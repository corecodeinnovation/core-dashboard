import { HttpException, Injectable, ServiceUnavailableException } from "@nestjs/common";

// Reenvía login/refresh/2FA a cci-auth-service. El browser nunca le habla
// directo (evita depender de que ese servicio tenga nuestro origen en su
// CORS_ORIGINS): todo pasa por este mismo origen vía /api/auth/*.
// El password viaja solo en este cuerpo de request, nunca se loguea.
@Injectable()
export class AuthProxyService {
  login(email: string, password: string): Promise<unknown> {
    return this.forward("/auth/login", { email, password });
  }

  verifyTwoFactor(challengeToken: string, code: string): Promise<unknown> {
    return this.forward("/2fa/verify", { challengeToken, code });
  }

  refresh(refreshToken: string): Promise<unknown> {
    return this.forward("/auth/refresh", { refreshToken });
  }

  logout(refreshToken: string): Promise<unknown> {
    return this.forward("/auth/logout", { refreshToken });
  }

  private async forward(path: string, body: unknown): Promise<unknown> {
    const baseUrl = process.env.AUTH_SERVICE_URL;
    if (!baseUrl) throw new ServiceUnavailableException("AUTH_SERVICE_URL no configurado");

    let response: Response;
    try {
      response = await fetch(new URL(path, baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ServiceUnavailableException("no se pudo contactar al servicio de autenticación");
    }

    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) throw new HttpException(data as Record<string, unknown>, response.status);
    return data;
  }
}
