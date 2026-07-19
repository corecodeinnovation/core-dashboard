import type {
  ContainerHealth,
  ContainerStatus,
  ServiceState,
  ServiceUpdate,
} from "@core-dashboard/shared";

// Helpers puros del estado en vivo: sin dependencia de React ni del socket.

export function sortServices(services: ServiceState[]): ServiceState[] {
  return [...services].sort(
    (a, b) => a.project.localeCompare(b.project) || a.service.localeCompare(b.service),
  );
}

// El contenedor puede recrearse (id nuevo) manteniendo el nombre: se pisa por nombre.
export function applyUpdate(services: ServiceState[], update: ServiceUpdate): ServiceState[] {
  const next = services.filter((s) => s.name !== update.state.name);
  next.push(update.state);
  return sortServices(next);
}

export type StatusTone = "ok" | "warn" | "down";

export function statusTone(status: ContainerStatus, health: ContainerHealth): StatusTone {
  if (health === "unhealthy" || status === "dead" || status === "exited") return "down";
  if (
    health === "starting" ||
    status === "restarting" ||
    status === "paused" ||
    status === "created"
  )
    return "warn";
  return "ok";
}

export function statusLabel(status: ContainerStatus, health: ContainerHealth): string {
  if (status === "running" && health !== "none") return health;
  return status;
}

// Uptime compacto para la card: 3d 4h · 2h 15m · 5m 30s · 42s
export function formatUptime(startedAt: string | null, now: number): string | null {
  if (!startedAt) return null;
  const total = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
