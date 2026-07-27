import { Module } from "@nestjs/common";

import { ContainersModule } from "../containers/containers.module";
import { GatewayModule } from "../gateway/gateway.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AlertsFeedController } from "./alerts-feed.controller";
import { AlertsController } from "./alerts.controller";
import { AlertsPollerService } from "./alerts-poller.service";
import { AlertsService } from "./alerts.service";
import { NotifyBotClient } from "./notify-bot.client";

@Module({
  imports: [ContainersModule, PrismaModule, GatewayModule],
  controllers: [AlertsController, AlertsFeedController],
  providers: [NotifyBotClient, AlertsService, AlertsPollerService],
})
export class AlertsModule {}
