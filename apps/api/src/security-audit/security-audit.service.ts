import { HttpException, Injectable, ServiceUnavailableException } from "@nestjs/common";

// Mismos 19 valores que el enum AuditAction de cci-auth-service (prisma/schema.prisma).
export type SecurityAuditAction =
  | "USER_REGISTERED"
  | "EMAIL_VERIFIED"
  | "EMAIL_VERIFICATION_RESENT"
  | "LOGIN_SUCCEEDED"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "TOKEN_REUSE_DETECTED"
  | "SESSION_REVOKED"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET_COMPLETED"
  | "OAUTH_LOGIN"
  | "OAUTH_ACCOUNT_LINKED"
  | "ROLES_UPDATED"
  | "TWO_FACTOR_ENABLED"
  | "TWO_FACTOR_DISABLED"
  | "TWO_FACTOR_BACKUP_CODE_USED"
  | "TWO_FACTOR_BACKUP_CODES_REGENERATED"
  | "CLIENT_TOKEN_ISSUED"
  | "CLIENT_TOKEN_REJECTED";

export interface SecurityAuditEvent {
  id: string;
  action: SecurityAuditAction;
  userId: string | null;
  actorId: string | null;
  ip: string | null;
  device: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface SecurityAuditPage {
  total: number;
  events: SecurityAuditEvent[];
}

export interface SecurityAuditFilters {
  action?: string;
  userId?: string;
  skip: number;
  take: number;
}

// Log de seguridad de cci-auth-service (RF-13), no el audit trail propio del
// dashboard (ver AuditModule en ../audit). Es delegación pura: reenvía el
// Bearer del propio usuario admin, ya validado por AuthGuard/RequireRole acá
// — el JWT lo emite cci-auth-service, así que su propio RolesGuard(ADMIN) lo
// vuelve a aceptar sin credenciales de servicio aparte.
@Injectable()
export class SecurityAuditService {
  async list(filters: SecurityAuditFilters, accessToken: string): Promise<SecurityAuditPage> {
    const baseUrl = process.env.AUTH_SERVICE_URL;
    if (!baseUrl) throw new ServiceUnavailableException("AUTH_SERVICE_URL no configurado");

    const query = new URLSearchParams({
      skip: String(filters.skip),
      take: String(filters.take),
    });
    if (filters.action) query.set("action", filters.action);
    if (filters.userId) query.set("userId", filters.userId);

    let response: Response;
    try {
      response = await fetch(new URL(`/audit?${query}`, baseUrl), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (err) {
      throw new ServiceUnavailableException(
        `no se pudo contactar al servicio de autenticación: ${(err as Error).message}`,
      );
    }

    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) throw new HttpException(data as Record<string, unknown>, response.status);
    return data as SecurityAuditPage;
  }
}
