import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ContainersModule } from "../containers/containers.module";
import { LogsModule } from "../logs/logs.module";
import { LiveGateway } from "./live.gateway";

@Module({
  imports: [AuthModule, ContainersModule, LogsModule],
  providers: [LiveGateway],
  exports: [LiveGateway],
})
export class GatewayModule {}
