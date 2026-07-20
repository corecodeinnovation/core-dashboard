import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { MetricKind } from "@prisma/client";

import { MetricsService, type MetricPoint } from "./metrics.service";

const CONTAINER_NAME = /^[a-z0-9][a-z0-9_.-]{0,127}$/i;

interface SeriesResponse {
  container: string;
  metric: MetricKind;
  points: MetricPoint[];
}

// Métricas por contenedor (RF-05/RF-12). Público: rol viewer alcanza.
@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  // Serie en vivo (proxy Prometheus): últimos N minutos, resolución de scrape.
  @Get("live")
  async live(
    @Query("container") container: string | undefined,
    @Query("metric") metric: string | undefined,
    @Query("minutes") minutes: string | undefined,
  ): Promise<SeriesResponse> {
    const parsed = this.parseCommon(container, metric);
    const window = this.parsePositiveInt(minutes, 60, 360, "minutes");
    return {
      container: parsed.container,
      metric: parsed.metric,
      points: await this.metrics.getLiveSeries(parsed.container, parsed.metric, window),
    };
  }

  // Histórico desde rollups de 5 min en Postgres (retención 30 d).
  @Get("history")
  async history(
    @Query("container") container: string | undefined,
    @Query("metric") metric: string | undefined,
    @Query("hours") hours: string | undefined,
  ): Promise<SeriesResponse> {
    const parsed = this.parseCommon(container, metric);
    const window = this.parsePositiveInt(hours, 24, 720, "hours");
    return {
      container: parsed.container,
      metric: parsed.metric,
      points: await this.metrics.getHistory(parsed.container, parsed.metric, window),
    };
  }

  private parseCommon(
    container: string | undefined,
    metric: string | undefined,
  ): { container: string; metric: MetricKind } {
    if (!container || !CONTAINER_NAME.test(container)) {
      throw new BadRequestException("container inválido");
    }
    if (!metric || !(metric in MetricKind)) {
      throw new BadRequestException(
        `metric inválida (valores: ${Object.values(MetricKind).join(", ")})`,
      );
    }
    return { container, metric: metric as MetricKind };
  }

  private parsePositiveInt(
    raw: string | undefined,
    fallback: number,
    max: number,
    field: string,
  ): number {
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0 || value > max) {
      throw new BadRequestException(`${field} inválido (1..${max})`);
    }
    return value;
  }
}
