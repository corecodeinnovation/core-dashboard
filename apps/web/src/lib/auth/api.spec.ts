import {
  AuthApiError,
  fetchMe,
  isTwoFactorChallenge,
  login,
  logout,
  refresh,
  verifyTwoFactor,
} from "./api";

describe("lib/auth/api", () => {
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

  it("login postea a /api/auth/login y devuelve el par de tokens", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ accessToken: "a", refreshToken: "b" }));

    const result = await login("ada@example.com", "s3cret");

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/auth/login");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "ada@example.com",
      password: "s3cret",
    });
    expect(result).toEqual({ accessToken: "a", refreshToken: "b" });
  });

  it("login con challenge de 2FA lo devuelve tal cual", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ twoFactorRequired: true, challengeToken: "chal" }));
    const result = await login("ada@example.com", "s3cret");
    expect(isTwoFactorChallenge(result)).toBe(true);
  });

  it("respuesta no-ok ⇒ AuthApiError con el status y mensaje del server", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "credenciales inválidas" }, false, 401));

    await expect(login("x@x.com", "bad")).rejects.toMatchObject({
      status: 401,
      message: "credenciales inválidas",
    });
  });

  it("mensaje de error como array (class-validator) se une en un string", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ message: ["email inválido", "password requerido"] }, false, 400),
    );
    await expect(login("x@x.com", "")).rejects.toThrow("email inválido, password requerido");
  });

  it("verifyTwoFactor postea a /api/auth/2fa/verify", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ accessToken: "a", refreshToken: "b" }));
    await verifyTwoFactor("chal", "123456");
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/auth/2fa/verify");
    expect(JSON.parse(init.body as string)).toEqual({ challengeToken: "chal", code: "123456" });
  });

  it("refresh postea a /api/auth/refresh", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ accessToken: "a", refreshToken: "b" }));
    await refresh("r1");
    const [url] = fetchMock.mock.calls[0]! as [string];
    expect(url).toBe("/api/auth/refresh");
  });

  it("logout nunca lanza, incluso si el server falla", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 500));
    await expect(logout("r1")).resolves.toBeUndefined();
  });

  it("fetchMe manda el Authorization header y devuelve el usuario", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ sub: "u1", email: "a@a.com", role: "operator" }));
    const user = await fetchMe("token123");
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/auth/me");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token123");
    expect(user).toEqual({ sub: "u1", email: "a@a.com", role: "operator" });
  });

  it("fetchMe con respuesta no-ok ⇒ ANONYMOUS (no lanza)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 401));
    const user = await fetchMe("token-vencido");
    expect(user).toEqual({ sub: null, email: null, role: "viewer" });
  });

  it("AuthApiError es instanceof Error", () => {
    expect(new AuthApiError("x", 400)).toBeInstanceOf(Error);
  });
});
