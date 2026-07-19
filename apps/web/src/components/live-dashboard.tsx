"use client";

import { useEffect, useState } from "react";

import { ConnectionBadge } from "@/components/connection-badge";
import { ServiceCard } from "@/components/service-card";
import { useLiveServices } from "@/lib/live/use-live-services";

export function LiveDashboard() {
  const { services, status } = useLiveServices();
  const [now, setNow] = useState(() => Date.now());

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

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((state) => (
          <ServiceCard key={state.name} state={state} now={now} />
        ))}
      </div>
    </section>
  );
}
