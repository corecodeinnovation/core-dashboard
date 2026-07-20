import { Injectable, Logger } from "@nestjs/common";

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
