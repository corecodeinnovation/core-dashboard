import type { PrismaService } from "../prisma/prisma.service";
import { RetentionService } from "./retention.service";

function harness(auditCount = 0, jobCount = 0) {
  const prisma = {
    auditLog: { deleteMany: jest.fn().mockResolvedValue({ count: auditCount }) },
    jobRun: { deleteMany: jest.fn().mockResolvedValue({ count: jobCount }) },
  };
  return { service: new RetentionService(prisma as unknown as PrismaService), prisma };
}

describe("RetentionService", () => {
  describe("purgeAuditLogs / purgeJobRuns", () => {
    it("borra filas anteriores al corte de 30 días", async () => {
      const { service, prisma } = harness(5);
      const before = Date.now();

      const count = await service.purgeAuditLogs();

      expect(count).toBe(5);
      const where = prisma.auditLog.deleteMany.mock.calls[0]![0].where as {
        createdAt: { lt: Date };
      };
      const ageDays = (before - where.createdAt.lt.getTime()) / 86_400_000;
      expect(ageDays).toBeCloseTo(30, 1);
    });

    it("purgeJobRuns usa el mismo corte de 30 días", async () => {
      const { service, prisma } = harness(0, 3);
      const before = Date.now();

      const count = await service.purgeJobRuns();

      expect(count).toBe(3);
      const where = prisma.jobRun.deleteMany.mock.calls[0]![0].where as { createdAt: { lt: Date } };
      const ageDays = (before - where.createdAt.lt.getTime()) / 86_400_000;
      expect(ageDays).toBeCloseTo(30, 1);
    });
  });

  describe("purgeTick", () => {
    it("purga ambas tablas y no revienta si una falla", async () => {
      const { service, prisma } = harness(2, 1);
      await expect(service.purgeTick()).resolves.toBeUndefined();
      expect(prisma.auditLog.deleteMany).toHaveBeenCalledTimes(1);
      expect(prisma.jobRun.deleteMany).toHaveBeenCalledTimes(1);
    });

    it("un error en una tabla no bloquea la corrida ni tira la excepción", async () => {
      const { service, prisma } = harness();
      prisma.auditLog.deleteMany.mockRejectedValueOnce(new Error("db caída"));

      await expect(service.purgeTick()).resolves.toBeUndefined();
    });
  });

  describe("onModuleInit", () => {
    it("dispara una corrida de purga al arrancar", async () => {
      const { service, prisma } = harness();
      service.onModuleInit();
      await new Promise((r) => setImmediate(r));

      expect(prisma.auditLog.deleteMany).toHaveBeenCalled();
      expect(prisma.jobRun.deleteMany).toHaveBeenCalled();
    });
  });
});
