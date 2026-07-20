import { Module } from "@nestjs/common";

import { ContainersModule } from "../containers/containers.module";
import { LogsService } from "./logs.service";

@Module({
  imports: [ContainersModule],
  providers: [LogsService],
  exports: [LogsService],
})
export class LogsModule {}
