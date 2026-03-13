import type {
  PortalLaunchView,
  PortalRunDetail,
  PortalRunListItem,
  PortalWorkersView
} from "@paretoproof/shared";
import { runKindCatalog } from "@paretoproof/shared";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  artifacts,
  attempts,
  jobs,
  runs,
  workerJobLeases
} from "../db/schema.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";

type RunRow = typeof runs.$inferSelect;
type JobRow = typeof jobs.$inferSelect;
type AttemptRow = typeof attempts.$inferSelect;
type ArtifactRow = typeof artifacts.$inferSelect;
type WorkerLeaseRow = typeof workerJobLeases.$inferSelect;

const RUN_LIST_LIMIT = 50;
const LAUNCH_SOURCE_LIMIT = 100;
const WORKER_ACTIVE_LEASE_LIMIT = 100;
const WORKER_INCIDENT_LIMIT = 10;

export async function loadPortalRunList(
  db: ReturnTypeOfCreateDbClient
): Promise<PortalRunListItem[]> {
  const runRows = await db.query.runs.findMany({
    limit: RUN_LIST_LIMIT,
    orderBy: [desc(runs.createdAt)]
  });

  return mapPortalRunList(db, runRows);
}

export async function loadPortalRunDetail(
  db: ReturnTypeOfCreateDbClient,
  runId: string
): Promise<PortalRunDetail | null> {
  const runRow = await db.query.runs.findFirst({
    where: eq(runs.id, runId)
  });

  if (!runRow) {
    return null;
  }

  const [jobRows, attemptRows, artifactRows, leaseRows, relatedRunRows] = await Promise.all([
    db.query.jobs.findMany({
      orderBy: [desc(jobs.createdAt)],
      where: eq(jobs.runId, runRow.id)
    }),
    db.query.attempts.findMany({
      orderBy: [desc(attempts.createdAt)],
      where: eq(attempts.runId, runRow.id)
    }),
    db.query.artifacts.findMany({
      orderBy: [desc(artifacts.registeredAt)],
      where: eq(artifacts.runId, runRow.id)
    }),
    db.query.workerJobLeases.findMany({
      orderBy: [desc(workerJobLeases.createdAt)],
      where: and(eq(workerJobLeases.runId, runRow.id), isNull(workerJobLeases.revokedAt))
    }),
    db.query.runs.findMany({
      limit: 12,
      orderBy: [desc(runs.createdAt)],
      where: and(
        eq(runs.benchmarkPackageDigest, runRow.benchmarkPackageDigest),
        eq(runs.benchmarkItemId, runRow.benchmarkItemId),
        eq(runs.laneId, runRow.laneId),
        eq(runs.modelConfigId, runRow.modelConfigId),
        eq(runs.providerFamily, runRow.providerFamily),
        eq(runs.authMode, runRow.authMode),
        eq(runs.runConfigDigest, runRow.runConfigDigest)
      )
    })
  ]);
  const relatedRuns = relatedRunRows
    .filter((candidate) => candidate.id !== runRow.id)
    .map((candidate) => ({
      completedAt: candidate.completedAt.toISOString(),
      createdAt: candidate.createdAt.toISOString(),
      id: candidate.id,
      state: candidate.state,
      verdictClass: candidate.verdictClass
    }));
  const listItem = (await mapPortalRunList(db, [runRow]))[0];

  if (!listItem) {
    return null;
  }

  return {
    ...listItem,
    activeLeases: leaseRows.map((leaseRow) => ({
      attemptId: leaseRow.attemptId,
      id: leaseRow.id,
      jobId: leaseRow.jobId,
      lastHeartbeatAt: leaseRow.lastHeartbeatAt?.toISOString() ?? null,
      leaseExpiresAt: leaseRow.leaseExpiresAt.toISOString(),
      revokedAt: leaseRow.revokedAt?.toISOString() ?? null,
      workerId: leaseRow.workerId,
      workerPool: leaseRow.workerPool,
      workerRuntime: leaseRow.workerRuntime,
      workerVersion: leaseRow.workerVersion
    })),
    artifacts: artifactRows.map((artifactRow) => ({
      artifactClassId: artifactRow.artifactClassId,
      byteSize: artifactRow.byteSize,
      id: artifactRow.id,
      lastVerifiedAt: artifactRow.lastVerifiedAt?.toISOString() ?? null,
      lifecycleState: artifactRow.lifecycleState,
      mediaType: artifactRow.mediaType,
      objectKey: artifactRow.objectKey,
      relativePath: artifactRow.relativePath,
      requiredForIngest: artifactRow.requiredForIngest,
      sha256: artifactRow.sha256
    })),
    attempts: attemptRows.map((attemptRow) => ({
      attemptState: attemptRow.state,
      bundleDigest: attemptRow.bundleDigest,
      completedAt: attemptRow.completedAt.toISOString(),
      id: attemptRow.id,
      jobId: attemptRow.jobId,
      primaryFailureCode: attemptRow.primaryFailureCode,
      primaryFailureFamily: attemptRow.primaryFailureFamily,
      primaryFailureSummary: attemptRow.primaryFailureSummary,
      sourceAttemptId: attemptRow.sourceAttemptId,
      stopReason: attemptRow.stopReason,
      updatedAt: attemptRow.updatedAt.toISOString(),
      verifierResult: attemptRow.verifierResult,
      verdictClass: attemptRow.verdictClass
    })),
    jobs: jobRows.map((jobRow) => ({
      completedAt: jobRow.completedAt.toISOString(),
      id: jobRow.id,
      jobState: jobRow.state,
      primaryFailureCode: jobRow.primaryFailureCode,
      primaryFailureFamily: jobRow.primaryFailureFamily,
      primaryFailureSummary: jobRow.primaryFailureSummary,
      sourceJobId: jobRow.sourceJobId,
      stopReason: jobRow.stopReason,
      updatedAt: jobRow.updatedAt.toISOString(),
      verdictClass: jobRow.verdictClass
    })),
    relatedRuns
  };
}

export async function loadPortalLaunchView(
  db: ReturnTypeOfCreateDbClient
): Promise<PortalLaunchView> {
  const runRows = await db.query.runs.findMany({
    limit: LAUNCH_SOURCE_LIMIT,
    orderBy: [desc(runs.createdAt)]
  });
  const benchmarkTargetMap = new Map<
    string,
    {
      benchmarkItemIds: Set<string>;
      benchmarkPackageDigest: string;
      benchmarkPackageId: string;
      benchmarkPackageVersion: string;
      laneIds: Set<string>;
      latestRunCreatedAt: Date;
      recentRunCount: number;
    }
  >();
  const modelOptionMap = new Map<
    string,
    {
      authMode: string;
      latestRunCreatedAt: Date;
      modelConfigId: string;
      modelSnapshotId: string;
      providerFamily: string;
    }
  >();

  for (const runRow of runRows) {
    const benchmarkKey = [
      runRow.benchmarkPackageId,
      runRow.benchmarkPackageVersion,
      runRow.benchmarkPackageDigest
    ].join("::");
    const existingBenchmarkTarget = benchmarkTargetMap.get(benchmarkKey);

    if (existingBenchmarkTarget) {
      existingBenchmarkTarget.benchmarkItemIds.add(runRow.benchmarkItemId);
      existingBenchmarkTarget.laneIds.add(runRow.laneId);
      existingBenchmarkTarget.latestRunCreatedAt =
        existingBenchmarkTarget.latestRunCreatedAt.getTime() > runRow.createdAt.getTime()
          ? existingBenchmarkTarget.latestRunCreatedAt
          : runRow.createdAt;
      existingBenchmarkTarget.recentRunCount += 1;
    } else {
      benchmarkTargetMap.set(benchmarkKey, {
        benchmarkItemIds: new Set([runRow.benchmarkItemId]),
        benchmarkPackageDigest: runRow.benchmarkPackageDigest,
        benchmarkPackageId: runRow.benchmarkPackageId,
        benchmarkPackageVersion: runRow.benchmarkPackageVersion,
        laneIds: new Set([runRow.laneId]),
        latestRunCreatedAt: runRow.createdAt,
        recentRunCount: 1
      });
    }

    const modelKey = [
      runRow.providerFamily,
      runRow.modelConfigId,
      runRow.modelSnapshotId,
      runRow.authMode
    ].join("::");
    const existingModelOption = modelOptionMap.get(modelKey);

    if (existingModelOption) {
      existingModelOption.latestRunCreatedAt =
        existingModelOption.latestRunCreatedAt.getTime() > runRow.createdAt.getTime()
          ? existingModelOption.latestRunCreatedAt
          : runRow.createdAt;
    } else {
      modelOptionMap.set(modelKey, {
        authMode: runRow.authMode,
        latestRunCreatedAt: runRow.createdAt,
        modelConfigId: runRow.modelConfigId,
        modelSnapshotId: runRow.modelSnapshotId,
        providerFamily: runRow.providerFamily
      });
    }
  }

  return {
    benchmarkTargets: [...benchmarkTargetMap.values()]
      .sort((left, right) => right.latestRunCreatedAt.getTime() - left.latestRunCreatedAt.getTime())
      .map((target) => ({
        benchmarkItemIds: [...target.benchmarkItemIds].sort(),
        benchmarkPackageDigest: target.benchmarkPackageDigest,
        benchmarkPackageId: target.benchmarkPackageId,
        benchmarkPackageVersion: target.benchmarkPackageVersion,
        laneIds: [...target.laneIds].sort(),
        latestRunCreatedAt: target.latestRunCreatedAt.toISOString(),
        recentRunCount: target.recentRunCount
      })),
    launchMode: "preflight_only",
    modelOptions: [...modelOptionMap.values()]
      .sort((left, right) => right.latestRunCreatedAt.getTime() - left.latestRunCreatedAt.getTime())
      .map((modelOption) => ({
        authMode: modelOption.authMode,
        latestRunCreatedAt: modelOption.latestRunCreatedAt.toISOString(),
        modelConfigId: modelOption.modelConfigId,
        modelSnapshotId: modelOption.modelSnapshotId,
        providerFamily: modelOption.providerFamily
      })),
    runKindOptions: runKindCatalog
  };
}

export async function loadPortalWorkersView(
  db: ReturnTypeOfCreateDbClient
): Promise<PortalWorkersView> {
  const [queueJobRows, terminalJobRows, leaseRows] = await Promise.all([
    db.query.jobs.findMany({
      where: or(
        eq(jobs.state, "queued"),
        eq(jobs.state, "claimed"),
        eq(jobs.state, "running"),
        eq(jobs.state, "cancel_requested")
      )
    }),
    db.query.jobs.findMany({
      limit: WORKER_INCIDENT_LIMIT,
      orderBy: [desc(jobs.updatedAt)],
      where: eq(jobs.state, "failed")
    }),
    db.query.workerJobLeases.findMany({
      limit: WORKER_ACTIVE_LEASE_LIMIT,
      orderBy: [desc(workerJobLeases.createdAt)],
      where: isNull(workerJobLeases.revokedAt)
    })
  ]);
  const now = Date.now();
  const poolMap = new Map<
    string,
    {
      activeLeaseCount: number;
      activeWorkers: Set<string>;
      impactedRuns: Set<string>;
      latestHeartbeatAt: Date | null;
      staleLeaseCount: number;
      workerPool: string;
      workerRuntime: "local_docker" | "modal";
    }
  >();
  const staleLeaseIncidents = leaseRows
    .filter((leaseRow) => leaseRow.leaseExpiresAt.getTime() <= now)
    .slice(0, WORKER_INCIDENT_LIMIT)
    .map((leaseRow) => ({
      jobId: leaseRow.jobId,
      kind: "stale_lease" as const,
      leaseId: leaseRow.id,
      observedAt: leaseRow.leaseExpiresAt.toISOString(),
      runId: leaseRow.runId,
      summary: `Lease for worker ${leaseRow.workerId} expired before recovery completed.`,
      workerPool: leaseRow.workerPool
    }));

  for (const leaseRow of leaseRows) {
    const poolKey = `${leaseRow.workerPool}::${leaseRow.workerRuntime}`;
    const existingPool = poolMap.get(poolKey) ?? {
      activeLeaseCount: 0,
      activeWorkers: new Set<string>(),
      impactedRuns: new Set<string>(),
      latestHeartbeatAt: null,
      staleLeaseCount: 0,
      workerPool: leaseRow.workerPool,
      workerRuntime: leaseRow.workerRuntime
    };
    const active = leaseRow.leaseExpiresAt.getTime() > now;

    if (active) {
      existingPool.activeLeaseCount += 1;
      existingPool.activeWorkers.add(leaseRow.workerId);
    } else {
      existingPool.staleLeaseCount += 1;
    }

    existingPool.impactedRuns.add(leaseRow.runId);
    existingPool.latestHeartbeatAt =
      !existingPool.latestHeartbeatAt ||
      (leaseRow.lastHeartbeatAt &&
        leaseRow.lastHeartbeatAt.getTime() > existingPool.latestHeartbeatAt.getTime())
        ? leaseRow.lastHeartbeatAt
        : existingPool.latestHeartbeatAt;
    poolMap.set(poolKey, existingPool);
  }

  return {
    activeLeases: leaseRows.slice(0, 20).map((leaseRow) => ({
      attemptId: leaseRow.attemptId,
      id: leaseRow.id,
      jobId: leaseRow.jobId,
      lastHeartbeatAt: leaseRow.lastHeartbeatAt?.toISOString() ?? null,
      leaseExpiresAt: leaseRow.leaseExpiresAt.toISOString(),
      revokedAt: leaseRow.revokedAt?.toISOString() ?? null,
      runId: leaseRow.runId,
      workerId: leaseRow.workerId,
      workerPool: leaseRow.workerPool,
      workerRuntime: leaseRow.workerRuntime,
      workerVersion: leaseRow.workerVersion
    })),
    incidents: [
      ...staleLeaseIncidents,
      ...terminalJobRows.map((jobRow) => ({
        jobId: jobRow.id,
        kind: "failed_job" as const,
        leaseId: null,
        observedAt: jobRow.updatedAt.toISOString(),
        runId: jobRow.runId,
        summary: jobRow.primaryFailureSummary ?? jobRow.stopReason,
        workerPool: null
      }))
    ]
      .sort((left, right) => new Date(right.observedAt).getTime() - new Date(left.observedAt).getTime())
      .slice(0, WORKER_INCIDENT_LIMIT),
    pools: [...poolMap.values()]
      .sort((left, right) => left.workerPool.localeCompare(right.workerPool))
      .map((pool) => ({
        activeLeaseCount: pool.activeLeaseCount,
        activeWorkerCount: pool.activeWorkers.size,
        impactedRunCount: pool.impactedRuns.size,
        latestHeartbeatAt: pool.latestHeartbeatAt?.toISOString() ?? null,
        staleLeaseCount: pool.staleLeaseCount,
        workerPool: pool.workerPool,
        workerRuntime: pool.workerRuntime
      })),
    queue: {
      cancelRequestedJobs: queueJobRows.filter((jobRow) => jobRow.state === "cancel_requested").length,
      claimedJobs: queueJobRows.filter((jobRow) => jobRow.state === "claimed").length,
      queuedJobs: queueJobRows.filter((jobRow) => jobRow.state === "queued").length,
      runningJobs: queueJobRows.filter((jobRow) => jobRow.state === "running").length,
      terminalJobs: terminalJobRows.length
    }
  };
}

async function mapPortalRunList(
  db: ReturnTypeOfCreateDbClient,
  runRows: RunRow[]
): Promise<PortalRunListItem[]> {
  if (runRows.length === 0) {
    return [];
  }

  const runIds = runRows.map((runRow) => runRow.id);
  const runConfigDigests = [...new Set(runRows.map((runRow) => runRow.runConfigDigest))];
  const [jobRows, attemptRows, lineageRows] = await Promise.all([
    db.query.jobs.findMany({
      where: inArray(jobs.runId, runIds)
    }),
    db.query.attempts.findMany({
      where: inArray(attempts.runId, runIds)
    }),
    db.query.runs.findMany({
      where: inArray(runs.runConfigDigest, runConfigDigests)
    })
  ]);
  const jobsByRunId = groupBy(jobRows, (jobRow) => jobRow.runId);
  const attemptsByRunId = groupBy(attemptRows, (attemptRow) => attemptRow.runId);
  const lineageCounts = countBy(lineageRows, buildRunLineageKey);

  return runRows.map((runRow) => {
    const runJobRows = jobsByRunId.get(runRow.id) ?? [];
    const runAttemptRows = [...(attemptsByRunId.get(runRow.id) ?? [])].sort(
      (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()
    );
    const lineageKey = buildRunLineageKey(runRow);

    return {
      activeJobCount: runJobRows.filter((jobRow) => isActiveJobState(jobRow.state)).length,
      benchmark: {
        benchmarkItemId: runRow.benchmarkItemId,
        benchmarkPackageDigest: runRow.benchmarkPackageDigest,
        benchmarkPackageId: runRow.benchmarkPackageId,
        benchmarkPackageVersion: runRow.benchmarkPackageVersion,
        laneId: runRow.laneId
      },
      completedAt: runRow.completedAt.toISOString(),
      createdAt: runRow.createdAt.toISOString(),
      failure: {
        primaryFailureCode: runRow.primaryFailureCode,
        primaryFailureFamily: runRow.primaryFailureFamily,
        primaryFailureSummary: runRow.primaryFailureSummary
      },
      id: runRow.id,
      importedAt: runRow.importedAt.toISOString(),
      latestAttemptState: runAttemptRows[0]?.state ?? null,
      lineage: {
        lineageKey,
        relatedRunCount: lineageCounts.get(lineageKey) ?? 1
      },
      model: {
        authMode: runRow.authMode,
        modelConfigId: runRow.modelConfigId,
        modelSnapshotId: runRow.modelSnapshotId,
        providerFamily: runRow.providerFamily
      },
      runKind: runRow.runKind,
      sourceRunId: runRow.sourceRunId,
      state: runRow.state,
      stopReason: runRow.stopReason,
      terminalJobCount: runJobRows.filter((jobRow) => isTerminalJobState(jobRow.state)).length,
      updatedAt: runRow.updatedAt.toISOString(),
      verdictClass: runRow.verdictClass
    };
  });
}

function buildRunLineageKey(runRow: RunRow) {
  return [
    runRow.benchmarkPackageDigest,
    runRow.benchmarkItemId,
    runRow.laneId,
    runRow.providerFamily,
    runRow.authMode,
    runRow.modelConfigId,
    runRow.runConfigDigest
  ].join("::");
}

function isActiveJobState(state: JobRow["state"]) {
  return state === "queued" || state === "claimed" || state === "running" || state === "cancel_requested";
}

function isTerminalJobState(state: JobRow["state"]) {
  return state === "completed" || state === "failed" || state === "cancelled";
}

function groupBy<T>(rows: T[], keySelector: (row: T) => string) {
  const groupedRows = new Map<string, T[]>();

  for (const row of rows) {
    const key = keySelector(row);
    const existingRows = groupedRows.get(key) ?? [];

    existingRows.push(row);
    groupedRows.set(key, existingRows);
  }

  return groupedRows;
}

function countBy<T>(rows: T[], keySelector: (row: T) => string) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const key = keySelector(row);

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}
