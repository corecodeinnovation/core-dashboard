import type { ServiceUpdate } from "@core-dashboard/shared";

import type { ContainersService } from "../containers/containers.service";
import type { PrismaService } from "../prisma/prisma.service";
import { AlertsService, CONTAINER_DOWN_ALERT_KEY } from "./alerts.service";
import type { NotifyBotClient } from "./notify-bot.client";

function update(
  partial: Partial<ServiceUpdate> & { action: ServiceUpdate["action"] },
): ServiceUpdate {
  return {
    service: "core-dashboard.worker",
    state: {
      id: "abc123456789",
      name: "core-dashboard-worker-1",
      service: "worker",
      project: "core-dashboard",
      image: "core-dashboard-worker",
      status: "exited",
      health: "none",
      startedAt: null,
      uptimeSec: null,
    },
    occurredAt: new Date().toISOString(),
    ...partial,
  };
}

function harness(settingRow: { enabled: boolean } | null = null) {
  let capturedListener: ((u: ServiceUpdate) => void) | null = null;
  const containers = {
    onUpdate: jest.fn((listener: (u: ServiceUpdate) => void) => {
      capturedListener = listener;
    }),
  };
  const prisma = {
    alertSetting: { findUnique: jest.fn().mockResolvedValue(settingRow) },
  };
  const notifyBot = { sendContainerDown: jest.fn().mockResolvedValue(undefined) };

  const service = new AlertsService(
    containers as unknown as ContainersService,
    prisma as unknown as PrismaService,
    notifyBot as unknown as NotifyBotClient,
  );
  service.onModuleInit();

  return {
    emit: async (u: ServiceUpdate) => {
      capturedListener!(u);
      await new Promise((r) => setImmediate(r));
    },
    prisma,
    notifyBot,
  };
}

describe("AlertsService", () => {
  it("die ⇒ notifica container_down con el exit code", async () => {
    const { emit, notifyBot } = harness();

    await emit(update({ action: "die", exitCode: 137 }));

    expect(notifyBot.sendContainerDown).toHaveBeenCalledWith({
      type: "container_down",
      container: "core-dashboard-worker-1",
      exitCode: 137,
    });
  });

  it.each(["start", "stop", "kill", "restart", "pause", "unpause", "health_status"] as const)(
    "acción %s (no die) ⇒ no notifica",
    async (action) => {
      const { emit, notifyBot } = harness();
      await emit(update({ action }));
      expect(notifyBot.sendContainerDown).not.toHaveBeenCalled();
    },
  );

  it("consulta la clave correcta de AlertSetting", async () => {
    const { emit, prisma } = harness();
    await emit(update({ action: "die" }));
    expect(prisma.alertSetting.findUnique).toHaveBeenCalledWith({
      where: { key: CONTAINER_DOWN_ALERT_KEY },
    });
  });

  it("AlertSetting.enabled=false ⇒ no notifica", async () => {
    const { emit, notifyBot } = harness({ enabled: false });
    await emit(update({ action: "die" }));
    expect(notifyBot.sendContainerDown).not.toHaveBeenCalled();
  });

  it("sin fila de AlertSetting ⇒ default activado", async () => {
    const { emit, notifyBot } = harness(null);
    await emit(update({ action: "die" }));
    expect(notifyBot.sendContainerDown).toHaveBeenCalledTimes(1);
  });

  it("cooldown: dos caídas seguidas del mismo contenedor ⇒ solo una alerta", async () => {
    const { emit, notifyBot } = harness();
    await emit(update({ action: "die" }));
    await emit(update({ action: "die" }));
    expect(notifyBot.sendContainerDown).toHaveBeenCalledTimes(1);
  });

  it("cooldown es por contenedor: otro contenedor alerta igual", async () => {
    const { emit, notifyBot } = harness();
    await emit(update({ action: "die" }));
    await emit(
      update({
        action: "die",
        state: {
          id: "def456789012",
          name: "core-dashboard-other-1",
          service: "other",
          project: "core-dashboard",
          image: "core-dashboard-other",
          status: "exited",
          health: "none",
          startedAt: null,
          uptimeSec: null,
        },
      }),
    );
    expect(notifyBot.sendContainerDown).toHaveBeenCalledTimes(2);
  });

  it("pasado el cooldown, el mismo contenedor vuelve a alertar", async () => {
    const { emit, notifyBot } = harness();
    const nowSpy = jest.spyOn(Date, "now");
    nowSpy.mockReturnValue(1_000_000);
    await emit(update({ action: "die" }));
    nowSpy.mockReturnValue(1_000_000 + 61_000); // pasó el cooldown de 60s
    await emit(update({ action: "die" }));
    nowSpy.mockRestore();

    expect(notifyBot.sendContainerDown).toHaveBeenCalledTimes(2);
  });
});
