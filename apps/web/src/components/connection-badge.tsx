import type { ConnectionStatus } from "@/lib/live/live-provider";

const LABELS: Record<ConnectionStatus, { text: string; dot: string }> = {
  connecting: { text: "conectando…", dot: "bg-cci-slate" },
  live: { text: "en vivo", dot: "bg-cci-success" },
  reconnecting: { text: "reconectando…", dot: "bg-cci-warn" },
};

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const { text, dot } = LABELS[status];
  return (
    <span
      className="inline-flex items-center gap-2 rounded-cci border border-cci-line bg-cci-surface px-3 py-1.5 font-mono text-xs text-cci-muted"
      role="status"
    >
      <span
        className={`h-2 w-2 rounded-full ${dot} ${status !== "connecting" ? "" : "animate-pulse"}`}
      />
      {text}
    </span>
  );
}
