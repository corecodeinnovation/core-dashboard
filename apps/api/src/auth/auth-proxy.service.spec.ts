import { HttpException, ServiceUnavailableException } from "@nestjs/common";

import { AuthProxyService } from "./auth-proxy.service";

describe("AuthProxyService", () => {
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

  function ok(body: unknown): Response {
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  }

  it("login reenvía a /auth/login con el body correcto", async () => {
    fetchMock.mockResolvedValue(ok({ accessToken: "a", refreshToken: "b" }));

    const result = await new AuthProxyService().login("ada@example.com", "s3cret");

    const [url, init] = fetchMock.mock.calls[0]! as [URL, RequestInit];
    expect(url.toString()).toBe("http://cci-auth-service:3000/auth/login");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "ada@example.com",
      password: "s3cret",
    });
    expect(result).toEqual({ accessToken: "a", refreshToken: "b" });
  });

  it("verifyTwoFactor reenvía a /2fa/verify", async () => {
    fetchMock.mockResolvedValue(ok({ accessToken: "a", refreshToken: "b" }));
    await new AuthProxyService().verifyTwoFactor("chal", "123456");
    const [url, init] = fetchMock.mock.calls[0]! as [URL, RequestInit];
    expect(url.toString()).toBe("http://cci-auth-service:3000/2fa/verify");
    expect(JSON.parse(init.body as string)).toEqual({ challengeToken: "chal", code: "123456" });
  });

  it("refresh reenvía a /auth/refresh", async () => {
    fetchMock.mockResolvedValue(ok({ accessToken: "a", refreshToken: "b" }));
    await new AuthProxyService().refresh("r1");
    const [url] = fetchMock.mock.calls[0]! as [URL];
    expect(url.toString()).toBe("http://cci-auth-service:3000/auth/refresh");
  });

  it("logout reenvía a /auth/logout", async () => {
    fetchMock.mockResolvedValue(ok({ message: "ok" }));
    await new AuthProxyService().logout("r1");
    const [url] = fetchMock.mock.calls[0]! as [URL];
    expect(url.toString()).toBe("http://cci-auth-service:3000/auth/logout");
  });

  it("respuesta no-ok ⇒ HttpException con el mismo status y body", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "credenciales inválidas" }),
    } as unknown as Response);

    await expect(new AuthProxyService().login("x@x.com", "bad")).rejects.toMatchObject({
      status: 401,
      response: { message: "credenciales inválidas" },
    });
  });

  it("respuesta no-ok ⇒ HttpException (instancia correcta)", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    } as unknown as Response);
    await expect(new AuthProxyService().login("x@x.com", "bad")).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it("sin AUTH_SERVICE_URL ⇒ ServiceUnavailableException", async () => {
    delete process.env.AUTH_SERVICE_URL;
    await expect(new AuthProxyService().login("x@x.com", "y")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("red caída (fetch rechaza) ⇒ ServiceUnavailableException", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(new AuthProxyService().login("x@x.com", "y")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
