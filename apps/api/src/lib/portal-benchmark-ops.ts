import {
  defaultRunControlPolicy,
  portalRunsLifecycleBuckets,
  runKindCatalog,
  runKindConcurrencyOverrides,
  type PortalLaunchBenchmarkOption,
  type PortalLaunchModelConfigOption,
  type PortalLaunchViewResponse,
  type PortalRunArtifactSummary,
  type PortalRunAttemptSummary,
  type PortalRunDetailResponse,
  type PortalRunFailureSummary,
  type PortalRunJobSummary,
  type PortalRunListItem,
  type PortalRunTimelineEntry,
  type PortalRunsLifecycleBucket,
  type PortalRunsListQuery,
  type PortalRunsListResponse,
  type PortalWorkerIncident,
  type PortalWorkerLeaseSummary,
  type PortalWorkersViewResponse
} from "@paretoproof/shared";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  artifacts,
  attempts,
  jobs,
  runs,
  workerAttemptEvents,
  workerJobLeases
} from "../db/schema.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";

type RunRow = typeof runs.$inferSelect;
type JobRow = typeof jobs.$inferSelect;
type AttemptRow = typeof attempts.$inferSelect;
type ArtifactRow = typeof artifacts.$inferSelect;
type WorkerJobLeaseRow = typeof workerJobLeases.$inferSelect;
type WorkerAttemptEventRow = typeof workerAttemptEvents.$inferSelect;

export type PortalBenchmarkOpsReadModelService = {
  getLaunchView(): Promise<PortalLaunchViewResponse>;
  getRunDetail(runId: string): Promise<PortalRunDetailResponse | null>;
  getRunsList(query: PortalRunsListQuery): Promise<PortalRunsListResponse>;
  getWorkersView(): Promise<PortalWorkersViewResponse>;
};

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function getBenchmarkVersionId(runRow: RunRow) {
  return `${runRow.benchmarkPackageId}@${runRow.benchmarkPackageVersion}`;
}

function getBenchmarkLabel(runRow: RunRow) {
  return `${runRow.benchmarkPackageId} @ ${runRow.benchmarkPackageVersion}`;
}

function getRunLifecycleBucket(runState: RunRow["state"]): PortalRunsLifecycleBucket {
  return (
    portalRunsLifecycleBuckets.find((bucket) =>
      (bucket.runStates as ReadonlyArray<RunRow["state"]>).includes(runState)
    )?.id ??
    "pending"
  );
}

function compareByCreatedAtDesc<T extends { createdAt: Date }>(left: T, right: T) {
  return right.createdAt.getTime() - left.createdAt.getTime();
}

function compareByRecordedAtDesc<T extends { recordedAt: Date }>(left: T, right: T) {
  return right.recordedAt.getTime() - left.recordedAt.getTime();
}

function compareByLeaseExpiryDesc(
  left: WorkerJobLeaseRow,
  right: WorkerJobLeaseRow
) {
  return right.leaseExpiresAt.getTime() - left.leaseExpiresAt.getTime();
}

function groupByRunId<T extends { runId: string }>(items: T[]) {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    const group = grouped.get(item.runId);

    if (group) {
      group.push(item);
      continue;
    }

    grouped.set(item.runId, [item]);
  }

  return grouped;
}

function getFailureSummary(record: {
  primaryFailureCode: string | null;
  primaryFailureFamily: string | null;
  primaryFailureSummary: string | null;
}): PortalRunFailureSummary {
  return {
    code: record.primaryFailureCode,
    family: record.primaryFailureFamily,
    summary: record.primaryFailureSummary
  };
}

function buildRunListItem(options: {
  attemptRows: AttemptRow[];
  jobRows: JobRow[];
  runRow: RunRow;
}): PortalRunListItem {
  const latestJob = [...options.jobRows].sort(compareByCreatedAtDesc)[0] ?? null;
  const latestAttempt = [...options.attemptRows].sort(compareByCreatedAtDesc)[0] ?? null;

  return {
    authMode: options.runRow.authMode,
    benchmarkItemId: options.runRow.benchmarkItemId,
    benchmarkLabel: getBenchmarkLabel(options.runRow),
    benchmarkPackageDigest: options.runRow.benchmarkPackageDigest,
    benchmarkPackageId: options.runRow.benchmarkPackageId,
    benchmarkPackageVersion: options.runRow.benchmarkPackageVersion,
    benchmarkVersionId: getBenchmarkVersionId(options.runRow),
    completedAt: options.runRow.completedAt.toISOString(),
    durationMs: Math.max(
      options.runRow.completedAt.getTime() - options.runRow.createdAt.getTime(),
      0
    ),
    failure: getFailureSummary(options.runRow),
    laneId: options.runRow.laneId,
    latestAttemptId: latestAttempt?.sourceAttemptId ?? null,
    latestJobId: latestJob?.sourceJobId ?? null,
    lineage: {
      attemptCount: options.attemptRows.length,
      attemptIds: options.attemptRows.map((attemptRow) => attemptRow.sourceAttemptId),
      jobCount: options.jobRows.length,
      jobIds: options.jobRows
        .map((jobRow) => jobRow.sourceJobId)
        .filter((jobId): jobId is string => typeof jobId === "string"),
      latestAttemptId: latestAttempt?.sourceAttemptId ?? null,
      latestJobId: latestJob?.sourceJobId ?? null
    },
    modelConfigId: options.runRow.modelConfigId,
    modelConfigLabel: options.runRow.modelConfigId,
    modelSnapshotId: options.runRow.modelSnapshotId,
    providerFamily: options.runRow.providerFamily,
    runId: options.runRow.sourceRunId,
    runKind: options.runRow.runKind,
    runLifecycleBucket: getRunLifecycleBucket(options.runRow.state),
    runMode: options.runRow.runMode,
    runState: options.runRow.state,
    startedAt: options.runRow.createdAt.toISOString(),
    toolProfile: options.runRow.toolProfile,
    verdictClass: options.runRow.verdictClass
  };
}

function buildJobSummary(runRow: RunRow, jobRow: JobRow): PortalRunJobSummary {
  return {
    completedAt: jobRow.completedAt.toISOString(),
    failure: getFailureSummary(jobRow),
    jobId: jobRow.sourceJobId,
    runId: runRow.sourceRunId,
    startedAt: jobRow.createdAt.toISOString(),
    state: jobRow.state,
    stopReason: jobRow.stopReason,
    verdictClass: jobRow.verdictClass
  };
}

function buildAttemptSummary(
  runRow: RunRow,
  attemptRow: AttemptRow,
  jobById: Map<string, JobRow>
): PortalRunAttemptSummary {
  return {
    attemptId: attemptRow.sourceAttemptId,
    completedAt: attemptRow.completedAt.toISOString(),
    failure: getFailureSummary(attemptRow),
    jobId: jobById.get(attemptRow.jobId)?.sourceJobId ?? null,
    runId: runRow.sourceRunId,
    startedAt: attemptRow.createdAt.toISOString(),
    state: attemptRow.state,
    stopReason: attemptRow.stopReason,
    verdictClass: attemptRow.verdictClass,
    verifierResult: attemptRow.verifierResult
  };
}

function buildArtifactSummary(artifactRow: ArtifactRow): PortalRunArtifactSummary {
  return {
    artifactClassId: artifactRow.artifactClassId,
    artifactId: artifactRow.id,
    byteSize: artifactRow.byteSize,
    contentEncoding: artifactRow.contentEncoding,
    lifecycleState: artifactRow.lifecycleState,
    mediaType: artifactRow.mediaType,
    relativePath: artifactRow.relativePath,
    requiredForIngest: artifactRow.requiredForIngest
  };
}

function buildWorkerLeaseSummary(options: {
  attemptById: Map<string, AttemptRow>;
  jobById: Map<string, JobRow>;
  now: Date;
  runById: Map<string, RunRow>;
  workerLeaseRow: WorkerJobLeaseRow;
}): PortalWorkerLeaseSummary {
  const runRow = options.runById.get(options.workerLeaseRow.runId);
  const jobRow = options.jobById.get(options.workerLeaseRow.jobId);
  const attemptRow = options.attemptById.get(options.workerLeaseRow.attemptId);

  if (!runRow || !attemptRow) {
    throw new Error("Worker lease references a run or attempt that is missing from the read-model set.");
  }

  return {
    attemptId: attemptRow.sourceAttemptId,
    heartbeatIntervalSeconds: options.workerLeaseRow.heartbeatIntervalSeconds,
    heartbeatTimeoutSeconds: options.workerLeaseRow.heartbeatTimeoutSeconds,
    health:
      options.workerLeaseRow.leaseExpiresAt.getTime() <= options.now.getTime()
        ? "stale"
        : "healthy",
    jobId: jobRow?.sourceJobId ?? null,
    lastEventSequence: options.workerLeaseRow.lastEventSequence,
    lastHeartbeatAt: toIso(options.workerLeaseRow.lastHeartbeatAt),
    leaseExpiresAt: options.workerLeaseRow.leaseExpiresAt.toISOString(),
    runId: runRow.sourceRunId,
    workerId: options.workerLeaseRow.workerId,
    workerPool: options.workerLeaseRow.workerPool,
    workerRuntime: options.workerLeaseRow.workerRuntime,
    workerVersion: options.workerLeaseRow.workerVersion
  };
}

function buildTimeline(options: {
  attemptById: Map<string, AttemptRow>;
  eventRows: WorkerAttemptEventRow[];
  jobById: Map<string, JobRow>;
  jobRows: JobRow[];
  runRow: RunRow;
}): PortalRunTimelineEntry[] {
  const timeline: PortalRunTimelineEntry[] = [
    {
      label: "Run record created",
      occurredAt: options.runRow.createdAt.toISOString(),
      scope: "run",
      sourceId: options.runRow.sourceRunId,
      state: options.runRow.state
    },
    {
      label: "Run completed",
      occurredAt: options.runRow.completedAt.toISOString(),
      scope: "run",
      sourceId: options.runRow.sourceRunId,
      state: options.runRow.state
    }
  ];

  for (const jobRow of options.jobRows) {
    timeline.push({
      label: "Job started",
      occurredAt: jobRow.createdAt.toISOString(),
      scope: "job",
      sourceId: jobRow.sourceJobId,
      state: jobRow.state
    });
    timeline.push({
      label: "Job completed",
      occurredAt: jobRow.completedAt.toISOString(),
      scope: "job",
      sourceId: jobRow.sourceJobId,
      state: jobRow.state
    });
  }

  for (const attemptRow of options.attemptById.values()) {
    timeline.push({
      label: "Attempt started",
      occurredAt: attemptRow.createdAt.toISOString(),
      scope: "attempt",
      sourceId: attemptRow.sourceAttemptId,
      state: attemptRow.state
    });
    timeline.push({
      label: "Attempt completed",
      occurredAt: attemptRow.completedAt.toISOString(),
      scope: "attempt",
      sourceId: attemptRow.sourceAttemptId,
      state: attemptRow.state
    });
  }

  for (const eventRow of options.eventRows) {
    timeline.push({
      label: eventRow.summary,
      occurredAt: eventRow.recordedAt.toISOString(),
      scope: "worker",
      sourceId: options.attemptById.get(eventRow.attemptId)?.sourceAttemptId ?? null,
      state: eventRow.eventKind
    });
  }

  return timeline.sort(
    (left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime()
  );
}

function filterRunListItems(
  items: PortalRunListItem[],
  query: PortalRunsListQuery
) {
  const searchTerm = query.q?.toLowerCase() ?? null;

  return items.filter((item) => {
    if (query.runId && item.runId !== query.runId) {
      return false;
    }

    if (query.jobId && !item.lineage.jobIds.includes(query.jobId)) {
      return false;
    }

    if (query.attemptId && !item.lineage.attemptIds.includes(query.attemptId)) {
      return false;
    }

    if (!searchTerm) {
      return true;
    }

    return [
      item.runId,
      item.benchmarkItemId,
      item.benchmarkPackageId,
      item.benchmarkPackageVersion,
      item.modelConfigId,
      item.providerFamily,
      item.failure.code,
      item.failure.family,
      item.failure.summary
    ]
      .filter((value): value is string => typeof value === "string")
      .some((value) => value.toLowerCase().includes(searchTerm));
  });
}

function sortRunListItems(items: PortalRunListItem[], sortId: PortalRunsListQuery["sort"]) {
  const sorted = [...items];

  sorted.sort((left, right) => {
    switch (sortId) {
      case "finished_at_desc":
        return (
          new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime()
        );
      case "duration_desc":
        return right.durationMs - left.durationMs || left.runId.localeCompare(right.runId);
      case "run_state_asc":
        return left.runState.localeCompare(right.runState) || left.runId.localeCompare(right.runId);
      case "verdict_asc":
        return (
          left.verdictClass.localeCompare(right.verdictClass) ||
          left.runId.localeCompare(right.runId)
        );
      case "started_at_desc":
      default:
        return new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime();
    }
  });

  return sorted;
}

async function loadJobsForRunIds(
  db: ReturnTypeOfCreateDbClient,
  runIds: string[]
) {
  if (runIds.length === 0) {
    return [] satisfies JobRow[];
  }

  return db
    .select()
    .from(jobs)
    .where(inArray(jobs.runId, runIds));
}

async function loadAttemptsForRunIds(
  db: ReturnTypeOfCreateDbClient,
  runIds: string[]
) {
  if (runIds.length === 0) {
    return [] satisfies AttemptRow[];
  }

  return db
    .select()
    .from(attempts)
    .where(inArray(attempts.runId, runIds));
}

async function loadActiveLeasesForRunIds(
  db: ReturnTypeOfCreateDbClient,
  runIds: string[]
) {
  if (runIds.length === 0) {
    return [] satisfies WorkerJobLeaseRow[];
  }

  return db
    .select()
    .from(workerJobLeases)
    .where(and(inArray(workerJobLeases.runId, runIds), isNull(workerJobLeases.revokedAt)));
}

export function createPortalBenchmarkOpsReadModelService(
  db: ReturnTypeOfCreateDbClient
): PortalBenchmarkOpsReadModelService {
  return {
    async getRunsList(query) {
      const runConditions = [];

      if (query.runLifecycle.length > 0) {
        runConditions.push(inArray(runs.state, query.runLifecycle));
      }

      if (query.lifecycleBucket) {
        const bucketStates =
          portalRunsLifecycleBuckets.find((bucket) => bucket.id === query.lifecycleBucket)
            ?.runStates ?? [];

        if (bucketStates.length > 0) {
          runConditions.push(inArray(runs.state, bucketStates));
        }
      }

      if (query.verdict.length > 0) {
        runConditions.push(inArray(runs.verdictClass, query.verdict));
      }

      if (query.runKind) {
        runConditions.push(eq(runs.runKind, query.runKind));
      }

      if (query.benchmarkPackageId) {
        runConditions.push(eq(runs.benchmarkPackageId, query.benchmarkPackageId));
      }

      if (query.benchmarkPackageVersion) {
        runConditions.push(eq(runs.benchmarkPackageVersion, query.benchmarkPackageVersion));
      }

      if (query.benchmarkPackageDigest) {
        runConditions.push(eq(runs.benchmarkPackageDigest, query.benchmarkPackageDigest));
      }

      if (query.modelConfigId) {
        runConditions.push(eq(runs.modelConfigId, query.modelConfigId));
      }

      if (query.providerFamily) {
        runConditions.push(eq(runs.providerFamily, query.providerFamily));
      }

      if (query.authMode) {
        runConditions.push(eq(runs.authMode, query.authMode));
      }

      if (query.runMode) {
        runConditions.push(eq(runs.runMode, query.runMode));
      }

      if (query.toolProfile) {
        runConditions.push(eq(runs.toolProfile, query.toolProfile));
      }

      if (query.failureFamily) {
        runConditions.push(eq(runs.primaryFailureFamily, query.failureFamily));
      }

      if (query.failureCode) {
        runConditions.push(eq(runs.primaryFailureCode, query.failureCode));
      }

      const runRows = await db
        .select()
        .from(runs)
        .where(runConditions.length > 0 ? and(...runConditions) : undefined)
        .orderBy(desc(runs.createdAt));
      const runIds = runRows.map((runRow) => runRow.id);
      const jobRows = await loadJobsForRunIds(db, runIds);
      const attemptRows = await loadAttemptsForRunIds(db, runIds);
      const jobsByRunId = groupByRunId(jobRows);
      const attemptsByRunId = groupByRunId(attemptRows);

      const filteredItems = filterRunListItems(
        runRows.map((runRow) =>
          buildRunListItem({
            attemptRows: attemptsByRunId.get(runRow.id) ?? [],
            jobRows: jobsByRunId.get(runRow.id) ?? [],
            runRow
          })
        ),
        query
      );
      const sortedItems = sortRunListItems(filteredItems, query.sort);

      return {
        items: sortedItems.slice(0, query.limit),
        query,
        summary: {
          activeRuns: filteredItems.filter((item) => item.runLifecycleBucket === "active").length,
          failedRuns: filteredItems.filter((item) => item.runState === "failed").length,
          returnedCount: Math.min(sortedItems.length, query.limit),
          totalMatches: filteredItems.length,
          verdictCounts: {
            fail: filteredItems.filter((item) => item.verdictClass === "fail").length,
            invalid_result: filteredItems.filter(
              (item) => item.verdictClass === "invalid_result"
            ).length,
            pass: filteredItems.filter((item) => item.verdictClass === "pass").length
          }
        }
      };
    },

    async getRunDetail(runId) {
      const runRow = await db.query.runs.findFirst({
        where: eq(runs.sourceRunId, runId)
      });

      if (!runRow) {
        return null;
      }

      const [jobRows, attemptRows, artifactRows, leaseRows, eventRows] = await Promise.all([
        db.select().from(jobs).where(eq(jobs.runId, runRow.id)),
        db.select().from(attempts).where(eq(attempts.runId, runRow.id)),
        db.select().from(artifacts).where(eq(artifacts.runId, runRow.id)),
        db
          .select()
          .from(workerJobLeases)
          .where(eq(workerJobLeases.runId, runRow.id)),
        db
          .select()
          .from(workerAttemptEvents)
          .where(eq(workerAttemptEvents.runId, runRow.id))
      ]);
      const jobById = new Map(jobRows.map((jobRow) => [jobRow.id, jobRow]));
      const attemptById = new Map(attemptRows.map((attemptRow) => [attemptRow.id, attemptRow]));
      const runById = new Map([[runRow.id, runRow]]);
      const now = new Date();

      return {
        artifacts: artifactRows.map(buildArtifactSummary),
        attempts: attemptRows
          .sort(compareByCreatedAtDesc)
          .map((attemptRow) => buildAttemptSummary(runRow, attemptRow, jobById)),
        item: buildRunListItem({
          attemptRows,
          jobRows,
          runRow
        }),
        jobs: jobRows
          .sort(compareByCreatedAtDesc)
          .map((jobRow) => buildJobSummary(runRow, jobRow)),
        recentWorkerEvents: [...eventRows]
          .sort(compareByRecordedAtDesc)
          .slice(0, 10)
          .map((eventRow) => ({
            label: eventRow.summary,
            occurredAt: eventRow.recordedAt.toISOString(),
            scope: "worker" as const,
            sourceId: attemptById.get(eventRow.attemptId)?.sourceAttemptId ?? null,
            state: eventRow.eventKind
          })),
        timeline: buildTimeline({
          attemptById,
          eventRows,
          jobById,
          jobRows,
          runRow
        }),
        workerLeases: leaseRows
          .sort(compareByLeaseExpiryDesc)
          .map((workerLeaseRow) =>
            buildWorkerLeaseSummary({
              attemptById,
              jobById,
              now,
              runById,
              workerLeaseRow
            })
          )
      };
    },

    async getLaunchView() {
      const runRows = await db
        .select({
          authMode: runs.authMode,
          benchmarkItemId: runs.benchmarkItemId,
          benchmarkPackageDigest: runs.benchmarkPackageDigest,
          benchmarkPackageId: runs.benchmarkPackageId,
          benchmarkPackageVersion: runs.benchmarkPackageVersion,
          createdAt: runs.createdAt,
          laneId: runs.laneId,
          modelConfigId: runs.modelConfigId,
          modelSnapshotId: runs.modelSnapshotId,
          providerFamily: runs.providerFamily,
          runMode: runs.runMode,
          sourceRunId: runs.sourceRunId,
          toolProfile: runs.toolProfile
        })
        .from(runs)
        .orderBy(desc(runs.createdAt));

      const benchmarkOptions = new Map<string, PortalLaunchBenchmarkOption>();
      const modelConfigOptions = new Map<string, PortalLaunchModelConfigOption>();

      for (const runRow of runRows) {
        const benchmarkVersionId = `${runRow.benchmarkPackageId}@${runRow.benchmarkPackageVersion}`;
        const existingBenchmark = benchmarkOptions.get(benchmarkVersionId);

        if (!existingBenchmark) {
          benchmarkOptions.set(benchmarkVersionId, {
            benchmarkItemCount: 1,
            benchmarkLabel: `${runRow.benchmarkPackageId} @ ${runRow.benchmarkPackageVersion}`,
            benchmarkPackageDigest: runRow.benchmarkPackageDigest,
            benchmarkPackageId: runRow.benchmarkPackageId,
            benchmarkPackageVersion: runRow.benchmarkPackageVersion,
            benchmarkVersionId,
            laneIds: [runRow.laneId],
            lastSeenRunId: runRow.sourceRunId
          });
        } else {
          existingBenchmark.benchmarkItemCount += 1;

          if (!existingBenchmark.laneIds.includes(runRow.laneId)) {
            existingBenchmark.laneIds.push(runRow.laneId);
          }
        }

        const modelConfigKey = [
          runRow.modelConfigId,
          runRow.providerFamily
        ].join(":");
        const existingModelConfig = modelConfigOptions.get(modelConfigKey);

        if (!existingModelConfig) {
          modelConfigOptions.set(modelConfigKey, {
            authModes: [runRow.authMode],
            modelConfigId: runRow.modelConfigId,
            modelConfigLabel: runRow.modelConfigId,
            modelSnapshotIds: [runRow.modelSnapshotId],
            providerFamily: runRow.providerFamily,
            runModes: [runRow.runMode],
            toolProfiles: [runRow.toolProfile]
          });
          continue;
        }

        if (!existingModelConfig.authModes.includes(runRow.authMode)) {
          existingModelConfig.authModes.push(runRow.authMode);
        }

        if (!existingModelConfig.modelSnapshotIds.includes(runRow.modelSnapshotId)) {
          existingModelConfig.modelSnapshotIds.push(runRow.modelSnapshotId);
        }

        if (!existingModelConfig.runModes.includes(runRow.runMode)) {
          existingModelConfig.runModes.push(runRow.runMode);
        }

        if (!existingModelConfig.toolProfiles.includes(runRow.toolProfile)) {
          existingModelConfig.toolProfiles.push(runRow.toolProfile);
        }
      }

      return {
        benchmarks: [...benchmarkOptions.values()],
        governance: {
          defaultPolicy: defaultRunControlPolicy,
          runKindConcurrencyOverrides
        },
        modelConfigs: [...modelConfigOptions.values()],
        redirectPattern: "/runs/:runId",
        runKinds: runKindCatalog,
        submissionMode: "preflight_only"
      };
    },

    async getWorkersView() {
      const [runRows, jobRows, attemptRows, leaseRows] = await Promise.all([
        db.select().from(runs),
        db.select().from(jobs),
        db.select().from(attempts),
        db
          .select()
          .from(workerJobLeases)
          .where(isNull(workerJobLeases.revokedAt))
      ]);
      const now = new Date();
      const runById = new Map(runRows.map((runRow) => [runRow.id, runRow]));
      const jobById = new Map(jobRows.map((jobRow) => [jobRow.id, jobRow]));
      const attemptById = new Map(attemptRows.map((attemptRow) => [attemptRow.id, attemptRow]));
      const activeLeases = leaseRows
        .sort(compareByLeaseExpiryDesc)
        .map((workerLeaseRow) =>
          buildWorkerLeaseSummary({
            attemptById,
            jobById,
            now,
            runById,
            workerLeaseRow
          })
        );
      const workerPools = new Map<string, PortalWorkersViewResponse["workerPools"][number]>();

      for (const lease of activeLeases) {
        const poolKey = [lease.workerPool, lease.workerRuntime, lease.workerVersion].join(":");
        const existingPool = workerPools.get(poolKey);

        if (!existingPool) {
          workerPools.set(poolKey, {
            activeLeaseCount: 1,
            activeRunIds: [lease.runId],
            staleLeaseCount: lease.health === "stale" ? 1 : 0,
            workerPool: lease.workerPool,
            workerRuntime: lease.workerRuntime,
            workerVersion: lease.workerVersion
          });
          continue;
        }

        existingPool.activeLeaseCount += 1;
        existingPool.staleLeaseCount += lease.health === "stale" ? 1 : 0;

        if (!existingPool.activeRunIds.includes(lease.runId)) {
          existingPool.activeRunIds.push(lease.runId);
        }
      }

      const incidents: PortalWorkerIncident[] = [];

      if (jobRows.some((jobRow) => jobRow.state === "queued")) {
        incidents.push({
          affectedRunIds: jobRows
            .filter((jobRow) => jobRow.state === "queued")
            .map((jobRow) => runById.get(jobRow.runId)?.sourceRunId ?? null)
            .filter((runId): runId is string => typeof runId === "string")
            .slice(0, 5),
          kind: "queue_backlog",
          observedAt: now.toISOString(),
          severity: "warning",
          summary: `${jobRows.filter((jobRow) => jobRow.state === "queued").length} queued jobs are waiting for worker capacity.`,
          workerPool: null
        });
      }

      for (const pool of workerPools.values()) {
        if (pool.staleLeaseCount === 0) {
          continue;
        }

        incidents.push({
          affectedRunIds: pool.activeRunIds.slice(0, 5),
          kind: "stale_lease",
          observedAt: now.toISOString(),
          severity: pool.staleLeaseCount > 1 ? "critical" : "warning",
          summary: `${pool.staleLeaseCount} active lease(s) in ${pool.workerPool} are stale or expired.`,
          workerPool: pool.workerPool
        });
      }

      const failedRuns = runRows.filter((runRow) => runRow.primaryFailureFamily);

      if (failedRuns.length > 0) {
        const failureCounts = new Map<string, { affectedRunIds: string[]; count: number }>();

        for (const runRow of failedRuns) {
          if (!runRow.primaryFailureFamily) {
            continue;
          }

          const existingFailure = failureCounts.get(runRow.primaryFailureFamily);

          if (!existingFailure) {
            failureCounts.set(runRow.primaryFailureFamily, {
              affectedRunIds: [runRow.sourceRunId],
              count: 1
            });
            continue;
          }

          existingFailure.count += 1;

          if (!existingFailure.affectedRunIds.includes(runRow.sourceRunId)) {
            existingFailure.affectedRunIds.push(runRow.sourceRunId);
          }
        }

        for (const [failureFamily, failureSummary] of failureCounts) {
          incidents.push({
            affectedRunIds: failureSummary.affectedRunIds.slice(0, 5),
            kind: "failure_cluster",
            observedAt: now.toISOString(),
            severity: failureSummary.count > 1 ? "warning" : "info",
            summary: `${failureSummary.count} recent run(s) ended in the ${failureFamily} failure family.`,
            workerPool: null
          });
        }
      }

      return {
        activeLeases,
        generatedAt: now.toISOString(),
        incidents,
        queueSummary: {
          activeRuns: runRows.filter((runRow) =>
            runRow.state === "running" || runRow.state === "cancel_requested"
          ).length,
          cancelRequestedJobs: jobRows.filter((jobRow) => jobRow.state === "cancel_requested")
            .length,
          claimedJobs: jobRows.filter((jobRow) => jobRow.state === "claimed").length,
          queuedJobs: jobRows.filter((jobRow) => jobRow.state === "queued").length,
          queuedRuns: runRows.filter((runRow) => runRow.state === "queued").length,
          runningJobs: jobRows.filter((jobRow) => jobRow.state === "running").length
        },
        workerPools: [...workerPools.values()]
      };
    }
  };
}
