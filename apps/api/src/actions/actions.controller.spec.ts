import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as jwt from "jsonwebtoken";
import request from "supertest";

import { AuthModule } from "../auth/auth.module";
import { ActionsController } from "./actions.controller";
import { ActionsService } from "./actions.service";

const SECRET = "actions-controller-test-secret";

function tokenFor(roles: string[]): string {
  return jwt.sign({ sub: "u1", email: "op@cci.dev", roles }, SECRET);
}

describe("ActionsController", () => {
  let app: INestApplication;
  const actions = { restartContainer: jest.fn() };

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [ActionsController],
      providers: [{ provide: ActionsService, useValue: actions }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    delete process.env.AUTH_JWT_SECRET;
    await app.close();
  });

  beforeEach(() => {
    actions.restartContainer.mockReset();
  });

  it("sin token ⇒ 401", async () => {
    await request(app.getHttpServer())
      .post("/actions/containers/core-dashboard-worker-1/restart")
      .expect(401);
  });

  it("con rol viewer (identificado, sin rango) ⇒ 403", async () => {
    await request(app.getHttpServer())
      .post("/actions/containers/core-dashboard-worker-1/restart")
      .set("Authorization", `Bearer ${tokenFor(["USER"])}`)
      .expect(403);
    expect(actions.restartContainer).not.toHaveBeenCalled();
  });

  it("con rol operator ⇒ delega al service con el usuario del token", async () => {
    actions.restartContainer.mockResolvedValue({ container: "core-dashboard-worker-1" });

    const res = await request(app.getHttpServer())
      .post("/actions/containers/core-dashboard-worker-1/restart")
      .set("Authorization", `Bearer ${tokenFor(["OPERATOR"])}`)
      .expect(201);

    expect(res.body).toEqual({ container: "core-dashboard-worker-1" });
    expect(actions.restartContainer).toHaveBeenCalledWith(
      "core-dashboard-worker-1",
      expect.objectContaining({ sub: "u1", role: "operator" }),
    );
  });

  it("rol admin también puede (Operator+)", async () => {
    actions.restartContainer.mockResolvedValue({ container: "x" });
    await request(app.getHttpServer())
      .post("/actions/containers/x/restart")
      .set("Authorization", `Bearer ${tokenFor(["ADMIN"])}`)
      .expect(201);
  });

  it("nombre de contenedor con caracteres inválidos ⇒ 400, no llega al service", async () => {
    await request(app.getHttpServer())
      .post("/actions/containers/bad*name/restart")
      .set("Authorization", `Bearer ${tokenFor(["OPERATOR"])}`)
      .expect(400);
    expect(actions.restartContainer).not.toHaveBeenCalled();
  });
});
