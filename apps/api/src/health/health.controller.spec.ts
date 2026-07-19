import { Test } from "@nestjs/testing";

import { HealthController } from "./health.controller";

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it("responde ok con identidad del servicio y uptime", () => {
    const health = controller.getHealth();

    expect(health.status).toBe("ok");
    expect(health.service).toBe("core-dashboard-api");
    expect(health.uptime).toBeGreaterThan(0);
  });
});
