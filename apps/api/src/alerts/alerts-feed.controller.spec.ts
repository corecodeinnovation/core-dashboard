import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AuthModule } from "../auth/auth.module";
import { AlertsFeedController } from "./alerts-feed.controller";
import { NotifyBotClient } from "./notify-bot.client";

describe("AlertsFeedController", () => {
  let app: INestApplication;
  const notifyBot = { listAlerts: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [AlertsFeedController],
      providers: [{ provide: NotifyBotClient, useValue: notifyBot }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    notifyBot.listAlerts.mockReset();
    notifyBot.listAlerts.mockResolvedValue({ total: 0, items: [] });
  });

  it("público: sin token también responde 200 (mismo nivel que el grid de contenedores)", async () => {
    await request(app.getHttpServer()).get("/alerts/feed").expect(200);
    expect(notifyBot.listAlerts).toHaveBeenCalledWith({ limit: 50, offset: 0, type: undefined });
  });

  it("pasa los filtros y paginación de la query", async () => {
    await request(app.getHttpServer())
      .get("/alerts/feed?type=job_dlq&limit=10&offset=20")
      .expect(200);
    expect(notifyBot.listAlerts).toHaveBeenCalledWith({ limit: 10, offset: 20, type: "job_dlq" });
  });

  it("limit fuera de rango ⇒ 400", async () => {
    await request(app.getHttpServer()).get("/alerts/feed?limit=500").expect(400);
    await request(app.getHttpServer()).get("/alerts/feed?limit=0").expect(400);
    expect(notifyBot.listAlerts).not.toHaveBeenCalled();
  });

  it("offset negativo ⇒ 400", async () => {
    await request(app.getHttpServer()).get("/alerts/feed?offset=-1").expect(400);
  });
});
