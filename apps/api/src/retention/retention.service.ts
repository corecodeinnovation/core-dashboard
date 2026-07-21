import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { PrismaService } from "../prisma/prisma.service";

// Mismo horizonte de retención que MetricRollup (B-02): 30 días alcanza para
// la demo y coincide con lo que ya retiene Prometheus.
const RETENTION_DAYS = 30;

// Purga automática (B-11) de las otras dos tablas que crecen sin límite:
// AuditLog (una fila por acción ejecutada) y JobRun (una por job disparado a
// taskforge). MetricRollup ya se purga solo en MetricsService — no se toca
// acá para no mezclar responsabilidades con un cron que ya funciona.
@Injectable()
export class RetentionService implements OnModuleInit {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Corrida al arrancar: en un homelab el proceso puede reiniciar seguido
  // durante desarrollo; no hace falta esperar hasta la próxima medianoche
  // para que la purga esté al día.
  onModuleInit(): void {
    void this.purgeTick();
  }

  @Cron("0 3 * * *") // una vez por día, de madrugada
  async purgeTick(): Promise<void> {
    try {
      const [auditLogs, jobRuns] = await Promise.all([this.purgeAuditLogs(), this.purgeJobRuns()]);
      if (auditLogs > 0 || jobRuns > 0) {
        this.logger.log(`purga de retención: ${auditLogs} audit logs, ${jobRuns} job runs`);
      }
    } catch (err) {
      this.logger.warn(`purga de retención fallida: ${(err as Error).message}`);
    }
  }

  async purgeAuditLogs(): Promise<number> {
    const result = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff() } },
    });
    return result.count;
  }

  async purgeJobRuns(): Promise<number> {
    const result = await this.prisma.jobRun.deleteMany({ where: { createdAt: { lt: cutoff() } } });
    return result.count;
  }
}

function cutoff(): Date {
  return new Date(Date.now() - RETENTION_DAYS * 24 * 3_600_000);
}
