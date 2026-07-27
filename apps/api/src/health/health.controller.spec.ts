import { Test } from "@nestjs/testing";

import { DependenciesHealthService } from "./dependencies-health.service";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  let controller: HealthController;
  const dependencies = { check: jest.fn() };

  beforeEach(async () => {
    dependencies.check.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DependenciesHealthService, useValue: dependencies }],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it("responde ok con identidad del servicio y uptime", () => {
    const health = controller.getHealth();

    expect(health.status).toBe("ok");
    expect(health.service).toBe("core-dashboard-api");
    expect(health.uptime).toBeGreaterThan(0);
  });

  it("getDependencies delega en DependenciesHealthService", async () => {
    dependencies.check.mockResolvedValue({
      checkedAt: "2026-07-27T00:00:00.000Z",
      dependencies: [{ name: "taskforge", status: "ok", latencyMs: 5 }],
    });

    const result = await controller.getDependencies();

    expect(dependencies.check).toHaveBeenCalled();
    expect(result.dependencies).toEqual([{ name: "taskforge", status: "ok", latencyMs: 5 }]);
  });
});
