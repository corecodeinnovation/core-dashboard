import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";

import { LiveGateway } from "../gateway/live.gateway";
import { NotifyBotClient } from "./notify-bot.client";

const POLL_MS = 10_000;
// Suficiente para no perder ráfagas entre polls; ops-notify-bot guarda hasta 200.
const POLL_LIMIT = 20;

// RF-14: en vez de que cada cliente conectado poll-ee ops-notify-bot por su
// cuenta, el api lo hace UNA vez server-side y reenvía lo nuevo por WS a
// todos — de N pollers (uno por pestaña abierta) a 1.
@Injectable()
export class AlertsPollerService implements OnModuleInit {
  private readonly logger = new Logger(AlertsPollerService.name);
  private lastSeenId: string | null = null;
  // Al arrancar, el primer poll establece la base sin emitir el historial
  // existente como si fuera "nuevo".
  private initialized = false;

  constructor(
    private readonly notifyBot: NotifyBotClient,
    private readonly gateway: LiveGateway,
  ) {}

  onModuleInit(): void {
    void this.poll();
  }

  @Interval(POLL_MS)
  async poll(): Promise<void> {
    let items;
    try {
      ({ items } = await this.notifyBot.listAlerts({ limit: POLL_LIMIT }));
    } catch (err) {
      // ops-notify-bot caído: se reintenta en el próximo tick, no es fatal.
      this.logger.warn(`no se pudo consultar el feed de alertas: ${(err as Error).message}`);
      return;
    }

    if (!this.initialized) {
      this.lastSeenId = items[0]?.id ?? null;
      this.initialized = true;
      return;
    }
    if (items.length === 0) return;

    // items viene más reciente primero; boundary = último ya visto.
    const boundary = items.findIndex((item) => item.id === this.lastSeenId);
    const fresh = boundary === -1 ? items : items.slice(0, boundary);
    if (fresh.length === 0) return;

    this.lastSeenId = items[0]!.id;
    // Emitir en orden cronológico (más viejo primero), como llegaron de verdad.
    for (const item of [...fresh].reverse()) {
      this.gateway.publishAlert(item.type);
    }
  }
}
