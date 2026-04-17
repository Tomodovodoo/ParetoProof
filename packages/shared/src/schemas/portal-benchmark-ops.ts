import { z } from "zod";
import {
  evaluationVerdictClassSchema,
  runKindSchema,
  runLifecycleStateSchema
} from "./run-control.js";
import { runControlPolicySchema, runKindConcurrencyOverrideSchema } from "./run-governance.js";

const timestampSchema = z.string().min(1);
const portalTerminalRunLifecycleStateSchema = z.enum([
  "succeeded",
  "failed",
  "cancelled"
]);
const portalNonTerminalRunLifecycleStateSchema = z.enum([
  "created",
  "queued",
  "running",
  "cancel_requested"
]);
const portalTerminalJobLifecycleStateSchema = z.enum([
  "completed",
  "failed",
  "cancelled"
]);
const portalNonTerminalJobLifecycleStateSchema = z.enum([
  "queued",
  "claimed",
  "running",
  "cancel_requested"
]);
const portalTerminalAttemptLifecycleStateSchema = z.enum([
  "succeeded",
  "failed",
  "cancelled"
]);
const portalNonTerminalAttemptLifecycleStateSchema = z.enum([
  "prepared",
  "active"
]);

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

const portalRunListItemBaseSchema = z.object({
  authMode: z.string(),
  benchmarkItemId: z.string(),
  benchmarkLabel: z.string(),
  benchmarkPackageDigest: z.string(),
  benchmarkPackageId: z.string(),
  benchmarkPackageVersion: z.string(),
  benchmarkVersionId: z.string(),
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
  startedAt: timestampSchema,
  toolProfile: z.string()
});

export const portalRunListItemSchema = z.union([
  portalRunListItemBaseSchema.extend({
    completedAt: timestampSchema,
    durationMs: z.number().int().nonnegative(),
    runState: portalTerminalRunLifecycleStateSchema,
    verdictClass: evaluationVerdictClassSchema
  }),
  portalRunListItemBaseSchema.extend({
    completedAt: z.null(),
    durationMs: z.null(),
    runState: portalNonTerminalRunLifecycleStateSchema,
    verdictClass: z.null()
  })
]);

export const portalRunsProviderFilterOptionSchema = z.object({
  count: z.number().int().nonnegative(),
  providerFamily: z.string()
});

export const portalRunsModelConfigFilterOptionSchema = z.object({
  count: z.number().int().nonnegative(),
  modelConfigId: z.string(),
  modelConfigLabel: z.string(),
  providerFamily: z.string()
});

export const portalRunsAvailableFiltersSchema = z.object({
  modelConfigs: z.array(portalRunsModelConfigFilterOptionSchema),
  providerFamilies: z.array(portalRunsProviderFilterOptionSchema)
});

export const portalRunsListResponseSchema = z.object({
  filters: portalRunsAvailableFiltersSchema,
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

const portalRunJobSummaryBaseSchema = z.object({
  failure: portalRunFailureSummarySchema,
  jobId: z.string().nullable(),
  runId: z.string(),
  startedAt: timestampSchema
});

export const portalRunJobSummarySchema = z.union([
  portalRunJobSummaryBaseSchema.extend({
    completedAt: timestampSchema,
    state: portalTerminalJobLifecycleStateSchema,
    stopReason: z.string(),
    verdictClass: evaluationVerdictClassSchema
  }),
  portalRunJobSummaryBaseSchema.extend({
    completedAt: z.null(),
    state: portalNonTerminalJobLifecycleStateSchema,
    stopReason: z.null(),
    verdictClass: z.null()
  })
]);

const portalRunAttemptSummaryBaseSchema = z.object({
  attemptId: z.string(),
  failure: portalRunFailureSummarySchema,
  jobId: z.string().nullable(),
  runId: z.string(),
  startedAt: timestampSchema
});

export const portalRunAttemptSummarySchema = z.union([
  portalRunAttemptSummaryBaseSchema.extend({
    completedAt: timestampSchema,
    state: portalTerminalAttemptLifecycleStateSchema,
    stopReason: z.string(),
    verdictClass: evaluationVerdictClassSchema,
    verifierResult: z.string()
  }),
  portalRunAttemptSummaryBaseSchema.extend({
    completedAt: z.null(),
    state: portalNonTerminalAttemptLifecycleStateSchema,
    stopReason: z.null(),
    verdictClass: z.null(),
    verifierResult: z.null()
  })
]);

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

export const portalBenchmarkDatasetParamsSchema = z.object({
  packageId: z.string().trim().min(1)
});

export const portalBenchmarkExportFormatSchema = z.enum(["csv", "json"]);

export const portalBenchmarkExportQuerySchema = z.object({
  format: portalBenchmarkExportFormatSchema.default("json")
});

export const portalBenchmarkListItemSchema = z.object({
  attemptCount: z.number().int().nonnegative(),
  benchmarkLabel: z.string(),
  benchmarkPackageId: z.string(),
  latestCompletedAt: timestampSchema.nullable(),
  latestRunId: z.string().nullable(),
  modelConfigIds: z.array(z.string()),
  providerFamilies: z.array(z.string()),
  runCount: z.number().int().nonnegative(),
  versions: z.array(z.string()),
  verdictCounts: z.object({
    fail: z.number().int().nonnegative(),
    invalid_result: z.number().int().nonnegative(),
    pass: z.number().int().nonnegative()
  })
});

export const portalBenchmarksListResponseSchema = z.object({
  items: z.array(portalBenchmarkListItemSchema)
});

export const portalBenchmarkDatasetSummarySchema = z.object({
  attemptCount: z.number().int().nonnegative(),
  jobCount: z.number().int().nonnegative(),
  latestCompletedAt: timestampSchema.nullable(),
  runCount: z.number().int().nonnegative(),
  verdictCounts: z.object({
    fail: z.number().int().nonnegative(),
    invalid_result: z.number().int().nonnegative(),
    pass: z.number().int().nonnegative()
  })
});

export const portalBenchmarkDatasetMetadataSchema = z.object({
  benchmarkLabel: z.string(),
  benchmarkPackageId: z.string(),
  laneIds: z.array(z.string()),
  latestRunId: z.string().nullable(),
  modelConfigIds: z.array(z.string()),
  providerFamilies: z.array(z.string()),
  versions: z.array(z.string())
});

export const portalBenchmarkDatasetResponseSchema = z.object({
  attempts: z.array(portalRunAttemptSummarySchema),
  benchmark: portalBenchmarkDatasetMetadataSchema,
  jobs: z.array(portalRunJobSummarySchema),
  runs: z.array(portalRunListItemSchema),
  summary: portalBenchmarkDatasetSummarySchema
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

export const portalOverviewResponseSchema = z.object({
  benchmarkHighlights: z.array(portalBenchmarkListItemSchema),
  generatedAt: timestampSchema,
  recentIncidents: z.array(portalWorkerIncidentSchema),
  recentRuns: z.array(portalRunListItemSchema),
  summary: z.object({
    activeLeases: z.number().int().nonnegative(),
    activeRuns: z.number().int().nonnegative(),
    failedRuns: z.number().int().nonnegative(),
    observedBenchmarkPackageCount: z.number().int().nonnegative(),
    queuedJobs: z.number().int().nonnegative(),
    queuedRuns: z.number().int().nonnegative(),
    runningJobs: z.number().int().nonnegative(),
    staleLeaseCount: z.number().int().nonnegative(),
    totalRuns: z.number().int().nonnegative()
  })
});
