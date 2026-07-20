import { ForbiddenException, HttpException, NotFoundException } from "@nestjs/common";
import type { AuthUser, ServiceState } from "@core-dashboard/shared";

import type { ContainersService } from "../containers/containers.service";
import type { PrismaService } from "../prisma/prisma.service";
import { ActionsService } from "./actions.service";

const OPERATOR: AuthUser = { sub: "u1", email: "op@cci.dev", role: "operator" };

function serviceState(partial: Partial<ServiceState> = {}): ServiceState {
  return {
    id: "abc123456789",
    name: "core-dashboard-worker-1",
    service: "worker",
    project: "taskforge",
    image: "taskforge-worker",
    status: "running",
    health: "healthy",
    startedAt: new Date().toISOString(),
    uptimeSec: 100,
    ...partial,
  };
}

function harness(found: ServiceState | null) {
  const containers = {
    findManagedByName: jest.fn().mockResolvedValue(found),
    restart: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = { auditLog: { create: jest.fn().mockResolvedValue(undefined) } };
  const service = new ActionsService(
    containers as unknown as ContainersService,
    prisma as unknown as PrismaService,
  );
  return { service, containers, prisma };
}

describe("ActionsService.restartContainer", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.PROTECTED_PROJECTS;
  });

  afterAll(() => {
    process.env = env;
  });

  it("contenedor gestionado y no protegido ⇒ reinicia y audita ok", async () => {
    const { service, containers, prisma } = harness(serviceState());

    const result = await service.restartContainer("core-dashboard-worker-1", OPERATOR);

    expect(containers.restart).toHaveBeenCalledWith("core-dashboard-worker-1");
    expect(result).toEqual({ container: "core-dashboard-worker-1" });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userSub: "u1",
        userEmail: "op@cci.dev",
        role: "operator",
        action: "restart",
        target: "core-dashboard-worker-1",
        result: "ok",
      },
    });
  });

  it("contenedor desconocido ⇒ 404, no llama a Docker ni audita", async () => {
    const { service, containers, prisma } = harness(null);

    await expect(service.restartContainer("no-existe", OPERATOR)).rejects.toThrow(
      NotFoundException,
    );
    expect(containers.restart).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it.each(["core-dashboard", "cci-auth-service"])(
    "proyecto protegido por default (%s) ⇒ 403, no reinicia",
    async (project) => {
      const { service, containers } = harness(serviceState({ project }));
      await expect(service.restartContainer("x", OPERATOR)).rejects.toThrow(ForbiddenException);
      expect(containers.restart).not.toHaveBeenCalled();
    },
  );

  it("PROTECTED_PROJECTS es configurable por env", async () => {
    process.env.PROTECTED_PROJECTS = "taskforge";
    const { service, containers } = harness(serviceState({ project: "taskforge" }));
    await expect(service.restartContainer("x", OPERATOR)).rejects.toThrow(ForbiddenException);
    expect(containers.restart).not.toHaveBeenCalled();
  });

  it("cooldown: dos restarts seguidos del mismo contenedor ⇒ 429 en el segundo", async () => {
    const { service, containers } = harness(serviceState());
    await service.restartContainer("core-dashboard-worker-1", OPERATOR);
    await expect(service.restartContainer("core-dashboard-worker-1", OPERATOR)).rejects.toThrow(
      HttpException,
    );
    expect(containers.restart).toHaveBeenCalledTimes(1);
  });

  it("cooldown es por contenedor: otro contenedor no se ve afectado", async () => {
    const { service, containers } = harness(serviceState());
    await service.restartContainer("core-dashboard-worker-1", OPERATOR);
    containers.findManagedByName.mockResolvedValueOnce(
      serviceState({ name: "core-dashboard-other-1" }),
    );
    await expect(
      service.restartContainer("core-dashboard-other-1", OPERATOR),
    ).resolves.toBeDefined();
    expect(containers.restart).toHaveBeenCalledTimes(2);
  });

  it("presupuesto global: el 11º restart en la ventana ⇒ 429", async () => {
    const { service, containers } = harness(serviceState());
    for (let i = 0; i < 10; i++) {
      containers.findManagedByName.mockResolvedValueOnce(serviceState({ name: `c-${i}` }));
      await service.restartContainer(`c-${i}`, OPERATOR);
    }
    containers.findManagedByName.mockResolvedValueOnce(serviceState({ name: "c-11" }));
    await expect(service.restartContainer("c-11", OPERATOR)).rejects.toThrow(HttpException);
    expect(containers.restart).toHaveBeenCalledTimes(10);
  });

  it("Docker rechaza el restart ⇒ 502 y audita error", async () => {
    const { service, containers, prisma } = harness(serviceState());
    containers.restart.mockRejectedValueOnce(new Error("no such container"));

    await expect(service.restartContainer("core-dashboard-worker-1", OPERATOR)).rejects.toThrow(
      HttpException,
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ result: "error", target: "core-dashboard-worker-1" }),
    });
  });
});
