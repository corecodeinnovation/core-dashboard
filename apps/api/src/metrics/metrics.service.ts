import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { MetricKind } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { PrometheusService } from "./prometheus.service";

export interface MetricPoint {
  t: number; // epoch ms
  v: number;
}

const BUCKET_SEC = 300; // rollups de 5 minutos
const RETENTION_DAYS = 30;
const MAX_RANGE_POINTS = 240;

// Set de RF-05 decidido en el spike de cAdvisor (ADR 0002):
// identificación por label `name`; red filtrada a eth0.
function liveQuery(kind: MetricKind, container: string): string {
  const c = JSON.stringify(container);
  switch (kind) {
    case MetricKind.CPU:
      return `rate(container_cpu_usage_seconds_total{name=${c},cpu="total"}[1m])`;
    case MetricKind.MEMORY:
      return `container_memory_working_set_bytes{name=${c}}`;
    case MetricKind.NETWORK_RX:
      return `rate(container_network_receive_bytes_total{name=${c},interface="eth0"}[1m])`;
    case MetricKind.NETWORK_TX:
      return `rate(container_network_transmit_bytes_total{name=${c},interface="eth0"}[1m])`;
  }
}

// Igual que la live pero sobre todos los contenedores y ventana de 5 min:
// una consulta instantánea por métrica alcanza para el rollup completo.
function rollupQuery(kind: MetricKind): string {
  const projects = process.env.COMPOSE_PROJECTS?.split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .join("|");
  const scope = projects
    ? `name!="",container_label_com_docker_compose_project=~"${projects}"`
    : `name!=""`;
  switch (kind) {
    case MetricKind.CPU:
      return `rate(container_cpu_usage_seconds_total{${scope},cpu="total"}[5m])`;
    case MetricKind.MEMORY:
      return `avg_over_time(container_memory_working_set_bytes{${scope}}[5m])`;
    case MetricKind.NETWORK_RX:
      return `rate(container_network_receive_bytes_total{${scope},interface="eth0"}[5m])`;
    case MetricKind.NETWORK_TX:
      return `rate(container_network_transmit_bytes_total{${scope},interface="eth0"}[5m])`;
  }
}

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    private readonly prometheus: PrometheusService,
    private readonly prisma: PrismaService,
  ) {}

  // Primer rollup al arrancar: la vista de histórico tiene datos sin esperar
  // al próximo múltiplo de 5 minutos.
  onModuleInit(): void {
    void this.rollupTick();
  }

  @Cron("*/5 * * * *")
  async rollupTick(): Promise<void> {
    try {
      await this.runRollup();
      await this.purgeOldRollups();
    } catch (err) {
      this.logger.warn(`rollup fallido: ${(err as Error).message}`);
    }
  }

  // Serie en vivo directa de Prometheus (retención 30 d, resolución de scrape).
  async getLiveSeries(
    container: string,
    kind: MetricKind,
    minutes: number,
  ): Promise<MetricPoint[]> {
    const endSec = Math.floor(Date.now() / 1000);
    const startSec = endSec - minutes * 60;
    const stepSec = Math.max(30, Math.ceil((minutes * 60) / MAX_RANGE_POINTS));
    const result = await this.prometheus.queryRange(
      liveQuery(kind, container),
      startSec,
      endSec,
      stepSec,
    );
    const series = result[0]?.values ?? [];
    return series.map(([t, v]) => ({ t: t * 1000, v: Number(v) }));
  }

  // Histórico desde los rollups persistidos (endpoint REST de RF-12).
  async getHistory(container: string, kind: MetricKind, hours: number): Promise<MetricPoint[]> {
    const since = new Date(Date.now() - hours * 3_600_000);
    const rows = await this.prisma.metricRollup.findMany({
      where: { containerName: container, metric: kind, bucketStart: { gte: since } },
      orderBy: { bucketStart: "asc" },
    });
    return rows.map((row) => ({ t: row.bucketStart.getTime(), v: row.avgValue }));
  }

  async runRollup(): Promise<number> {
    // Bucket recién cerrado, alineado a múltiplos de 5 min.
    const bucketEndSec = Math.floor(Date.now() / 1000 / BUCKET_SEC) * BUCKET_SEC;
    const bucketStart = new Date((bucketEndSec - BUCKET_SEC) * 1000);
    let inserted = 0;
    for (const kind of Object.values(MetricKind)) {
      const samples = await this.prometheus.queryInstant(rollupQuery(kind), bucketEndSec);
      const rows = samples
        .filter((s) => typeof s.metric.name === "string" && s.metric.name.length > 0)
        .map((s) => ({
          containerName: s.metric.name!,
          metric: kind,
          avgValue: Number(s.value[1]),
          bucketStart,
        }))
        .filter((row) => Number.isFinite(row.avgValue));
      if (rows.length > 0) {
        // Idempotente por el unique (containerName, metric, bucketStart).
        const result = await this.prisma.metricRollup.createMany({
          data: rows,
          skipDuplicates: true,
        });
        inserted += result.count;
      }
    }
    return inserted;
  }

  async purgeOldRollups(): Promise<number> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3_600_000);
    const result = await this.prisma.metricRollup.deleteMany({
      where: { bucketStart: { lt: cutoff } },
    });
    return result.count;
  }
}
