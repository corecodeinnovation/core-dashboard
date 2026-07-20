import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as jwt from "jsonwebtoken";
import request from "supertest";

import { AuthModule } from "../auth/auth.module";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";

const SECRET = "jobs-controller-test-secret";

function tokenFor(roles: string[]): string {
  return jwt.sign({ sub: "u1", email: "op@cci.dev", roles }, SECRET);
}

describe("JobsController", () => {
  let app: INestApplication;
  const jobs = { triggerDemo: jest.fn(), list: jest.fn(), refreshStatus: jest.fn() };

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [JobsController],
      providers: [{ provide: JobsService, useValue: jobs }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    delete process.env.AUTH_JWT_SECRET;
    await app.close();
  });

  beforeEach(() => {
    Object.values(jobs).forEach((fn) => fn.mockReset());
  });

  it("sin token ⇒ 401 en todas las rutas", async () => {
    await request(app.getHttpServer()).post("/jobs/demo").expect(401);
    await request(app.getHttpServer()).get("/jobs").expect(401);
    await request(app.getHttpServer()).get("/jobs/r1").expect(401);
  });

  it("con rol viewer identificado (sin rango) ⇒ 403", async () => {
    await request(app.getHttpServer())
      .post("/jobs/demo")
      .set("Authorization", `Bearer ${tokenFor(["USER"])}`)
      .expect(403);
    expect(jobs.triggerDemo).not.toHaveBeenCalled();
  });

  it("POST /jobs/demo con operator ⇒ delega con el user y los steps del body", async () => {
    jobs.triggerDemo.mockResolvedValue({ id: "r1", externalId: "j1", status: "PENDING" });
    const res = await request(app.getHttpServer())
      .post("/jobs/demo")
      .set("Authorization", `Bearer ${tokenFor(["OPERATOR"])}`)
      .send({ steps: 3 })
      .expect(201);
    expect(jobs.triggerDemo).toHaveBeenCalledWith(
      expect.objectContaining({ sub: "u1", role: "operator" }),
      3,
    );
    expect(res.body).toEqual({ id: "r1", externalId: "j1", status: "PENDING" });
  });

  it("POST /jobs/demo sin body ⇒ steps undefined (el service pone el default)", async () => {
    jobs.triggerDemo.mockResolvedValue({});
    await request(app.getHttpServer())
      .post("/jobs/demo")
      .set("Authorization", `Bearer ${tokenFor(["ADMIN"])}`)
      .expect(201);
    expect(jobs.triggerDemo).toHaveBeenCalledWith(expect.anything(), undefined);
  });

  it("GET /jobs con operator ⇒ devuelve la lista del service", async () => {
    jobs.list.mockResolvedValue([{ id: "r1" }, { id: "r2" }]);
    const res = await request(app.getHttpServer())
      .get("/jobs")
      .set("Authorization", `Bearer ${tokenFor(["OPERATOR"])}`)
      .expect(200);
    expect(res.body).toEqual([{ id: "r1" }, { id: "r2" }]);
  });

  it("GET /jobs/:id refresca y devuelve el job puntual", async () => {
    jobs.refreshStatus.mockResolvedValue({ id: "r1", status: "COMPLETED" });
    const res = await request(app.getHttpServer())
      .get("/jobs/r1")
      .set("Authorization", `Bearer ${tokenFor(["OPERATOR"])}`)
      .expect(200);
    expect(jobs.refreshStatus).toHaveBeenCalledWith("r1");
    expect(res.body).toEqual({ id: "r1", status: "COMPLETED" });
  });
});
