import { PassThrough } from "stream";

import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { LIVE_NAMESPACE, type ServiceState } from "@core-dashboard/shared";
import { io, type Socket as ClientSocket } from "socket.io-client";

import { DOCKER_CLIENT } from "../containers/docker.client";
import { GatewayModule } from "./gateway.module";

// E2E del flujo crítico de reconexión (1-08): el cliente pierde el gateway,
// reintenta con backoff, reconecta contra un proceso nuevo y el resync le
// devuelve el estado ACTUAL (lo que cambió mientras estuvo desconectado no
// se pierde: se recupera por snapshot, no por replay de eventos).

interface FakeContainer {
  Id: string;
  name: string;
  service: string;
  running: boolean;
}

// Inventario mutable compartido: simula que el mundo cambió entre conexiones.
const inventory: FakeContainer[] = [];

const fakeDocker = {
  listContainers: async () =>
    inventory.map((c) => ({
      Id: c.Id,
      Names: [`/${c.name}`],
      Labels: {
        "com.docker.compose.service": c.service,
        "com.docker.compose.project": "core-dashboard",
      },
    })),
  getContainer: (id: string) => ({
    inspect: async () => {
      const found = inventory.find((c) => c.Id === id);
      if (!found) throw new Error("no such container");
      return {
        Id: found.Id,
        Name: `/${found.name}`,
        Config: {
          Labels: {
            "com.docker.compose.service": found.service,
            "com.docker.compose.project": "core-dashboard",
          },
          Image: `core-dashboard-${found.service}`,
        },
        State: {
          Status: found.running ? "running" : "exited",
          Running: found.running,
          StartedAt: found.running ? new Date().toISOString() : "0001-01-01T00:00:00Z",
        },
      };
    },
  }),
  getEvents: async () => new PassThrough(),
};

async function bootGateway(port: number): Promise<INestApplication> {
  // El puerto recién liberado puede tardar en soltarse: pequeño retry anti-flake.
  for (let attempt = 1; ; attempt++) {
    const moduleRef = await Test.createTestingModule({ imports: [GatewayModule] })
      .overrideProvider(DOCKER_CLIENT)
      .useValue(fakeDocker)
      .compile();
    const app = moduleRef.createNestApplication();
    try {
      await app.listen(port);
      return app;
    } catch (err) {
      await app.close().catch(() => {});
      if (attempt >= 5) throw err;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

describe("reconexión del cliente (e2e)", () => {
  let firstApp: INestApplication | null = null;
  let secondApp: INestApplication | null = null;
  let client: ClientSocket;

  afterEach(async () => {
    client?.removeAllListeners();
    client?.disconnect();
    await firstApp?.close().catch(() => {});
    await secondApp?.close().catch(() => {});
  });

  it("reconecta con backoff y resincroniza el estado que cambió mientras estaba caído", async () => {
    inventory.length = 0;
    inventory.push({
      Id: "1".repeat(64),
      name: "core-dashboard-api-1",
      service: "api",
      running: true,
    });

    firstApp = await bootGateway(0);
    const address = firstApp.getHttpServer().address();
    if (typeof address === "string" || address === null) throw new Error("puerto desconocido");
    const port = address.port;

    client = io(`http://127.0.0.1:${port}${LIVE_NAMESPACE}`, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 200,
      reconnectionDelayMax: 1_000,
      timeout: 2_000,
    });

    // Conexión inicial: un servicio corriendo.
    await new Promise<void>((resolve, reject) => {
      client.once("connect", () => resolve());
      client.once("connect_error", reject);
    });
    const initial = await client.emitWithAck("state:resync");
    expect(initial.services).toHaveLength(1);
    expect(initial.services[0]).toMatchObject({ service: "api", status: "running" });

    // El gateway muere; mientras está caído, el mundo cambia.
    const attempts: number[] = [];
    const disconnected = new Promise<string>((resolve) => client.once("disconnect", resolve));
    client.io.on("reconnect_attempt", (attempt) => attempts.push(attempt));
    await firstApp.close();
    firstApp = null;
    // La razón exacta depende del timing (transport close o ping timeout);
    // lo que importa es que el cliente detectó la caída.
    await expect(disconnected).resolves.toMatch(/transport close|ping timeout/);

    inventory[0]!.running = false; // el contenedor cayó durante la desconexión
    inventory.push({
      Id: "2".repeat(64),
      name: "core-dashboard-web-1",
      service: "web",
      running: true,
    });

    // Dejamos que acumule al menos un reintento fallido antes de revivir el server.
    await new Promise((resolve) => setTimeout(resolve, 500));
    secondApp = await bootGateway(port);

    // Reconexión automática contra el proceso nuevo.
    await new Promise<void>((resolve) => client.once("connect", () => resolve()));
    expect(attempts.length).toBeGreaterThanOrEqual(1);

    // El resync refleja el estado actual: api caído, web nuevo presente.
    const resynced = await client.emitWithAck("state:resync");
    expect(resynced.services).toHaveLength(2);
    expect(resynced.services.find((s: ServiceState) => s.service === "api")).toMatchObject({
      status: "exited",
      uptimeSec: null,
    });
    expect(resynced.services.find((s: ServiceState) => s.service === "web")).toMatchObject({
      status: "running",
    });
  }, 20_000);
});
