"use client";

import { hasRole } from "@core-dashboard/shared";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { useAuth } from "@/lib/auth/auth-provider";
import {
  fetchTaskforgeStatus,
  TASKFORGE_JOB_STATES,
  TaskforgeStatusApiError,
  type TaskforgeJobState,
} from "@/lib/taskforge-status/api";

const REFRESH_MS = 15_000;

const STATE_TONE: Record<TaskforgeJobState, string> = {
  queued: "text-cci-muted",
  delayed: "text-cci-muted",
  active: "text-cci-warn",
  completed: "text-cci-success",
  failed: "text-cci-danger",
  dlq: "text-cci-danger",
};

// RF-13: vistazo de la cola de taskforge. No hay endpoint de agregados del
// lado de taskforge (ver su README) — el api arma los conteos pidiendo el
// total por estado. Operator+, mismo umbral que RestartButton.
export function TaskforgeStatusPanel() {
  const t = useTranslations("taskforgeStatus");
  const { user, accessToken } = useAuth();

  const enabled = hasRole(user, "operator") && accessToken !== null;

  const query = useQuery({
    queryKey: ["taskforge-status"],
    queryFn: () => fetchTaskforgeStatus(accessToken!),
    enabled,
    refetchInterval: REFRESH_MS,
  });

  if (!hasRole(user, "operator")) return null;

  const counts = query.data?.counts;
  const recentFailures = query.data?.recentFailures ?? [];

  return (
    <section className="flex flex-col overflow-hidden rounded-cci border border-cci-line bg-cci-surface shadow-cci">
      <header className="border-b border-cci-line px-4 py-3">
        <h2 className="font-display text-sm font-semibold text-cci-text">{t("title")}</h2>
      </header>

      <div className="px-4 py-3">
        {query.isError ? (
          <p className="font-mono text-xs text-cci-danger">
            {query.error instanceof TaskforgeStatusApiError ? query.error.message : t("error")}
          </p>
        ) : query.isLoading || !counts ? (
          <p className="font-mono text-xs text-cci-muted">{t("loading")}</p>
        ) : (
          <div className="flex flex-wrap gap-4 font-mono text-xs">
            {TASKFORGE_JOB_STATES.map((state) => (
              <span key={state} className="flex flex-col gap-0.5">
                <span className={`text-lg font-semibold ${STATE_TONE[state]}`}>
                  {counts[state]}
                </span>
                <span className="text-cci-muted">{t(`state.${state}`)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {recentFailures.length > 0 && (
        <div className="border-t border-cci-line px-4 py-2">
          <p className="mb-1.5 font-mono text-[11px] text-cci-muted">{t("recentFailures")}</p>
          <ol className="flex flex-col gap-1.5 font-mono text-xs">
            {recentFailures.map((job) => (
              <li
                key={job.jobId}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-cci-line py-1.5 last:border-0"
              >
                <span className={STATE_TONE[job.state as TaskforgeJobState] ?? "text-cci-muted"}>
                  {job.state}
                </span>
                <span className="text-cci-text">{job.name}</span>
                <span className="text-cci-slate-600">
                  {t("attempts", { count: job.attemptsMade })}
                </span>
                {job.failedReason && (
                  <span className="w-full truncate text-cci-muted" title={job.failedReason}>
                    {job.failedReason}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
