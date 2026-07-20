import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AuthProxyService } from "./auth-proxy.service";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { JwksKeyProvider } from "./jwks.provider";
import { TokenService } from "./token.service";

@Module({
  providers: [
    JwksKeyProvider,
    TokenService,
    AuthProxyService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  controllers: [AuthController],
  exports: [TokenService],
})
export class AuthModule {}
