export type MetricKind = "CPU" | "MEMORY" | "NETWORK_RX" | "NETWORK_TX";

export interface MetricPoint {
  t: number;
  v: number;
}

export type MetricRange = "1h" | "24h" | "7d";

export const RANGE_HOURS: Record<MetricRange, number> = { "1h": 1, "24h": 24, "7d": 168 };

// REST por mismo origen: /api/* lo proxya Next hacia el gateway (rewrites).
async function fetchSeries(path: string): Promise<MetricPoint[]> {
  const response = await fetch(`/api/metrics/${path}`);
  if (!response.ok) throw new Error(`métricas: HTTP ${response.status}`);
  const body = (await response.json()) as { points: MetricPoint[] };
  return body.points;
}

// 1h = vivo (Prometheus, resolución de scrape); 24h/7d = rollups persistidos.
export function fetchMetricSeries(
  container: string,
  metric: MetricKind,
  range: MetricRange,
): Promise<MetricPoint[]> {
  const params = new URLSearchParams({ container, metric });
  if (range === "1h") {
    params.set("minutes", "60");
    return fetchSeries(`live?${params}`);
  }
  params.set("hours", String(RANGE_HOURS[range]));
  return fetchSeries(`history?${params}`);
}
