import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AuthGuard } from "./auth.guard";
import { JwksKeyProvider } from "./jwks.provider";
import { TokenService } from "./token.service";

@Module({
  providers: [JwksKeyProvider, TokenService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [TokenService],
})
export class AuthModule {}
