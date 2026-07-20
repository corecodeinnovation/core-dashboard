import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { AuthModule } from "./auth/auth.module";
import { GatewayModule } from "./gateway/gateway.module";
import { HealthController } from "./health/health.controller";
import { MetricsModule } from "./metrics/metrics.module";

@Module({
  imports: [ScheduleModule.forRoot(), AuthModule, GatewayModule, MetricsModule],
  controllers: [HealthController],
})
export class AppModule {}
