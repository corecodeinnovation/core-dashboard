import { TaskforgeClient } from "../jobs/taskforge-client.service";
import { TaskforgeStatusService } from "./taskforge-status.service";

function page(total: number, items: unknown[] = []) {
  return { total, limit: 1, offset: 0, items };
}

describe("TaskforgeStatusService", () => {
  it("pide el total por cada uno de los 6 estados y los últimos fallos/dlq", async () => {
    const listJobs = jest.fn().mockImplementation(({ state }: { state: string }) => {
      const totals: Record<string, number> = {
        queued: 3,
        active: 1,
        delayed: 0,
        completed: 40,
        failed: 2,
        dlq: 1,
      };
      if (state === "failed") {
        return Promise.resolve(
          page(2, [
            { jobId: "f1", updatedAt: "2026-07-20T00:00:00.000Z" },
            { jobId: "f2", updatedAt: "2026-07-22T00:00:00.000Z" },
          ]),
        );
      }
      if (state === "dlq") {
        return Promise.resolve(page(1, [{ jobId: "d1", updatedAt: "2026-07-25T00:00:00.000Z" }]));
      }
      return Promise.resolve(page(totals[state]!));
    });
    const service = new TaskforgeStatusService({ listJobs } as unknown as TaskforgeClient);

    const result = await service.getStatus();

    expect(result.counts).toEqual({
      queued: 3,
      active: 1,
      delayed: 0,
      completed: 40,
      failed: 2,
      dlq: 1,
    });
    // más reciente primero
    expect(result.recentFailures.map((f) => f.jobId)).toEqual(["d1", "f2", "f1"]);
    expect(listJobs).toHaveBeenCalledWith({ state: "queued", limit: 1 });
    expect(listJobs).toHaveBeenCalledWith({ state: "failed", limit: 10 });
    expect(listJobs).toHaveBeenCalledWith({ state: "dlq", limit: 10 });
  });
});
