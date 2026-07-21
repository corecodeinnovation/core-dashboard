import type { INestApplicationContext } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient, type RedisClientType } from "redis";
import type { ServerOptions } from "socket.io";

const logger = new Logger("RedisIoAdapter");

// Adapter de Socket.IO sobre Redis pub/sub (B-09): sin esto, un evento
// publicado en la réplica A (p. ej. un `state:update` disparado por su propio
// watcher de Docker) nunca llega a un cliente conectado a la réplica B —
// cada instancia de Socket.IO solo conoce sus propios sockets en memoria.
//
// Con una sola réplica (operación normal) esto es opcional: sin REDIS_URL
// configurada, cae en el adapter en memoria de Socket.IO sin romper nada.
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const url = process.env.REDIS_URL;
    if (!url) {
      logger.warn("REDIS_URL no configurada: gateway en modo single-instance (adapter en memoria)");
      return;
    }

    const pubClient: RedisClientType = createClient({ url });
    const subClient: RedisClientType = pubClient.duplicate();
    pubClient.on("error", (err: Error) => logger.error(`redis pub: ${err.message}`));
    subClient.on("error", (err: Error) => logger.error(`redis sub: ${err.message}`));

    await Promise.all([pubClient.connect(), subClient.connect()]);
    this.adapterConstructor = createAdapter(pubClient, subClient);
    logger.log("gateway conectado al adapter de Redis (multi-réplica habilitado)");
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
