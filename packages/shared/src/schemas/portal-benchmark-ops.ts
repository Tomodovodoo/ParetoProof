import { z } from "zod";
import {
  attemptLifecycleStateSchema,
  evaluationVerdictClassSchema,
  jobLifecycleStateSchema,
  runKindCatalogEntrySchema,
  runKindSchema,
  runLifecycleStateSchema
} from "./run-control.js";

export const portalRunBenchmarkSummarySchema = z.object({
  benchmarkItemId: z.string(),
  benchmarkPackageDigest: z.string(),
  benchmarkPackageId: z.string(),
  benchmarkPackageVersion: z.string(),
  laneId: z.string()
});

export const portalRunModelSummarySchema = z.object({
  authMode: z.string(),
  modelConfigId: z.string(),
  modelSnapshotId: z.string(),
  providerFamily: z.string()
});

export const portalRunFailureSummarySchema = z.object({
  primaryFailureCode: z.string().nullable(),
  primaryFailureFamily: z.string().nullable(),
  primaryFailureSummary: z.string().nullable()
});

export const portalRunLineageSummarySchema = z.object({
  lineageKey: z.string(),
  relatedRunCount: z.number().int().nonnegative()
});

export const portalRunListItemSchema = z.object({
  activeJobCount: z.number().int().nonnegative(),
  benchmark: portalRunBenchmarkSummarySchema,
  completedAt: z.string(),
  createdAt: z.string(),
  failure: portalRunFailureSummarySchema,
  id: z.string().uuid(),
  importedAt: z.string(),
  latestAttemptState: attemptLifecycleStateSchema.nullable(),
  lineage: portalRunLineageSummarySchema,
  model: portalRunModelSummarySchema,
  runKind: runKindSchema,
  sourceRunId: z.string(),
  state: runLifecycleStateSchema,
  stopReason: z.string(),
  terminalJobCount: z.number().int().nonnegative(),
  updatedAt: z.string(),
  verdictClass: evaluationVerdictClassSchema
});

export const portalRunJobSummarySchema = z.object({
  completedAt: z.string(),
  id: z.string().uuid(),
  jobState: jobLifecycleStateSchema,
  primaryFailureCode: z.string().nullable(),
  primaryFailureFamily: z.string().nullable(),
  primaryFailureSummary: z.string().nullable(),
  sourceJobId: z.string().nullable(),
  stopReason: z.string(),
  updatedAt: z.string(),
  verdictClass: evaluationVerdictClassSchema
});

export const portalRunAttemptSummarySchema = z.object({
  attemptState: attemptLifecycleStateSchema,
  bundleDigest: z.string(),
  completedAt: z.string(),
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  primaryFailureCode: z.string().nullable(),
  primaryFailureFamily: z.string().nullable(),
  primaryFailureSummary: z.string().nullable(),
  sourceAttemptId: z.string(),
  stopReason: z.string(),
  updatedAt: z.string(),
  verifierResult: z.string(),
  verdictClass: evaluationVerdictClassSchema
});

export const portalRunArtifactSummarySchema = z.object({
  artifactClassId: z.string(),
  byteSize: z.number().int().nonnegative(),
  id: z.string().uuid(),
  lastVerifiedAt: z.string().nullable(),
  lifecycleState: z.string(),
  mediaType: z.string().nullable(),
  objectKey: z.string(),
  relativePath: z.string(),
  requiredForIngest: z.boolean(),
  sha256: z.string()
});

export const portalRunLeaseSummarySchema = z.object({
  attemptId: z.string().uuid(),
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  lastHeartbeatAt: z.string().nullable(),
  leaseExpiresAt: z.string(),
  revokedAt: z.string().nullable(),
  workerId: z.string(),
  workerPool: z.string(),
  workerRuntime: z.enum(["local_docker", "modal"]),
  workerVersion: z.string()
});

export const portalRelatedRunSummarySchema = z.object({
  completedAt: z.string(),
  createdAt: z.string(),
  id: z.string().uuid(),
  state: runLifecycleStateSchema,
  verdictClass: evaluationVerdictClassSchema
});

export const portalRunDetailSchema = portalRunListItemSchema.extend({
  activeLeases: z.array(portalRunLeaseSummarySchema),
  artifacts: z.array(portalRunArtifactSummarySchema),
  attempts: z.array(portalRunAttemptSummarySchema),
  jobs: z.array(portalRunJobSummarySchema),
  relatedRuns: z.array(portalRelatedRunSummarySchema)
});

export const portalLaunchBenchmarkTargetSchema = z.object({
  benchmarkItemIds: z.array(z.string()),
  benchmarkPackageDigest: z.string(),
  benchmarkPackageId: z.string(),
  benchmarkPackageVersion: z.string(),
  laneIds: z.array(z.string()),
  latestRunCreatedAt: z.string(),
  recentRunCount: z.number().int().nonnegative()
});

export const portalLaunchModelOptionSchema = z.object({
  authMode: z.string(),
  latestRunCreatedAt: z.string(),
  modelConfigId: z.string(),
  modelSnapshotId: z.string(),
  providerFamily: z.string()
});

export const portalLaunchViewSchema = z.object({
  benchmarkTargets: z.array(portalLaunchBenchmarkTargetSchema),
  launchMode: z.literal("preflight_only"),
  modelOptions: z.array(portalLaunchModelOptionSchema),
  runKindOptions: z.array(runKindCatalogEntrySchema)
});

export const portalWorkerQueueSummarySchema = z.object({
  cancelRequestedJobs: z.number().int().nonnegative(),
  claimedJobs: z.number().int().nonnegative(),
  queuedJobs: z.number().int().nonnegative(),
  runningJobs: z.number().int().nonnegative(),
  terminalJobs: z.number().int().nonnegative()
});

export const portalWorkerPoolSummarySchema = z.object({
  activeLeaseCount: z.number().int().nonnegative(),
  activeWorkerCount: z.number().int().nonnegative(),
  impactedRunCount: z.number().int().nonnegative(),
  latestHeartbeatAt: z.string().nullable(),
  staleLeaseCount: z.number().int().nonnegative(),
  workerPool: z.string(),
  workerRuntime: z.enum(["local_docker", "modal"])
});

export const portalWorkerLeaseSummarySchema = z.object({
  attemptId: z.string().uuid(),
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  lastHeartbeatAt: z.string().nullable(),
  leaseExpiresAt: z.string(),
  revokedAt: z.string().nullable(),
  runId: z.string().uuid(),
  workerId: z.string(),
  workerPool: z.string(),
  workerRuntime: z.enum(["local_docker", "modal"]),
  workerVersion: z.string()
});

export const portalWorkerIncidentSummarySchema = z.object({
  jobId: z.string().uuid().nullable(),
  kind: z.enum(["failed_job", "stale_lease"]),
  leaseId: z.string().uuid().nullable(),
  observedAt: z.string(),
  runId: z.string().uuid().nullable(),
  summary: z.string(),
  workerPool: z.string().nullable()
});

export const portalWorkersViewSchema = z.object({
  activeLeases: z.array(portalWorkerLeaseSummarySchema),
  incidents: z.array(portalWorkerIncidentSummarySchema),
  pools: z.array(portalWorkerPoolSummarySchema),
  queue: portalWorkerQueueSummarySchema
});

export const portalRunListResponseSchema = z.object({
  items: z.array(portalRunListItemSchema)
});

export const portalRunDetailResponseSchema = z.object({
  item: portalRunDetailSchema
});

export const portalLaunchViewResponseSchema = z.object({
  item: portalLaunchViewSchema
});

export const portalWorkersViewResponseSchema = z.object({
  item: portalWorkersViewSchema
});
