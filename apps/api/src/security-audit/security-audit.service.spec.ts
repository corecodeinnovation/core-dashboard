import { HttpException, ServiceUnavailableException } from "@nestjs/common";

import { SecurityAuditService } from "./security-audit.service";

describe("SecurityAuditService", () => {
  const env = process.env;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...env, AUTH_SERVICE_URL: "http://cci-auth-service:3000" };
    fetchMock = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchMock.mockRestore();
    process.env = env;
  });

  function jsonResponse(body: unknown, ok = true, status = 200): Response {
    return { ok, status, json: async () => body } as unknown as Response;
  }

  it("pide GET /audit con el Bearer del usuario y los filtros como query", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ total: 0, events: [] }));
    const service = new SecurityAuditService();

    await service.list({ action: "LOGIN_FAILED", userId: "u2", skip: 20, take: 10 }, "user-tok");

    const [url, init] = fetchMock.mock.calls[0]! as [URL, RequestInit];
    expect(url.toString()).toBe(
      "http://cci-auth-service:3000/audit?skip=20&take=10&action=LOGIN_FAILED&userId=u2",
    );
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer user-tok");
  });

  it("devuelve el total y los eventos tal cual los manda cci-auth-service", async () => {
    const body = { total: 1, events: [{ id: "e1", action: "LOGIN_SUCCEEDED" }] };
    fetchMock.mockResolvedValue(jsonResponse(body));
    const result = await new SecurityAuditService().list({ skip: 0, take: 50 }, "tok");
    expect(result).toEqual(body);
  });

  it("respuesta no-ok de cci-auth-service ⇒ reenvía el status (p. ej. 403 sin rol ADMIN)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Forbidden" }, false, 403));
    await expect(
      new SecurityAuditService().list({ skip: 0, take: 50 }, "tok-sin-admin"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      new SecurityAuditService().list({ skip: 0, take: 50 }, "tok-sin-admin"),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it("sin AUTH_SERVICE_URL configurado ⇒ ServiceUnavailableException, no llama a fetch", async () => {
    delete process.env.AUTH_SERVICE_URL;
    await expect(
      new SecurityAuditService().list({ skip: 0, take: 50 }, "tok"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetch falla (red) ⇒ ServiceUnavailableException", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      new SecurityAuditService().list({ skip: 0, take: 50 }, "tok"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
