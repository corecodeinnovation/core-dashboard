import { fetchDependenciesHealth } from "./api";

describe("lib/health/api", () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  function jsonResponse(body: unknown, ok = true, status = 200): Response {
    return { ok, status, json: async () => body } as unknown as Response;
  }

  it("pide /api/health/dependencies", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ checkedAt: "2026-07-27T00:00:00.000Z", dependencies: [] }),
    );
    await fetchDependenciesHealth();
    const [url] = fetchMock.mock.calls[0]! as [string];
    expect(url).toBe("/api/health/dependencies");
  });

  it("devuelve el chequeo tal cual", async () => {
    const body = {
      checkedAt: "2026-07-27T00:00:00.000Z",
      dependencies: [{ name: "taskforge", status: "ok", latencyMs: 12 }],
    };
    fetchMock.mockResolvedValue(jsonResponse(body));
    const result = await fetchDependenciesHealth();
    expect(result).toEqual(body);
  });

  it("respuesta no-ok ⇒ lanza", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 503));
    await expect(fetchDependenciesHealth()).rejects.toThrow("HTTP 503");
  });
});
