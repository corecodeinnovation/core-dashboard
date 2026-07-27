import { fetchTaskforgeStatus, TaskforgeStatusApiError } from "./api";

describe("lib/taskforge-status/api", () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  function jsonResponse(body: unknown, ok = true, status = 200): Response {
    return { ok, status, json: async () => body } as unknown as Response;
  }

  it("pide /api/taskforge-status con el Bearer del usuario", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        counts: { queued: 0, active: 0, delayed: 0, completed: 0, failed: 0, dlq: 0 },
        recentFailures: [],
      }),
    );

    await fetchTaskforgeStatus("tok123");

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/taskforge-status");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok123");
  });

  it("devuelve los conteos y los últimos fallos", async () => {
    const body = {
      counts: { queued: 1, active: 2, delayed: 0, completed: 40, failed: 1, dlq: 1 },
      recentFailures: [{ jobId: "j1", state: "dlq" }],
    };
    fetchMock.mockResolvedValue(jsonResponse(body));
    const result = await fetchTaskforgeStatus("tok");
    expect(result).toEqual(body);
  });

  it("respuesta no-ok ⇒ TaskforgeStatusApiError con status y mensaje", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Forbidden" }, false, 403));
    await expect(fetchTaskforgeStatus("tok")).rejects.toMatchObject({
      status: 403,
      message: "Forbidden",
    });
  });

  it("TaskforgeStatusApiError es instanceof Error", () => {
    expect(new TaskforgeStatusApiError("x", 400)).toBeInstanceOf(Error);
  });
});
