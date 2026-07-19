import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { LiveGateway } from "./live.gateway";
import { EmptySnapshotProvider, STATE_SNAPSHOT_PROVIDER } from "./snapshot.provider";

@Module({
  imports: [AuthModule],
  providers: [LiveGateway, { provide: STATE_SNAPSHOT_PROVIDER, useClass: EmptySnapshotProvider }],
  exports: [LiveGateway],
})
export class GatewayModule {}
