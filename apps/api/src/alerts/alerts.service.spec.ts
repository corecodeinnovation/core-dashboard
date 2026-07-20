import type { ServiceUpdate } from "@core-dashboard/shared";

import type { ContainersService } from "../containers/containers.service";
import type { PrismaService } from "../prisma/prisma.service";
import {
  AlertsService,
  CONTAINER_DOWN_ALERT_KEY,
  CONTAINER_RESTARTED_ALERT_KEY,
  DIE_RESTART_COALESCE_MS,
} from "./alerts.service";
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

function otherContainerUpdate(action: ServiceUpdate["action"]): ServiceUpdate {
  return update({
    action,
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
  });
}

// key -> fila de AlertSetting (o ausente = no existe, default activado).
function harness(settings: Record<string, { enabled: boolean } | null> = {}) {
  let capturedListener: ((u: ServiceUpdate) => void) | null = null;
  const containers = {
    onUpdate: jest.fn((listener: (u: ServiceUpdate) => void) => {
      capturedListener = listener;
    }),
  };
  const prisma = {
    alertSetting: {
      findUnique: jest.fn(({ where: { key } }: { where: { key: string } }) =>
        Promise.resolve(key in settings ? settings[key] : null),
      ),
    },
  };
  const notifyBot = {
    sendContainerDown: jest.fn().mockResolvedValue(undefined),
    sendContainerRestarted: jest.fn().mockResolvedValue(undefined),
  };

  const service = new AlertsService(
    containers as unknown as ContainersService,
    prisma as unknown as PrismaService,
    notifyBot as unknown as NotifyBotClient,
  );
  service.onModuleInit();

  return { service, emit: (u: ServiceUpdate) => capturedListener!(u), prisma, notifyBot };
}

// Las alertas de "die" están detrás de un setTimeout (coalescing con restart);
// hay que avanzar el reloj falso y dejar correr las promesas encoladas.
async function flushCoalesceWindow(): Promise<void> {
  await jest.advanceTimersByTimeAsync(DIE_RESTART_COALESCE_MS);
}

describe("AlertsService", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("die (sin restart posterior) ⇒ notifica container_down con el exit code", async () => {
    const { emit, notifyBot } = harness();

    emit(update({ action: "die", exitCode: 137 }));
    await flushCoalesceWindow();

    expect(notifyBot.sendContainerDown).toHaveBeenCalledWith({
      container: "core-dashboard-worker-1",
      exitCode: 137,
    });
    expect(notifyBot.sendContainerRestarted).not.toHaveBeenCalled();
  });

  it("restart sin die previo ⇒ notifica container_restarted de inmediato", async () => {
    const { emit, notifyBot } = harness();

    emit(update({ action: "restart" }));
    await Promise.resolve();
    await Promise.resolve();

    expect(notifyBot.sendContainerRestarted).toHaveBeenCalledWith({
      container: "core-dashboard-worker-1",
    });
    expect(notifyBot.sendContainerDown).not.toHaveBeenCalled();
  });

  it("docker restart real (die + restart casi juntos) ⇒ solo 'reiniciado', nunca 'caído'", async () => {
    const { emit, notifyBot } = harness();

    emit(update({ action: "die", exitCode: 137 })); // el stop del restart
    await jest.advanceTimersByTimeAsync(50); // llega bien dentro de la ventana
    emit(update({ action: "restart" }));
    await flushCoalesceWindow();

    expect(notifyBot.sendContainerRestarted).toHaveBeenCalledTimes(1);
    expect(notifyBot.sendContainerDown).not.toHaveBeenCalled();
  });

  it.each(["start", "stop", "kill", "pause", "unpause", "health_status"] as const)(
    "acción %s (ni die ni restart) ⇒ no notifica nada",
    async (action) => {
      const { emit, notifyBot } = harness();
      emit(update({ action }));
      await flushCoalesceWindow();
      expect(notifyBot.sendContainerDown).not.toHaveBeenCalled();
      expect(notifyBot.sendContainerRestarted).not.toHaveBeenCalled();
    },
  );

  it("cada acción consulta su propia clave de AlertSetting", async () => {
    const { emit, prisma } = harness();
    emit(update({ action: "die" }));
    await flushCoalesceWindow();
    emit(update({ action: "restart" }));
    await Promise.resolve();

    expect(prisma.alertSetting.findUnique).toHaveBeenCalledWith({
      where: { key: CONTAINER_DOWN_ALERT_KEY },
    });
    expect(prisma.alertSetting.findUnique).toHaveBeenCalledWith({
      where: { key: CONTAINER_RESTARTED_ALERT_KEY },
    });
  });

  it("AlertSetting.enabled=false desactiva solo esa categoría", async () => {
    const { emit, notifyBot } = harness({ [CONTAINER_RESTARTED_ALERT_KEY]: { enabled: false } });

    emit(update({ action: "restart" }));
    await Promise.resolve();
    await Promise.resolve();
    expect(notifyBot.sendContainerRestarted).not.toHaveBeenCalled();

    emit(update({ action: "die" }));
    await flushCoalesceWindow();
    expect(notifyBot.sendContainerDown).toHaveBeenCalledTimes(1);
  });

  it("cooldown: dos caídas seguidas (sin restart) del mismo contenedor ⇒ solo una alerta", async () => {
    const { emit, notifyBot } = harness();
    emit(update({ action: "die" }));
    await flushCoalesceWindow();
    emit(update({ action: "die" }));
    await flushCoalesceWindow();
    expect(notifyBot.sendContainerDown).toHaveBeenCalledTimes(1);
  });

  it("cooldown es por contenedor: otro contenedor alerta igual", async () => {
    const { emit, notifyBot } = harness();
    emit(update({ action: "die" }));
    await flushCoalesceWindow();
    emit(otherContainerUpdate("die"));
    await flushCoalesceWindow();
    expect(notifyBot.sendContainerDown).toHaveBeenCalledTimes(2);
  });

  it("pasado el cooldown, el mismo contenedor vuelve a alertar", async () => {
    const { emit, notifyBot } = harness();
    const nowSpy = jest.spyOn(Date, "now");
    nowSpy.mockReturnValue(1_000_000);
    emit(update({ action: "die" }));
    await flushCoalesceWindow();
    nowSpy.mockReturnValue(1_000_000 + 61_000); // pasó el cooldown de 60s
    emit(update({ action: "die" }));
    await flushCoalesceWindow();
    nowSpy.mockRestore();

    expect(notifyBot.sendContainerDown).toHaveBeenCalledTimes(2);
  });

  it("onModuleDestroy cancela las alertas de die pendientes", async () => {
    const { service, emit, notifyBot } = harness();
    emit(update({ action: "die" }));
    service.onModuleDestroy();
    await flushCoalesceWindow();

    expect(notifyBot.sendContainerDown).not.toHaveBeenCalled();
  });
});
