import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AuthModule } from "../auth/auth.module";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";

describe("MetricsController", () => {
  let app: INestApplication;
  const metrics = {
    getLiveSeries: jest.fn().mockResolvedValue([{ t: 1, v: 0.5 }]),
    getHistory: jest.fn().mockResolvedValue([{ t: 2, v: 0.7 }]),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [MetricsController],
      providers: [{ provide: MetricsService, useValue: metrics }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /metrics/live responde la serie (acceso viewer, sin token)", async () => {
    const res = await request(app.getHttpServer())
      .get("/metrics/live?container=core-dashboard-api-1&metric=CPU&minutes=60")
      .expect(200);
    expect(res.body).toEqual({
      container: "core-dashboard-api-1",
      metric: "CPU",
      points: [{ t: 1, v: 0.5 }],
    });
    expect(metrics.getLiveSeries).toHaveBeenCalledWith("core-dashboard-api-1", "CPU", 60);
  });

  it("GET /metrics/history usa el default de 24 h", async () => {
    await request(app.getHttpServer())
      .get("/metrics/history?container=api-1&metric=MEMORY")
      .expect(200);
    expect(metrics.getHistory).toHaveBeenCalledWith("api-1", "MEMORY", 24);
  });

  it("métrica desconocida ⇒ 400", async () => {
    await request(app.getHttpServer()).get("/metrics/live?container=api-1&metric=DISK").expect(400);
  });

  it("nombre de contenedor inválido ⇒ 400", async () => {
    await request(app.getHttpServer()).get("/metrics/live?container=../etc&metric=CPU").expect(400);
  });

  it("ventana fuera de rango ⇒ 400", async () => {
    await request(app.getHttpServer())
      .get("/metrics/history?container=api-1&metric=CPU&hours=100000")
      .expect(400);
  });
});
