"use client";

import { useState } from "react";

import { LogViewer } from "@/components/log-viewer";
import { MetricsPanel } from "@/components/metrics-panel";
import { RestartButton } from "@/components/restart-button";

type PanelTab = "metrics" | "logs";

// Panel del contenedor seleccionado: métricas (REST) y logs en vivo (WS).
export function ContainerPanel({ container, onClose }: { container: string; onClose: () => void }) {
  const [tab, setTab] = useState<PanelTab>("metrics");

  return (
    <section className="flex h-96 flex-col overflow-hidden rounded-cci border border-cci-line bg-cci-surface shadow-cci">
      <header className="flex items-center justify-between border-b border-cci-line px-4 py-2">
        <h2 className="flex min-w-0 items-center gap-3 font-mono text-xs">
          <span className="truncate text-cci-text">{container}</span>
          <nav className="flex gap-1" aria-label="Vista del contenedor">
            <TabButton active={tab === "metrics"} onClick={() => setTab("metrics")}>
              métricas
            </TabButton>
            <TabButton active={tab === "logs"} onClick={() => setTab("logs")}>
              logs
            </TabButton>
          </nav>
        </h2>
        <div className="flex items-center gap-2">
          <RestartButton container={container} />
          <button
            type="button"
            onClick={onClose}
            className="rounded-cci px-2 py-1 font-mono text-xs text-cci-muted transition-colors hover:bg-cci-surface-2 hover:text-cci-text"
          >
            cerrar ✕
          </button>
        </div>
      </header>
      {tab === "metrics" ? (
        <MetricsPanel container={container} />
      ) : (
        <LogViewer container={container} />
      )}
    </section>
  );
}

function TabButton({
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
      aria-pressed={active}
      className={`rounded-cci px-2.5 py-1 transition-colors ${
        active
          ? "bg-cci-surface-2 text-cci-text"
          : "text-cci-muted hover:bg-cci-surface-2 hover:text-cci-text"
      }`}
    >
      {children}
    </button>
  );
}
