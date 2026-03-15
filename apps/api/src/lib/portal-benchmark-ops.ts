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
  type PortalRunsAvailableFilters,
  type PortalRunListItem,
  type PortalRunTimelineEntry,
  type PortalRunsLifecycleBucket,
  type PortalRunsListQuery,
  type PortalRunsListResponse,
  type PortalWorkerIncident,
  type PortalWorkerLeaseSummary,
  type PortalWorkersViewResponse
} from "@paretoproof/shared";
import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
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

// This service is the authoritative read-model boundary for `/portal/runs`,
// `/portal/runs/:runId`, `/portal/launch`, and `/portal/workers`. The portal UI
// should consume explicit filter facets and detail fields from here rather than
// inferring them from paginated rows.

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

async function loadRunIdsForSourceJobId(
  db: ReturnTypeOfCreateDbClient,
  sourceJobId: string
) {
  const jobRows = await db
    .select({
      runId: jobs.runId
    })
    .from(jobs)
    .where(eq(jobs.sourceJobId, sourceJobId));

  return [...new Set(jobRows.map((jobRow) => jobRow.runId))];
}

async function loadRunIdsForSourceAttemptId(
  db: ReturnTypeOfCreateDbClient,
  sourceAttemptId: string
) {
  const attemptRows = await db
    .select({
      runId: attempts.runId
    })
    .from(attempts)
    .where(eq(attempts.sourceAttemptId, sourceAttemptId));

  return [...new Set(attemptRows.map((attemptRow) => attemptRow.runId))];
}

function buildRunOrderBy(sortId: PortalRunsListQuery["sort"]) {
  switch (sortId) {
    case "finished_at_desc":
      return [desc(runs.completedAt), desc(runs.createdAt)] as const;
    case "duration_desc":
      return [desc(sql`${runs.completedAt} - ${runs.createdAt}`), desc(runs.createdAt)] as const;
    case "run_state_asc":
      return [runs.state, runs.sourceRunId] as const;
    case "verdict_asc":
      return [runs.verdictClass, runs.sourceRunId] as const;
    case "started_at_desc":
    default:
      return [desc(runs.createdAt), desc(runs.completedAt)] as const;
  }
}

function buildEmptyRunsFilters(): PortalRunsAvailableFilters {
  return {
    modelConfigs: [],
    providerFamilies: []
  };
}

function buildEmptyRunsListResponse(query: PortalRunsListQuery): PortalRunsListResponse {
  return {
    filters: buildEmptyRunsFilters(),
    items: [],
    query,
    summary: {
      activeRuns: 0,
      failedRuns: 0,
      returnedCount: 0,
      totalMatches: 0,
      verdictCounts: {
        fail: 0,
        invalid_result: 0,
        pass: 0
      }
    }
  };
}

async function loadRunsFilters(
  db: ReturnTypeOfCreateDbClient,
  whereClause: ReturnType<typeof and> | undefined
): Promise<PortalRunsAvailableFilters> {
  const [providerRows, modelConfigRows] = await Promise.all([
    db
      .select({
        count: count(),
        providerFamily: runs.providerFamily
      })
      .from(runs)
      .where(whereClause)
      .groupBy(runs.providerFamily)
      .orderBy(runs.providerFamily),
    db
      .select({
        count: count(),
        modelConfigId: runs.modelConfigId,
        providerFamily: runs.providerFamily
      })
      .from(runs)
      .where(whereClause)
      .groupBy(runs.modelConfigId, runs.providerFamily)
      .orderBy(runs.modelConfigId, runs.providerFamily)
  ]);

  return {
    modelConfigs: modelConfigRows.map((row) => ({
      count: row.count,
      modelConfigId: row.modelConfigId,
      modelConfigLabel: row.modelConfigId,
      providerFamily: row.providerFamily
    })),
    providerFamilies: providerRows.map((row) => ({
      count: row.count,
      providerFamily: row.providerFamily
    }))
  };
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

      if (query.runId) {
        runConditions.push(eq(runs.sourceRunId, query.runId));
      }

      if (query.jobId) {
        const jobRunIds = await loadRunIdsForSourceJobId(db, query.jobId);

        if (jobRunIds.length === 0) {
          return buildEmptyRunsListResponse(query);
        }

        runConditions.push(inArray(runs.id, jobRunIds));
      }

      if (query.attemptId) {
        const attemptRunIds = await loadRunIdsForSourceAttemptId(db, query.attemptId);

        if (attemptRunIds.length === 0) {
          return buildEmptyRunsListResponse(query);
        }

        runConditions.push(inArray(runs.id, attemptRunIds));
      }

      if (query.q) {
        const searchPattern = `%${query.q}%`;

        runConditions.push(
          or(
            ilike(runs.sourceRunId, searchPattern),
            ilike(runs.benchmarkItemId, searchPattern),
            ilike(runs.benchmarkPackageId, searchPattern),
            ilike(runs.benchmarkPackageVersion, searchPattern),
            ilike(runs.modelConfigId, searchPattern),
            ilike(runs.providerFamily, searchPattern),
            ilike(runs.primaryFailureCode, searchPattern),
            ilike(runs.primaryFailureFamily, searchPattern),
            ilike(runs.primaryFailureSummary, searchPattern)
          )!
        );
      }

      const whereClause = runConditions.length > 0 ? and(...runConditions) : undefined;
      const [[{ total: totalMatches }], filters, runRows] = await Promise.all([
        db
          .select({
            total: count()
          })
          .from(runs)
          .where(whereClause),
        loadRunsFilters(db, whereClause),
        db
          .select()
          .from(runs)
          .where(whereClause)
          .orderBy(...buildRunOrderBy(query.sort))
          .limit(query.limit)
      ]);
      const runIds = runRows.map((runRow) => runRow.id);
      const jobRows = await loadJobsForRunIds(db, runIds);
      const attemptRows = await loadAttemptsForRunIds(db, runIds);
      const jobsByRunId = groupByRunId(jobRows);
      const attemptsByRunId = groupByRunId(attemptRows);
      const items = runRows.map((runRow) =>
        buildRunListItem({
          attemptRows: attemptsByRunId.get(runRow.id) ?? [],
          jobRows: jobsByRunId.get(runRow.id) ?? [],
          runRow
        })
      );

      return {
        filters,
        items,
        query,
        summary: {
          activeRuns: items.filter((item) => item.runLifecycleBucket === "active").length,
          failedRuns: items.filter((item) => item.runState === "failed").length,
          returnedCount: items.length,
          totalMatches,
          verdictCounts: {
            fail: items.filter((item) => item.verdictClass === "fail").length,
            invalid_result: items.filter((item) => item.verdictClass === "invalid_result")
              .length,
            pass: items.filter((item) => item.verdictClass === "pass").length
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
      const [
        [{ total: activeRuns }],
        [{ total: queuedRuns }],
        [{ total: queuedJobs }],
        [{ total: claimedJobs }],
        [{ total: runningJobs }],
        [{ total: cancelRequestedJobs }],
        leaseRows
      ] = await Promise.all([
        db
          .select({
            total: count()
          })
          .from(runs)
          .where(inArray(runs.state, ["running", "cancel_requested"])),
        db
          .select({
            total: count()
          })
          .from(runs)
          .where(eq(runs.state, "queued")),
        db
          .select({
            total: count()
          })
          .from(jobs)
          .where(eq(jobs.state, "queued")),
        db
          .select({
            total: count()
          })
          .from(jobs)
          .where(eq(jobs.state, "claimed")),
        db
          .select({
            total: count()
          })
          .from(jobs)
          .where(eq(jobs.state, "running")),
        db
          .select({
            total: count()
          })
          .from(jobs)
          .where(eq(jobs.state, "cancel_requested")),
        db
          .select()
          .from(workerJobLeases)
          .where(isNull(workerJobLeases.revokedAt))
      ]);
      const runIds = [...new Set(leaseRows.map((leaseRow) => leaseRow.runId))];
      const jobIds = [...new Set(leaseRows.map((leaseRow) => leaseRow.jobId))];
      const attemptIds = [...new Set(leaseRows.map((leaseRow) => leaseRow.attemptId))];
      const [runRows, jobRows, attemptRows, recentFailedRuns, queuedRunRows] = await Promise.all([
        runIds.length > 0
          ? db.select().from(runs).where(inArray(runs.id, runIds))
          : Promise.resolve([] as RunRow[]),
        jobIds.length > 0
          ? db.select().from(jobs).where(inArray(jobs.id, jobIds))
          : Promise.resolve([] as JobRow[]),
        attemptIds.length > 0
          ? db.select().from(attempts).where(inArray(attempts.id, attemptIds))
          : Promise.resolve([] as AttemptRow[]),
        db
          .select({
            completedAt: runs.completedAt,
            primaryFailureFamily: runs.primaryFailureFamily,
            sourceRunId: runs.sourceRunId
          })
          .from(runs)
          .where(eq(runs.state, "failed"))
          .orderBy(desc(runs.completedAt))
          .limit(20),
        db
          .select({
            sourceRunId: runs.sourceRunId
          })
          .from(runs)
          .where(eq(runs.state, "queued"))
          .orderBy(desc(runs.createdAt))
          .limit(5)
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

      if (queuedJobs > 0) {
        incidents.push({
          affectedRunIds: queuedRunRows.map((runRow) => runRow.sourceRunId),
          kind: "queue_backlog",
          observedAt: now.toISOString(),
          severity: "warning",
          summary: `${queuedJobs} queued jobs are waiting for worker capacity.`,
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

      const failedRuns = recentFailedRuns.filter((runRow) => runRow.primaryFailureFamily);

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
          activeRuns,
          cancelRequestedJobs,
          claimedJobs,
          queuedJobs,
          queuedRuns,
          runningJobs
        },
        workerPools: [...workerPools.values()]
      };
    }
  };
}
