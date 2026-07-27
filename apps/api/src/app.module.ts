import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { ActionsModule } from "./actions/actions.module";
import { AlertsModule } from "./alerts/alerts.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { GatewayModule } from "./gateway/gateway.module";
import { HealthModule } from "./health/health.module";
import { JobsModule } from "./jobs/jobs.module";
import { MetricsModule } from "./metrics/metrics.module";
import { RetentionModule } from "./retention/retention.module";
import { SecurityAuditModule } from "./security-audit/security-audit.module";
import { TaskforgeStatusModule } from "./taskforge-status/taskforge-status.module";

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
    RetentionModule,
    SecurityAuditModule,
    TaskforgeStatusModule,
    HealthModule,
  ],
})
export class AppModule {}
