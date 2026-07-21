"use client";

import { useTranslations } from "next-intl";

import type { ServiceState } from "@core-dashboard/shared";

import { formatUptime, statusLabel, statusTone, type StatusTone } from "@/lib/live/state";

const TONE_DOT: Record<StatusTone, string> = {
  ok: "bg-cci-success",
  warn: "bg-cci-warn",
  down: "bg-cci-danger",
};

const TONE_TEXT: Record<StatusTone, string> = {
  ok: "text-cci-success",
  warn: "text-cci-warn",
  down: "text-cci-danger",
};

export function ServiceCard({
  state,
  now,
  selected,
  onSelect,
}: {
  state: ServiceState;
  now: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("serviceCard");
  const tone = statusTone(state.status, state.health);
  const uptime = formatUptime(state.startedAt, now);

  return (
    <article
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex cursor-pointer flex-col gap-3 rounded-cci border p-4 transition-colors hover:bg-cci-surface-2 ${
        selected ? "border-cci-orange bg-cci-surface-2" : "border-cci-line bg-cci-surface"
      }`}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 font-display text-sm font-semibold">
          <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
          <span className="truncate">{state.service}</span>
        </h3>
        <span className="shrink-0 font-mono text-[11px] text-cci-slate">{state.project}</span>
      </header>
      <p className="truncate font-mono text-xs text-cci-muted" title={state.image}>
        {state.image}
      </p>
      <footer className="flex items-center justify-between font-mono text-xs">
        <span className={TONE_TEXT[tone]}>
          {t(`status.${statusLabel(state.status, state.health)}`)}
        </span>
        <span className="text-cci-muted">{uptime ? t("uptime", { uptime }) : "—"}</span>
      </footer>
    </article>
  );
}
