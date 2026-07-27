"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { AlertItem, ALERT_TYPES, AlertsApiError, AlertType, fetchAlerts } from "@/lib/alerts/api";

const PAGE_SIZE = 20;
const REFRESH_MS = 15_000;

const TYPE_TONE: Record<AlertType, string> = {
  deploy: "text-cci-slate",
  resource_alert: "text-cci-warn",
  container_down: "text-cci-danger",
  container_restarted: "text-cci-muted",
  job_dlq: "text-cci-danger",
};

// ops-notify-bot no manda un resumen de texto (a propósito: es HTML de
// Telegram, no sirve acá) — se arma acá a partir del payload estructurado,
// con i18n es/en.
function useSummary(): (alert: AlertItem) => string {
  const t = useTranslations("alertsFeed.summary");
  return (alert: AlertItem) => {
    const p = alert.payload;
    switch (alert.type) {
      case "deploy": {
        const version = typeof p.version === "string" ? ` (${p.version})` : "";
        const status = p.status === "success" ? t("deployOk") : t("deployFailed");
        return t("deploy", { service: String(p.service ?? "?"), status, version });
      }
      case "resource_alert":
        return t("resourceAlert", {
          host: String(p.host ?? "?"),
          metric: String(p.metric ?? "?"),
          value: String(p.value ?? "?"),
          threshold: String(p.threshold ?? "?"),
        });
      case "container_down": {
        const exitCode = typeof p.exitCode === "number" ? ` (exit ${p.exitCode})` : "";
        return t("containerDown", { container: String(p.container ?? "?"), exitCode });
      }
      case "container_restarted":
        return t("containerRestarted", { container: String(p.container ?? "?") });
      case "job_dlq":
        return t("jobDlq", {
          service: String(p.service ?? "?"),
          queue: String(p.queue ?? "?"),
          name: String(p.name ?? "?"),
          attempts: String(p.attemptsMade ?? "?"),
          reason: String(p.failedReason ?? "?"),
        });
    }
  };
}

export function AlertsFeedPanel() {
  const t = useTranslations("alertsFeed");
  const summarize = useSummary();
  const [type, setType] = useState<AlertType | "">("");
  const [offset, setOffset] = useState(0);

  const query = useQuery({
    queryKey: ["alerts-feed", type, offset],
    queryFn: () => fetchAlerts({ type: type || undefined, limit: PAGE_SIZE, offset }),
    refetchInterval: REFRESH_MS,
  });

  const total = query.data?.total ?? 0;
  const items = query.data?.items ?? [];

  return (
    <section className="flex flex-col overflow-hidden rounded-cci border border-cci-line bg-cci-surface shadow-cci">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-cci-line px-4 py-3">
        <h2 className="font-display text-sm font-semibold text-cci-text">{t("title")}</h2>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as AlertType | "");
            setOffset(0);
          }}
          className="rounded-cci border border-cci-line bg-cci-surface-2 px-2 py-1 font-mono text-[11px] text-cci-text"
        >
          <option value="">{t("allTypes")}</option>
          {ALERT_TYPES.map((alertType) => (
            <option key={alertType} value={alertType}>
              {t(`type.${alertType}`)}
            </option>
          ))}
        </select>
      </header>

      <div className="max-h-80 overflow-y-auto px-4 py-2">
        {query.isError ? (
          <p className="font-mono text-xs text-cci-danger">
            {query.error instanceof AlertsApiError ? query.error.message : t("error")}
          </p>
        ) : query.isLoading ? (
          <p className="font-mono text-xs text-cci-muted">{t("loading")}</p>
        ) : items.length === 0 ? (
          <p className="font-mono text-xs text-cci-muted">{t("empty")}</p>
        ) : (
          <ol className="flex flex-col gap-1.5 font-mono text-xs">
            {items.map((alert) => (
              <li
                key={alert.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-cci-line py-1.5 last:border-0"
              >
                <span className="shrink-0 text-cci-slate-600">
                  {alert.receivedAt.slice(0, 19).replace("T", " ")}
                </span>
                <span className={`shrink-0 ${TYPE_TONE[alert.type]}`}>
                  {t(`type.${alert.type}`)}
                </span>
                <span className="text-cci-text">{summarize(alert)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-cci-line px-4 py-2 font-mono text-[11px] text-cci-muted">
        <span>{t("total", { total })}</span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            className="rounded-cci border border-cci-line px-2 py-1 transition-colors hover:bg-cci-surface-2 hover:text-cci-text disabled:opacity-40"
          >
            {t("prev")}
          </button>
          <button
            type="button"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
            className="rounded-cci border border-cci-line px-2 py-1 transition-colors hover:bg-cci-surface-2 hover:text-cci-text disabled:opacity-40"
          >
            {t("next")}
          </button>
        </div>
      </footer>
    </section>
  );
}
