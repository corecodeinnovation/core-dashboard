import type { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "./audit.service";

function harness(entries: unknown[] = [], total = entries.length) {
  const prisma = {
    auditLog: {
      findMany: jest.fn().mockResolvedValue(entries),
      count: jest.fn().mockResolvedValue(total),
    },
  };
  return { service: new AuditService(prisma as unknown as PrismaService), prisma };
}

describe("AuditService.list", () => {
  it("ordena por createdAt desc y aplica limit/offset", async () => {
    const { service, prisma } = harness([{ id: "1" }], 1);

    await service.list({ limit: 20, offset: 40 });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" }, take: 20, skip: 40 }),
    );
  });

  it("sin filtros ⇒ where vacío", async () => {
    const { service, prisma } = harness();
    await service.list({ limit: 10, offset: 0 });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    expect(prisma.auditLog.count).toHaveBeenCalledWith({ where: {} });
  });

  it("arma el where solo con los filtros presentes", async () => {
    const { service, prisma } = harness();
    await service.list({ limit: 10, offset: 0, action: "restart", target: "api-1" });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { action: "restart", target: "api-1" } }),
    );
  });

  it("filtra por userSub", async () => {
    const { service, prisma } = harness();
    await service.list({ limit: 10, offset: 0, userSub: "u1" });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userSub: "u1" } }),
    );
  });

  it("devuelve entries y total del count independiente (paginación real)", async () => {
    const { service } = harness([{ id: "1" }, { id: "2" }], 57);
    const page = await service.list({ limit: 2, offset: 0 });
    expect(page.entries).toHaveLength(2);
    expect(page.total).toBe(57);
  });
});
