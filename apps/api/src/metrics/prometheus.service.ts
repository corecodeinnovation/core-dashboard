import { Injectable } from "@nestjs/common";

// Resultado instantáneo: una muestra por serie.
export interface VectorSample {
  metric: Record<string, string>;
  value: [number, string];
}

// Resultado de rango: serie temporal por serie.
export interface MatrixSeries {
  metric: Record<string, string>;
  values: Array<[number, string]>;
}

// Cliente mínimo de la API HTTP de Prometheus. Solo lectura: el api actúa de
// proxy para las gráficas (Prometheus no publica puertos fuera del compose).
@Injectable()
export class PrometheusService {
  private baseUrl(): string {
    return process.env.PROMETHEUS_URL ?? "http://prometheus:9090";
  }

  async queryInstant(promql: string, atSec?: number): Promise<VectorSample[]> {
    const url = new URL("/api/v1/query", this.baseUrl());
    url.searchParams.set("query", promql);
    if (atSec !== undefined) url.searchParams.set("time", String(atSec));
    return (await this.request(url)) as VectorSample[];
  }

  async queryRange(
    promql: string,
    startSec: number,
    endSec: number,
    stepSec: number,
  ): Promise<MatrixSeries[]> {
    const url = new URL("/api/v1/query_range", this.baseUrl());
    url.searchParams.set("query", promql);
    url.searchParams.set("start", String(startSec));
    url.searchParams.set("end", String(endSec));
    url.searchParams.set("step", String(stepSec));
    return (await this.request(url)) as MatrixSeries[];
  }

  private async request(url: URL): Promise<unknown> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Prometheus respondió ${response.status}`);
    const body = (await response.json()) as {
      status: string;
      data?: { result?: unknown };
      error?: string;
    };
    if (body.status !== "success") throw new Error(body.error ?? "query fallida");
    return body.data?.result ?? [];
  }
}
