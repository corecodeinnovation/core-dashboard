// Mismos 19 valores que el enum AuditAction de cci-auth-service.
export const SECURITY_AUDIT_ACTIONS = [
  "USER_REGISTERED",
  "EMAIL_VERIFIED",
  "EMAIL_VERIFICATION_RESENT",
  "LOGIN_SUCCEEDED",
  "LOGIN_FAILED",
  "LOGOUT",
  "TOKEN_REUSE_DETECTED",
  "SESSION_REVOKED",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET_COMPLETED",
  "OAUTH_LOGIN",
  "OAUTH_ACCOUNT_LINKED",
  "ROLES_UPDATED",
  "TWO_FACTOR_ENABLED",
  "TWO_FACTOR_DISABLED",
  "TWO_FACTOR_BACKUP_CODE_USED",
  "TWO_FACTOR_BACKUP_CODES_REGENERATED",
  "CLIENT_TOKEN_ISSUED",
  "CLIENT_TOKEN_REJECTED",
] as const;

export type SecurityAuditAction = (typeof SECURITY_AUDIT_ACTIONS)[number];

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
  action?: SecurityAuditAction;
  userId?: string;
  skip: number;
  take: number;
}

export class SecurityAuditApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

// RF-13: log de seguridad de cci-auth-service, vía proxy admin-only del api.
export async function fetchSecurityAudit(
  filters: SecurityAuditFilters,
  accessToken: string,
): Promise<SecurityAuditPage> {
  const params = new URLSearchParams({
    skip: String(filters.skip),
    take: String(filters.take),
  });
  if (filters.action) params.set("action", filters.action);
  if (filters.userId) params.set("userId", filters.userId);

  const response = await fetch(`/api/security-audit?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data as { message?: string })?.message ?? `HTTP ${response.status}`;
    throw new SecurityAuditApiError(
      Array.isArray(message) ? message.join(", ") : message,
      response.status,
    );
  }
  return data as SecurityAuditPage;
}
