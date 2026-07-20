import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { ActionsModule } from "./actions/actions.module";
import { AlertsModule } from "./alerts/alerts.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { GatewayModule } from "./gateway/gateway.module";
import { HealthController } from "./health/health.controller";
import { JobsModule } from "./jobs/jobs.module";
import { MetricsModule } from "./metrics/metrics.module";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AuthModule,
    GatewayModule,
    MetricsModule,
    AlertsModule,
    ActionsModule,
    AuditModule,
    JobsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
