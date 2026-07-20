import { BadRequestException, Controller, Get, Query } from "@nestjs/common";

import { RequireRole } from "../auth/roles.decorator";
import { AuditService, type AuditLogPage } from "./audit.service";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// Consulta del audit log (RF-11): solo admin, nunca operator (el que ejecuta
// la acción no necesariamente debe poder ver/borrar rastro de todas).
@Controller("audit-log")
@RequireRole("admin")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  async list(
    @Query("action") action: string | undefined,
    @Query("target") target: string | undefined,
    @Query("userSub") userSub: string | undefined,
    @Query("limit") limitRaw: string | undefined,
    @Query("offset") offsetRaw: string | undefined,
  ): Promise<AuditLogPage> {
    const limit = this.parseNonNegativeInt(limitRaw, DEFAULT_LIMIT, "limit");
    if (limit < 1 || limit > MAX_LIMIT) {
      throw new BadRequestException(`limit inválido (1..${MAX_LIMIT})`);
    }
    const offset = this.parseNonNegativeInt(offsetRaw, 0, "offset");

    return this.audit.list({ action, target, userSub, limit, offset });
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
