import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { LIVE_NAMESPACE, type ServiceState } from "@core-dashboard/shared";
import * as jwt from "jsonwebtoken";
import { io, type Socket as ClientSocket } from "socket.io-client";

import { GatewayModule } from "./gateway.module";
import { LiveGateway } from "./live.gateway";

const SECRET = "gateway-test-secret";

function serviceState(service: string): ServiceState {
  return {
    id: "abc123",
    name: `core-dashboard-${service}-1`,
    service,
    project: "core-dashboard",
    image: `core-dashboard-${service}`,
    status: "running",
    health: "healthy",
    startedAt: new Date().toISOString(),
    uptimeSec: 42,
  };
}

describe("LiveGateway (integración)", () => {
  let app: INestApplication;
  let gateway: LiveGateway;
  let baseUrl: string;
  let client: ClientSocket;

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({ imports: [GatewayModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    const address = app.getHttpServer().address();
    if (typeof address === "string" || address === null) throw new Error("puerto desconocido");
    baseUrl = `http://127.0.0.1:${address.port}${LIVE_NAMESPACE}`;
    gateway = app.get(LiveGateway);
  });

  afterAll(async () => {
    delete process.env.AUTH_JWT_SECRET;
    await app.close();
  });

  afterEach(() => {
    client?.disconnect();
  });

  function connect(token?: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = io(baseUrl, {
        transports: ["websocket"],
        auth: token ? { token } : {},
        timeout: 3000,
      });
      socket.on("connect", () => resolve(socket));
      socket.on("connect_error", reject);
    });
  }

  function serverUser(id: string): unknown {
    const socket = gateway.server.sockets.get(id);
    return socket?.data.user;
  }

  it("acepta conexión anónima como viewer (demo read-only)", async () => {
    client = await connect();
    expect(serverUser(client.id!)).toEqual({ sub: null, email: null, role: "viewer" });
  });

  it("handshake con JWT válido adjunta el rol mapeado", async () => {
    const token = jwt.sign({ sub: "u1", email: "ops@cci.dev", roles: ["OPERATOR"] }, SECRET);
    client = await connect(token);
    expect(serverUser(client.id!)).toMatchObject({ sub: "u1", role: "operator" });
  });

  it("handshake con JWT inválido degrada a viewer anónimo", async () => {
    client = await connect("no-es-un-jwt");
    expect(serverUser(client.id!)).toEqual({ sub: null, email: null, role: "viewer" });
  });

  it("rooms:subscribe filtra nombres inválidos y confirma por ack", async () => {
    client = await connect();
    const joined = await client.emitWithAck("rooms:subscribe", ["api", "../etc/passwd", 7]);
    expect(joined).toEqual(["api"]);
  });

  it("broadcast selectivo: solo llega al room suscrito", async () => {
    client = await connect();
    await client.emitWithAck("rooms:subscribe", ["api"]);

    const received: string[] = [];
    client.on("state:update", (update) => received.push(update.service));

    gateway.publishUpdate({
      service: "web",
      state: serviceState("web"),
      occurredAt: new Date().toISOString(),
    });
    gateway.publishUpdate({
      service: "api",
      state: serviceState("api"),
      occurredAt: new Date().toISOString(),
    });

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(received).toEqual(["api"]);
  });

  it("rooms:unsubscribe corta el broadcast", async () => {
    client = await connect();
    await client.emitWithAck("rooms:subscribe", ["api"]);
    await client.emitWithAck("rooms:unsubscribe", ["api"]);

    const received: string[] = [];
    client.on("state:update", (update) => received.push(update.service));
    gateway.publishUpdate({
      service: "api",
      state: serviceState("api"),
      occurredAt: new Date().toISOString(),
    });

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(received).toEqual([]);
  });

  it("state:resync devuelve el snapshot por ack", async () => {
    client = await connect();
    const snapshot = await client.emitWithAck("state:resync");
    expect(snapshot.services).toEqual([]);
    expect(typeof snapshot.generatedAt).toBe("string");
  });
});
