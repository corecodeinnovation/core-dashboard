import { Injectable } from "@nestjs/common";

import {
  JobRecordItem,
  TASKFORGE_JOB_STATES,
  TaskforgeClient,
  TaskforgeJobState,
} from "../jobs/taskforge-client.service";

const FAILURE_STATES: TaskforgeJobState[] = ["failed", "dlq"];
const RECENT_FAILURES_LIMIT = 10;

export type QueueCounts = Record<TaskforgeJobState, number>;

export interface QueueStatus {
  counts: QueueCounts;
  recentFailures: JobRecordItem[];
}

// Vistazo de salud de la cola de taskforge (RF-13): no hay endpoint de
// agregados del lado de taskforge (ver su README), así que se arma pidiendo
// el total por estado (limit=1, solo interesa `total`) más el detalle de los
// últimos fallos.
@Injectable()
export class TaskforgeStatusService {
  constructor(private readonly taskforge: TaskforgeClient) {}

  async getStatus(): Promise<QueueStatus> {
    const [countPages, failurePages] = await Promise.all([
      Promise.all(
        TASKFORGE_JOB_STATES.map((state) => this.taskforge.listJobs({ state, limit: 1 })),
      ),
      Promise.all(
        FAILURE_STATES.map((state) =>
          this.taskforge.listJobs({ state, limit: RECENT_FAILURES_LIMIT }),
        ),
      ),
    ]);

    const counts = TASKFORGE_JOB_STATES.reduce((acc, state, i) => {
      acc[state] = countPages[i]!.total;
      return acc;
    }, {} as QueueCounts);

    const recentFailures = failurePages
      .flatMap((page) => page.items)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, RECENT_FAILURES_LIMIT);

    return { counts, recentFailures };
  }
}
