import { z } from "zod";
import {
  evaluationVerdictClassSchema,
  jobLifecycleStateSchema,
  runKindSchema,
  runLifecycleStateSchema
} from "./run-control.js";
import { runControlPolicySchema, runKindConcurrencyOverrideSchema } from "./run-governance.js";

const timestampSchema = z.string().min(1);

function csvArraySchema<TItem extends z.ZodTypeAny>(itemSchema: TItem) {
  return z.preprocess((value) => {
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value !== "string") {
      return value;
    }

    if (value.trim().length === 0) {
      return [];
    }

    return value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }, z.array(itemSchema));
}

export const portalRunsLifecycleBucketSchema = z.enum([
  "pending",
  "active",
  "terminal_success",
  "terminal_failure",
  "terminal_cancelled"
]);

export const portalRunsSortIdSchema = z.enum([
  "started_at_desc",
  "finished_at_desc",
  "duration_desc",
  "run_state_asc",
  "verdict_asc"
]);

export const portalRunsListQuerySchema = z.object({
  attemptId: z.string().trim().min(1).nullable().default(null),
  authMode: z.string().trim().min(1).nullable().default(null),
  benchmarkPackageDigest: z.string().trim().min(1).nullable().default(null),
  benchmarkPackageId: z.string().trim().min(1).nullable().default(null),
  benchmarkPackageVersion: z.string().trim().min(1).nullable().default(null),
  failureCode: z.string().trim().min(1).nullable().default(null),
  failureFamily: z.string().trim().min(1).nullable().default(null),
  jobId: z.string().trim().min(1).nullable().default(null),
  lifecycleBucket: portalRunsLifecycleBucketSchema.nullable().default(null),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  modelConfigId: z.string().trim().min(1).nullable().default(null),
  providerFamily: z.string().trim().min(1).nullable().default(null),
  q: z.string().trim().min(1).nullable().default(null),
  runId: z.string().trim().min(1).nullable().default(null),
  runLifecycle: csvArraySchema(runLifecycleStateSchema).default([]),
  runMode: z.string().trim().min(1).nullable().default(null),
  runKind: runKindSchema.nullable().default(null),
  sort: portalRunsSortIdSchema.default("started_at_desc"),
  toolProfile: z.string().trim().min(1).nullable().default(null),
  verdict: csvArraySchema(evaluationVerdictClassSchema).default([])
});

export const portalRunFailureSummarySchema = z.object({
  code: z.string().nullable(),
  family: z.string().nullable(),
  summary: z.string().nullable()
});

export const portalRunLineageSummarySchema = z.object({
  attemptCount: z.number().int().nonnegative(),
  attemptIds: z.array(z.string()),
  jobCount: z.number().int().nonnegative(),
  jobIds: z.array(z.string()),
  latestAttemptId: z.string().nullable(),
  latestJobId: z.string().nullable()
});

export const portalRunListItemSchema = z.object({
  authMode: z.string(),
  benchmarkItemId: z.string(),
  benchmarkLabel: z.string(),
  benchmarkPackageDigest: z.string(),
  benchmarkPackageId: z.string(),
  benchmarkPackageVersion: z.string(),
  benchmarkVersionId: z.string(),
  completedAt: timestampSchema,
  durationMs: z.number().int().nonnegative(),
  failure: portalRunFailureSummarySchema,
  laneId: z.string(),
  latestAttemptId: z.string().nullable(),
  latestJobId: z.string().nullable(),
  lineage: portalRunLineageSummarySchema,
  modelConfigId: z.string(),
  modelConfigLabel: z.string(),
  modelSnapshotId: z.string(),
  providerFamily: z.string(),
  runId: z.string(),
  runKind: runKindSchema,
  runLifecycleBucket: portalRunsLifecycleBucketSchema,
  runMode: z.string(),
  runState: runLifecycleStateSchema,
  startedAt: timestampSchema,
  toolProfile: z.string(),
  verdictClass: evaluationVerdictClassSchema
});

export const portalRunsListResponseSchema = z.object({
  items: z.array(portalRunListItemSchema),
  query: portalRunsListQuerySchema,
  summary: z.object({
    activeRuns: z.number().int().nonnegative(),
    failedRuns: z.number().int().nonnegative(),
    returnedCount: z.number().int().nonnegative(),
    totalMatches: z.number().int().nonnegative(),
    verdictCounts: z.object({
      fail: z.number().int().nonnegative(),
      invalid_result: z.number().int().nonnegative(),
      pass: z.number().int().nonnegative()
    })
  })
});

export const portalRunDetailParamsSchema = z.object({
  runId: z.string().trim().min(1)
});

export const portalRunTimelineEntrySchema = z.object({
  label: z.string(),
  occurredAt: timestampSchema,
  scope: z.enum(["attempt", "job", "run", "worker"]),
  sourceId: z.string().nullable(),
  state: z.string().nullable()
});

export const portalRunJobSummarySchema = z.object({
  completedAt: timestampSchema,
  failure: portalRunFailureSummarySchema,
  jobId: z.string().nullable(),
  runId: z.string(),
  startedAt: timestampSchema,
  state: jobLifecycleStateSchema,
  stopReason: z.string(),
  verdictClass: evaluationVerdictClassSchema
});

export const portalRunAttemptSummarySchema = z.object({
  attemptId: z.string(),
  completedAt: timestampSchema,
  failure: portalRunFailureSummarySchema,
  jobId: z.string().nullable(),
  runId: z.string(),
  startedAt: timestampSchema,
  state: z.enum(["prepared", "active", "succeeded", "failed", "cancelled"]),
  stopReason: z.string(),
  verdictClass: evaluationVerdictClassSchema,
  verifierResult: z.string()
});

export const portalRunArtifactSummarySchema = z.object({
  artifactClassId: z.string(),
  artifactId: z.string(),
  byteSize: z.number().int().nonnegative(),
  contentEncoding: z.string().nullable(),
  lifecycleState: z.enum(["registered", "available", "missing", "quarantined", "deleted"]),
  mediaType: z.string().nullable(),
  relativePath: z.string(),
  requiredForIngest: z.boolean()
});

export const portalWorkerLeaseHealthSchema = z.enum(["healthy", "stale"]);

export const portalWorkerLeaseSummarySchema = z.object({
  attemptId: z.string(),
  heartbeatIntervalSeconds: z.number().int().positive(),
  heartbeatTimeoutSeconds: z.number().int().positive(),
  health: portalWorkerLeaseHealthSchema,
  jobId: z.string().nullable(),
  lastEventSequence: z.number().int().nonnegative(),
  lastHeartbeatAt: timestampSchema.nullable(),
  leaseExpiresAt: timestampSchema,
  runId: z.string(),
  workerId: z.string(),
  workerPool: z.string(),
  workerRuntime: z.enum(["local_docker", "modal"]),
  workerVersion: z.string()
});

export const portalRunDetailResponseSchema = z.object({
  artifacts: z.array(portalRunArtifactSummarySchema),
  attempts: z.array(portalRunAttemptSummarySchema),
  item: portalRunListItemSchema,
  jobs: z.array(portalRunJobSummarySchema),
  recentWorkerEvents: z.array(portalRunTimelineEntrySchema),
  timeline: z.array(portalRunTimelineEntrySchema),
  workerLeases: z.array(portalWorkerLeaseSummarySchema)
});

export const portalLaunchBenchmarkOptionSchema = z.object({
  benchmarkItemCount: z.number().int().nonnegative(),
  benchmarkLabel: z.string(),
  benchmarkPackageDigest: z.string(),
  benchmarkPackageId: z.string(),
  benchmarkPackageVersion: z.string(),
  benchmarkVersionId: z.string(),
  laneIds: z.array(z.string()),
  lastSeenRunId: z.string()
});

export const portalLaunchModelConfigOptionSchema = z.object({
  authModes: z.array(z.string()),
  modelConfigId: z.string(),
  modelConfigLabel: z.string(),
  modelSnapshotIds: z.array(z.string()),
  providerFamily: z.string(),
  runModes: z.array(z.string()),
  toolProfiles: z.array(z.string())
});

export const portalLaunchViewResponseSchema = z.object({
  benchmarks: z.array(portalLaunchBenchmarkOptionSchema),
  governance: z.object({
    defaultPolicy: runControlPolicySchema,
    runKindConcurrencyOverrides: z.array(runKindConcurrencyOverrideSchema)
  }),
  modelConfigs: z.array(portalLaunchModelConfigOptionSchema),
  redirectPattern: z.literal("/runs/:runId"),
  runKinds: z.array(
    z.object({
      description: z.string(),
      id: runKindSchema,
      requiredFields: z.array(z.string())
    })
  ),
  submissionMode: z.literal("preflight_only")
});

export const portalWorkerIncidentKindSchema = z.enum([
  "queue_backlog",
  "stale_lease",
  "failure_cluster"
]);

export const portalWorkerIncidentSeveritySchema = z.enum([
  "info",
  "warning",
  "critical"
]);

export const portalWorkerIncidentSchema = z.object({
  affectedRunIds: z.array(z.string()),
  kind: portalWorkerIncidentKindSchema,
  observedAt: timestampSchema,
  severity: portalWorkerIncidentSeveritySchema,
  summary: z.string(),
  workerPool: z.string().nullable()
});

export const portalWorkerPoolSummarySchema = z.object({
  activeLeaseCount: z.number().int().nonnegative(),
  activeRunIds: z.array(z.string()),
  staleLeaseCount: z.number().int().nonnegative(),
  workerPool: z.string(),
  workerRuntime: z.enum(["local_docker", "modal"]),
  workerVersion: z.string()
});

export const portalWorkersViewResponseSchema = z.object({
  activeLeases: z.array(portalWorkerLeaseSummarySchema),
  generatedAt: timestampSchema,
  incidents: z.array(portalWorkerIncidentSchema),
  queueSummary: z.object({
    activeRuns: z.number().int().nonnegative(),
    cancelRequestedJobs: z.number().int().nonnegative(),
    claimedJobs: z.number().int().nonnegative(),
    queuedJobs: z.number().int().nonnegative(),
    queuedRuns: z.number().int().nonnegative(),
    runningJobs: z.number().int().nonnegative()
  }),
  workerPools: z.array(portalWorkerPoolSummarySchema)
});
