import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";
import { PrometheusService } from "./prometheus.service";

@Module({
  imports: [PrismaModule],
  controllers: [MetricsController],
  providers: [PrometheusService, MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
