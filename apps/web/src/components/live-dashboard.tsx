"use client";

import { useEffect, useState } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ConnectionBadge } from "@/components/connection-badge";
import { ContainerPanel } from "@/components/container-panel";
import { ServiceCard } from "@/components/service-card";
import { LiveProvider, useLive } from "@/lib/live/live-provider";

export function LiveDashboard() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <LiveProvider>
        <DashboardContent />
      </LiveProvider>
    </QueryClientProvider>
  );
}

function DashboardContent() {
  const { services, status } = useLive();
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<string | null>(null);

  // Tick de 1 s: los uptimes corren solos sin esperar eventos del server.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const running = services.filter((s) => s.status === "running").length;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">
            Core <span className="text-cci-orange">Dashboard</span>
          </h1>
          <p className="mt-1 font-mono text-xs text-cci-muted">
            {services.length > 0
              ? `${services.length} servicios · ${running} en ejecución`
              : "esperando estado del homelab…"}
          </p>
        </div>
        <ConnectionBadge status={status} />
      </header>

      {selected && (
        // sticky: al hacer scroll se fija arriba del viewport y el grid de
        // abajo sigue scrolleando por detrás (z-10 + fondo opaco del panel).
        <div className="sticky top-4 z-10 mt-6">
          <ContainerPanel container={selected} onClose={() => setSelected(null)} />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((state) => (
          <ServiceCard
            key={state.name}
            state={state}
            now={now}
            selected={state.name === selected}
            onSelect={() => setSelected(state.name === selected ? null : state.name)}
          />
        ))}
      </div>
    </section>
  );
}
