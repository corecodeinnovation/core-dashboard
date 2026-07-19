import type { AuthUser } from "./auth";

export const LIVE_NAMESPACE = "/live";

export type ContainerStatus = "created" | "running" | "paused" | "restarting" | "exited" | "dead";

export type ContainerHealth = "healthy" | "unhealthy" | "starting" | "none";

// Estado observable de un servicio del stack (un contenedor de compose).
export interface ServiceState {
  id: string;
  name: string;
  service: string;
  project: string;
  image: string;
  status: ContainerStatus;
  health: ContainerHealth;
  startedAt: string | null;
  uptimeSec: number | null;
}

export interface StateSnapshot {
  services: ServiceState[];
  generatedAt: string;
}

export interface ServiceUpdate {
  service: string;
  state: ServiceState;
  occurredAt: string;
}

// Clave única de un servicio en el portfolio: los nombres cortos de compose
// (db, redis) se repiten entre proyectos; la clave incluye el proyecto.
export function serviceKey(project: string, service: string): string {
  return `${project}.${service}`;
}

// Rooms por servicio: broadcast selectivo solo a quien mira ese servicio.
export function serviceRoom(serviceKey: string): string {
  return `service:${serviceKey}`;
}

export interface ServerToClientEvents {
  "state:update": (update: ServiceUpdate) => void;
}

export interface ClientToServerEvents {
  "rooms:subscribe": (services: string[], ack: (joined: string[]) => void) => void;
  "rooms:unsubscribe": (services: string[], ack: (left: string[]) => void) => void;
  // Resync al (re)conectar: el cliente pide el snapshot completo por ack.
  "state:resync": (ack: (snapshot: StateSnapshot) => void) => void;
}

export interface SocketData {
  user: AuthUser;
}
