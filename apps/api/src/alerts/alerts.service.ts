import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { ContainerLifecycleAction, ServiceUpdate } from "@core-dashboard/shared";

import { ContainersService } from "../containers/containers.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotifyBotClient } from "./notify-bot.client";

// Claves de AlertSetting por categoría (RF-06): cada una se puede activar o
// desactivar por separado desde /alerts/settings (admin) — "caída" es más
// crítico que "reinicio" y un admin podría querer solo el primero.
export const CONTAINER_DOWN_ALERT_KEY = "container_down";
export const CONTAINER_RESTARTED_ALERT_KEY = "container_restarted";

// Ventana mínima entre dos alertas del mismo tipo para el MISMO contenedor:
// evita saturar Telegram si un contenedor entra en crash-loop.
const COOLDOWN_MS = 60_000;

// Un `docker restart` real (incluida la acción con RBAC de RF-07) dispara
// `die` (por el stop) seguido casi de inmediato por `restart` — confirmado
// contra Docker real. Sin coalescer, cada restart mandaría dos alertas
// contradictorias ("caído" + "reiniciado") para una sola acción. Se retiene
// la alerta de "caído" esta ventana por si llega el `restart` que la cancela;
// un `die` sin `restart` posterior (crash real) sigue alertando igual.
export const DIE_RESTART_COALESCE_MS = 3_000;

type AlertableAction = Extract<ContainerLifecycleAction, "die" | "restart">;

@Injectable()
export class AlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertsService.name);
  private readonly lastAlertAt = new Map<string, number>();
  private readonly pendingDieAlerts = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly containers: ContainersService,
    private readonly prisma: PrismaService,
    private readonly notifyBot: NotifyBotClient,
  ) {}

  onModuleInit(): void {
    this.containers.onUpdate((update) => this.handleUpdate(update));
  }

  onModuleDestroy(): void {
    for (const timer of this.pendingDieAlerts.values()) clearTimeout(timer);
    this.pendingDieAlerts.clear();
  }

  private handleUpdate(update: ServiceUpdate): void {
    if (update.action === "die") {
      this.scheduleDieAlert(update.state.name, update.exitCode);
      return;
    }
    if (update.action === "restart") {
      // Si había un "caído" pendiente por este mismo restart, se cancela:
      // el aviso único y correcto es "reiniciado".
      this.cancelPendingDieAlert(update.state.name);
      void this.maybeAlert(
        "restart",
        update.state.name,
        CONTAINER_RESTARTED_ALERT_KEY,
        () => this.notifyBot.sendContainerRestarted({ container: update.state.name }),
        "reiniciado",
      );
    }
  }

  private scheduleDieAlert(containerName: string, exitCode: number | undefined): void {
    this.cancelPendingDieAlert(containerName);
    const timer = setTimeout(() => {
      this.pendingDieAlerts.delete(containerName);
      void this.maybeAlert(
        "die",
        containerName,
        CONTAINER_DOWN_ALERT_KEY,
        () => this.notifyBot.sendContainerDown({ container: containerName, exitCode }),
        `caído (exit ${exitCode ?? "?"})`,
      );
    }, DIE_RESTART_COALESCE_MS);
    this.pendingDieAlerts.set(containerName, timer);
  }

  private cancelPendingDieAlert(containerName: string): void {
    const timer = this.pendingDieAlerts.get(containerName);
    if (timer) {
      clearTimeout(timer);
      this.pendingDieAlerts.delete(containerName);
    }
  }

  private async maybeAlert(
    action: AlertableAction,
    containerName: string,
    settingKey: string,
    send: () => Promise<void>,
    logDetail: string,
  ): Promise<void> {
    if (!(await this.isEnabled(settingKey))) return;
    if (this.isOnCooldown(action, containerName)) return;

    this.lastAlertAt.set(this.cooldownKey(action, containerName), Date.now());
    await send();
    this.logger.log(`alerta enviada: ${containerName} ${logDetail}`);
  }

  private isOnCooldown(action: AlertableAction, containerName: string): boolean {
    const last = this.lastAlertAt.get(this.cooldownKey(action, containerName));
    return last !== undefined && Date.now() - last < COOLDOWN_MS;
  }

  private cooldownKey(action: AlertableAction, containerName: string): string {
    return `${action}:${containerName}`;
  }

  private async isEnabled(settingKey: string): Promise<boolean> {
    const setting = await this.prisma.alertSetting.findUnique({ where: { key: settingKey } });
    // Sin fila todavía ⇒ default activado (RF-06 es "Alta" prioridad).
    return setting?.enabled ?? true;
  }
}
