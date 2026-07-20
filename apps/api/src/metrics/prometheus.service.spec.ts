import { PrometheusService } from "./prometheus.service";

describe("PrometheusService", () => {
  const env = process.env;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...env, PROMETHEUS_URL: "http://prometheus:9090" };
    fetchMock = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchMock.mockRestore();
    process.env = env;
  });

  function ok(result: unknown): Response {
    return {
      ok: true,
      json: async () => ({ status: "success", data: { result } }),
    } as unknown as Response;
  }

  it("queryInstant arma la URL con query y time", async () => {
    fetchMock.mockResolvedValue(ok([{ metric: { name: "api-1" }, value: [1, "0.5"] }]));

    const result = await new PrometheusService().queryInstant("up", 1234);

    const url = fetchMock.mock.calls[0]![0] as URL;
    expect(url.origin).toBe("http://prometheus:9090");
    expect(url.pathname).toBe("/api/v1/query");
    expect(url.searchParams.get("query")).toBe("up");
    expect(url.searchParams.get("time")).toBe("1234");
    expect(result[0]?.metric.name).toBe("api-1");
  });

  it("queryRange arma start/end/step", async () => {
    fetchMock.mockResolvedValue(ok([]));

    await new PrometheusService().queryRange("up", 100, 200, 30);

    const url = fetchMock.mock.calls[0]![0] as URL;
    expect(url.pathname).toBe("/api/v1/query_range");
    expect(url.searchParams.get("start")).toBe("100");
    expect(url.searchParams.get("end")).toBe("200");
    expect(url.searchParams.get("step")).toBe("30");
  });

  it("HTTP no-ok ⇒ lanza error", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502 } as unknown as Response);
    await expect(new PrometheusService().queryInstant("up")).rejects.toThrow("502");
  });

  it("status != success ⇒ lanza error con el detalle", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "error", error: "query mal formada" }),
    } as unknown as Response);
    await expect(new PrometheusService().queryInstant("up{")).rejects.toThrow("query mal formada");
  });
});
