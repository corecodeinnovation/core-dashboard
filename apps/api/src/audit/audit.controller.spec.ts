import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as jwt from "jsonwebtoken";
import request from "supertest";

import { AuthModule } from "../auth/auth.module";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";

const SECRET = "audit-controller-test-secret";

function tokenFor(roles: string[]): string {
  return jwt.sign({ sub: "u1", roles }, SECRET);
}

describe("AuditController", () => {
  let app: INestApplication;
  const audit = { list: jest.fn() };

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [AuditController],
      providers: [{ provide: AuditService, useValue: audit }],
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
    audit.list.mockResolvedValue({ entries: [], total: 0 });
  });

  it("sin token ⇒ 401", async () => {
    await request(app.getHttpServer()).get("/audit-log").expect(401);
  });

  it("con rol operator (no admin) ⇒ 403", async () => {
    await request(app.getHttpServer())
      .get("/audit-log")
      .set("Authorization", `Bearer ${tokenFor(["OPERATOR"])}`)
      .expect(403);
    expect(audit.list).not.toHaveBeenCalled();
  });

  it("admin sin query params ⇒ defaults (limit 50, offset 0)", async () => {
    await request(app.getHttpServer())
      .get("/audit-log")
      .set("Authorization", `Bearer ${tokenFor(["ADMIN"])}`)
      .expect(200);
    expect(audit.list).toHaveBeenCalledWith({
      action: undefined,
      target: undefined,
      userSub: undefined,
      limit: 50,
      offset: 0,
    });
  });

  it("pasa los filtros y paginación de la query", async () => {
    await request(app.getHttpServer())
      .get("/audit-log?action=restart&target=api-1&userSub=u2&limit=10&offset=20")
      .set("Authorization", `Bearer ${tokenFor(["ADMIN"])}`)
      .expect(200);
    expect(audit.list).toHaveBeenCalledWith({
      action: "restart",
      target: "api-1",
      userSub: "u2",
      limit: 10,
      offset: 20,
    });
  });

  it("limit fuera de rango ⇒ 400", async () => {
    await request(app.getHttpServer())
      .get("/audit-log?limit=500")
      .set("Authorization", `Bearer ${tokenFor(["ADMIN"])}`)
      .expect(400);
    await request(app.getHttpServer())
      .get("/audit-log?limit=0")
      .set("Authorization", `Bearer ${tokenFor(["ADMIN"])}`)
      .expect(400);
  });

  it("offset negativo ⇒ 400", async () => {
    await request(app.getHttpServer())
      .get("/audit-log?offset=-1")
      .set("Authorization", `Bearer ${tokenFor(["ADMIN"])}`)
      .expect(400);
  });
});
