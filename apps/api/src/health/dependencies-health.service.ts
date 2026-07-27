import { Injectable } from "@nestjs/common";

import { TaskforgeClient } from "../jobs/taskforge-client.service";

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

const CHECK_TIMEOUT_MS = 3_000;

// Salud de las dependencias externas del ecosistema (RF-14), separado del
// GET /health (liveness pura, la usa el healthcheck de Docker — no debe
// depender de servicios de terceros, un blip externo no puede tumbarla).
@Injectable()
export class DependenciesHealthService {
  constructor(private readonly taskforge: TaskforgeClient) {}

  async check(): Promise<DependenciesHealth> {
    const [authService, taskforge, notifyBot] = await Promise.all([
      this.checkHttpHealth("cci-auth-service", process.env.AUTH_SERVICE_URL),
      this.checkTaskforge(),
      this.checkHttpHealth("ops-notify-bot", process.env.NOTIFY_BOT_URL),
    ]);
    return {
      checkedAt: new Date().toISOString(),
      dependencies: [authService, taskforge, notifyBot],
    };
  }

  // Valida la cadena completa (credenciales client_credentials incluidas), no
  // solo que el proceso responda: un simple ping de red no hubiera detectado
  // el incidente del cliente M2M sin dar de alta (invalid_client) — esto sí.
  private async checkTaskforge(): Promise<DependencyCheck> {
    const start = Date.now();
    try {
      await this.taskforge.listJobs({ limit: 1 });
      return { name: "taskforge", status: "ok", latencyMs: Date.now() - start };
    } catch {
      return { name: "taskforge", status: "down", latencyMs: Date.now() - start };
    }
  }

  private async checkHttpHealth(
    name: DependencyName,
    baseUrl: string | undefined,
  ): Promise<DependencyCheck> {
    const start = Date.now();
    if (!baseUrl) return { name, status: "down", latencyMs: 0 };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    try {
      const response = await fetch(new URL("/health", baseUrl), { signal: controller.signal });
      return { name, status: response.ok ? "ok" : "down", latencyMs: Date.now() - start };
    } catch {
      return { name, status: "down", latencyMs: Date.now() - start };
    } finally {
      clearTimeout(timeout);
    }
  }
}
