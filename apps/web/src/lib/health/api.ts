export type DependencyStatus = "ok" | "down";

export type DependencyName = "cci-auth-service" | "taskforge" | "ops-notify-bot";

export interface DependencyCheck {
  name: DependencyName;
  status: DependencyStatus;
  latencyMs: number;
}

export interface DependenciesHealth {
  checkedAt: string;
  dependencies: DependencyCheck[];
}

// RF-14: salud de las dependencias externas del ecosistema, público (mismo
// trato que /health) — sin datos sensibles, solo ok/down + latencia.
export async function fetchDependenciesHealth(): Promise<DependenciesHealth> {
  const response = await fetch("/api/health/dependencies");
  if (!response.ok) throw new Error(`health/dependencies: HTTP ${response.status}`);
  return (await response.json()) as DependenciesHealth;
}
