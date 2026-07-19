import { Injectable } from "@nestjs/common";
import { JwksClient } from "jwks-rsa";

// Claves públicas RS256 de cci-auth-service, elegidas por `kid`.
// Inyectable para poder sustituirlo en tests por un keypair local.
@Injectable()
export class JwksKeyProvider {
  private client: JwksClient | null = null;

  async getPublicKey(kid: string | undefined): Promise<string> {
    const jwksUri = process.env.AUTH_JWKS_URL;
    if (!jwksUri) {
      throw new Error("auth no configurada (AUTH_JWKS_URL/AUTH_JWT_SECRET)");
    }
    this.client ??= new JwksClient({ jwksUri, cache: true });
    const key = await this.client.getSigningKey(kid);
    return key.getPublicKey();
  }
}
