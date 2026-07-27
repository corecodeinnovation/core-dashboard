import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";

export interface ContainerDownEvent {
  type: "container_down";
  container: string;
  exitCode?: number;
}

export interface ContainerRestartedEvent {
  type: "container_restarted";
  container: string;
}

type WebhookEvent = ContainerDownEvent | ContainerRestartedEvent;

// Tipos de alerta que expone GET /alerts (todo WebhookEvent salvo "contact",
// ver ops-notify-bot/src/alerts/types.ts).
export type AlertType =
  "deploy" | "resource_alert" | "container_down" | "container_restarted" | "job_dlq";

export interface AlertItem {
  id: string;
  type: AlertType;
  receivedAt: string;
  payload: Record<string, unknown>;
}

export interface AlertsPage {
  total: number;
  items: AlertItem[];
}

export interface ListAlertsParams {
  limit?: number;
  offset?: number;
  type?: AlertType;
}

// Cliente del webhook de ops-notify-bot. Fire-and-forget desde el punto de
// vista del llamador: nunca lanza, solo loguea si Telegram/el bot fallan.
@Injectable()
export class NotifyBotClient {
  private readonly logger = new Logger(NotifyBotClient.name);

  sendContainerDown(event: Omit<ContainerDownEvent, "type">): Promise<void> {
    return this.send({ type: "container_down", ...event });
  }

  sendContainerRestarted(event: Omit<ContainerRestartedEvent, "type">): Promise<void> {
    return this.send({ type: "container_restarted", ...event });
  }

  // A diferencia de send() (fire-and-forget), este lado SÍ propaga el error:
  // quien pide el feed necesita saber si ops-notify-bot no respondió.
  async listAlerts(params: ListAlertsParams = {}): Promise<AlertsPage> {
    const baseUrl = process.env.NOTIFY_BOT_URL;
    const secret = process.env.NOTIFY_BOT_WEBHOOK_SECRET;
    if (!baseUrl || !secret) {
      throw new ServiceUnavailableException(
        "NOTIFY_BOT_URL/NOTIFY_BOT_WEBHOOK_SECRET no configurados",
      );
    }

    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.offset !== undefined) query.set("offset", String(params.offset));
    if (params.type) query.set("type", params.type);
    const qs = query.toString();

    let response: Response;
    try {
      response = await fetch(new URL(`/alerts${qs ? `?${qs}` : ""}`, baseUrl), {
        headers: { "X-Webhook-Secret": secret },
      });
    } catch (err) {
      throw new ServiceUnavailableException(
        `no se pudo contactar a ops-notify-bot: ${(err as Error).message}`,
      );
    }

    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      this.logger.warn(`ops-notify-bot respondió ${response.status} para /alerts`);
      throw new ServiceUnavailableException(
        (data as { error?: string })?.error ?? `ops-notify-bot respondió ${response.status}`,
      );
    }
    return data as AlertsPage;
  }

  private async send(event: WebhookEvent): Promise<void> {
    const baseUrl = process.env.NOTIFY_BOT_URL;
    const secret = process.env.NOTIFY_BOT_WEBHOOK_SECRET;
    if (!baseUrl || !secret) {
      this.logger.warn("NOTIFY_BOT_URL/NOTIFY_BOT_WEBHOOK_SECRET no configurados; alerta omitida");
      return;
    }
    try {
      const response = await fetch(new URL("/webhook", baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret },
        body: JSON.stringify(event),
      });
      if (!response.ok) {
        this.logger.warn(`ops-notify-bot respondió ${response.status} para ${event.container}`);
      }
    } catch (err) {
      this.logger.warn(`no se pudo notificar a ops-notify-bot: ${(err as Error).message}`);
    }
  }
}
