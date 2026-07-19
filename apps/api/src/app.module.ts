import { Module } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module";
import { GatewayModule } from "./gateway/gateway.module";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [AuthModule, GatewayModule],
  controllers: [HealthController],
})
export class AppModule {}
