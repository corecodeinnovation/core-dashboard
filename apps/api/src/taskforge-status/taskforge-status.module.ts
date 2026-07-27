import { Module } from "@nestjs/common";

import { JobsModule } from "../jobs/jobs.module";
import { TaskforgeStatusController } from "./taskforge-status.controller";
import { TaskforgeStatusService } from "./taskforge-status.service";

@Module({
  imports: [JobsModule],
  controllers: [TaskforgeStatusController],
  providers: [TaskforgeStatusService],
})
export class TaskforgeStatusModule {}
