import { BadRequestException, Body, Controller, Get, Param, Patch, Req } from "@nestjs/common";
import type { AlertSetting } from "@prisma/client";

import type { AuthenticatedRequest } from "../auth/auth.guard";
import { RequireRole } from "../auth/roles.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { CONTAINER_DOWN_ALERT_KEY } from "./alerts.service";

const KNOWN_KEYS = new Set([CONTAINER_DOWN_ALERT_KEY]);

interface UpdateAlertSettingBody {
  enabled?: boolean;
  threshold?: number | null;
}

// Umbrales/toggles de alertas (RF-06), editables solo por admin.
@Controller("alerts/settings")
@RequireRole("admin")
export class AlertsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(): Promise<AlertSetting[]> {
    // La categoría container_down existe siempre para el admin, aunque nadie
    // la haya tocado todavía (default: activada — ver AlertsService.isEnabled).
    const existing = await this.prisma.alertSetting.findMany({ orderBy: { key: "asc" } });
    if (existing.some((s) => s.key === CONTAINER_DOWN_ALERT_KEY)) return existing;
    return [
      ...existing,
      {
        id: "",
        key: CONTAINER_DOWN_ALERT_KEY,
        enabled: true,
        threshold: null,
        updatedBy: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ];
  }

  @Patch(":key")
  async update(
    @Param("key") key: string,
    @Body() body: UpdateAlertSettingBody,
    @Req() req: AuthenticatedRequest,
  ): Promise<AlertSetting> {
    if (!KNOWN_KEYS.has(key)) {
      throw new BadRequestException(
        `clave de alerta desconocida (válidas: ${[...KNOWN_KEYS].join(", ")})`,
      );
    }
    if (body.enabled === undefined && body.threshold === undefined) {
      throw new BadRequestException("nada para actualizar (enabled y/o threshold)");
    }
    return this.prisma.alertSetting.upsert({
      where: { key },
      create: {
        key,
        enabled: body.enabled ?? true,
        threshold: body.threshold ?? null,
        updatedBy: req.user.sub,
      },
      update: {
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.threshold !== undefined ? { threshold: body.threshold } : {}),
        updatedBy: req.user.sub,
      },
    });
  }
}
