import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";

export interface EnqueuedJob {
  jobId: string;
  queue: string;
  state: string;
}

export interface JobStatus {
  jobId: string;
  name: string;
  state: string;
  result?: unknown;
  failedReason?: string;
}

// Estados públicos del ciclo de vida en taskforge (ver su README).
export const TASKFORGE_JOB_STATES = [
  "queued",
  "active",
  "delayed",
  "completed",
  "failed",
  "dlq",
] as const;
export type TaskforgeJobState = (typeof TASKFORGE_JOB_STATES)[number];

export interface JobRecordItem {
  jobId: string;
  queue: string;
  name: string;
  state: string;
  priority: number | null;
  attemptsMade: number;
  failedReason: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface JobRecordPage {
  total: number;
  limit: number;
  offset: number;
  items: JobRecordItem[];
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

// Margen antes de que venza el token para renovarlo, evita pisar el filo.
const TOKEN_REFRESH_MARGIN_MS = 30_000;

// Cliente de taskforge (RF-08): obtiene su propio access token vía
// client_credentials (RFC 6749 §4.4, cacheado hasta cerca de vencer) y encola
// jobs. Auth de servicio a servicio, sin usuario — el usuario que disparó la
// acción se audita del lado de JobsService, no acá.
@Injectable()
export class TaskforgeClient {
  private readonly logger = new Logger(TaskforgeClient.name);
  private cachedToken: CachedToken | null = null;

  async enqueueDemoJob(steps: number): Promise<EnqueuedJob> {
    const token = await this.getAccessToken();
    const response = await this.request(token, "/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "core-dashboard-metrics-report",
        payload: { steps },
        idempotencyKey: `core-dashboard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      }),
    });
    return response as EnqueuedJob;
  }

  async getJobStatus(jobId: string): Promise<JobStatus> {
    const token = await this.getAccessToken();
    const response = await this.request(token, `/jobs/${encodeURIComponent(jobId)}`, {
      method: "GET",
    });
    return response as JobStatus;
  }

  // Histórico crudo de taskforge (RF-13): usado para armar el vistazo de
  // estado de la cola, no hay endpoint de agregados del lado de taskforge.
  async listJobs(
    params: { state?: TaskforgeJobState; limit?: number } = {},
  ): Promise<JobRecordPage> {
    const token = await this.getAccessToken();
    const query = new URLSearchParams();
    if (params.state) query.set("state", params.state);
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    const qs = query.toString();
    const response = await this.request(token, `/jobs${qs ? `?${qs}` : ""}`, { method: "GET" });
    return response as JobRecordPage;
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt - now > TOKEN_REFRESH_MARGIN_MS) {
      return this.cachedToken.accessToken;
    }

    const clientId = process.env.TASKFORGE_CLIENT_ID;
    const clientSecret = process.env.TASKFORGE_CLIENT_SECRET;
    const authUrl = process.env.AUTH_SERVICE_URL;
    if (!clientId || !clientSecret || !authUrl) {
      throw new ServiceUnavailableException(
        "TASKFORGE_CLIENT_ID/TASKFORGE_CLIENT_SECRET/AUTH_SERVICE_URL no configurados",
      );
    }

    let response: Response;
    try {
      response = await fetch(new URL("/oauth/token", authUrl), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
          scope: "taskforge:enqueue taskforge:read",
        }),
      });
    } catch (err) {
      throw new ServiceUnavailableException(
        `no se pudo contactar al servicio de autenticación: ${(err as Error).message}`,
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new ServiceUnavailableException(`no se pudo obtener token para taskforge: ${body}`);
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.cachedToken = { accessToken: data.access_token, expiresAt: now + data.expires_in * 1000 };
    return data.access_token;
  }

  private async request(token: string, path: string, init: RequestInit): Promise<unknown> {
    const baseUrl = process.env.TASKFORGE_URL;
    if (!baseUrl) throw new ServiceUnavailableException("TASKFORGE_URL no configurado");

    let response: Response;
    try {
      response = await fetch(new URL(path, baseUrl), {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      throw new ServiceUnavailableException(
        `no se pudo contactar a taskforge: ${(err as Error).message}`,
      );
    }

    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      this.logger.warn(`taskforge respondió ${response.status} para ${path}`);
      throw new ServiceUnavailableException(
        (data as { message?: string })?.message ?? `taskforge respondió ${response.status}`,
      );
    }
    return data;
  }
}
