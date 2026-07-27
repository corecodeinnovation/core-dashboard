import { ALERT_TYPES, type AlertType } from "@core-dashboard/shared";

export { ALERT_TYPES, type AlertType };

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

export interface AlertsFilters {
  type?: AlertType;
  limit: number;
  offset: number;
}

export class AlertsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

// RF-14: feed de alertas de ops-notify-bot vía proxy público del api (mismo
// nivel que el grid de contenedores — sin datos sensibles).
export async function fetchAlerts(filters: AlertsFilters): Promise<AlertsPage> {
  const params = new URLSearchParams({
    limit: String(filters.limit),
    offset: String(filters.offset),
  });
  if (filters.type) params.set("type", filters.type);

  const response = await fetch(`/api/alerts/feed?${params}`);
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data as { message?: string })?.message ?? `HTTP ${response.status}`;
    throw new AlertsApiError(
      Array.isArray(message) ? message.join(", ") : message,
      response.status,
    );
  }
  return data as AlertsPage;
}
