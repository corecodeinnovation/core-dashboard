import { Injectable } from "@nestjs/common";
import { ANONYMOUS, roleFromClaims, type AuthUser } from "@core-dashboard/shared";
import * as jwt from "jsonwebtoken";

import { JwksKeyProvider } from "./jwks.provider";

// El JWT lo emite cci-auth-service; aquí SOLO se valida (mismo patrón que gql-core).
// Producción: firma RS256 verificada contra AUTH_JWKS_URL + `iss` de AUTH_ISSUER.
// Dev/test/CI: si existe AUTH_JWT_SECRET se valida HS256 (tokens de prueba,
// mitigación hasta que cci-auth-service esté desplegado).
@Injectable()
export class TokenService {
  constructor(private readonly jwks: JwksKeyProvider) {}

  // Token ausente o inválido → anónimo (viewer): la demo es read-only sin login
  // y los guards por rol deciden dónde exigir identidad real.
  async authenticate(token: string | null | undefined): Promise<AuthUser> {
    if (!token) return ANONYMOUS;
    try {
      const payload = await this.verify(token);
      if (typeof payload.sub !== "string" || payload.sub.length === 0) return ANONYMOUS;
      const claims = Array.isArray(payload.roles)
        ? payload.roles.filter((r): r is string => typeof r === "string")
        : [];
      return {
        sub: payload.sub,
        email: typeof payload.email === "string" ? payload.email : null,
        role: roleFromClaims(claims),
      };
    } catch {
      return ANONYMOUS;
    }
  }

  private async verify(token: string): Promise<jwt.JwtPayload> {
    const secret = process.env.AUTH_JWT_SECRET;
    if (secret) {
      return this.assertPayload(jwt.verify(token, secret, { algorithms: ["HS256"] }));
    }
    const { kid } = this.decodeHeader(token);
    const publicKey = await this.jwks.getPublicKey(kid);
    const issuer = process.env.AUTH_ISSUER ?? "https://auth.corecodeinnovation.com";
    // Allowlist explícita de algoritmos: nunca aceptar otros.
    return this.assertPayload(jwt.verify(token, publicKey, { algorithms: ["RS256"], issuer }));
  }

  private decodeHeader(token: string): { kid?: string } {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded) throw new Error("token ilegible");
    return decoded.header;
  }

  private assertPayload(decoded: string | jwt.JwtPayload): jwt.JwtPayload {
    if (typeof decoded === "string") throw new Error("payload inválido");
    return decoded;
  }
}
