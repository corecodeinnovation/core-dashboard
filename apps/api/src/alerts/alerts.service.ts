import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { ServiceUpdate } from "@core-dashboard/shared";

import { ContainersService } from "../containers/containers.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotifyBotClient } from "./notify-bot.client";

// Clave de AlertSetting para esta categoría de alerta (RF-06). El modelo
// soporta más categorías a futuro (p. ej. umbrales de recursos); por ahora
// solo existe esta.
export const CONTAINER_DOWN_ALERT_KEY = "container_down";

// Ventana mínima entre dos alertas del MISMO contenedor: evita saturar
// Telegram si un contenedor entra en crash-loop (varios `die` por minuto).
const COOLDOWN_MS = 60_000;

@Injectable()
export class AlertsService implements OnModuleInit {
  private readonly logger = new Logger(AlertsService.name);
  private readonly lastAlertAt = new Map<string, number>();

  constructor(
    private readonly containers: ContainersService,
    private readonly prisma: PrismaService,
    private readonly notifyBot: NotifyBotClient,
  ) {}

  onModuleInit(): void {
    this.containers.onUpdate((update) => void this.handleUpdate(update));
  }

  private async handleUpdate(update: ServiceUpdate): Promise<void> {
    // "Caída" (RF-06): el proceso principal del contenedor murió. Un restart
    // por política de Docker está necesariamente precedido por este mismo
    // evento, así que alertar solo en `die` ya cubre "caída o restart" sin
    // duplicar aviso cuando se recupera solo un instante después.
    if (update.action !== "die") return;
    if (!(await this.isEnabled())) return;
    if (this.isOnCooldown(update.state.name)) return;

    this.lastAlertAt.set(update.state.name, Date.now());
    await this.notifyBot.sendContainerDown({
      type: "container_down",
      container: update.state.name,
      exitCode: update.exitCode,
    });
    this.logger.log(`alerta enviada: ${update.state.name} caído (exit ${update.exitCode ?? "?"})`);
  }

  private isOnCooldown(containerName: string): boolean {
    const last = this.lastAlertAt.get(containerName);
    return last !== undefined && Date.now() - last < COOLDOWN_MS;
  }

  private async isEnabled(): Promise<boolean> {
    const setting = await this.prisma.alertSetting.findUnique({
      where: { key: CONTAINER_DOWN_ALERT_KEY },
    });
    // Sin fila todavía ⇒ default activado (RF-06 es "Alta" prioridad).
    return setting?.enabled ?? true;
  }
}
