import { BadRequestException, Controller, Param, Post, Req } from "@nestjs/common";

import type { AuthenticatedRequest } from "../auth/auth.guard";
import { RequireRole } from "../auth/roles.decorator";
import { ActionsService } from "./actions.service";

const CONTAINER_NAME = /^[a-z0-9][a-z0-9_.-]{0,127}$/i;

// Acciones destructivas sobre contenedores (RF-07): solo operator+.
@Controller("actions/containers")
@RequireRole("operator")
export class ActionsController {
  constructor(private readonly actions: ActionsService) {}

  @Post(":name/restart")
  async restart(
    @Param("name") name: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ container: string }> {
    if (!CONTAINER_NAME.test(name)) {
      throw new BadRequestException("nombre de contenedor inválido");
    }
    return this.actions.restartContainer(name, req.user);
  }
}
