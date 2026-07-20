import { NotifyBotClient } from "./notify-bot.client";

describe("NotifyBotClient", () => {
  const env = process.env;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env = {
      ...env,
      NOTIFY_BOT_URL: "http://ops-notify-bot:3001",
      NOTIFY_BOT_WEBHOOK_SECRET: "s3cret",
    };
    fetchMock = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchMock.mockRestore();
    process.env = env;
  });

  it("postea al webhook con el secreto y el payload correctos", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 202 } as Response);

    await new NotifyBotClient().sendContainerDown({
      type: "container_down",
      container: "core-dashboard-worker-1",
      exitCode: 137,
    });

    const [url, init] = fetchMock.mock.calls[0]! as [URL, RequestInit];
    expect(url.toString()).toBe("http://ops-notify-bot:3001/webhook");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-Webhook-Secret"]).toBe("s3cret");
    expect(JSON.parse(init.body as string)).toEqual({
      type: "container_down",
      container: "core-dashboard-worker-1",
      exitCode: 137,
    });
  });

  it("sin NOTIFY_BOT_URL/SECRET configurados, no llama a fetch (no revienta)", async () => {
    delete process.env.NOTIFY_BOT_URL;
    delete process.env.NOTIFY_BOT_WEBHOOK_SECRET;

    await new NotifyBotClient().sendContainerDown({ type: "container_down", container: "x" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("respuesta no-ok no lanza (se loguea y sigue)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response);

    await expect(
      new NotifyBotClient().sendContainerDown({ type: "container_down", container: "x" }),
    ).resolves.toBeUndefined();
  });

  it("fetch rechazado (red caída) no lanza", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      new NotifyBotClient().sendContainerDown({ type: "container_down", container: "x" }),
    ).resolves.toBeUndefined();
  });
});
