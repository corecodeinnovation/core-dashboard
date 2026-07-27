import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";
import { TaskforgeClient } from "./taskforge-client.service";

@Module({
  imports: [PrismaModule],
  controllers: [JobsController],
  providers: [TaskforgeClient, JobsService],
  exports: [TaskforgeClient],
})
export class JobsModule {}
