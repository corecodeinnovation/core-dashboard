import { BadRequestException, Controller, Get, Query } from "@nestjs/common";

import { AlertsPage, AlertType, NotifyBotClient } from "./notify-bot.client";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// Feed de alertas recientes de ops-notify-bot (RF-14). Público, mismo nivel
// que el grid de contenedores (informativo, no distinto de lo que ya se ve
// en /audit-log ni tan sensible como /security-audit o /taskforge-status).
@Controller("alerts/feed")
export class AlertsFeedController {
  constructor(private readonly notifyBot: NotifyBotClient) {}

  @Get()
  list(
    @Query("type") type: string | undefined,
    @Query("limit") limitRaw: string | undefined,
    @Query("offset") offsetRaw: string | undefined,
  ): Promise<AlertsPage> {
    const limit = this.parseNonNegativeInt(limitRaw, DEFAULT_LIMIT, "limit");
    if (limit < 1 || limit > MAX_LIMIT) {
      throw new BadRequestException(`limit inválido (1..${MAX_LIMIT})`);
    }
    const offset = this.parseNonNegativeInt(offsetRaw, 0, "offset");

    return this.notifyBot.listAlerts({
      limit,
      offset,
      type: type as AlertType | undefined,
    });
  }

  private parseNonNegativeInt(raw: string | undefined, fallback: number, field: string): number {
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      throw new BadRequestException(`${field} inválido`);
    }
    return value;
  }
}
