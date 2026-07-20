import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as jwt from "jsonwebtoken";
import request from "supertest";

import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../prisma/prisma.service";
import { AlertsController } from "./alerts.controller";
import { CONTAINER_DOWN_ALERT_KEY, CONTAINER_RESTARTED_ALERT_KEY } from "./alerts.service";

const SECRET = "alerts-controller-test-secret";

function tokenFor(roles: string[]): string {
  return jwt.sign({ sub: "u1", roles }, SECRET);
}

describe("AlertsController", () => {
  let app: INestApplication;
  const prisma = {
    alertSetting: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
    },
  };

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [AlertsController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    delete process.env.AUTH_JWT_SECRET;
    await app.close();
  });

  it("sin token ⇒ 401", async () => {
    await request(app.getHttpServer()).get("/alerts/settings").expect(401);
  });

  it("con rol insuficiente (operator) ⇒ 403", async () => {
    await request(app.getHttpServer())
      .get("/alerts/settings")
      .set("Authorization", `Bearer ${tokenFor(["OPERATOR"])}`)
      .expect(403);
  });

  it("GET con rol admin ⇒ incluye los defaults de ambas categorías si no hay filas", async () => {
    prisma.alertSetting.findMany.mockResolvedValueOnce([]);
    const res = await request(app.getHttpServer())
      .get("/alerts/settings")
      .set("Authorization", `Bearer ${tokenFor(["ADMIN"])}`)
      .expect(200);
    expect(res.body).toEqual([
      expect.objectContaining({ key: CONTAINER_DOWN_ALERT_KEY, enabled: true }),
      expect.objectContaining({ key: CONTAINER_RESTARTED_ALERT_KEY, enabled: true }),
    ]);
  });

  it("GET no duplica una categoría que ya tiene fila en la base", async () => {
    prisma.alertSetting.findMany.mockResolvedValueOnce([
      {
        id: "1",
        key: CONTAINER_DOWN_ALERT_KEY,
        enabled: false,
        threshold: null,
        updatedBy: "u1",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const res = await request(app.getHttpServer())
      .get("/alerts/settings")
      .set("Authorization", `Bearer ${tokenFor(["ADMIN"])}`)
      .expect(200);
    expect(res.body).toHaveLength(2);
    expect(res.body).toEqual([
      expect.objectContaining({ key: CONTAINER_DOWN_ALERT_KEY, enabled: false }),
      expect.objectContaining({ key: CONTAINER_RESTARTED_ALERT_KEY, enabled: true }),
    ]);
  });

  it("PATCH con clave desconocida ⇒ 400", async () => {
    await request(app.getHttpServer())
      .patch("/alerts/settings/algo-random")
      .set("Authorization", `Bearer ${tokenFor(["ADMIN"])}`)
      .send({ enabled: false })
      .expect(400);
  });

  it("PATCH sin body útil ⇒ 400", async () => {
    await request(app.getHttpServer())
      .patch(`/alerts/settings/${CONTAINER_DOWN_ALERT_KEY}`)
      .set("Authorization", `Bearer ${tokenFor(["ADMIN"])}`)
      .send({})
      .expect(400);
  });

  it("PATCH válido ⇒ upsert con el sub del admin", async () => {
    prisma.alertSetting.upsert.mockResolvedValueOnce({
      key: CONTAINER_DOWN_ALERT_KEY,
      enabled: false,
      threshold: null,
      updatedBy: "u1",
    });

    await request(app.getHttpServer())
      .patch(`/alerts/settings/${CONTAINER_DOWN_ALERT_KEY}`)
      .set("Authorization", `Bearer ${tokenFor(["ADMIN"])}`)
      .send({ enabled: false })
      .expect(200);

    expect(prisma.alertSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: CONTAINER_DOWN_ALERT_KEY },
        update: expect.objectContaining({ enabled: false, updatedBy: "u1" }),
      }),
    );
  });
});
