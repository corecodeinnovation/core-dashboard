import { ServiceUnavailableException } from "@nestjs/common";

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

  it("sendContainerDown postea el webhook con el secreto y el payload correctos", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 202 } as Response);

    await new NotifyBotClient().sendContainerDown({
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

  it("sendContainerRestarted postea un payload de tipo distinto, sin exitCode", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 202 } as Response);

    await new NotifyBotClient().sendContainerRestarted({ container: "core-dashboard-worker-1" });

    const [, init] = fetchMock.mock.calls[0]! as [URL, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      type: "container_restarted",
      container: "core-dashboard-worker-1",
    });
  });

  it("sin NOTIFY_BOT_URL/SECRET configurados, no llama a fetch (no revienta)", async () => {
    delete process.env.NOTIFY_BOT_URL;
    delete process.env.NOTIFY_BOT_WEBHOOK_SECRET;

    await new NotifyBotClient().sendContainerDown({ container: "x" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("respuesta no-ok no lanza (se loguea y sigue)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response);

    await expect(
      new NotifyBotClient().sendContainerDown({ container: "x" }),
    ).resolves.toBeUndefined();
  });

  it("fetch rechazado (red caída) no lanza", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      new NotifyBotClient().sendContainerDown({ container: "x" }),
    ).resolves.toBeUndefined();
  });

  it("listAlerts pide GET /alerts con el secreto y los filtros como query", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ total: 1, items: [{ id: "a1", type: "container_down" }] }),
    } as Response);

    const page = await new NotifyBotClient().listAlerts({
      limit: 20,
      offset: 10,
      type: "container_down",
    });

    const [url, init] = fetchMock.mock.calls[0]! as [URL, RequestInit];
    expect(url.toString()).toBe(
      "http://ops-notify-bot:3001/alerts?limit=20&offset=10&type=container_down",
    );
    expect((init.headers as Record<string, string>)["X-Webhook-Secret"]).toBe("s3cret");
    expect(page).toEqual({ total: 1, items: [{ id: "a1", type: "container_down" }] });
  });

  it("listAlerts sin params consulta GET /alerts sin query string", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ total: 0, items: [] }),
    } as Response);
    await new NotifyBotClient().listAlerts();
    const [url] = fetchMock.mock.calls[0]! as [URL];
    expect(url.toString()).toBe("http://ops-notify-bot:3001/alerts");
  });

  it("listAlerts sin config ⇒ ServiceUnavailableException, no llama a fetch", async () => {
    delete process.env.NOTIFY_BOT_URL;
    await expect(new NotifyBotClient().listAlerts()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listAlerts respuesta no-ok ⇒ ServiceUnavailableException (a diferencia de send, sí propaga)", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "unauthorized" }),
    } as Response);
    await expect(new NotifyBotClient().listAlerts()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("listAlerts fetch rechazado ⇒ ServiceUnavailableException", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(new NotifyBotClient().listAlerts()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
