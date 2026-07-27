import { fetchSecurityAudit, SecurityAuditApiError } from "./api";

describe("lib/security-audit/api", () => {
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

  it("pide /api/security-audit con el Bearer y la paginación por default", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ total: 0, events: [] }));

    await fetchSecurityAudit({ skip: 0, take: 50 }, "tok123");

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/security-audit?skip=0&take=50");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok123");
  });

  it("incluye action y userId cuando vienen en los filtros", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ total: 0, events: [] }));
    await fetchSecurityAudit({ action: "LOGIN_FAILED", userId: "u2", skip: 10, take: 20 }, "tok");
    const [url] = fetchMock.mock.calls[0]! as [string];
    expect(url).toBe("/api/security-audit?skip=10&take=20&action=LOGIN_FAILED&userId=u2");
  });

  it("devuelve el total y los eventos", async () => {
    const body = { total: 1, events: [{ id: "e1", action: "LOGIN_SUCCEEDED" }] };
    fetchMock.mockResolvedValue(jsonResponse(body));
    const result = await fetchSecurityAudit({ skip: 0, take: 50 }, "tok");
    expect(result).toEqual(body);
  });

  it("respuesta no-ok ⇒ SecurityAuditApiError con status y mensaje", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Forbidden" }, false, 403));
    await expect(fetchSecurityAudit({ skip: 0, take: 50 }, "tok")).rejects.toMatchObject({
      status: 403,
      message: "Forbidden",
    });
  });

  it("SecurityAuditApiError es instanceof Error", () => {
    expect(new SecurityAuditApiError("x", 400)).toBeInstanceOf(Error);
  });
});
