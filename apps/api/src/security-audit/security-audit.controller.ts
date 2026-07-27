import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

import { RequireRole } from "../auth/roles.decorator";
import { SecurityAuditPage, SecurityAuditService } from "./security-audit.service";

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

// Consulta del log de seguridad de cci-auth-service (RF-13): solo admin.
// Distinto del propio audit trail del dashboard, que vive en /audit-log.
@Controller("security-audit")
@RequireRole("admin")
export class SecurityAuditController {
  constructor(private readonly audit: SecurityAuditService) {}

  @Get()
  list(
    @Req() req: Request,
    @Query("action") action: string | undefined,
    @Query("userId") userId: string | undefined,
    @Query("skip") skipRaw: string | undefined,
    @Query("take") takeRaw: string | undefined,
  ): Promise<SecurityAuditPage> {
    const skip = this.parseNonNegativeInt(skipRaw, 0, "skip");
    const take = this.parseNonNegativeInt(takeRaw, DEFAULT_TAKE, "take");
    if (take < 1 || take > MAX_TAKE) {
      throw new BadRequestException(`take inválido (1..${MAX_TAKE})`);
    }

    return this.audit.list({ action, userId, skip, take }, this.extractToken(req));
  }

  // AuthGuard/RequireRole("admin") ya exigieron un Bearer válido para llegar
  // acá; se reextrae solo para reenviarlo tal cual a cci-auth-service.
  private extractToken(req: Request): string {
    const raw = req.headers.authorization;
    if (!raw?.startsWith("Bearer ")) throw new UnauthorizedException();
    return raw.slice("Bearer ".length);
  }

  private parseNonNegativeInt(raw: string | undefined, fallback: number, field: string): number {
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      throw new BadRequestException(`${field} inválido`);
    }
    return value;
  }
}
