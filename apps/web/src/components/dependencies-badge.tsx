"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { fetchDependenciesHealth, type DependencyStatus } from "@/lib/health/api";

const REFRESH_MS = 30_000;

const DOT: Record<DependencyStatus, string> = {
  ok: "bg-cci-success",
  down: "bg-cci-danger",
};

// RF-14: vistazo ambiental de las dependencias externas (cci-auth-service,
// taskforge, ops-notify-bot). Sin datos ⇒ no renderiza nada — no ensucia el
// header con un badge roto mientras carga o si el propio api no responde.
export function DependenciesBadge() {
  const t = useTranslations("dependenciesBadge");
  const query = useQuery({
    queryKey: ["health-dependencies"],
    queryFn: fetchDependenciesHealth,
    refetchInterval: REFRESH_MS,
  });

  const dependencies = query.data?.dependencies ?? [];
  if (dependencies.length === 0) return null;

  return (
    <span
      className="inline-flex items-center gap-3 rounded-cci border border-cci-line bg-cci-surface px-3 py-1.5 font-mono text-xs text-cci-muted"
      role="status"
    >
      {dependencies.map((dep) => (
        <span key={dep.name} className="flex items-center gap-1.5" title={t(`name.${dep.name}`)}>
          <span className={`h-2 w-2 rounded-full ${DOT[dep.status]}`} aria-hidden />
          {t(`name.${dep.name}`)}
        </span>
      ))}
    </span>
  );
}
