import { Module } from "@nestjs/common";

import { JobsModule } from "../jobs/jobs.module";
import { DependenciesHealthService } from "./dependencies-health.service";
import { HealthController } from "./health.controller";

@Module({
  imports: [JobsModule],
  controllers: [HealthController],
  providers: [DependenciesHealthService],
})
export class HealthModule {}
