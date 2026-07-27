export const TASKFORGE_JOB_STATES = [
  "queued",
  "active",
  "delayed",
  "completed",
  "failed",
  "dlq",
] as const;

export type TaskforgeJobState = (typeof TASKFORGE_JOB_STATES)[number];

export interface TaskforgeJobRecord {
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

export interface TaskforgeQueueStatus {
  counts: Record<TaskforgeJobState, number>;
  recentFailures: TaskforgeJobRecord[];
}

export class TaskforgeStatusApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

// RF-13: vistazo de la cola de taskforge (conteos por estado + últimos
// fallos), vía proxy operator+ del api.
export async function fetchTaskforgeStatus(accessToken: string): Promise<TaskforgeQueueStatus> {
  const response = await fetch("/api/taskforge-status", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data as { message?: string })?.message ?? `HTTP ${response.status}`;
    throw new TaskforgeStatusApiError(
      Array.isArray(message) ? message.join(", ") : message,
      response.status,
    );
  }
  return data as TaskforgeQueueStatus;
}
