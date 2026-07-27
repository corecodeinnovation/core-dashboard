import { Controller, Get } from "@nestjs/common";

import { DependenciesHealth, DependenciesHealthService } from "./dependencies-health.service";

export interface HealthStatus {
  status: "ok";
  service: string;
  uptime: number;
}

@Controller("health")
export class HealthController {
  constructor(private readonly dependencies: DependenciesHealthService) {}

  @Get()
  getHealth(): HealthStatus {
    return {
      status: "ok",
      service: "core-dashboard-api",
      uptime: process.uptime(),
    };
  }

  // Separado del liveness de arriba a propósito (ver DependenciesHealthService).
  @Get("dependencies")
  getDependencies(): Promise<DependenciesHealth> {
    return this.dependencies.check();
  }
}
