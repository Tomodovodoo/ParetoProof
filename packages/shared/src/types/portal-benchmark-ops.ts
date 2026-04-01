import type {
  AttemptLifecycleState,
  EvaluationVerdictClass,
  JobLifecycleState,
  RunKind,
  RunLifecycleState
} from "./run-control.js";
import type { RunControlPolicy, RunKindConcurrencyOverride } from "./run-governance.js";

export type PortalRunsLifecycleBucket =
  | "pending"
  | "active"
  | "terminal_success"
  | "terminal_failure"
  | "terminal_cancelled";

export type PortalRunsSortId =
  | "started_at_desc"
  | "finished_at_desc"
  | "duration_desc"
  | "run_state_asc"
  | "verdict_asc";

export type PortalRunsLifecycleBucketDefinition = {
  description: string;
  id: PortalRunsLifecycleBucket;
  label: string;
  runStates: RunLifecycleState[];
};

export type PortalRunsSortOption = {
  description: string;
  id: PortalRunsSortId;
  label: string;
};

export type PortalRunsProviderFilterOption = {
  count: number;
  providerFamily: string;
};

export type PortalRunsModelConfigFilterOption = {
  count: number;
  modelConfigId: string;
  modelConfigLabel: string;
  providerFamily: string;
};

export type PortalRunsAvailableFilters = {
  modelConfigs: PortalRunsModelConfigFilterOption[];
  providerFamilies: PortalRunsProviderFilterOption[];
};

export type PortalRunsListQuery = {
  attemptId: string | null;
  authMode: string | null;
  benchmarkPackageDigest: string | null;
  benchmarkPackageId: string | null;
  benchmarkPackageVersion: string | null;
  failureCode: string | null;
  failureFamily: string | null;
  jobId: string | null;
  lifecycleBucket: PortalRunsLifecycleBucket | null;
  limit: number;
  modelConfigId: string | null;
  providerFamily: string | null;
  q: string | null;
  runId: string | null;
  runLifecycle: RunLifecycleState[];
  runMode: string | null;
  runKind: RunKind | null;
  sort: PortalRunsSortId;
  toolProfile: string | null;
  verdict: EvaluationVerdictClass[];
};

export type PortalRunFailureSummary = {
  code: string | null;
  family: string | null;
  summary: string | null;
};

export type PortalRunLineageSummary = {
  attemptCount: number;
  attemptIds: string[];
  jobCount: number;
  jobIds: string[];
  latestAttemptId: string | null;
  latestJobId: string | null;
};

export type PortalRunListItem = {
  authMode: string;
  benchmarkItemId: string;
  benchmarkLabel: string;
  benchmarkPackageDigest: string;
  benchmarkPackageId: string;
  benchmarkPackageVersion: string;
  benchmarkVersionId: string;
  completedAt: string | null;
  durationMs: number | null;
  failure: PortalRunFailureSummary;
  laneId: string;
  latestAttemptId: string | null;
  latestJobId: string | null;
  lineage: PortalRunLineageSummary;
  modelConfigId: string;
  modelConfigLabel: string;
  modelSnapshotId: string;
  providerFamily: string;
  runId: string;
  runKind: RunKind;
  runLifecycleBucket: PortalRunsLifecycleBucket;
  runMode: string;
  runState: RunLifecycleState;
  startedAt: string;
  toolProfile: string;
  verdictClass: EvaluationVerdictClass | null;
};

export type PortalRunsListResponse = {
  filters: PortalRunsAvailableFilters;
  items: PortalRunListItem[];
  query: PortalRunsListQuery;
  summary: {
    activeRuns: number;
    failedRuns: number;
    returnedCount: number;
    totalMatches: number;
    verdictCounts: Record<EvaluationVerdictClass, number>;
  };
};

export type PortalRunTimelineEntry = {
  label: string;
  occurredAt: string;
  scope: "attempt" | "job" | "run" | "worker";
  sourceId: string | null;
  state: string | null;
};

export type PortalRunJobSummary = {
  completedAt: string | null;
  failure: PortalRunFailureSummary;
  jobId: string | null;
  runId: string;
  startedAt: string;
  state: JobLifecycleState;
  stopReason: string | null;
  verdictClass: EvaluationVerdictClass | null;
};

export type PortalRunAttemptSummary = {
  attemptId: string;
  completedAt: string | null;
  failure: PortalRunFailureSummary;
  jobId: string | null;
  runId: string;
  startedAt: string;
  state: AttemptLifecycleState;
  stopReason: string | null;
  verdictClass: EvaluationVerdictClass | null;
  verifierResult: string | null;
};

export type PortalRunArtifactSummary = {
  artifactClassId: string;
  artifactId: string;
  byteSize: number;
  contentEncoding: string | null;
  lifecycleState: "registered" | "available" | "missing" | "quarantined" | "deleted";
  mediaType: string | null;
  relativePath: string;
  requiredForIngest: boolean;
};

export type PortalWorkerLeaseHealth = "healthy" | "stale";

export type PortalWorkerLeaseSummary = {
  attemptId: string;
  heartbeatIntervalSeconds: number;
  heartbeatTimeoutSeconds: number;
  health: PortalWorkerLeaseHealth;
  jobId: string | null;
  lastEventSequence: number;
  lastHeartbeatAt: string | null;
  leaseExpiresAt: string;
  runId: string;
  workerId: string;
  workerPool: string;
  workerRuntime: "local_docker" | "modal";
  workerVersion: string;
};

export type PortalRunDetailResponse = {
  artifacts: PortalRunArtifactSummary[];
  attempts: PortalRunAttemptSummary[];
  item: PortalRunListItem;
  jobs: PortalRunJobSummary[];
  recentWorkerEvents: PortalRunTimelineEntry[];
  timeline: PortalRunTimelineEntry[];
  workerLeases: PortalWorkerLeaseSummary[];
};

export type PortalBenchmarkDatasetParams = {
  packageId: string;
};

export type PortalBenchmarkExportFormat = "csv" | "json";

export type PortalBenchmarkExportQuery = {
  format: PortalBenchmarkExportFormat;
};

export type PortalBenchmarkListItem = {
  attemptCount: number;
  benchmarkLabel: string;
  benchmarkPackageId: string;
  latestCompletedAt: string | null;
  latestRunId: string | null;
  modelConfigIds: string[];
  providerFamilies: string[];
  runCount: number;
  versions: string[];
  verdictCounts: Record<EvaluationVerdictClass, number>;
};

export type PortalBenchmarksListResponse = {
  items: PortalBenchmarkListItem[];
};

export type PortalBenchmarkDatasetSummary = {
  attemptCount: number;
  jobCount: number;
  latestCompletedAt: string | null;
  runCount: number;
  verdictCounts: Record<EvaluationVerdictClass, number>;
};

export type PortalBenchmarkDatasetMetadata = {
  benchmarkLabel: string;
  benchmarkPackageId: string;
  laneIds: string[];
  latestRunId: string | null;
  modelConfigIds: string[];
  providerFamilies: string[];
  versions: string[];
};

export type PortalBenchmarkDatasetResponse = {
  attempts: PortalRunAttemptSummary[];
  benchmark: PortalBenchmarkDatasetMetadata;
  jobs: PortalRunJobSummary[];
  runs: PortalRunListItem[];
  summary: PortalBenchmarkDatasetSummary;
};

export type PortalLaunchBenchmarkOption = {
  benchmarkItemCount: number;
  benchmarkLabel: string;
  benchmarkPackageDigest: string;
  benchmarkPackageId: string;
  benchmarkPackageVersion: string;
  benchmarkVersionId: string;
  laneIds: string[];
  lastSeenRunId: string;
};

export type PortalLaunchModelConfigOption = {
  authModes: string[];
  modelConfigId: string;
  modelConfigLabel: string;
  modelSnapshotIds: string[];
  providerFamily: string;
  runModes: string[];
  toolProfiles: string[];
};

export type PortalLaunchViewResponse = {
  benchmarks: PortalLaunchBenchmarkOption[];
  governance: {
    defaultPolicy: RunControlPolicy;
    runKindConcurrencyOverrides: RunKindConcurrencyOverride[];
  };
  modelConfigs: PortalLaunchModelConfigOption[];
  redirectPattern: "/runs/:runId";
  runKinds: Array<{
    description: string;
    id: RunKind;
    requiredFields: string[];
  }>;
  submissionMode: "preflight_only";
};

export type PortalWorkerIncidentKind = "queue_backlog" | "stale_lease" | "failure_cluster";

export type PortalWorkerIncidentSeverity = "info" | "warning" | "critical";

export type PortalWorkerIncident = {
  affectedRunIds: string[];
  kind: PortalWorkerIncidentKind;
  observedAt: string;
  severity: PortalWorkerIncidentSeverity;
  summary: string;
  workerPool: string | null;
};

export type PortalWorkerPoolSummary = {
  activeLeaseCount: number;
  activeRunIds: string[];
  staleLeaseCount: number;
  workerPool: string;
  workerRuntime: "local_docker" | "modal";
  workerVersion: string;
};

export type PortalWorkersViewResponse = {
  activeLeases: PortalWorkerLeaseSummary[];
  generatedAt: string;
  incidents: PortalWorkerIncident[];
  queueSummary: {
    activeRuns: number;
    cancelRequestedJobs: number;
    claimedJobs: number;
    queuedJobs: number;
    queuedRuns: number;
    runningJobs: number;
  };
  workerPools: PortalWorkerPoolSummary[];
};
