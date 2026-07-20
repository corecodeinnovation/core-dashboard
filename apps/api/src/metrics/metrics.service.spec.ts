import { MetricKind } from "@prisma/client";

import type { PrismaService } from "../prisma/prisma.service";
import { MetricsService } from "./metrics.service";
import type { PrometheusService } from "./prometheus.service";

function fakePrisma() {
  return {
    metricRollup: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

describe("MetricsService", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.COMPOSE_PROJECTS;
  });

  afterAll(() => {
    process.env = env;
  });

  describe("runRollup", () => {
    it("persiste un promedio por contenedor y métrica en el bucket alineado", async () => {
      const prometheus = {
        queryInstant: jest.fn().mockResolvedValue([
          { metric: { name: "core-dashboard-api-1" }, value: [1, "0.25"] },
          { metric: { name: "core-dashboard-db-1" }, value: [1, "0.10"] },
        ]),
      };
      const prisma = fakePrisma();
      const service = new MetricsService(
        prometheus as unknown as PrometheusService,
        prisma as unknown as PrismaService,
      );

      await service.runRollup();

      // Una consulta instantánea por cada MetricKind.
      expect(prometheus.queryInstant).toHaveBeenCalledTimes(Object.values(MetricKind).length);
      const evaluatedAt = prometheus.queryInstant.mock.calls[0]![1] as number;
      expect(evaluatedAt % 300).toBe(0); // bucket alineado a 5 min

      const firstBatch = prisma.metricRollup.createMany.mock.calls[0]![0] as {
        data: Array<{ containerName: string; metric: MetricKind; bucketStart: Date }>;
        skipDuplicates: boolean;
      };
      expect(firstBatch.skipDuplicates).toBe(true);
      expect(firstBatch.data).toHaveLength(2);
      expect(firstBatch.data[0]).toMatchObject({
        containerName: "core-dashboard-api-1",
        metric: MetricKind.CPU,
      });
      expect(firstBatch.data[0]!.bucketStart.getTime()).toBe((evaluatedAt - 300) * 1000);
    });

    it("descarta muestras sin nombre o con valor no numérico", async () => {
      const prometheus = {
        queryInstant: jest.fn().mockResolvedValue([
          { metric: {}, value: [1, "0.5"] },
          { metric: { name: "api-1" }, value: [1, "NaN"] },
        ]),
      };
      const prisma = fakePrisma();
      const service = new MetricsService(
        prometheus as unknown as PrometheusService,
        prisma as unknown as PrismaService,
      );

      await service.runRollup();

      expect(prisma.metricRollup.createMany).not.toHaveBeenCalled();
    });

    it("con COMPOSE_PROJECTS la query restringe por label de proyecto", async () => {
      process.env.COMPOSE_PROJECTS = "core-dashboard, taskforge";
      const prometheus = { queryInstant: jest.fn().mockResolvedValue([]) };
      const service = new MetricsService(
        prometheus as unknown as PrometheusService,
        fakePrisma() as unknown as PrismaService,
      );

      await service.runRollup();

      const promql = prometheus.queryInstant.mock.calls[0]![0] as string;
      expect(promql).toContain('compose_project=~"core-dashboard|taskforge"');
    });
  });

  it("purgeOldRollups borra lo anterior a 30 días", async () => {
    const prisma = fakePrisma();
    const service = new MetricsService(
      { queryInstant: jest.fn() } as unknown as PrometheusService,
      prisma as unknown as PrismaService,
    );

    await service.purgeOldRollups();

    const where = prisma.metricRollup.deleteMany.mock.calls[0]![0] as {
      where: { bucketStart: { lt: Date } };
    };
    const ageDays = (Date.now() - where.where.bucketStart.lt.getTime()) / 86_400_000;
    expect(ageDays).toBeCloseTo(30, 1);
  });

  it("getLiveSeries consulta la métrica del contenedor y mapea a puntos", async () => {
    const prometheus = {
      queryRange: jest.fn().mockResolvedValue([
        {
          metric: { name: "api-1" },
          values: [
            [100, "0.5"],
            [130, "0.7"],
          ],
        },
      ]),
    };
    const service = new MetricsService(
      prometheus as unknown as PrometheusService,
      fakePrisma() as unknown as PrismaService,
    );

    const points = await service.getLiveSeries("core-dashboard-api-1", MetricKind.CPU, 60);

    const promql = prometheus.queryRange.mock.calls[0]![0] as string;
    expect(promql).toContain('name="core-dashboard-api-1"');
    expect(promql).toContain("container_cpu_usage_seconds_total");
    expect(points).toEqual([
      { t: 100_000, v: 0.5 },
      { t: 130_000, v: 0.7 },
    ]);
  });

  it("getHistory lee rollups y devuelve puntos ordenados", async () => {
    const prisma = fakePrisma();
    const bucket = new Date("2026-07-19T12:00:00Z");
    prisma.metricRollup.findMany.mockResolvedValue([{ bucketStart: bucket, avgValue: 0.42 }]);
    const service = new MetricsService(
      { queryInstant: jest.fn() } as unknown as PrometheusService,
      prisma as unknown as PrismaService,
    );

    const points = await service.getHistory("api-1", MetricKind.MEMORY, 24);

    expect(prisma.metricRollup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ containerName: "api-1", metric: MetricKind.MEMORY }),
        orderBy: { bucketStart: "asc" },
      }),
    );
    expect(points).toEqual([{ t: bucket.getTime(), v: 0.42 }]);
  });
});
