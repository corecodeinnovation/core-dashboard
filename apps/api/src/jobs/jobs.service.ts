import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "@core-dashboard/shared";
import { JobRunStatus, type JobRun } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { TaskforgeClient } from "./taskforge-client.service";

const DEFAULT_STEPS = 5;
const MAX_STEPS = 20;

// Estados de taskforge (README: queued, delayed, active, completed, failed, dlq)
// → nuestro enum simplificado de histórico.
function mapState(state: string): JobRunStatus {
  switch (state) {
    case "active":
      return JobRunStatus.RUNNING;
    case "completed":
      return JobRunStatus.COMPLETED;
    case "failed":
    case "dlq":
      return JobRunStatus.FAILED;
    default: // queued, delayed
      return JobRunStatus.PENDING;
  }
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly taskforge: TaskforgeClient,
    private readonly prisma: PrismaService,
  ) {}

  // RF-08: dispara el job demo (reporte de métricas simulado) y lo registra
  // en el histórico propio — taskforge es la fuente de verdad de su ejecución.
  async triggerDemo(user: AuthUser, steps?: number): Promise<JobRun> {
    const clampedSteps = this.clampSteps(steps);
    const enqueued = await this.taskforge.enqueueDemoJob(clampedSteps);
    const jobRun = await this.prisma.jobRun.create({
      data: {
        externalId: enqueued.jobId,
        status: mapState(enqueued.state),
        requestedBy: user.sub ?? "unknown",
      },
    });
    this.logger.log(`job demo encolado: ${enqueued.jobId} (${clampedSteps} pasos)`);
    return jobRun;
  }

  async list(): Promise<JobRun[]> {
    return this.prisma.jobRun.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  }

  // Refresca el estado consultando taskforge en vivo (no se persiste `result`
  // acá: el histórico completo del job vive del lado de taskforge).
  async refreshStatus(id: string): Promise<JobRun> {
    const jobRun = await this.prisma.jobRun.findUnique({ where: { id } });
    if (!jobRun) throw new NotFoundException(`job run desconocido: ${id}`);

    try {
      const status = await this.taskforge.getJobStatus(jobRun.externalId);
      const nextStatus = mapState(status.state);
      if (nextStatus === jobRun.status) return jobRun;
      return await this.prisma.jobRun.update({
        where: { id },
        data: { status: nextStatus },
      });
    } catch (err) {
      this.logger.warn(`no se pudo refrescar ${jobRun.externalId}: ${(err as Error).message}`);
      return jobRun; // estado stale antes que romper la consulta
    }
  }

  private clampSteps(value: number | undefined): number {
    if (value === undefined) return DEFAULT_STEPS;
    if (!Number.isInteger(value) || value < 1) return DEFAULT_STEPS;
    return Math.min(value, MAX_STEPS);
  }
}
