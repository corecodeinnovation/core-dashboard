import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { JobRun } from "@prisma/client";

import type { AuthenticatedRequest } from "../auth/auth.guard";
import { RequireRole } from "../auth/roles.decorator";
import { JobsService } from "./jobs.service";

interface TriggerDemoBody {
  steps?: number;
}

// Delegación de trabajo pesado a taskforge (RF-08): solo operator+.
@Controller("jobs")
@RequireRole("operator")
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post("demo")
  trigger(@Body() body: TriggerDemoBody, @Req() req: AuthenticatedRequest): Promise<JobRun> {
    return this.jobs.triggerDemo(req.user, body.steps);
  }

  @Get()
  list(): Promise<JobRun[]> {
    return this.jobs.list();
  }

  @Get(":id")
  refresh(@Param("id") id: string): Promise<JobRun> {
    return this.jobs.refreshStatus(id);
  }
}
