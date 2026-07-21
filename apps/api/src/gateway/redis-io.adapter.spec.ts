import type { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";

const mockPubClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  duplicate: jest.fn(),
};
const mockSubClient = { connect: jest.fn().mockResolvedValue(undefined), on: jest.fn() };
mockPubClient.duplicate.mockReturnValue(mockSubClient);

const createClientMock = jest.fn().mockReturnValue(mockPubClient);
const adapterInstance = Symbol("redis-adapter-instance");
const createAdapterMock = jest.fn().mockReturnValue(adapterInstance);

jest.mock("redis", () => ({ createClient: (...args: unknown[]) => createClientMock(...args) }));
jest.mock("@socket.io/redis-adapter", () => ({
  createAdapter: (...args: unknown[]) => createAdapterMock(...args),
}));

// Import diferido: los mocks de arriba deben registrarse antes de que el
// módulo bajo prueba importe "redis"/"@socket.io/redis-adapter".
import { RedisIoAdapter } from "./redis-io.adapter";

describe("RedisIoAdapter", () => {
  const env = process.env;
  let fakeServer: { adapter: jest.Mock };
  let createIOServerSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...env };
    jest.clearAllMocks();
    mockPubClient.duplicate.mockReturnValue(mockSubClient);
    fakeServer = { adapter: jest.fn() };
    // El padre real (IoAdapter.createIOServer) levantaría un socket.io Server
    // de verdad ligado a un puerto; se stubea para mantener esto como unit test.
    createIOServerSpy = jest
      .spyOn(IoAdapter.prototype, "createIOServer")
      .mockReturnValue(fakeServer as never);
  });

  afterEach(() => {
    createIOServerSpy.mockRestore();
  });

  afterAll(() => {
    process.env = env;
  });

  it("sin REDIS_URL: no crea clientes ni conecta nada", async () => {
    delete process.env.REDIS_URL;
    const adapter = new RedisIoAdapter({} as INestApplicationContext);

    await adapter.connectToRedis();

    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("sin REDIS_URL: createIOServer no adjunta ningún adapter (modo en memoria)", async () => {
    delete process.env.REDIS_URL;
    const adapter = new RedisIoAdapter({} as INestApplicationContext);
    await adapter.connectToRedis();

    const server = adapter.createIOServer(3000);

    expect(server).toBe(fakeServer);
    expect(fakeServer.adapter).not.toHaveBeenCalled();
  });

  it("con REDIS_URL: crea pub/sub por duplicate(), conecta ambos y arma el adapter", async () => {
    process.env.REDIS_URL = "redis://redis:6379";
    const adapter = new RedisIoAdapter({} as INestApplicationContext);

    await adapter.connectToRedis();

    expect(createClientMock).toHaveBeenCalledWith({ url: "redis://redis:6379" });
    expect(mockPubClient.duplicate).toHaveBeenCalled();
    expect(mockPubClient.connect).toHaveBeenCalled();
    expect(mockSubClient.connect).toHaveBeenCalled();
    expect(createAdapterMock).toHaveBeenCalledWith(mockPubClient, mockSubClient);
  });

  it("con REDIS_URL: createIOServer adjunta el adapter de Redis al server", async () => {
    process.env.REDIS_URL = "redis://redis:6379";
    const adapter = new RedisIoAdapter({} as INestApplicationContext);
    await adapter.connectToRedis();

    adapter.createIOServer(3000);

    expect(fakeServer.adapter).toHaveBeenCalledWith(adapterInstance);
  });

  it("errores del cliente redis se loguean, no tiran la app (handler de error registrado)", async () => {
    process.env.REDIS_URL = "redis://redis:6379";
    const adapter = new RedisIoAdapter({} as INestApplicationContext);

    await adapter.connectToRedis();

    expect(mockPubClient.on).toHaveBeenCalledWith("error", expect.any(Function));
    expect(mockSubClient.on).toHaveBeenCalledWith("error", expect.any(Function));
  });
});
