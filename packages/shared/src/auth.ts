export const ROLES = ["viewer", "operator", "admin"] as const;

export type Role = (typeof ROLES)[number];

export interface AuthUser {
  sub: string | null;
  email: string | null;
  role: Role;
}

export const ANONYMOUS: AuthUser = { sub: null, email: null, role: "viewer" };

// Claim `roles` de cci-auth-service (USER | OPERATOR | ADMIN) → nivel de acceso
// del dashboard. Gana el rol más alto presente; sin claims reconocidos, viewer.
export function roleFromClaims(claims: readonly string[]): Role {
  if (claims.includes("ADMIN")) return "admin";
  if (claims.includes("OPERATOR")) return "operator";
  return "viewer";
}

export function hasRole(user: AuthUser, min: Role): boolean {
  return ROLES.indexOf(user.role) >= ROLES.indexOf(min);
}
