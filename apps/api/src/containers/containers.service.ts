import { EventEmitter } from "events";

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  serviceKey,
  type ContainerHealth,
  type ContainerStatus,
  type ServiceState,
  type ServiceUpdate,
  type StateSnapshot,
} from "@core-dashboard/shared";
import type Docker from "dockerode";

import type { StateSnapshotProvider } from "../gateway/snapshot.provider";
import { DOCKER_CLIENT } from "./docker.client";

const COMPOSE_SERVICE = "com.docker.compose.service";
const COMPOSE_PROJECT = "com.docker.compose.project";

// Eventos del ciclo de vida que disparan un update al room del servicio.
const LIFECYCLE_EVENTS = new Set([
  "start",
  "die",
  "stop",
  "kill",
  "restart",
  "pause",
  "unpause",
  "health_status",
]);

const EVENT_STREAM_RETRY_MS = 5_000;

interface DockerEvent {
  Type?: string;
  Action?: string;
  id?: string;
  Actor?: { ID?: string; Attributes?: Record<string, string> };
}

@Injectable()
export class ContainersService implements OnModuleInit, OnModuleDestroy, StateSnapshotProvider {
  private readonly logger = new Logger(ContainersService.name);
  private readonly emitter = new EventEmitter();
  private stream: NodeJS.ReadableStream | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(@Inject(DOCKER_CLIENT) private readonly docker: Docker) {}

  onModuleInit(): void {
    void this.subscribeToDockerEvents();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    (this.stream as { destroy?: () => void } | null)?.destroy?.();
  }

  onUpdate(listener: (update: ServiceUpdate) => void): void {
    this.emitter.on("update", listener);
  }

  // Snapshot completo del stack CCI: contenedores con labels de compose
  // (inspect por contenedor para salud y uptime reales).
  async getSnapshot(): Promise<StateSnapshot> {
    const containers = await this.docker.listContainers({ all: true });
    const managed = containers.filter((c) => this.isManaged(c.Labels));
    const services = await Promise.all(
      managed.map(async (c) => {
        try {
          return await this.inspectState(c.Id);
        } catch {
          return null;
        }
      }),
    );
    return {
      services: services
        .filter((s): s is ServiceState => s !== null)
        .sort((a, b) => a.name.localeCompare(b.name)),
      generatedAt: new Date().toISOString(),
    };
  }

  private isManaged(labels: Record<string, string> | undefined): boolean {
    if (!labels?.[COMPOSE_SERVICE]) return false;
    const filter = process.env.COMPOSE_PROJECTS;
    if (!filter) return true;
    const projects = filter.split(",").map((p) => p.trim());
    return projects.includes(labels[COMPOSE_PROJECT] ?? "");
  }

  private async inspectState(id: string): Promise<ServiceState> {
    const info = await this.docker.getContainer(id).inspect();
    const labels = info.Config.Labels ?? {};
    const startedAt = info.State.StartedAt?.startsWith("0001") ? null : info.State.StartedAt;
    return {
      id: info.Id.slice(0, 12),
      name: info.Name.replace(/^\//, ""),
      service: labels[COMPOSE_SERVICE] ?? "",
      project: labels[COMPOSE_PROJECT] ?? "",
      image: info.Config.Image,
      status: (info.State.Status as ContainerStatus) ?? "dead",
      health: (info.State.Health?.Status as ContainerHealth) ?? "none",
      startedAt: info.State.Running && startedAt ? startedAt : null,
      uptimeSec:
        info.State.Running && startedAt
          ? Math.max(0, Math.round((Date.now() - Date.parse(startedAt)) / 1000))
          : null,
    };
  }

  private async subscribeToDockerEvents(): Promise<void> {
    if (this.stopped) return;
    try {
      const stream = await this.docker.getEvents({
        filters: { type: ["container"] },
      });
      this.stream = stream;
      this.logger.log("suscripto a eventos Docker");
      let buffer = "";
      stream.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) this.handleEventLine(line);
        }
      });
      stream.on("error", (err: Error) => this.scheduleRetry(err));
      stream.on("end", () => this.scheduleRetry(new Error("stream terminado")));
    } catch (err) {
      this.scheduleRetry(err as Error);
    }
  }

  private scheduleRetry(err: Error): void {
    if (this.stopped || this.retryTimer) return;
    this.logger.warn(`stream de eventos Docker caído (${err.message}); reintento en 5 s`);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.subscribeToDockerEvents();
    }, EVENT_STREAM_RETRY_MS);
  }

  private handleEventLine(line: string): void {
    let event: DockerEvent;
    try {
      event = JSON.parse(line) as DockerEvent;
    } catch {
      return;
    }
    // `health_status: healthy` viene con sufijo: se compara solo el prefijo.
    const action = event.Action?.split(":")[0]?.trim();
    const attributes = event.Actor?.Attributes ?? {};
    if (!action || !LIFECYCLE_EVENTS.has(action) || !this.isManaged(attributes)) return;
    void this.publishFromEvent(event, attributes);
  }

  private async publishFromEvent(
    event: DockerEvent,
    attributes: Record<string, string>,
  ): Promise<void> {
    const id = event.Actor?.ID ?? event.id;
    if (!id) return;
    let state: ServiceState;
    try {
      state = await this.inspectState(id);
    } catch {
      // El contenedor ya no existe (die + rm): estado sintético desde el evento.
      state = {
        id: id.slice(0, 12),
        name: attributes.name ?? id.slice(0, 12),
        service: attributes[COMPOSE_SERVICE] ?? "",
        project: attributes[COMPOSE_PROJECT] ?? "",
        image: attributes.image ?? "",
        status: "exited",
        health: "none",
        startedAt: null,
        uptimeSec: null,
      };
    }
    const update: ServiceUpdate = {
      service: serviceKey(state.project, state.service),
      state,
      occurredAt: new Date().toISOString(),
    };
    this.emitter.emit("update", update);
  }
}
