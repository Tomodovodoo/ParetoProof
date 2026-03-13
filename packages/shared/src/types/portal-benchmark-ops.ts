import type {
  AttemptLifecycleState,
  EvaluationVerdictClass,
  JobLifecycleState,
  RunKind,
  RunKindCatalogEntry,
  RunLifecycleState
} from "./run-control.js";

export type PortalRunBenchmarkSummary = {
  benchmarkItemId: string;
  benchmarkPackageDigest: string;
  benchmarkPackageId: string;
  benchmarkPackageVersion: string;
  laneId: string;
};

export type PortalRunModelSummary = {
  authMode: string;
  modelConfigId: string;
  modelSnapshotId: string;
  providerFamily: string;
};

export type PortalRunFailureSummary = {
  primaryFailureCode: string | null;
  primaryFailureFamily: string | null;
  primaryFailureSummary: string | null;
};

export type PortalRunLineageSummary = {
  lineageKey: string;
  relatedRunCount: number;
};

export type PortalRunListItem = {
  activeJobCount: number;
  benchmark: PortalRunBenchmarkSummary;
  completedAt: string;
  createdAt: string;
  failure: PortalRunFailureSummary;
  id: string;
  importedAt: string;
  latestAttemptState: AttemptLifecycleState | null;
  lineage: PortalRunLineageSummary;
  model: PortalRunModelSummary;
  runKind: RunKind;
  sourceRunId: string;
  state: RunLifecycleState;
  stopReason: string;
  terminalJobCount: number;
  updatedAt: string;
  verdictClass: EvaluationVerdictClass;
};

export type PortalRunJobSummary = {
  completedAt: string;
  id: string;
  jobState: JobLifecycleState;
  primaryFailureCode: string | null;
  primaryFailureFamily: string | null;
  primaryFailureSummary: string | null;
  sourceJobId: string | null;
  stopReason: string;
  updatedAt: string;
  verdictClass: EvaluationVerdictClass;
};

export type PortalRunAttemptSummary = {
  attemptState: AttemptLifecycleState;
  bundleDigest: string;
  completedAt: string;
  id: string;
  jobId: string;
  primaryFailureCode: string | null;
  primaryFailureFamily: string | null;
  primaryFailureSummary: string | null;
  sourceAttemptId: string;
  stopReason: string;
  updatedAt: string;
  verifierResult: string;
  verdictClass: EvaluationVerdictClass;
};

export type PortalRunArtifactSummary = {
  artifactClassId: string;
  byteSize: number;
  id: string;
  lastVerifiedAt: string | null;
  lifecycleState: string;
  mediaType: string | null;
  objectKey: string;
  relativePath: string;
  requiredForIngest: boolean;
  sha256: string;
};

export type PortalRunLeaseSummary = {
  attemptId: string;
  id: string;
  jobId: string;
  lastHeartbeatAt: string | null;
  leaseExpiresAt: string;
  revokedAt: string | null;
  workerId: string;
  workerPool: string;
  workerRuntime: "local_docker" | "modal";
  workerVersion: string;
};

export type PortalRelatedRunSummary = {
  completedAt: string;
  createdAt: string;
  id: string;
  state: RunLifecycleState;
  verdictClass: EvaluationVerdictClass;
};

export type PortalRunDetail = PortalRunListItem & {
  activeLeases: PortalRunLeaseSummary[];
  artifacts: PortalRunArtifactSummary[];
  attempts: PortalRunAttemptSummary[];
  jobs: PortalRunJobSummary[];
  relatedRuns: PortalRelatedRunSummary[];
};

export type PortalLaunchBenchmarkTarget = {
  benchmarkItemIds: string[];
  benchmarkPackageDigest: string;
  benchmarkPackageId: string;
  benchmarkPackageVersion: string;
  laneIds: string[];
  latestRunCreatedAt: string;
  recentRunCount: number;
};

export type PortalLaunchModelOption = {
  authMode: string;
  latestRunCreatedAt: string;
  modelConfigId: string;
  modelSnapshotId: string;
  providerFamily: string;
};

export type PortalLaunchView = {
  benchmarkTargets: PortalLaunchBenchmarkTarget[];
  launchMode: "preflight_only";
  modelOptions: PortalLaunchModelOption[];
  runKindOptions: RunKindCatalogEntry[];
};

export type PortalWorkerQueueSummary = {
  cancelRequestedJobs: number;
  claimedJobs: number;
  queuedJobs: number;
  runningJobs: number;
  terminalJobs: number;
};

export type PortalWorkerPoolSummary = {
  activeLeaseCount: number;
  activeWorkerCount: number;
  impactedRunCount: number;
  latestHeartbeatAt: string | null;
  staleLeaseCount: number;
  workerPool: string;
  workerRuntime: "local_docker" | "modal";
};

export type PortalWorkerLeaseSummary = {
  attemptId: string;
  id: string;
  jobId: string;
  lastHeartbeatAt: string | null;
  leaseExpiresAt: string;
  revokedAt: string | null;
  runId: string;
  workerId: string;
  workerPool: string;
  workerRuntime: "local_docker" | "modal";
  workerVersion: string;
};

export type PortalWorkerIncidentSummary = {
  jobId: string | null;
  kind: "failed_job" | "stale_lease";
  leaseId: string | null;
  observedAt: string;
  runId: string | null;
  summary: string;
  workerPool: string | null;
};

export type PortalWorkersView = {
  activeLeases: PortalWorkerLeaseSummary[];
  incidents: PortalWorkerIncidentSummary[];
  pools: PortalWorkerPoolSummary[];
  queue: PortalWorkerQueueSummary;
};

export type PortalRunListResponse = {
  items: PortalRunListItem[];
};

export type PortalRunDetailResponse = {
  item: PortalRunDetail;
};

export type PortalLaunchViewResponse = {
  item: PortalLaunchView;
};

export type PortalWorkersViewResponse = {
  item: PortalWorkersView;
};
