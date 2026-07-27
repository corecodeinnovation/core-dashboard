import { TaskforgeClient } from "../jobs/taskforge-client.service";
import { DependenciesHealthService } from "./dependencies-health.service";

describe("DependenciesHealthService", () => {
  const env = process.env;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env = {
      ...env,
      AUTH_SERVICE_URL: "http://cci-auth-service:3000",
      NOTIFY_BOT_URL: "http://ops-notify-bot:3001",
    };
    fetchMock = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchMock.mockRestore();
    process.env = env;
  });

  function healthResponse(ok = true): Response {
    return { ok, json: async () => ({ status: ok ? "ok" : "error" }) } as unknown as Response;
  }

  it("los tres servicios responden ok ⇒ los tres 'ok'", async () => {
    fetchMock.mockResolvedValue(healthResponse(true));
    const taskforge = {
      listJobs: jest.fn().mockResolvedValue({ total: 0, limit: 1, offset: 0, items: [] }),
    };
    const service = new DependenciesHealthService(taskforge as unknown as TaskforgeClient);

    const result = await service.check();

    expect(result.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "cci-auth-service", status: "ok" }),
        expect.objectContaining({ name: "taskforge", status: "ok" }),
        expect.objectContaining({ name: "ops-notify-bot", status: "ok" }),
      ]),
    );
    expect(result.checkedAt).toBeDefined();
  });

  it("taskforge falla (p. ej. invalid_client) ⇒ 'down', sin tumbar el resto", async () => {
    fetchMock.mockResolvedValue(healthResponse(true));
    const taskforge = { listJobs: jest.fn().mockRejectedValue(new Error("invalid_client")) };
    const service = new DependenciesHealthService(taskforge as unknown as TaskforgeClient);

    const result = await service.check();

    const tf = result.dependencies.find((d) => d.name === "taskforge");
    expect(tf?.status).toBe("down");
    const auth = result.dependencies.find((d) => d.name === "cci-auth-service");
    expect(auth?.status).toBe("ok");
  });

  it("cci-auth-service responde no-ok ⇒ 'down'", async () => {
    fetchMock.mockImplementation((url: URL) =>
      url.toString().includes("cci-auth-service")
        ? Promise.resolve(healthResponse(false))
        : Promise.resolve(healthResponse(true)),
    );
    const taskforge = { listJobs: jest.fn().mockResolvedValue({}) };
    const service = new DependenciesHealthService(taskforge as unknown as TaskforgeClient);

    const result = await service.check();

    expect(result.dependencies.find((d) => d.name === "cci-auth-service")?.status).toBe("down");
  });

  it("URL no configurada ⇒ 'down' sin llamar a fetch para esa dependencia", async () => {
    delete process.env.NOTIFY_BOT_URL;
    fetchMock.mockResolvedValue(healthResponse(true));
    const taskforge = { listJobs: jest.fn().mockResolvedValue({}) };
    const service = new DependenciesHealthService(taskforge as unknown as TaskforgeClient);

    const result = await service.check();

    expect(result.dependencies.find((d) => d.name === "ops-notify-bot")?.status).toBe("down");
  });

  it("fetch falla (red) ⇒ 'down', no propaga la excepción", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const taskforge = { listJobs: jest.fn().mockResolvedValue({}) };
    const service = new DependenciesHealthService(taskforge as unknown as TaskforgeClient);

    const result = await service.check();

    expect(result.dependencies.find((d) => d.name === "cci-auth-service")?.status).toBe("down");
    expect(result.dependencies.find((d) => d.name === "ops-notify-bot")?.status).toBe("down");
  });
});
