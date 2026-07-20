import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import type { AuthUser } from "@core-dashboard/shared";

import { AuthProxyService } from "./auth-proxy.service";
import type { AuthenticatedRequest } from "./auth.guard";

interface LoginBody {
  email?: string;
  password?: string;
}

interface TwoFactorBody {
  challengeToken?: string;
  code?: string;
}

interface RefreshBody {
  refreshToken?: string;
}

// BFF de auth: el web solo le habla a este mismo origen (/api/auth/*); acá
// se reenvía a cci-auth-service. Público (sin @RequireRole): login no puede
// exigir estar logueado.
@Controller("auth")
export class AuthController {
  constructor(private readonly proxy: AuthProxyService) {}

  @Post("login")
  login(@Body() body: LoginBody): Promise<unknown> {
    this.requireFields(body, ["email", "password"]);
    return this.proxy.login(body.email!, body.password!);
  }

  @Post("2fa/verify")
  verifyTwoFactor(@Body() body: TwoFactorBody): Promise<unknown> {
    this.requireFields(body, ["challengeToken", "code"]);
    return this.proxy.verifyTwoFactor(body.challengeToken!, body.code!);
  }

  @Post("refresh")
  refresh(@Body() body: RefreshBody): Promise<unknown> {
    this.requireFields(body, ["refreshToken"]);
    return this.proxy.refresh(body.refreshToken!);
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@Body() body: RefreshBody): Promise<{ message: string }> {
    // Best-effort: si el refresh ya venció o cci-auth-service no responde,
    // el web igual limpia su estado local; no tiene sentido bloquear el logout.
    if (body.refreshToken) {
      await this.proxy.logout(body.refreshToken).catch(() => {});
    }
    return { message: "sesión cerrada" };
  }

  // El AuthGuard global ya autenticó y adjuntó req.user (viewer si no hay
  // token válido): esto le permite al web confirmar rol/identidad sin
  // decodificar el JWT del lado del cliente.
  @Get("me")
  me(@Req() req: AuthenticatedRequest): AuthUser {
    return req.user;
  }

  private requireFields<T extends object>(body: T, fields: (keyof T)[]): void {
    const missing = fields.filter((f) => !body[f]);
    if (missing.length > 0) {
      throw new BadRequestException(`faltan campos: ${missing.join(", ")}`);
    }
  }
}
