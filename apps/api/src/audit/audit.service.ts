import { Injectable } from "@nestjs/common";
import type { AuditLog, Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";

export interface AuditLogFilters {
  action?: string;
  target?: string;
  userSub?: string;
  limit: number;
  offset: number;
}

export interface AuditLogPage {
  entries: AuditLog[];
  total: number;
}

// Consulta del audit log (RF-11): la escritura vive donde ocurre la acción
// (hoy solo ActionsService, en el restart); este servicio es solo lectura.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: AuditLogFilters): Promise<AuditLogPage> {
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.target ? { target: filters.target } : {}),
      ...(filters.userSub ? { userSub: filters.userSub } : {}),
    };
    const [entries, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: filters.limit,
        skip: filters.offset,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { entries, total };
  }
}
