import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ContainersModule } from "../containers/containers.module";
import { LiveGateway } from "./live.gateway";

@Module({
  imports: [AuthModule, ContainersModule],
  providers: [LiveGateway],
  exports: [LiveGateway],
})
export class GatewayModule {}
