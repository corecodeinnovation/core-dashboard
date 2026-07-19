import { PassThrough } from "stream";

import type Docker from "dockerode";
import type { ServiceUpdate } from "@core-dashboard/shared";

import { ContainersService } from "./containers.service";

const COMPOSE = {
  service: "com.docker.compose.service",
  project: "com.docker.compose.project",
};

interface FakeContainer {
  Id: string;
  Names: string[];
  Labels: Record<string, string>;
  running: boolean;
  health?: string;
  image: string;
}

function fakeDocker(containers: FakeContainer[]): { docker: Docker; events: PassThrough } {
  const events = new PassThrough();
  const docker = {
    listContainers: jest
      .fn()
      .mockResolvedValue(containers.map((c) => ({ Id: c.Id, Names: c.Names, Labels: c.Labels }))),
    getContainer: jest.fn((id: string) => ({
      inspect: async () => {
        const found = containers.find((c) => c.Id === id);
        if (!found) throw new Error("no such container");
        return {
          Id: found.Id,
          Name: found.Names[0],
          Config: { Labels: found.Labels, Image: found.image },
          State: {
            Status: found.running ? "running" : "exited",
            Running: found.running,
            StartedAt: found.running
              ? new Date(Date.now() - 60_000).toISOString()
              : "0001-01-01T00:00:00Z",
            Health: found.health ? { Status: found.health } : undefined,
          },
        };
      },
    })),
    getEvents: jest.fn().mockResolvedValue(events),
  };
  return { docker: docker as unknown as Docker, events };
}

function container(partial: Partial<FakeContainer> & { Id: string }): FakeContainer {
  return {
    Names: [`/${partial.Id}-name`],
    Labels: { [COMPOSE.service]: "api", [COMPOSE.project]: "core-dashboard" },
    running: true,
    image: "core-dashboard-api",
    ...partial,
  };
}

describe("ContainersService", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.COMPOSE_PROJECTS;
  });

  afterAll(() => {
    process.env = env;
  });

  describe("getSnapshot", () => {
    it("mapea contenedores de compose con salud y uptime; ignora los sueltos", async () => {
      const { docker } = fakeDocker([
        container({ Id: "a".repeat(64), health: "healthy" }),
        container({ Id: "b".repeat(64), Labels: {} }), // sin labels de compose
      ]);
      const snapshot = await new ContainersService(docker).getSnapshot();

      expect(snapshot.services).toHaveLength(1);
      expect(snapshot.services[0]).toMatchObject({
        id: "a".repeat(12),
        service: "api",
        project: "core-dashboard",
        status: "running",
        health: "healthy",
      });
      expect(snapshot.services[0]?.uptimeSec).toBeGreaterThanOrEqual(59);
      expect(snapshot.services[0]?.startedAt).not.toBeNull();
    });

    it("contenedor detenido: exited, sin uptime ni startedAt", async () => {
      const { docker } = fakeDocker([container({ Id: "c".repeat(64), running: false })]);
      const snapshot = await new ContainersService(docker).getSnapshot();

      expect(snapshot.services[0]).toMatchObject({
        status: "exited",
        health: "none",
        startedAt: null,
        uptimeSec: null,
      });
    });

    it("COMPOSE_PROJECTS filtra por proyecto", async () => {
      process.env.COMPOSE_PROJECTS = "core-dashboard";
      const { docker } = fakeDocker([
        container({ Id: "d".repeat(64) }),
        container({
          Id: "e".repeat(64),
          Labels: { [COMPOSE.service]: "db", [COMPOSE.project]: "otro-proyecto" },
        }),
      ]);
      const snapshot = await new ContainersService(docker).getSnapshot();

      expect(snapshot.services.map((s) => s.project)).toEqual(["core-dashboard"]);
    });
  });

  describe("eventos Docker", () => {
    function emitted(service: ContainersService): Promise<ServiceUpdate> {
      return new Promise((resolve) => service.onUpdate(resolve));
    }

    it("evento del ciclo de vida ⇒ update con la clave proyecto.servicio", async () => {
      const target = container({ Id: "f".repeat(64), health: "healthy" });
      const { docker, events } = fakeDocker([target]);
      const service = new ContainersService(docker);
      service.onModuleInit();
      await new Promise((r) => setImmediate(r));

      const update = emitted(service);
      events.write(
        JSON.stringify({
          Type: "container",
          Action: "health_status: healthy",
          Actor: { ID: target.Id, Attributes: { ...target.Labels, name: "api-1" } },
        }) + "\n",
      );

      await expect(update).resolves.toMatchObject({
        service: "core-dashboard.api",
        state: { status: "running", health: "healthy" },
      });
      service.onModuleDestroy();
    });

    it("contenedor ya eliminado ⇒ estado sintético exited desde el evento", async () => {
      const { docker, events } = fakeDocker([]);
      const service = new ContainersService(docker);
      service.onModuleInit();
      await new Promise((r) => setImmediate(r));

      const update = emitted(service);
      events.write(
        JSON.stringify({
          Type: "container",
          Action: "die",
          Actor: {
            ID: "0".repeat(64),
            Attributes: {
              [COMPOSE.service]: "web",
              [COMPOSE.project]: "core-dashboard",
              name: "core-dashboard-web-1",
              image: "core-dashboard-web",
            },
          },
        }) + "\n",
      );

      await expect(update).resolves.toMatchObject({
        service: "core-dashboard.web",
        state: { status: "exited", name: "core-dashboard-web-1", uptimeSec: null },
      });
      service.onModuleDestroy();
    });

    it("eventos sin labels de compose o fuera del ciclo de vida se ignoran", async () => {
      const { docker, events } = fakeDocker([]);
      const service = new ContainersService(docker);
      service.onModuleInit();
      await new Promise((r) => setImmediate(r));

      const received: ServiceUpdate[] = [];
      service.onUpdate((u) => received.push(u));
      events.write(
        JSON.stringify({ Type: "container", Action: "die", Actor: { ID: "x", Attributes: {} } }) +
          "\n" +
          JSON.stringify({
            Type: "container",
            Action: "exec_start",
            Actor: { ID: "y", Attributes: { [COMPOSE.service]: "api" } },
          }) +
          "\n",
      );
      await new Promise((r) => setTimeout(r, 50));

      expect(received).toEqual([]);
      service.onModuleDestroy();
    });
  });
});
