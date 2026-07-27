import { Module } from "@nestjs/common";

import { ContainersModule } from "../containers/containers.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AlertsFeedController } from "./alerts-feed.controller";
import { AlertsController } from "./alerts.controller";
import { AlertsService } from "./alerts.service";
import { NotifyBotClient } from "./notify-bot.client";

@Module({
  imports: [ContainersModule, PrismaModule],
  controllers: [AlertsController, AlertsFeedController],
  providers: [NotifyBotClient, AlertsService],
})
export class AlertsModule {}
