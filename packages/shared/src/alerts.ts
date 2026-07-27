// Tipos de alerta que expone ops-notify-bot vía GET /alerts (todo WebhookEvent
// salvo "contact", que no es una alerta operativa — ver ops-notify-bot/src/alerts/types.ts).
export const ALERT_TYPES = [
  "deploy",
  "resource_alert",
  "container_down",
  "container_restarted",
  "job_dlq",
] as const;

export type AlertType = (typeof ALERT_TYPES)[number];
