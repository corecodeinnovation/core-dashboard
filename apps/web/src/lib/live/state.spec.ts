import type { ServiceState, ServiceUpdate } from "@core-dashboard/shared";

import { applyUpdate, formatUptime, sortServices, statusLabel, statusTone } from "./state";

function state(partial: Partial<ServiceState>): ServiceState {
  return {
    id: "abc123456789",
    name: "core-dashboard-api-1",
    service: "api",
    project: "core-dashboard",
    image: "core-dashboard-api",
    status: "running",
    health: "healthy",
    startedAt: null,
    uptimeSec: null,
    ...partial,
  };
}

describe("sortServices", () => {
  it("ordena por proyecto y después por servicio", () => {
    const sorted = sortServices([
      state({ project: "taskforge", service: "api", name: "t-api" }),
      state({ project: "cci-auth-service", service: "db", name: "a-db" }),
      state({ project: "cci-auth-service", service: "api", name: "a-api" }),
    ]);
    expect(sorted.map((s) => `${s.project}.${s.service}`)).toEqual([
      "cci-auth-service.api",
      "cci-auth-service.db",
      "taskforge.api",
    ]);
  });
});

describe("applyUpdate", () => {
  const base = [state({ name: "api-1", service: "api" }), state({ name: "db-1", service: "db" })];

  function update(s: ServiceState): ServiceUpdate {
    return { service: `${s.project}.${s.service}`, state: s, occurredAt: new Date().toISOString() };
  }

  it("reemplaza el estado existente por nombre de contenedor", () => {
    const next = applyUpdate(
      base,
      update(state({ name: "api-1", service: "api", status: "exited" })),
    );
    expect(next).toHaveLength(2);
    expect(next.find((s) => s.name === "api-1")?.status).toBe("exited");
  });

  it("un contenedor recreado (id nuevo, mismo nombre) no se duplica", () => {
    const next = applyUpdate(
      base,
      update(state({ name: "api-1", service: "api", id: "nuevo-id-9999" })),
    );
    expect(next.filter((s) => s.name === "api-1")).toHaveLength(1);
    expect(next.find((s) => s.name === "api-1")?.id).toBe("nuevo-id-9999");
  });

  it("un servicio nuevo se agrega manteniendo el orden", () => {
    const next = applyUpdate(base, update(state({ name: "web-1", service: "web" })));
    expect(next.map((s) => s.service)).toEqual(["api", "db", "web"]);
  });
});

describe("statusTone / statusLabel", () => {
  it.each([
    ["running", "healthy", "ok", "healthy"],
    ["running", "none", "ok", "running"],
    ["running", "starting", "warn", "starting"],
    ["restarting", "none", "warn", "restarting"],
    ["paused", "none", "warn", "paused"],
    ["running", "unhealthy", "down", "unhealthy"],
    ["exited", "none", "down", "exited"],
    ["dead", "none", "down", "dead"],
  ] as const)("%s/%s ⇒ tono %s, label %s", (status, health, tone, label) => {
    expect(statusTone(status, health)).toBe(tone);
    expect(statusLabel(status, health)).toBe(label);
  });
});

describe("formatUptime", () => {
  const now = Date.parse("2026-07-19T12:00:00Z");

  it.each([
    ["2026-07-19T11:59:18Z", "42s"],
    ["2026-07-19T11:54:30Z", "5m 30s"],
    ["2026-07-19T09:45:00Z", "2h 15m"],
    ["2026-07-16T08:00:00Z", "3d 4h"],
  ])("desde %s ⇒ %s", (startedAt, expected) => {
    expect(formatUptime(startedAt, now)).toBe(expected);
  });

  it("sin startedAt ⇒ null (contenedor detenido)", () => {
    expect(formatUptime(null, now)).toBeNull();
  });
});
