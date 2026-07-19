import { Controller, Get } from "@nestjs/common";

export interface HealthStatus {
  status: "ok";
  service: string;
  uptime: number;
}

@Controller("health")
export class HealthController {
  @Get()
  getHealth(): HealthStatus {
    return {
      status: "ok",
      service: "core-dashboard-api",
      uptime: process.uptime(),
    };
  }
}
