import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as jwt from "jsonwebtoken";
import request from "supertest";

import { AuthProxyService } from "./auth-proxy.service";
import { AuthModule } from "./auth.module";

const SECRET = "auth-controller-test-secret";

describe("AuthController", () => {
  let app: INestApplication;
  const proxy = {
    login: jest.fn(),
    verifyTwoFactor: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  };

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(AuthProxyService)
      .useValue(proxy)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    delete process.env.AUTH_JWT_SECRET;
    await app.close();
  });

  beforeEach(() => {
    Object.values(proxy).forEach((fn) => fn.mockReset());
  });

  it("POST /auth/login sin email/password ⇒ 400, no llega al proxy", async () => {
    await request(app.getHttpServer()).post("/auth/login").send({ email: "x@x.com" }).expect(400);
    expect(proxy.login).not.toHaveBeenCalled();
  });

  it("POST /auth/login válido ⇒ delega y devuelve el resultado del proxy", async () => {
    proxy.login.mockResolvedValue({ accessToken: "a", refreshToken: "b" });
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ada@example.com", password: "s3cret" })
      .expect(201);
    expect(proxy.login).toHaveBeenCalledWith("ada@example.com", "s3cret");
    expect(res.body).toEqual({ accessToken: "a", refreshToken: "b" });
  });

  it("POST /auth/2fa/verify sin campos ⇒ 400", async () => {
    await request(app.getHttpServer()).post("/auth/2fa/verify").send({}).expect(400);
    expect(proxy.verifyTwoFactor).not.toHaveBeenCalled();
  });

  it("POST /auth/2fa/verify válido ⇒ delega", async () => {
    proxy.verifyTwoFactor.mockResolvedValue({ accessToken: "a", refreshToken: "b" });
    await request(app.getHttpServer())
      .post("/auth/2fa/verify")
      .send({ challengeToken: "chal", code: "123456" })
      .expect(201);
    expect(proxy.verifyTwoFactor).toHaveBeenCalledWith("chal", "123456");
  });

  it("POST /auth/refresh sin refreshToken ⇒ 400", async () => {
    await request(app.getHttpServer()).post("/auth/refresh").send({}).expect(400);
  });

  it("POST /auth/logout sin refreshToken ⇒ 200 igual (no llama al proxy)", async () => {
    const res = await request(app.getHttpServer()).post("/auth/logout").send({}).expect(200);
    expect(proxy.logout).not.toHaveBeenCalled();
    expect(res.body).toEqual({ message: "sesión cerrada" });
  });

  it("POST /auth/logout con refreshToken ⇒ delega y responde 200 aunque el proxy falle", async () => {
    proxy.logout.mockRejectedValue(new Error("upstream caído"));
    const res = await request(app.getHttpServer())
      .post("/auth/logout")
      .send({ refreshToken: "r1" })
      .expect(200);
    expect(proxy.logout).toHaveBeenCalledWith("r1");
    expect(res.body).toEqual({ message: "sesión cerrada" });
  });

  it("GET /auth/me sin token ⇒ viewer anónimo", async () => {
    const res = await request(app.getHttpServer()).get("/auth/me").expect(200);
    expect(res.body).toEqual({ sub: null, email: null, role: "viewer" });
  });

  it("GET /auth/me con token válido ⇒ claims mapeados", async () => {
    const token = jwt.sign({ sub: "u1", email: "op@cci.dev", roles: ["OPERATOR"] }, SECRET);
    const res = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual({ sub: "u1", email: "op@cci.dev", role: "operator" });
  });
});
