import { Module } from "@nestjs/common";

import { ContainersModule } from "../containers/containers.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AlertsController } from "./alerts.controller";
import { AlertsService } from "./alerts.service";
import { NotifyBotClient } from "./notify-bot.client";

@Module({
  imports: [ContainersModule, PrismaModule],
  controllers: [AlertsController],
  providers: [NotifyBotClient, AlertsService],
})
export class AlertsModule {}
