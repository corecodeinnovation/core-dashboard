import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { hasRole, type AuthUser, type Role } from "@core-dashboard/shared";
import type { Request } from "express";

import { MIN_ROLE_KEY } from "./roles.decorator";
import { TokenService } from "./token.service";

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

// Guard global REST: siempre autentica (anónimo ⇒ viewer) y solo bloquea
// cuando el handler declara un rol mínimo con @RequireRole.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = await this.tokens.authenticate(this.extractToken(request));

    const minRole = this.reflector.getAllAndOverride<Role | undefined>(MIN_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!minRole || hasRole(request.user, minRole)) return true;
    // Sin identidad: falta login (401). Con identidad pero sin rango: 403.
    if (request.user.sub === null) throw new UnauthorizedException();
    throw new ForbiddenException();
  }

  private extractToken(request: Request): string | null {
    const raw = request.headers.authorization;
    if (!raw?.startsWith("Bearer ")) return null;
    return raw.slice("Bearer ".length);
  }
}
