import { PassThrough } from "stream";

import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { LIVE_NAMESPACE, type LogsBatch } from "@core-dashboard/shared";
import { io, type Socket as ClientSocket } from "socket.io-client";

import { DOCKER_CLIENT } from "../containers/docker.client";
import { GatewayModule } from "../gateway/gateway.module";

// B-03: prueba de carga con cliente lento artificial (mitigación R2).
// Un productor en ráfaga escribe muchas más líneas de las que caben en la
// cola (maxQueue) mientras el cliente confirma (ack) cada batch a propósito
// despacio. Ejercita el pipeline real de punta a punta —stream de Docker →
// parser de frames → splitter de líneas → LogSession → socket.io— bajo
// volumen real, no un mock de LogSession:
//   - ninguna línea se pierde en silencio: entregadas + descartadas = producidas
//   - el descarte de verdad ocurrió (la cola se llenó)
//   - la fuente se pausa/reanuda (watermarks) sobre un stream real de Node
//   - el gateway sigue respondiendo a otros eventos durante la ráfaga
//   - el cliente lento nunca se desconecta (los acks entran dentro del timeout)

const CONTAINER = "core-dashboard-worker-1";
const LINES_PRODUCED = 6_000;
const SLOW_ACK_MS = 15;

function frame(type: 1, payload: string): Buffer {
  const body = Buffer.from(payload, "utf8");
  const header = Buffer.alloc(8);
  header[0] = type;
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

function burstBuffer(count: number): Buffer {
  const frames: Buffer[] = [];
  for (let i = 0; i < count; i++) {
    frames.push(frame(1, `2026-07-20T00:00:00.000000000Z línea ${i}\n`));
  }
  return Buffer.concat(frames);
}

describe("carga: cliente lento en logs (B-03)", () => {
  let app: INestApplication;
  let baseUrl: string;
  let dockerStream: PassThrough;
  let client: ClientSocket;

  beforeAll(async () => {
    dockerStream = new PassThrough();
    const fakeDocker = {
      listContainers: async () => [
        {
          Id: "b".repeat(64),
          Names: [`/${CONTAINER}`],
          Labels: {
            "com.docker.compose.service": "worker",
            "com.docker.compose.project": "core-dashboard",
          },
        },
      ],
      getContainer: () => ({
        inspect: async () => ({
          Id: "b".repeat(64),
          Name: `/${CONTAINER}`,
          Config: {
            Labels: {
              "com.docker.compose.service": "worker",
              "com.docker.compose.project": "core-dashboard",
            },
            Image: "core-dashboard-worker",
          },
          State: { Status: "running", Running: true, StartedAt: new Date().toISOString() },
        }),
        logs: async () => dockerStream,
      }),
      getEvents: async () => new PassThrough(),
    };

    const moduleRef = await Test.createTestingModule({ imports: [GatewayModule] })
      .overrideProvider(DOCKER_CLIENT)
      .useValue(fakeDocker)
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    const address = app.getHttpServer().address();
    if (typeof address === "string" || address === null) throw new Error("puerto desconocido");
    baseUrl = `http://127.0.0.1:${address.port}${LIVE_NAMESPACE}`;
  });

  afterAll(async () => {
    client?.disconnect();
    await app.close();
  });

  it("drena bajo carga sin pérdida silenciosa, con backpressure real y gateway responsivo", async () => {
    const pauseSpy = jest.spyOn(dockerStream, "pause");
    const resumeSpy = jest.spyOn(dockerStream, "resume");

    client = await new Promise<ClientSocket>((resolve, reject) => {
      const socket = io(baseUrl, { transports: ["websocket"], timeout: 5000 });
      socket.on("connect", () => resolve(socket));
      socket.on("connect_error", reject);
    });

    const receivedLines: string[] = [];
    let totalDropped = 0;
    client.on("logs:batch", (batch: LogsBatch, ack: () => void) => {
      for (const line of batch.lines) receivedLines.push(line.text);
      totalDropped += batch.dropped;
      // El "cliente lento": tarda en confirmar cada batch a propósito.
      setTimeout(ack, SLOW_ACK_MS);
    });

    const subscribeResult = await client.emitWithAck("logs:subscribe", { container: CONTAINER });
    expect(subscribeResult).toEqual({ ok: true });

    // Ráfaga: muchas más líneas de las que caben en la cola, en un solo write.
    dockerStream.write(burstBuffer(LINES_PRODUCED));
    dockerStream.end(); // fin natural de la fuente: debe drenar, no descartar el resto

    // Responsividad del gateway durante la ráfaga: resync concurrentes por el
    // MISMO socket mientras el terminal lento sigue drenando el backlog.
    const resyncLatenciesMs: number[] = [];
    const resyncInterval = setInterval(() => {
      const startedAt = Date.now();
      void client
        .emitWithAck("state:resync")
        .then(() => resyncLatenciesMs.push(Date.now() - startedAt))
        .catch(() => {});
    }, 40);

    // Espera activa a que se estabilice la contabilidad (entregadas + descartadas).
    const deadline = Date.now() + 8_000;
    while (receivedLines.length + totalDropped < LINES_PRODUCED && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    // Margen extra por si el último batch tarda en llegar tras estabilizarse.
    await new Promise((r) => setTimeout(r, 300));
    clearInterval(resyncInterval);

    // Contabilidad exacta: nada se pierde sin quedar contado (fix de end()
    // grácil incluido: el fin natural del stream no debe tirar la cola).
    expect(receivedLines.length + totalDropped).toBe(LINES_PRODUCED);
    // La ráfaga excede maxQueue (2000 líneas): tiene que haber descartado.
    expect(totalDropped).toBeGreaterThan(0);
    // Se conserva el tail (lo más nuevo); el medio de la ráfaga se descarta.
    // (La primera línea siempre sale sola en el primer batch —el primer push
    // dispara un flush síncrono antes de que lleguen las siguientes—, así
    // que la primera realmente descartada por desborde es la segunda.)
    expect(receivedLines.at(-1)).toBe(`línea ${LINES_PRODUCED - 1}`);
    expect(receivedLines).not.toContain("línea 1");

    // Backpressure real sobre el stream real de Docker (no un mock de fuente).
    expect(pauseSpy).toHaveBeenCalled();
    expect(resumeSpy).toHaveBeenCalled();

    // El gateway no se bloqueó: los resync concurrentes siguieron respondiendo
    // durante toda la ráfaga. El umbral es holgado a propósito — un event loop
    // realmente bloqueado por el backlog de logs daría segundos, no ~1s; medir
    // más fino haría el test frágil bajo carga de CPU (p. ej. con --coverage).
    expect(resyncLatenciesMs.length).toBeGreaterThan(0);
    expect(Math.max(...resyncLatenciesMs)).toBeLessThan(2_000);

    // El cliente lento nunca se cayó: los acks entraron dentro del timeout.
    expect(client.connected).toBe(true);
  }, 15_000);
});
