import { AlertsApiError, fetchAlerts } from "./api";

describe("lib/alerts/api", () => {
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

  it("pide /api/alerts/feed con limit/offset", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ total: 0, items: [] }));
    await fetchAlerts({ limit: 20, offset: 0 });
    const [url] = fetchMock.mock.calls[0]! as [string];
    expect(url).toBe("/api/alerts/feed?limit=20&offset=0");
  });

  it("incluye type cuando viene en los filtros", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ total: 0, items: [] }));
    await fetchAlerts({ type: "job_dlq", limit: 20, offset: 40 });
    const [url] = fetchMock.mock.calls[0]! as [string];
    expect(url).toBe("/api/alerts/feed?limit=20&offset=40&type=job_dlq");
  });

  it("devuelve el total y los items", async () => {
    const body = { total: 1, items: [{ id: "a1", type: "container_down" }] };
    fetchMock.mockResolvedValue(jsonResponse(body));
    const result = await fetchAlerts({ limit: 20, offset: 0 });
    expect(result).toEqual(body);
  });

  it("respuesta no-ok ⇒ AlertsApiError con status y mensaje", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "bad" }, false, 400));
    await expect(fetchAlerts({ limit: 20, offset: 0 })).rejects.toMatchObject({
      status: 400,
      message: "bad",
    });
  });

  it("AlertsApiError es instanceof Error", () => {
    expect(new AlertsApiError("x", 400)).toBeInstanceOf(Error);
  });
});
