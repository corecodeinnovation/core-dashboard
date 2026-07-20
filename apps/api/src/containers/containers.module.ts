import { Module } from "@nestjs/common";

import { STATE_SNAPSHOT_PROVIDER } from "../gateway/snapshot.provider";
import { ContainersService } from "./containers.service";
import { createDockerClient, DOCKER_CLIENT } from "./docker.client";

@Module({
  providers: [
    { provide: DOCKER_CLIENT, useFactory: createDockerClient },
    ContainersService,
    // El snapshot de resync sale del inventario real de contenedores.
    { provide: STATE_SNAPSHOT_PROVIDER, useExisting: ContainersService },
  ],
  exports: [ContainersService, STATE_SNAPSHOT_PROVIDER, DOCKER_CLIENT],
})
export class ContainersModule {}
