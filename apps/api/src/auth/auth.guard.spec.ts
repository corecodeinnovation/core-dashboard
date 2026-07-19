import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthUser, Role } from "@core-dashboard/shared";

import { AuthGuard } from "./auth.guard";
import { TokenService } from "./token.service";

function contextFor(headers: Record<string, string>): {
  context: ExecutionContext;
  request: { headers: Record<string, string>; user?: AuthUser };
} {
  const request = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  return { context, request };
}

function guardWith(user: AuthUser, minRole: Role | undefined): AuthGuard {
  const tokens = { authenticate: jest.fn().mockResolvedValue(user) };
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(minRole) };
  return new AuthGuard(tokens as unknown as TokenService, reflector as unknown as Reflector);
}

describe("AuthGuard", () => {
  const viewerAnon: AuthUser = { sub: null, email: null, role: "viewer" };
  const viewerUser: AuthUser = { sub: "u1", email: null, role: "viewer" };
  const operator: AuthUser = { sub: "u2", email: null, role: "operator" };

  it("endpoint sin @RequireRole ⇒ pasa y adjunta req.user", async () => {
    const { context, request } = contextFor({});
    await expect(guardWith(viewerAnon, undefined).canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(viewerAnon);
  });

  it("rol suficiente ⇒ pasa", async () => {
    const { context } = contextFor({ authorization: "Bearer t" });
    await expect(guardWith(operator, "operator").canActivate(context)).resolves.toBe(true);
  });

  it("anónimo sin rango ⇒ 401", async () => {
    const { context } = contextFor({});
    await expect(guardWith(viewerAnon, "operator").canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("identificado sin rango ⇒ 403", async () => {
    const { context } = contextFor({ authorization: "Bearer t" });
    await expect(guardWith(viewerUser, "admin").canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
