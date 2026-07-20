import { NotFoundException } from "@nestjs/common";
import type { AuthUser } from "@core-dashboard/shared";
import { JobRunStatus } from "@prisma/client";

import type { PrismaService } from "../prisma/prisma.service";
import { JobsService } from "./jobs.service";
import type { TaskforgeClient } from "./taskforge-client.service";

const OPERATOR: AuthUser = { sub: "u1", email: "op@cci.dev", role: "operator" };

function harness() {
  const taskforge = { enqueueDemoJob: jest.fn(), getJobStatus: jest.fn() };
  const prisma = {
    jobRun: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new JobsService(
    taskforge as unknown as TaskforgeClient,
    prisma as unknown as PrismaService,
  );
  return { service, taskforge, prisma };
}

describe("JobsService", () => {
  describe("triggerDemo", () => {
    it("encola en taskforge y persiste el JobRun con el estado mapeado", async () => {
      const { service, taskforge, prisma } = harness();
      taskforge.enqueueDemoJob.mockResolvedValue({ jobId: "j1", queue: "heavy", state: "queued" });
      prisma.jobRun.create.mockResolvedValue({ id: "r1", externalId: "j1", status: "PENDING" });

      const result = await service.triggerDemo(OPERATOR, 7);

      expect(taskforge.enqueueDemoJob).toHaveBeenCalledWith(7);
      expect(prisma.jobRun.create).toHaveBeenCalledWith({
        data: { externalId: "j1", status: JobRunStatus.PENDING, requestedBy: "u1" },
      });
      expect(result).toEqual({ id: "r1", externalId: "j1", status: "PENDING" });
    });

    it.each([
      [undefined, 5],
      [0, 5],
      [-3, 5],
      [1.5, 5],
      [3, 3],
      [50, 20],
    ])("steps=%p ⇒ clamp a %p", async (input, expected) => {
      const { service, taskforge, prisma } = harness();
      taskforge.enqueueDemoJob.mockResolvedValue({ jobId: "j1", queue: "heavy", state: "queued" });
      prisma.jobRun.create.mockResolvedValue({});

      await service.triggerDemo(OPERATOR, input as number | undefined);

      expect(taskforge.enqueueDemoJob).toHaveBeenCalledWith(expected);
    });

    it("sin sub (no debería pasar, RBAC lo garantiza) ⇒ fallback defensivo", async () => {
      const { service, taskforge, prisma } = harness();
      taskforge.enqueueDemoJob.mockResolvedValue({ jobId: "j1", queue: "heavy", state: "queued" });
      prisma.jobRun.create.mockResolvedValue({});

      await service.triggerDemo({ sub: null, email: null, role: "viewer" }, 1);

      expect(prisma.jobRun.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ requestedBy: "unknown" }) }),
      );
    });
  });

  describe("list", () => {
    it("devuelve el histórico ordenado por fecha descendente", async () => {
      const { service, prisma } = harness();
      prisma.jobRun.findMany.mockResolvedValue([{ id: "r1" }]);
      const result = await service.list();
      expect(prisma.jobRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: "desc" } }),
      );
      expect(result).toEqual([{ id: "r1" }]);
    });
  });

  describe("refreshStatus", () => {
    it("job desconocido ⇒ NotFoundException", async () => {
      const { service, prisma } = harness();
      prisma.jobRun.findUnique.mockResolvedValue(null);
      await expect(service.refreshStatus("nope")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("consulta taskforge y actualiza el estado si cambió", async () => {
      const { service, taskforge, prisma } = harness();
      prisma.jobRun.findUnique.mockResolvedValue({
        id: "r1",
        externalId: "j1",
        status: JobRunStatus.PENDING,
      });
      taskforge.getJobStatus.mockResolvedValue({ jobId: "j1", name: "x", state: "completed" });
      prisma.jobRun.update.mockResolvedValue({ id: "r1", status: JobRunStatus.COMPLETED });

      const result = await service.refreshStatus("r1");

      expect(taskforge.getJobStatus).toHaveBeenCalledWith("j1");
      expect(prisma.jobRun.update).toHaveBeenCalledWith({
        where: { id: "r1" },
        data: { status: JobRunStatus.COMPLETED },
      });
      expect(result).toEqual({ id: "r1", status: JobRunStatus.COMPLETED });
    });

    it("si el estado no cambió, no escribe en la base", async () => {
      const { service, taskforge, prisma } = harness();
      const current = { id: "r1", externalId: "j1", status: JobRunStatus.RUNNING };
      prisma.jobRun.findUnique.mockResolvedValue(current);
      taskforge.getJobStatus.mockResolvedValue({ jobId: "j1", name: "x", state: "active" });

      const result = await service.refreshStatus("r1");

      expect(prisma.jobRun.update).not.toHaveBeenCalled();
      expect(result).toBe(current);
    });

    it("si taskforge falla, devuelve el estado stale sin romper", async () => {
      const { service, taskforge, prisma } = harness();
      const current = { id: "r1", externalId: "j1", status: JobRunStatus.PENDING };
      prisma.jobRun.findUnique.mockResolvedValue(current);
      taskforge.getJobStatus.mockRejectedValue(new Error("taskforge caído"));

      const result = await service.refreshStatus("r1");

      expect(result).toBe(current);
      expect(prisma.jobRun.update).not.toHaveBeenCalled();
    });
  });
});
