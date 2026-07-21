import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { RedisIoAdapter } from "./gateway/redis-io.adapter";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Multi-réplica del gateway (B-09): sin REDIS_URL, sigue funcionando en
  // memoria (single-instance) sin cambios de comportamiento.
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
