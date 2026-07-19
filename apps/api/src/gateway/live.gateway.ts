import { Inject, OnModuleInit } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import {
  LIVE_NAMESPACE,
  serviceRoom,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type ServiceUpdate,
  type SocketData,
  type StateSnapshot,
} from "@core-dashboard/shared";
import type { Namespace, Socket } from "socket.io";

import { TokenService } from "../auth/token.service";
import { createWsAuthMiddleware } from "../auth/ws-auth.middleware";
import { ContainersService } from "../containers/containers.service";
import { STATE_SNAPSHOT_PROVIDER, type StateSnapshotProvider } from "./snapshot.provider";

type LiveNamespace = Namespace<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type LiveSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

// Nombres de servicio de compose válidos; corta cualquier input malicioso.
const SERVICE_NAME = /^[a-z0-9][a-z0-9_.-]{0,63}$/i;
const MAX_ROOMS_PER_REQUEST = 50;

function corsOrigins(): string[] | boolean {
  const raw = process.env.CORS_ORIGIN;
  if (!raw) return true;
  return raw.split(",").map((origin) => origin.trim());
}

@WebSocketGateway({
  namespace: LIVE_NAMESPACE,
  cors: { origin: corsOrigins() },
  // Heartbeat ping/pong: una conexión muerta se detecta en ≤15 s.
  pingInterval: 10_000,
  pingTimeout: 5_000,
})
export class LiveGateway implements OnGatewayInit, OnModuleInit {
  @WebSocketServer()
  server!: LiveNamespace;

  constructor(
    private readonly tokens: TokenService,
    @Inject(STATE_SNAPSHOT_PROVIDER) private readonly snapshots: StateSnapshotProvider,
    private readonly containers: ContainersService,
  ) {}

  onModuleInit(): void {
    // Cada evento Docker del stack termina en el room del servicio afectado.
    this.containers.onUpdate((update) => this.publishUpdate(update));
  }

  afterInit(namespace: LiveNamespace): void {
    namespace.use(createWsAuthMiddleware(this.tokens));
  }

  // El valor de retorno viaja como ack al cliente.
  @SubscribeMessage("rooms:subscribe")
  async onSubscribe(
    @ConnectedSocket() socket: LiveSocket,
    @MessageBody() services: unknown,
  ): Promise<string[]> {
    const valid = this.sanitizeServices(services);
    await Promise.all(valid.map((service) => socket.join(serviceRoom(service))));
    return valid;
  }

  @SubscribeMessage("rooms:unsubscribe")
  async onUnsubscribe(
    @ConnectedSocket() socket: LiveSocket,
    @MessageBody() services: unknown,
  ): Promise<string[]> {
    const valid = this.sanitizeServices(services);
    await Promise.all(valid.map((service) => socket.leave(serviceRoom(service))));
    return valid;
  }

  // Resync al (re)conectar: snapshot completo por ack, sin estado intermedio.
  @SubscribeMessage("state:resync")
  async onResync(): Promise<StateSnapshot> {
    return this.snapshots.getSnapshot();
  }

  // Broadcast selectivo: solo el room del servicio afectado.
  publishUpdate(update: ServiceUpdate): void {
    // Un evento Docker puede llegar antes de que el servidor WS esté inicializado.
    if (!this.server) return;
    this.server.to(serviceRoom(update.service)).emit("state:update", update);
  }

  private sanitizeServices(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    const valid = input.filter(
      (service): service is string => typeof service === "string" && SERVICE_NAME.test(service),
    );
    return [...new Set(valid)].slice(0, MAX_ROOMS_PER_REQUEST);
  }
}
