import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import type { LogsAck, LogsBatch, LogsSubscribeRequest } from "@core-dashboard/shared";
import type Docker from "dockerode";
import type { Socket } from "socket.io";

import { ContainersService } from "../containers/containers.service";
import { DOCKER_CLIENT } from "../containers/docker.client";
import { DockerFrameParser, LogLineSplitter } from "./docker-frames";
import { DEFAULT_SESSION_OPTIONS, LogSession } from "./log-session";

const CONTAINER_NAME = /^[a-z0-9][a-z0-9_.-]{0,127}$/i;
const MAX_SESSIONS_PER_SOCKET = 3;
const DEFAULT_TAIL = 100;
const MAX_TAIL = 1_000;

@Injectable()
export class LogsService implements OnModuleDestroy {
  private readonly logger = new Logger(LogsService.name);
  // key: `${socketId}|${container}`
  private readonly sessions = new Map<string, LogSession>();

  constructor(
    @Inject(DOCKER_CLIENT) private readonly docker: Docker,
    private readonly containers: ContainersService,
  ) {}

  onModuleDestroy(): void {
    for (const session of this.sessions.values()) session.close();
  }

  async subscribe(socket: Socket, request: unknown): Promise<LogsAck> {
    const parsed = this.parseRequest(request);
    if (!parsed) return { ok: false, error: "pedido inválido" };
    const key = this.key(socket.id, parsed.container);
    if (this.sessions.has(key)) return { ok: true };
    if (this.sessionCountFor(socket.id) >= MAX_SESSIONS_PER_SOCKET) {
      return { ok: false, error: `máximo ${MAX_SESSIONS_PER_SOCKET} streams por cliente` };
    }
    // Solo contenedores del stack gestionado por compose: nada arbitrario.
    const managed = await this.containers.findManagedByName(parsed.container);
    if (!managed) return { ok: false, error: "contenedor desconocido" };

    const session = new LogSession(
      { ...DEFAULT_SESSION_OPTIONS, container: parsed.container },
      (batch, ackTimeoutMs) => this.emitBatch(socket, batch, ackTimeoutMs),
      () => this.sessions.delete(key),
    );
    this.sessions.set(key, session);

    try {
      await this.openDockerStream(session, parsed.container, parsed.tail);
    } catch (err) {
      session.close();
      this.logger.warn(
        `no se pudo abrir el stream de ${parsed.container}: ${(err as Error).message}`,
      );
      return { ok: false, error: "no se pudo abrir el stream de logs" };
    }
    return { ok: true };
  }

  unsubscribe(socketId: string, request: unknown): LogsAck {
    const container =
      typeof request === "object" && request !== null
        ? (request as { container?: unknown }).container
        : undefined;
    if (typeof container !== "string") return { ok: false, error: "pedido inválido" };
    this.sessions.get(this.key(socketId, container))?.close();
    return { ok: true };
  }

  destroyForSocket(socketId: string): void {
    for (const [key, session] of this.sessions) {
      if (key.startsWith(`${socketId}|`)) session.close();
    }
  }

  private parseRequest(request: unknown): { container: string; tail: number } | null {
    if (typeof request !== "object" || request === null) return null;
    const { container, tail } = request as LogsSubscribeRequest;
    if (typeof container !== "string" || !CONTAINER_NAME.test(container)) return null;
    const parsedTail =
      typeof tail === "number" && Number.isInteger(tail) && tail >= 0
        ? Math.min(tail, MAX_TAIL)
        : DEFAULT_TAIL;
    return { container, tail: parsedTail };
  }

  private async openDockerStream(
    session: LogSession,
    container: string,
    tail: number,
  ): Promise<void> {
    const stream = (await this.docker.getContainer(container).logs({
      follow: true,
      stdout: true,
      stderr: true,
      timestamps: true,
      tail,
    })) as NodeJS.ReadableStream & { destroy?: () => void };

    const splitter = new LogLineSplitter((line) => session.push(line));
    const parser = new DockerFrameParser((source, payload) => splitter.push(source, payload));
    stream.on("data", (chunk: Buffer) => parser.push(chunk));
    // error: corte abrupto, no hay nada más que drenar de una fuente rota.
    stream.on("error", () => session.close());
    // end: el contenedor dejó de loguear (o murió) en condiciones normales;
    // se termina de drenar lo que ya está en cola antes de cerrar.
    stream.on("end", () => session.end());
    session.attachSource({
      pause: () => stream.pause(),
      resume: () => stream.resume(),
      destroy: () => stream.destroy?.(),
    });
  }

  private emitBatch(socket: Socket, batch: LogsBatch, ackTimeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      socket
        .timeout(ackTimeoutMs)
        .emit("logs:batch", batch, (err: Error | null) => (err ? reject(err) : resolve()));
    });
  }

  private key(socketId: string, container: string): string {
    return `${socketId}|${container}`;
  }

  private sessionCountFor(socketId: string): number {
    let count = 0;
    for (const key of this.sessions.keys()) {
      if (key.startsWith(`${socketId}|`)) count += 1;
    }
    return count;
  }
}
