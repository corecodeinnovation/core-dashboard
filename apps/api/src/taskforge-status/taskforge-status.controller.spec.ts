import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as jwt from "jsonwebtoken";
import request from "supertest";

import { AuthModule } from "../auth/auth.module";
import { TaskforgeStatusController } from "./taskforge-status.controller";
import { TaskforgeStatusService } from "./taskforge-status.service";

const SECRET = "taskforge-status-controller-test-secret";

function tokenFor(roles: string[]): string {
  return jwt.sign({ sub: "u1", email: "op@cci.dev", roles }, SECRET);
}

describe("TaskforgeStatusController", () => {
  let app: INestApplication;
  const status = { getStatus: jest.fn() };

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [TaskforgeStatusController],
      providers: [{ provide: TaskforgeStatusService, useValue: status }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    delete process.env.AUTH_JWT_SECRET;
    await app.close();
  });

  beforeEach(() => {
    status.getStatus.mockReset();
  });

  it("sin token ⇒ 401", async () => {
    await request(app.getHttpServer()).get("/taskforge-status").expect(401);
  });

  it("con rol viewer (identificado, sin rango) ⇒ 403", async () => {
    await request(app.getHttpServer())
      .get("/taskforge-status")
      .set("Authorization", `Bearer ${tokenFor(["USER"])}`)
      .expect(403);
    expect(status.getStatus).not.toHaveBeenCalled();
  });

  it("con rol operator ⇒ devuelve el estado", async () => {
    status.getStatus.mockResolvedValue({
      counts: { queued: 0, active: 0, delayed: 0, completed: 0, failed: 0, dlq: 0 },
      recentFailures: [],
    });
    const res = await request(app.getHttpServer())
      .get("/taskforge-status")
      .set("Authorization", `Bearer ${tokenFor(["OPERATOR"])}`)
      .expect(200);
    expect(res.body.counts).toEqual({
      queued: 0,
      active: 0,
      delayed: 0,
      completed: 0,
      failed: 0,
      dlq: 0,
    });
  });

  it("rol admin también puede (operator+)", async () => {
    status.getStatus.mockResolvedValue({ counts: {}, recentFailures: [] });
    await request(app.getHttpServer())
      .get("/taskforge-status")
      .set("Authorization", `Bearer ${tokenFor(["ADMIN"])}`)
      .expect(200);
  });
});
