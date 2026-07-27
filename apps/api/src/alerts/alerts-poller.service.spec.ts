import { LiveGateway } from "../gateway/live.gateway";
import { AlertsPollerService } from "./alerts-poller.service";
import { AlertItem, NotifyBotClient } from "./notify-bot.client";

function alert(id: string, type: AlertItem["type"] = "container_down"): AlertItem {
  return { id, type, receivedAt: new Date().toISOString(), payload: {} };
}

describe("AlertsPollerService", () => {
  function setup(listAlerts: jest.Mock) {
    const notifyBot = { listAlerts } as unknown as NotifyBotClient;
    const gateway = { publishAlert: jest.fn() } as unknown as LiveGateway;
    return { service: new AlertsPollerService(notifyBot, gateway), gateway };
  }

  it("el primer poll establece la base sin emitir nada (no trata el historial como nuevo)", async () => {
    const listAlerts = jest
      .fn()
      .mockResolvedValue({ total: 3, items: [alert("c"), alert("b"), alert("a")] });
    const { service, gateway } = setup(listAlerts);

    await service.poll();

    expect(gateway.publishAlert).not.toHaveBeenCalled();
  });

  it("un poll posterior con alertas nuevas las emite en orden cronológico (más vieja primero)", async () => {
    const listAlerts = jest
      .fn()
      .mockResolvedValueOnce({ total: 1, items: [alert("a")] })
      .mockResolvedValueOnce({
        total: 3,
        items: [alert("c", "job_dlq"), alert("b", "deploy"), alert("a")],
      });
    const { service, gateway } = setup(listAlerts);

    await service.poll(); // baseline: lastSeenId = "a"
    await service.poll(); // nuevas: "b" y "c"

    expect(gateway.publishAlert).toHaveBeenCalledTimes(2);
    expect(gateway.publishAlert).toHaveBeenNthCalledWith(1, "deploy"); // b, más vieja
    expect(gateway.publishAlert).toHaveBeenNthCalledWith(2, "job_dlq"); // c, más nueva
  });

  it("sin cambios desde el último poll, no emite nada", async () => {
    const listAlerts = jest
      .fn()
      .mockResolvedValueOnce({ total: 1, items: [alert("a")] })
      .mockResolvedValueOnce({ total: 1, items: [alert("a")] });
    const { service, gateway } = setup(listAlerts);

    await service.poll();
    await service.poll();

    expect(gateway.publishAlert).not.toHaveBeenCalled();
  });

  it("lastSeenId ya no está en la ventana (más de POLL_LIMIT alertas nuevas) ⇒ emite toda la página", async () => {
    const listAlerts = jest
      .fn()
      .mockResolvedValueOnce({ total: 1, items: [alert("a")] })
      .mockResolvedValueOnce({ total: 2, items: [alert("c"), alert("b")] }); // "a" ya no aparece
    const { service, gateway } = setup(listAlerts);

    await service.poll();
    await service.poll();

    expect(gateway.publishAlert).toHaveBeenCalledTimes(2);
  });

  it("ops-notify-bot caído: no lanza, no rompe el próximo poll", async () => {
    const listAlerts = jest
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce({ total: 1, items: [alert("a")] });
    const { service, gateway } = setup(listAlerts);

    await expect(service.poll()).resolves.toBeUndefined();
    await service.poll(); // este sí establece la base

    expect(gateway.publishAlert).not.toHaveBeenCalled();
  });

  it("página vacía en un poll posterior no rompe nada", async () => {
    const listAlerts = jest
      .fn()
      .mockResolvedValueOnce({ total: 1, items: [alert("a")] })
      .mockResolvedValueOnce({ total: 0, items: [] });
    const { service, gateway } = setup(listAlerts);

    await service.poll();
    await expect(service.poll()).resolves.toBeUndefined();

    expect(gateway.publishAlert).not.toHaveBeenCalled();
  });
});
