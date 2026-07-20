import { ServiceUnavailableException } from "@nestjs/common";

import { TaskforgeClient } from "./taskforge-client.service";

describe("TaskforgeClient", () => {
  const env = process.env;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env = {
      ...env,
      TASKFORGE_URL: "http://taskforge-api-1:3000",
      TASKFORGE_CLIENT_ID: "core-dashboard",
      TASKFORGE_CLIENT_SECRET: "s3cret",
      AUTH_SERVICE_URL: "http://cci-auth-service:3000",
    };
    fetchMock = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchMock.mockRestore();
    process.env = env;
  });

  function tokenResponse(expiresIn = 300): Response {
    return {
      ok: true,
      json: async () => ({
        access_token: "tok-1",
        token_type: "Bearer",
        expires_in: expiresIn,
        scope: "x",
      }),
    } as unknown as Response;
  }

  function jobResponse(body: unknown, ok = true, status = 200): Response {
    return {
      ok,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  }

  it("pide un token client_credentials form-urlencoded antes de encolar", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jobResponse({ jobId: "j1", queue: "heavy", state: "queued" }));

    const result = await new TaskforgeClient().enqueueDemoJob(5);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]! as [URL, RequestInit];
    expect(tokenUrl.toString()).toBe("http://cci-auth-service:3000/oauth/token");
    expect((tokenInit.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    const body = new URLSearchParams(tokenInit.body as string);
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("client_id")).toBe("core-dashboard");
    expect(body.get("client_secret")).toBe("s3cret");

    const [jobUrl, jobInit] = fetchMock.mock.calls[1]! as [URL, RequestInit];
    expect(jobUrl.toString()).toBe("http://taskforge-api-1:3000/jobs");
    expect((jobInit.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    expect(JSON.parse(jobInit.body as string)).toMatchObject({
      name: "core-dashboard-metrics-report",
      payload: { steps: 5 },
    });
    expect(result).toEqual({ jobId: "j1", queue: "heavy", state: "queued" });
  });

  it("cachea el token: dos llamadas seguidas piden token una sola vez", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jobResponse({ jobId: "j1", queue: "heavy", state: "queued" }))
      .mockResolvedValueOnce(jobResponse({ jobId: "j2", queue: "heavy", state: "queued" }));

    const client = new TaskforgeClient();
    await client.enqueueDemoJob(1);
    await client.enqueueDemoJob(1);

    const tokenCalls = fetchMock.mock.calls.filter(
      (call) => (call[0] as URL).toString() === "http://cci-auth-service:3000/oauth/token",
    );
    expect(tokenCalls).toHaveLength(1);
  });

  it("token vencido (dentro del margen) ⇒ pide uno nuevo", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse(10)) // expira en 10s, margen es 30s ⇒ ya "vencido"
      .mockResolvedValueOnce(jobResponse({ jobId: "j1", queue: "heavy", state: "queued" }))
      .mockResolvedValueOnce(tokenResponse(300))
      .mockResolvedValueOnce(jobResponse({ jobId: "j2", queue: "heavy", state: "queued" }));

    const client = new TaskforgeClient();
    await client.enqueueDemoJob(1);
    await client.enqueueDemoJob(1);

    const tokenCalls = fetchMock.mock.calls.filter(
      (call) => (call[0] as URL).toString() === "http://cci-auth-service:3000/oauth/token",
    );
    expect(tokenCalls).toHaveLength(2);
  });

  it("getJobStatus consulta GET /jobs/:id", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        jobResponse({ jobId: "j1", name: "x", state: "completed", result: { ok: true } }),
      );

    const status = await new TaskforgeClient().getJobStatus("j1");

    const [url, init] = fetchMock.mock.calls[1]! as [URL, RequestInit];
    expect(url.toString()).toBe("http://taskforge-api-1:3000/jobs/j1");
    expect(init.method).toBe("GET");
    expect(status).toEqual({ jobId: "j1", name: "x", state: "completed", result: { ok: true } });
  });

  it("sin credenciales configuradas ⇒ ServiceUnavailableException, no llama a fetch", async () => {
    delete process.env.TASKFORGE_CLIENT_ID;
    await expect(new TaskforgeClient().enqueueDemoJob(1)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("token endpoint no-ok ⇒ ServiceUnavailableException", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "invalid_client",
    } as unknown as Response);
    await expect(new TaskforgeClient().enqueueDemoJob(1)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("taskforge responde no-ok ⇒ ServiceUnavailableException", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jobResponse({ message: "invalid_scope" }, false, 403));
    await expect(new TaskforgeClient().enqueueDemoJob(1)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
