-- CreateEnum
CREATE TYPE "ContainerEventType" AS ENUM ('START', 'DIE', 'RESTART', 'HEALTH_STATUS');

-- CreateEnum
CREATE TYPE "MetricKind" AS ENUM ('CPU', 'MEMORY', 'NETWORK_RX', 'NETWORK_TX');

-- CreateEnum
CREATE TYPE "JobRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "container_events" (
    "id" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "containerName" TEXT NOT NULL,
    "type" "ContainerEventType" NOT NULL,
    "detail" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "container_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_rollups" (
    "id" TEXT NOT NULL,
    "containerName" TEXT NOT NULL,
    "metric" "MetricKind" NOT NULL,
    "avgValue" DOUBLE PRECISION NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_rollups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userSub" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "threshold" DOUBLE PRECISION,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" "JobRunStatus" NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "container_events_containerName_occurredAt_idx" ON "container_events"("containerName", "occurredAt");

-- CreateIndex
CREATE INDEX "container_events_occurredAt_idx" ON "container_events"("occurredAt");

-- CreateIndex
CREATE INDEX "metric_rollups_bucketStart_idx" ON "metric_rollups"("bucketStart");

-- CreateIndex
CREATE UNIQUE INDEX "metric_rollups_containerName_metric_bucketStart_key" ON "metric_rollups"("containerName", "metric", "bucketStart");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "alert_settings_key_key" ON "alert_settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "job_runs_externalId_key" ON "job_runs"("externalId");
