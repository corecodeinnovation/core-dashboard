import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as jwt from "jsonwebtoken";
import request from "supertest";

import { AuthModule } from "../auth/auth.module";
import { SecurityAuditController } from "./security-audit.controller";
import { SecurityAuditService } from "./security-audit.service";

const SECRET = "security-audit-controller-test-secret";

function tokenFor(roles: string[]): string {
  return jwt.sign({ sub: "u1", email: "admin@cci.dev", roles }, SECRET);
}

describe("SecurityAuditController", () => {
  let app: INestApplication;
  const audit = { list: jest.fn() };

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [SecurityAuditController],
      providers: [{ provide: SecurityAuditService, useValue: audit }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    delete process.env.AUTH_JWT_SECRET;
    await app.close();
  });

  beforeEach(() => {
    audit.list.mockReset();
    audit.list.mockResolvedValue({ total: 0, events: [] });
  });

  it("sin token ⇒ 401", async () => {
    await request(app.getHttpServer()).get("/security-audit").expect(401);
  });

  it("con rol operator (no admin) ⇒ 403", async () => {
    await request(app.getHttpServer())
      .get("/security-audit")
      .set("Authorization", `Bearer ${tokenFor(["OPERATOR"])}`)
      .expect(403);
    expect(audit.list).not.toHaveBeenCalled();
  });

  it("admin sin query params ⇒ defaults (take 50, skip 0) y reenvía el propio Bearer", async () => {
    const token = tokenFor(["ADMIN"]);
    await request(app.getHttpServer())
      .get("/security-audit")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(audit.list).toHaveBeenCalledWith(
      { action: undefined, userId: undefined, skip: 0, take: 50 },
      token,
    );
  });

  it("pasa los filtros y paginación de la query", async () => {
    const token = tokenFor(["ADMIN"]);
    await request(app.getHttpServer())
      .get("/security-audit?action=LOGIN_FAILED&userId=u2&skip=20&take=10")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(audit.list).toHaveBeenCalledWith(
      { action: "LOGIN_FAILED", userId: "u2", skip: 20, take: 10 },
      token,
    );
  });

  it("take fuera de rango ⇒ 400", async () => {
    await request(app.getHttpServer())
      .get("/security-audit?take=500")
      .set("Authorization", `Bearer ${tokenFor(["ADMIN"])}`)
      .expect(400);
    await request(app.getHttpServer())
      .get("/security-audit?take=0")
      .set("Authorization", `Bearer ${tokenFor(["ADMIN"])}`)
      .expect(400);
  });

  it("skip negativo ⇒ 400", async () => {
    await request(app.getHttpServer())
      .get("/security-audit?skip=-1")
      .set("Authorization", `Bearer ${tokenFor(["ADMIN"])}`)
      .expect(400);
  });
});
