"use client";

import { useTranslations } from "next-intl";

import type { ConnectionStatus } from "@/lib/live/live-provider";

const DOT: Record<ConnectionStatus, string> = {
  connecting: "bg-cci-slate",
  live: "bg-cci-success",
  reconnecting: "bg-cci-warn",
};

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const t = useTranslations("connection");
  return (
    <span
      className="inline-flex items-center gap-2 rounded-cci border border-cci-line bg-cci-surface px-3 py-1.5 font-mono text-xs text-cci-muted"
      role="status"
    >
      <span
        className={`h-2 w-2 rounded-full ${DOT[status]} ${status !== "connecting" ? "" : "animate-pulse"}`}
      />
      {t(status)}
    </span>
  );
}
