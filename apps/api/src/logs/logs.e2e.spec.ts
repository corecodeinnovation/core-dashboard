import { PassThrough } from "stream";

import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { LIVE_NAMESPACE, type LogsBatch } from "@core-dashboard/shared";
import { io, type Socket as ClientSocket } from "socket.io-client";

import { DOCKER_CLIENT } from "../containers/docker.client";
import { GatewayModule } from "../gateway/gateway.module";

// E2E de logs en vivo (RF-04): suscripción por socket real, entrega en batches
// con ack, tail inicial y validación de contenedores fuera del stack.

const CONTAINER = "core-dashboard-api-1";

function frame(type: 1 | 2, payload: string): Buffer {
  const body = Buffer.from(payload, "utf8");
  const header = Buffer.alloc(8);
  header[0] = type;
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

// Un stream de logs por suscripción, accesible para escribir desde el test.
const logStreams: PassThrough[] = [];

const fakeDocker = {
  listContainers: async () => [
    {
      Id: "a".repeat(64),
      Names: [`/${CONTAINER}`],
      Labels: {
        "com.docker.compose.service": "api",
        "com.docker.compose.project": "core-dashboard",
      },
    },
  ],
  getContainer: (idOrName: string) => ({
    inspect: async () => {
      if (idOrName !== "a".repeat(64) && idOrName !== CONTAINER) throw new Error("no existe");
      return {
        Id: "a".repeat(64),
        Name: `/${CONTAINER}`,
        Config: {
          Labels: {
            "com.docker.compose.service": "api",
            "com.docker.compose.project": "core-dashboard",
          },
          Image: "core-dashboard-api",
        },
        State: { Status: "running", Running: true, StartedAt: new Date().toISOString() },
      };
    },
    logs: async () => {
      const stream = new PassThrough();
      logStreams.push(stream);
      return stream;
    },
  }),
  getEvents: async () => new PassThrough(),
};

describe("logs en vivo (e2e)", () => {
  let app: INestApplication;
  let baseUrl: string;
  let client: ClientSocket;

  beforeAll(async () => {
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
    await app.close();
  });

  beforeEach(() => {
    logStreams.length = 0;
  });

  afterEach(() => {
    client?.disconnect();
  });

  function connect(): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = io(baseUrl, { transports: ["websocket"], timeout: 3000 });
      socket.on("connect", () => resolve(socket));
      socket.on("connect_error", reject);
    });
  }

  it("entrega líneas en batches con ack y distingue stdout de stderr", async () => {
    client = await connect();
    const batches: LogsBatch[] = [];
    client.on("logs:batch", (batch, ack) => {
      batches.push(batch);
      ack();
    });

    const result = await client.emitWithAck("logs:subscribe", { container: CONTAINER });
    expect(result).toEqual({ ok: true });
    expect(logStreams).toHaveLength(1);

    logStreams[0]!.write(
      Buffer.concat([
        frame(1, "2026-07-19T12:00:00.000000000Z arranque ok\n"),
        frame(2, "2026-07-19T12:00:01.000000000Z algo falló\n"),
      ]),
    );

    await new Promise((r) => setTimeout(r, 300));
    const lines = batches.flatMap((b) => b.lines);
    expect(lines).toEqual([
      { ts: "2026-07-19T12:00:00.000000000Z", source: "stdout", text: "arranque ok" },
      { ts: "2026-07-19T12:00:01.000000000Z", source: "stderr", text: "algo falló" },
    ]);
    expect(batches.every((b) => b.container === CONTAINER)).toBe(true);
  });

  it("rechaza contenedores fuera del stack gestionado", async () => {
    client = await connect();
    const result = await client.emitWithAck("logs:subscribe", { container: "sospechoso-1" });
    expect(result.ok).toBe(false);
    expect(logStreams).toHaveLength(0);
  });

  it("unsubscribe corta el stream de origen", async () => {
    client = await connect();
    await client.emitWithAck("logs:subscribe", { container: CONTAINER });
    const stream = logStreams[0]!;
    expect(stream.destroyed).toBe(false);

    await client.emitWithAck("logs:unsubscribe", { container: CONTAINER });
    await new Promise((r) => setTimeout(r, 100));
    expect(stream.destroyed).toBe(true);
  });

  it("al desconectar el socket se destruyen sus streams", async () => {
    client = await connect();
    await client.emitWithAck("logs:subscribe", { container: CONTAINER });
    const stream = logStreams[0]!;

    client.disconnect();
    await new Promise((r) => setTimeout(r, 200));
    expect(stream.destroyed).toBe(true);
  });
});
