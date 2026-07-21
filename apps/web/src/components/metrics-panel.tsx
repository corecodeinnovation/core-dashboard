"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";

import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  fetchMetricSeries,
  RANGE_HOURS,
  type MetricKind,
  type MetricPoint,
  type MetricRange,
} from "@/lib/metrics/api";
import { formatBytes, formatCores, formatRate, formatTick } from "@/lib/metrics/format";

type MetricTab = "cpu" | "ram" | "red";

interface SeriesDef {
  kind: MetricKind;
  label: string;
  stroke: string;
  dash?: string;
}

// El label del tab sale de i18n (metricsPanel.tab*); rx/tx/cpu/ram son
// abreviaturas técnicas iguales en cualquier idioma, no se traducen.
const TABS: Record<
  MetricTab,
  { messageKey: "tabCpu" | "tabRam" | "tabNet"; series: SeriesDef[]; format: (v: number) => string }
> = {
  cpu: {
    messageKey: "tabCpu",
    series: [{ kind: "CPU", label: "cpu", stroke: "var(--cci-slate)" }],
    format: formatCores,
  },
  ram: {
    messageKey: "tabRam",
    series: [{ kind: "MEMORY", label: "ram", stroke: "var(--cci-slate)" }],
    format: formatBytes,
  },
  red: {
    messageKey: "tabNet",
    // Par diferenciado por trazo además del color (encoding secundario).
    series: [
      { kind: "NETWORK_RX", label: "rx", stroke: "var(--cci-amber)" },
      { kind: "NETWORK_TX", label: "tx", stroke: "var(--cci-slate)", dash: "6 3" },
    ],
    format: formatRate,
  },
};

const RANGES: MetricRange[] = ["1h", "24h", "7d"];

type ChartRow = { t: number } & Partial<Record<MetricKind, number>>;

function mergeSeries(series: Array<{ kind: MetricKind; points: MetricPoint[] }>): ChartRow[] {
  const byTime = new Map<number, ChartRow>();
  for (const { kind, points } of series) {
    for (const point of points) {
      const row = byTime.get(point.t) ?? { t: point.t };
      row[kind] = point.v;
      byTime.set(point.t, row);
    }
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

export function MetricsPanel({ container }: { container: string }) {
  const t = useTranslations("metricsPanel");
  const [tab, setTab] = useState<MetricTab>("cpu");
  const [range, setRange] = useState<MetricRange>("1h");
  const { series, format } = { series: TABS[tab].series, format: TABS[tab].format };

  const query = useQuery({
    queryKey: ["metrics", container, tab, range],
    queryFn: async () => {
      const results = await Promise.all(
        series.map(async (def) => ({
          kind: def.kind,
          points: await fetchMetricSeries(container, def.kind, range),
        })),
      );
      return mergeSeries(results);
    },
    // 1h es vivo (Prometheus): refresco corto; el histórico cambia cada 5 min.
    refetchInterval: range === "1h" ? 30_000 : 120_000,
  });

  const rows = query.data ?? [];

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <div className="flex gap-1">
          {(Object.keys(TABS) as MetricTab[]).map((id) => (
            <SelectorButton key={id} active={id === tab} onClick={() => setTab(id)}>
              {t(TABS[id].messageKey)}
            </SelectorButton>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {series.length > 1 && (
            <span className="flex items-center gap-3 font-mono text-[11px] text-cci-muted">
              {series.map((def) => (
                <span key={def.kind} className="flex items-center gap-1.5">
                  <svg width="18" height="4" aria-hidden>
                    <line
                      x1="0"
                      y1="2"
                      x2="18"
                      y2="2"
                      stroke={def.stroke}
                      strokeWidth="2"
                      strokeDasharray={def.dash}
                    />
                  </svg>
                  {def.label}
                </span>
              ))}
            </span>
          )}
          <div className="flex gap-1">
            {RANGES.map((id) => (
              <SelectorButton key={id} active={id === range} onClick={() => setRange(id)}>
                {id}
              </SelectorButton>
            ))}
          </div>
        </div>
      </div>

      <div className="h-56 px-2 pb-2 pt-3">
        {query.isError ? (
          <p className="px-2 font-mono text-xs text-cci-danger">{t("error")}</p>
        ) : rows.length === 0 ? (
          <p className="px-2 font-mono text-xs text-cci-muted">
            {query.isLoading ? t("loading") : t("empty")}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--cci-line)" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t: number) => formatTick(t, RANGE_HOURS[range])}
                tick={{
                  fill: "var(--cci-muted)",
                  fontSize: 11,
                  fontFamily: "var(--cci-font-mono)",
                }}
                tickLine={false}
                axisLine={false}
                minTickGap={48}
              />
              <YAxis
                tickFormatter={format}
                width={70}
                tick={{
                  fill: "var(--cci-muted)",
                  fontSize: 11,
                  fontFamily: "var(--cci-font-mono)",
                }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ stroke: "var(--cci-slate-600)", strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-cci border border-cci-line bg-cci-surface-2 px-3 py-2 font-mono text-[11px] shadow-cci">
                      <p className="text-cci-muted">
                        {formatTick(Number(label), RANGE_HOURS[range])}
                      </p>
                      {payload.map((entry) => (
                        <p key={String(entry.dataKey)} className="text-cci-text">
                          {series.find((s) => s.kind === entry.dataKey)?.label}:{" "}
                          {format(Number(entry.value))}
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              {series.map((def) => (
                <Line
                  key={def.kind}
                  dataKey={def.kind}
                  name={def.label}
                  stroke={def.stroke}
                  strokeWidth={2}
                  strokeDasharray={def.dash}
                  dot={false}
                  activeDot={{ r: 4, fill: "var(--cci-orange)", stroke: "var(--cci-surface)" }}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function SelectorButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-cci px-2.5 py-1 font-mono text-[11px] transition-colors ${
        active
          ? "bg-cci-surface-2 text-cci-text"
          : "text-cci-muted hover:bg-cci-surface-2 hover:text-cci-text"
      }`}
    >
      {children}
    </button>
  );
}
