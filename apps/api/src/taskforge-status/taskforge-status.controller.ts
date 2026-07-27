import { Controller, Get } from "@nestjs/common";

import { RequireRole } from "../auth/roles.decorator";
import { QueueStatus, TaskforgeStatusService } from "./taskforge-status.service";

// Vistazo de salud de la cola de taskforge (RF-13): operativo, no destructivo,
// mismo umbral de rol que las acciones sobre contenedores (operator+).
@Controller("taskforge-status")
@RequireRole("operator")
export class TaskforgeStatusController {
  constructor(private readonly status: TaskforgeStatusService) {}

  @Get()
  get(): Promise<QueueStatus> {
    return this.status.getStatus();
  }
}
