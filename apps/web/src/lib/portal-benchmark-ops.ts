import {
  portalLaunchViewResponseSchema,
  portalRunDetailResponseSchema,
  portalRunsLifecycleBuckets,
  portalRunsListQuerySchema,
  portalRunsListResponseSchema,
  portalWorkersViewResponseSchema,
  type EvaluationVerdictClass,
  type PortalLaunchViewResponse,
  type PortalRunDetailResponse,
  type PortalRunListItem,
  type PortalRunsListQuery,
  type PortalRunsListResponse,
  type PortalRunsSortId,
  type PortalWorkerIncidentSeverity,
  type PortalWorkersViewResponse,
  type RunLifecycleState
} from "@paretoproof/shared";
import { getApiBaseUrl } from "./api-base-url";
import { isLocalHostname } from "./surface";

const portalRunsSortIds: PortalRunsSortId[] = [
  "started_at_desc",
  "finished_at_desc",
  "duration_desc",
  "run_state_asc",
  "verdict_asc"
];

const portalRunLifecycleStateOrder: Record<RunLifecycleState, number> = {
  cancel_requested: 3,
  cancelled: 6,
  created: 0,
  failed: 5,
  queued: 1,
  running: 2,
  succeeded: 4
};

const portalVerdictOrder: Record<EvaluationVerdictClass, number> = {
  fail: 1,
  invalid_result: 2,
  pass: 0
};

export const defaultPortalRunsQuery: PortalRunsListQuery = {
  attemptId: null,
  authMode: null,
  benchmarkPackageDigest: null,
  benchmarkPackageId: null,
  benchmarkPackageVersion: null,
  failureCode: null,
  failureFamily: null,
  jobId: null,
  lifecycleBucket: null,
  limit: 25,
  modelConfigId: null,
  providerFamily: null,
  q: null,
  runId: null,
  runKind: null,
  runLifecycle: [],
  runMode: null,
  sort: "started_at_desc",
  toolProfile: null,
  verdict: []
};

const localRunItems: PortalRunListItem[] = [
  {
    authMode: "oidc",
    benchmarkItemId: "item-simplify-001",
    benchmarkLabel: "mathlib4 / simplification",
    benchmarkPackageDigest: "sha256:3f91c1",
    benchmarkPackageId: "problem9-core",
    benchmarkPackageVersion: "2026.03.11",
    benchmarkVersionId: "problem9-core@2026.03.11",
    completedAt: "2026-03-13T15:38:00.000Z",
    durationMs: 342000,
    failure: { code: null, family: null, summary: null },
    laneId: "proof-simplification",
    latestAttemptId: "ATT-318-1",
    latestJobId: "JOB-318-1",
    lineage: {
      attemptCount: 1,
      attemptIds: ["ATT-318-1"],
      jobCount: 1,
      jobIds: ["JOB-318-1"],
      latestAttemptId: "ATT-318-1",
      latestJobId: "JOB-318-1"
    },
    modelConfigId: "openai-gpt-oss-high",
    modelConfigLabel: "OpenAI GPT-OSS (high reasoning)",
    modelSnapshotId: "gpt-oss-2026-03-10",
    providerFamily: "openai",
    runId: "PP-318",
    runKind: "single_run",
    runLifecycleBucket: "terminal_success",
    runMode: "eval",
    runState: "succeeded",
    startedAt: "2026-03-13T15:32:18.000Z",
    toolProfile: "lean4-proof",
    verdictClass: "pass"
  },
  {
    authMode: "oidc",
    benchmarkItemId: "item-induction-022",
    benchmarkLabel: "proof search / induction",
    benchmarkPackageDigest: "sha256:3f91c1",
    benchmarkPackageId: "problem9-core",
    benchmarkPackageVersion: "2026.03.11",
    benchmarkVersionId: "problem9-core@2026.03.11",
    completedAt: "2026-03-13T16:06:00.000Z",
    durationMs: 921000,
    failure: { code: null, family: null, summary: null },
    laneId: "induction-search",
    latestAttemptId: "ATT-319-2",
    latestJobId: "JOB-319-2",
    lineage: {
      attemptCount: 2,
      attemptIds: ["ATT-319-1", "ATT-319-2"],
      jobCount: 2,
      jobIds: ["JOB-319-1", "JOB-319-2"],
      latestAttemptId: "ATT-319-2",
      latestJobId: "JOB-319-2"
    },
    modelConfigId: "anthropic-claude-sonnet",
    modelConfigLabel: "Anthropic Claude Sonnet",
    modelSnapshotId: "claude-sonnet-4-2026-03-01",
    providerFamily: "anthropic",
    runId: "PP-319",
    runKind: "single_run",
    runLifecycleBucket: "active",
    runMode: "eval",
    runState: "running",
    startedAt: "2026-03-13T15:50:39.000Z",
    toolProfile: "lean4-proof",
    verdictClass: "pass"
  },
  {
    authMode: "service_token",
    benchmarkItemId: "item-queue-003",
    benchmarkLabel: "worker smoke / queue handoff",
    benchmarkPackageDigest: "sha256:c28a7b",
    benchmarkPackageId: "problem9-smoke",
    benchmarkPackageVersion: "2026.03.12",
    benchmarkVersionId: "problem9-smoke@2026.03.12",
    completedAt: "2026-03-13T15:04:00.000Z",
    durationMs: 486000,
    failure: {
      code: "worker_lease_lost",
      family: "provider",
      summary: "Worker lease heartbeat expired during provider retry recovery."
    },
    laneId: "worker-smoke",
    latestAttemptId: "ATT-320-3",
    latestJobId: "JOB-320-3",
    lineage: {
      attemptCount: 3,
      attemptIds: ["ATT-320-1", "ATT-320-2", "ATT-320-3"],
      jobCount: 3,
      jobIds: ["JOB-320-1", "JOB-320-2", "JOB-320-3"],
      latestAttemptId: "ATT-320-3",
      latestJobId: "JOB-320-3"
    },
    modelConfigId: "google-gemini-pro",
    modelConfigLabel: "Google Gemini Pro",
    modelSnapshotId: "gemini-pro-2026-03-07",
    providerFamily: "google",
    runId: "PP-320",
    runKind: "single_run",
    runLifecycleBucket: "terminal_failure",
    runMode: "eval",
    runState: "failed",
    startedAt: "2026-03-13T14:55:54.000Z",
    toolProfile: "lean4-proof",
    verdictClass: "invalid_result"
  },
  {
    authMode: "oidc",
    benchmarkItemId: "slice-axioms-004",
    benchmarkLabel: "axioms slice / dependency drift",
    benchmarkPackageDigest: "sha256:3f91c1",
    benchmarkPackageId: "problem9-core",
    benchmarkPackageVersion: "2026.03.11",
    benchmarkVersionId: "problem9-core@2026.03.11",
    completedAt: "2026-03-13T16:18:00.000Z",
    durationMs: 0,
    failure: { code: null, family: null, summary: null },
    laneId: "axiom-slice",
    latestAttemptId: null,
    latestJobId: null,
    lineage: {
      attemptCount: 0,
      attemptIds: [],
      jobCount: 0,
      jobIds: [],
      latestAttemptId: null,
      latestJobId: null
    },
    modelConfigId: "openai-gpt-oss-medium",
    modelConfigLabel: "OpenAI GPT-OSS (medium reasoning)",
    modelSnapshotId: "gpt-oss-2026-03-10",
    providerFamily: "openai",
    runId: "PP-321",
    runKind: "benchmark_slice",
    runLifecycleBucket: "pending",
    runMode: "eval",
    runState: "queued",
    startedAt: "2026-03-13T16:18:00.000Z",
    toolProfile: "lean4-proof",
    verdictClass: "pass"
  }
];

function baseDetail(item: PortalRunListItem): PortalRunDetailResponse {
  return {
    artifacts: [],
    attempts: [],
    item,
    jobs: [],
    recentWorkerEvents: [],
    timeline: [
      {
        label: "Run created",
        occurredAt: item.startedAt,
        scope: "run",
        sourceId: item.runId,
        state: "created"
      }
    ],
    workerLeases: []
  };
}

const localRunDetailById: Record<string, PortalRunDetailResponse> = {
  "PP-318": {
    ...baseDetail(localRunItems[0]),
    artifacts: [
      {
        artifactClassId: "transcript",
        artifactId: "artifact-318-transcript",
        byteSize: 64120,
        contentEncoding: null,
        lifecycleState: "available",
        mediaType: "application/json",
        relativePath: "runs/PP-318/transcript.json",
        requiredForIngest: true
      }
    ],
    attempts: [
      {
        attemptId: "ATT-318-1",
        completedAt: "2026-03-13T15:38:00.000Z",
        failure: { code: null, family: null, summary: null },
        jobId: "JOB-318-1",
        runId: "PP-318",
        startedAt: "2026-03-13T15:32:20.000Z",
        state: "succeeded",
        stopReason: "completed",
        verdictClass: "pass",
        verifierResult: "accepted"
      }
    ],
    jobs: [
      {
        completedAt: "2026-03-13T15:37:42.000Z",
        failure: { code: null, family: null, summary: null },
        jobId: "JOB-318-1",
        runId: "PP-318",
        startedAt: "2026-03-13T15:32:18.000Z",
        state: "completed",
        stopReason: "completed",
        verdictClass: "pass"
      }
    ],
    recentWorkerEvents: [
      {
        label: "Artifact upload finished",
        occurredAt: "2026-03-13T15:37:55.000Z",
        scope: "worker",
        sourceId: "worker-modal-eu-1",
        state: "available"
      }
    ],
    timeline: [
      ...baseDetail(localRunItems[0]).timeline,
      {
        label: "Run completed",
        occurredAt: "2026-03-13T15:38:00.000Z",
        scope: "run",
        sourceId: "PP-318",
        state: "succeeded"
      }
    ],
    workerLeases: [
      {
        attemptId: "ATT-318-1",
        heartbeatIntervalSeconds: 30,
        heartbeatTimeoutSeconds: 120,
        health: "healthy",
        jobId: "JOB-318-1",
        lastEventSequence: 18,
        lastHeartbeatAt: "2026-03-13T15:37:50.000Z",
        leaseExpiresAt: "2026-03-13T15:39:50.000Z",
        runId: "PP-318",
        workerId: "worker-modal-eu-1",
        workerPool: "modal-proof",
        workerRuntime: "modal",
        workerVersion: "2026.03.12"
      }
    ]
  },
  "PP-319": {
    ...baseDetail(localRunItems[1]),
    attempts: [
      {
        attemptId: "ATT-319-1",
        completedAt: "2026-03-13T15:47:08.000Z",
        failure: {
          code: "provider_rate_limited",
          family: "provider",
          summary: "Anthropic rate limit hit while warming the first attempt."
        },
        jobId: "JOB-319-1",
        runId: "PP-319",
        startedAt: "2026-03-13T15:44:18.000Z",
        state: "failed",
        stopReason: "retry_budget_consumed",
        verdictClass: "fail",
        verifierResult: "retryable_failure"
      },
      {
        attemptId: "ATT-319-2",
        completedAt: "2026-03-13T16:06:00.000Z",
        failure: { code: null, family: null, summary: null },
        jobId: "JOB-319-2",
        runId: "PP-319",
        startedAt: "2026-03-13T15:50:39.000Z",
        state: "active",
        stopReason: "still_running",
        verdictClass: "pass",
        verifierResult: "pending"
      }
    ],
    jobs: [
      {
        completedAt: "2026-03-13T16:06:00.000Z",
        failure: { code: null, family: null, summary: null },
        jobId: "JOB-319-2",
        runId: "PP-319",
        startedAt: "2026-03-13T15:50:39.000Z",
        state: "running",
        stopReason: "still_running",
        verdictClass: "pass"
      }
    ],
    recentWorkerEvents: [
      {
        label: "Heartbeat received",
        occurredAt: "2026-03-13T16:05:58.000Z",
        scope: "worker",
        sourceId: "worker-modal-eu-2",
        state: "healthy"
      }
    ],
    timeline: [
      ...baseDetail(localRunItems[1]).timeline,
      {
        label: "Attempt 1 failed with provider rate limit",
        occurredAt: "2026-03-13T15:47:08.000Z",
        scope: "attempt",
        sourceId: "ATT-319-1",
        state: "failed"
      }
    ],
    workerLeases: [
      {
        attemptId: "ATT-319-2",
        heartbeatIntervalSeconds: 30,
        heartbeatTimeoutSeconds: 120,
        health: "healthy",
        jobId: "JOB-319-2",
        lastEventSequence: 41,
        lastHeartbeatAt: "2026-03-13T16:05:58.000Z",
        leaseExpiresAt: "2026-03-13T16:07:58.000Z",
        runId: "PP-319",
        workerId: "worker-modal-eu-2",
        workerPool: "modal-proof",
        workerRuntime: "modal",
        workerVersion: "2026.03.12"
      }
    ]
  },
  "PP-320": {
    ...baseDetail(localRunItems[2]),
    artifacts: [
      {
        artifactClassId: "worker-log",
        artifactId: "artifact-320-worker-log",
        byteSize: 9722,
        contentEncoding: null,
        lifecycleState: "available",
        mediaType: "text/plain",
        relativePath: "runs/PP-320/worker.log",
        requiredForIngest: false
      }
    ],
    attempts: [
      {
        attemptId: "ATT-320-3",
        completedAt: "2026-03-13T15:04:00.000Z",
        failure: {
          code: "worker_lease_lost",
          family: "provider",
          summary: "Worker lease heartbeat expired during provider retry recovery."
        },
        jobId: "JOB-320-3",
        runId: "PP-320",
        startedAt: "2026-03-13T15:01:41.000Z",
        state: "failed",
        stopReason: "terminal_failure",
        verdictClass: "invalid_result",
        verifierResult: "invalid"
      }
    ],
    jobs: [
      {
        completedAt: "2026-03-13T15:04:00.000Z",
        failure: {
          code: "worker_lease_lost",
          family: "provider",
          summary: "Worker lease heartbeat expired during provider retry recovery."
        },
        jobId: "JOB-320-3",
        runId: "PP-320",
        startedAt: "2026-03-13T15:01:41.000Z",
        state: "failed",
        stopReason: "worker_lease_timeout",
        verdictClass: "invalid_result"
      }
    ],
    recentWorkerEvents: [
      {
        label: "Lease marked stale",
        occurredAt: "2026-03-13T15:03:55.000Z",
        scope: "worker",
        sourceId: "worker-local-3",
        state: "stale"
      }
    ],
    timeline: [
      ...baseDetail(localRunItems[2]).timeline,
      {
        label: "Lease timeout promoted to terminal failure",
        occurredAt: "2026-03-13T15:04:00.000Z",
        scope: "run",
        sourceId: "PP-320",
        state: "failed"
      }
    ],
    workerLeases: [
      {
        attemptId: "ATT-320-3",
        heartbeatIntervalSeconds: 30,
        heartbeatTimeoutSeconds: 120,
        health: "stale",
        jobId: "JOB-320-3",
        lastEventSequence: 12,
        lastHeartbeatAt: "2026-03-13T15:01:55.000Z",
        leaseExpiresAt: "2026-03-13T15:03:55.000Z",
        runId: "PP-320",
        workerId: "worker-local-3",
        workerPool: "local-devbox",
        workerRuntime: "local_docker",
        workerVersion: "2026.03.11"
      }
    ]
  },
  "PP-321": {
    ...baseDetail(localRunItems[3]),
    timeline: [
      ...baseDetail(localRunItems[3]).timeline,
      {
        label: "Run queued",
        occurredAt: "2026-03-13T16:18:05.000Z",
        scope: "run",
        sourceId: "PP-321",
        state: "queued"
      }
    ]
  }
};

const localLaunchView: PortalLaunchViewResponse = {
  benchmarks: [
    {
      benchmarkItemCount: 128,
      benchmarkLabel: "Problem 9 core benchmark",
      benchmarkPackageDigest: "sha256:3f91c1",
      benchmarkPackageId: "problem9-core",
      benchmarkPackageVersion: "2026.03.11",
      benchmarkVersionId: "problem9-core@2026.03.11",
      laneIds: ["proof-simplification", "induction-search", "axiom-slice"],
      lastSeenRunId: "PP-321"
    },
    {
      benchmarkItemCount: 12,
      benchmarkLabel: "Problem 9 smoke benchmark",
      benchmarkPackageDigest: "sha256:c28a7b",
      benchmarkPackageId: "problem9-smoke",
      benchmarkPackageVersion: "2026.03.12",
      benchmarkVersionId: "problem9-smoke@2026.03.12",
      laneIds: ["worker-smoke"],
      lastSeenRunId: "PP-320"
    }
  ],
  governance: {
    defaultPolicy: {
      budget: {
        budgetExceededTerminalState: "failed",
        maxEstimatedUsdPerRun: 18,
        maxInputTokensPerRun: 550000,
        maxOutputTokensPerRun: 180000,
        maxWallClockMinutesPerRun: 90
      },
      cancellation: {
        cancelRequestGraceSeconds: 45,
        forcedCancelAfterSeconds: 240,
        heartbeatStaleSeconds: 120
      },
      concurrency: {
        maxActiveRunsGlobal: 12,
        maxActiveRunsPerContributor: 3,
        maxConcurrentJobsPerRun: 4,
        maxQueuedRunsPerContributor: 5
      },
      retry: {
        backoffMultiplier: 2,
        initialBackoffSeconds: 30,
        maxAttemptsPerJob: 3,
        maxAttemptsPerRun: 5,
        maxBackoffSeconds: 300,
        retryableReasons: [
          "provider_rate_limited",
          "provider_transport_error",
          "artifact_upload_transient",
          "internal_transient"
        ]
      }
    },
    runKindConcurrencyOverrides: [
      {
        id: "single_run",
        maxConcurrentJobsPerRun: 1,
        rationale: "Single-run detail views should preserve causal evidence ordering."
      },
      {
        id: "benchmark_slice",
        maxConcurrentJobsPerRun: 6,
        rationale: "Slice runs may fan out more aggressively within the contributor cap."
      }
    ]
  },
  modelConfigs: [
    {
      authModes: ["oidc", "service_token"],
      modelConfigId: "openai-gpt-oss-high",
      modelConfigLabel: "OpenAI GPT-OSS (high reasoning)",
      modelSnapshotIds: ["gpt-oss-2026-03-10"],
      providerFamily: "openai",
      runModes: ["eval"],
      toolProfiles: ["lean4-proof"]
    },
    {
      authModes: ["oidc"],
      modelConfigId: "anthropic-claude-sonnet",
      modelConfigLabel: "Anthropic Claude Sonnet",
      modelSnapshotIds: ["claude-sonnet-4-2026-03-01"],
      providerFamily: "anthropic",
      runModes: ["eval"],
      toolProfiles: ["lean4-proof"]
    },
    {
      authModes: ["service_token"],
      modelConfigId: "google-gemini-pro",
      modelConfigLabel: "Google Gemini Pro",
      modelSnapshotIds: ["gemini-pro-2026-03-07"],
      providerFamily: "google",
      runModes: ["eval"],
      toolProfiles: ["lean4-proof"]
    }
  ],
  redirectPattern: "/runs/:runId",
  runKinds: [
    {
      description: "Run one benchmark item and preserve per-attempt evidence in run detail.",
      id: "single_run",
      requiredFields: ["benchmarkVersionId", "modelConfigId"]
    },
    {
      description: "Run a pre-defined benchmark slice with bounded fan-out.",
      id: "benchmark_slice",
      requiredFields: ["benchmarkVersionId", "modelConfigId"]
    },
    {
      description: "Run the full benchmark package within the current governance caps.",
      id: "full_benchmark",
      requiredFields: ["benchmarkVersionId", "modelConfigId"]
    },
    {
      description: "Repeat one benchmark configuration N times for stability analysis.",
      id: "repeated_n",
      requiredFields: ["benchmarkVersionId", "modelConfigId", "repeatCount"]
    }
  ],
  submissionMode: "preflight_only"
};

const localWorkersView: PortalWorkersViewResponse = {
  activeLeases: [
    {
      attemptId: "ATT-319-2",
      heartbeatIntervalSeconds: 30,
      heartbeatTimeoutSeconds: 120,
      health: "healthy",
      jobId: "JOB-319-2",
      lastEventSequence: 41,
      lastHeartbeatAt: "2026-03-13T16:05:58.000Z",
      leaseExpiresAt: "2026-03-13T16:07:58.000Z",
      runId: "PP-319",
      workerId: "worker-modal-eu-2",
      workerPool: "modal-proof",
      workerRuntime: "modal",
      workerVersion: "2026.03.12"
    },
    {
      attemptId: "ATT-320-3",
      heartbeatIntervalSeconds: 30,
      heartbeatTimeoutSeconds: 120,
      health: "stale",
      jobId: "JOB-320-3",
      lastEventSequence: 12,
      lastHeartbeatAt: "2026-03-13T15:01:55.000Z",
      leaseExpiresAt: "2026-03-13T15:03:55.000Z",
      runId: "PP-320",
      workerId: "worker-local-3",
      workerPool: "local-devbox",
      workerRuntime: "local_docker",
      workerVersion: "2026.03.11"
    }
  ],
  generatedAt: "2026-03-13T16:06:00.000Z",
  incidents: [
    {
      affectedRunIds: ["PP-320"],
      kind: "stale_lease",
      observedAt: "2026-03-13T15:03:55.000Z",
      severity: "critical",
      summary: "A stale lease expired on the local-devbox pool while PP-320 was retrying.",
      workerPool: "local-devbox"
    },
    {
      affectedRunIds: ["PP-321"],
      kind: "queue_backlog",
      observedAt: "2026-03-13T16:16:00.000Z",
      severity: "warning",
      summary: "Queued slice work is waiting on modal-proof capacity.",
      workerPool: "modal-proof"
    }
  ],
  queueSummary: {
    activeRuns: 1,
    cancelRequestedJobs: 0,
    claimedJobs: 1,
    queuedJobs: 2,
    queuedRuns: 1,
    runningJobs: 1
  },
  workerPools: [
    {
      activeLeaseCount: 1,
      activeRunIds: ["PP-319"],
      staleLeaseCount: 0,
      workerPool: "modal-proof",
      workerRuntime: "modal",
      workerVersion: "2026.03.12"
    },
    {
      activeLeaseCount: 1,
      activeRunIds: ["PP-320"],
      staleLeaseCount: 1,
      workerPool: "local-devbox",
      workerRuntime: "local_docker",
      workerVersion: "2026.03.11"
    }
  ]
};

function parseNullableParam(value: string | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function createRunsListResponse(query: PortalRunsListQuery): PortalRunsListResponse {
  const filteredItems = sortPortalRuns(
    localRunItems.filter((item) => matchesPortalRunsQuery(item, query)),
    query.sort
  );
  const limitedItems = filteredItems.slice(0, query.limit);

  return {
    items: limitedItems,
    query,
    summary: {
      activeRuns: filteredItems.filter((item) => item.runLifecycleBucket === "active").length,
      failedRuns: filteredItems.filter((item) => item.runLifecycleBucket === "terminal_failure")
        .length,
      returnedCount: limitedItems.length,
      totalMatches: filteredItems.length,
      verdictCounts: {
        fail: filteredItems.filter((item) => item.verdictClass === "fail").length,
        invalid_result: filteredItems.filter((item) => item.verdictClass === "invalid_result")
          .length,
        pass: filteredItems.filter((item) => item.verdictClass === "pass").length
      }
    }
  };
}

function matchesPortalRunsQuery(item: PortalRunListItem, query: PortalRunsListQuery) {
  if (query.runId && item.runId !== query.runId) {
    return false;
  }

  if (query.jobId && item.latestJobId !== query.jobId && !item.lineage.jobIds.includes(query.jobId)) {
    return false;
  }

  if (
    query.attemptId &&
    item.latestAttemptId !== query.attemptId &&
    !item.lineage.attemptIds.includes(query.attemptId)
  ) {
    return false;
  }

  if (query.lifecycleBucket && item.runLifecycleBucket !== query.lifecycleBucket) {
    return false;
  }

  if (query.runLifecycle.length > 0 && !query.runLifecycle.includes(item.runState)) {
    return false;
  }

  if (query.verdict.length > 0 && !query.verdict.includes(item.verdictClass)) {
    return false;
  }

  if (query.providerFamily && item.providerFamily !== query.providerFamily) {
    return false;
  }

  if (query.modelConfigId && item.modelConfigId !== query.modelConfigId) {
    return false;
  }

  if (query.runKind && item.runKind !== query.runKind) {
    return false;
  }

  if (query.authMode && item.authMode !== query.authMode) {
    return false;
  }

  if (query.runMode && item.runMode !== query.runMode) {
    return false;
  }

  if (query.toolProfile && item.toolProfile !== query.toolProfile) {
    return false;
  }

  if (query.benchmarkPackageId && item.benchmarkPackageId !== query.benchmarkPackageId) {
    return false;
  }

  if (query.benchmarkPackageVersion && item.benchmarkPackageVersion !== query.benchmarkPackageVersion) {
    return false;
  }

  if (query.benchmarkPackageDigest && item.benchmarkPackageDigest !== query.benchmarkPackageDigest) {
    return false;
  }

  if (query.failureCode && item.failure.code !== query.failureCode) {
    return false;
  }

  if (query.failureFamily && item.failure.family !== query.failureFamily) {
    return false;
  }

  if (query.q) {
    const haystack = [
      item.runId,
      item.latestJobId,
      item.latestAttemptId,
      item.benchmarkLabel,
      item.benchmarkPackageId,
      item.benchmarkPackageVersion,
      item.modelConfigLabel,
      item.modelConfigId,
      item.providerFamily,
      item.runMode,
      item.toolProfile,
      item.failure.code,
      item.failure.family,
      item.failure.summary
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (!haystack.includes(query.q.toLowerCase())) {
      return false;
    }
  }

  return true;
}

function sortPortalRuns(items: PortalRunListItem[], sortId: PortalRunsSortId) {
  return [...items].sort((left, right) => {
    switch (sortId) {
      case "finished_at_desc":
        return Date.parse(right.completedAt) - Date.parse(left.completedAt);
      case "duration_desc":
        return right.durationMs - left.durationMs;
      case "run_state_asc":
        return portalRunLifecycleStateOrder[left.runState] - portalRunLifecycleStateOrder[right.runState];
      case "verdict_asc":
        return portalVerdictOrder[left.verdictClass] - portalVerdictOrder[right.verdictClass];
      case "started_at_desc":
      default:
        return Date.parse(right.startedAt) - Date.parse(left.startedAt);
    }
  });
}

async function fetchPortalBenchmarkOpsJson<T>(
  path: string,
  schema: { parse: (value: unknown) => T }
): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}.`);
  }

  return schema.parse(await response.json());
}

export function parsePortalRunsQuery(search: string): PortalRunsListQuery {
  const params = new URLSearchParams(search);
  const sortCandidate = params.get("sort");
  const lifecycleCandidate = params.get("lifecycleBucket");

  return portalRunsListQuerySchema.parse({
    attemptId: parseNullableParam(params.get("attemptId")),
    authMode: parseNullableParam(params.get("authMode")),
    benchmarkPackageDigest: parseNullableParam(params.get("benchmarkPackageDigest")),
    benchmarkPackageId: parseNullableParam(params.get("benchmarkPackageId")),
    benchmarkPackageVersion: parseNullableParam(params.get("benchmarkPackageVersion")),
    failureCode: parseNullableParam(params.get("failureCode")),
    failureFamily: parseNullableParam(params.get("failureFamily")),
    jobId: parseNullableParam(params.get("jobId")),
    lifecycleBucket: portalRunsLifecycleBuckets.some((bucket) => bucket.id === lifecycleCandidate)
      ? lifecycleCandidate
      : null,
    limit: parseNullableParam(params.get("limit")) ?? defaultPortalRunsQuery.limit,
    modelConfigId: parseNullableParam(params.get("modelConfigId")),
    providerFamily: parseNullableParam(params.get("providerFamily")),
    q: parseNullableParam(params.get("q")),
    runId: parseNullableParam(params.get("runId")),
    runKind: parseNullableParam(params.get("runKind")),
    runLifecycle: params.get("runLifecycle") ?? undefined,
    runMode: parseNullableParam(params.get("runMode")),
    sort: portalRunsSortIds.includes((sortCandidate ?? "") as PortalRunsSortId)
      ? sortCandidate
      : defaultPortalRunsQuery.sort,
    toolProfile: parseNullableParam(params.get("toolProfile")),
    verdict: params.get("verdict") ?? undefined
  });
}

export function buildPortalRunsQueryString(query: PortalRunsListQuery) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value == null) {
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length > 0) {
        params.set(key, value.join(","));
      }
      continue;
    }

    if (key === "limit") {
      if (value !== defaultPortalRunsQuery.limit) {
        params.set(key, String(value));
      }
      continue;
    }

    if (key === "sort") {
      if (value !== defaultPortalRunsQuery.sort) {
        params.set(key, String(value));
      }
      continue;
    }

    params.set(key, String(value));
  }

  return params.toString();
}

export function buildRunsCsv(items: PortalRunListItem[]) {
  const headers = [
    "runId",
    "benchmarkLabel",
    "modelConfigLabel",
    "providerFamily",
    "runKind",
    "runState",
    "verdictClass",
    "latestJobId",
    "latestAttemptId",
    "failureFamily",
    "failureCode",
    "startedAt",
    "completedAt",
    "durationMs"
  ];

  const rows = items.map((item) => [
    item.runId,
    item.benchmarkLabel,
    item.modelConfigLabel,
    item.providerFamily,
    item.runKind,
    item.runState,
    item.verdictClass,
    item.latestJobId ?? "",
    item.latestAttemptId ?? "",
    item.failure.family ?? "",
    item.failure.code ?? "",
    item.startedAt,
    item.completedAt,
    String(item.durationMs)
  ]);

  return [headers, ...rows]
    .map((row) => row.map((value) => escapeCsvValue(value)).join(","))
    .join("\n");
}

function escapeCsvValue(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

export function getWorkerIncidentTone(severity: PortalWorkerIncidentSeverity) {
  return `portal-severity-${severity}`;
}

export function getLocalOverviewTimeline() {
  return [
    {
      detail: "PP-319 is active on modal-proof, while PP-320 is the current worker incident anchor.",
      meta: "Benchmark ops",
      title: "Runs and workers share one evidence trail"
    },
    {
      detail: "Problem 9 core remains the default launch package with one queued slice run ready to inspect.",
      meta: "Launch",
      title: "Launch stays preflight-only until create-run lands"
    },
    {
      detail: "Overview routes into Runs, Launch, and Workers without duplicating their state tables.",
      meta: "Portal shape",
      title: "Cluster boundaries remain intact"
    }
  ];
}

export async function fetchPortalRunsView(query: PortalRunsListQuery) {
  if (isLocalHostname(window.location.hostname)) {
    return portalRunsListResponseSchema.parse(createRunsListResponse(query));
  }

  const queryString = buildPortalRunsQueryString(query);
  return fetchPortalBenchmarkOpsJson(
    `/portal/runs${queryString ? `?${queryString}` : ""}`,
    portalRunsListResponseSchema
  );
}

export async function fetchPortalRunDetail(runId: string) {
  if (isLocalHostname(window.location.hostname)) {
    const detail = localRunDetailById[runId];

    if (!detail) {
      throw new Error(`Run ${runId} was not found.`);
    }

    return portalRunDetailResponseSchema.parse(detail);
  }

  return fetchPortalBenchmarkOpsJson(
    `/portal/runs/${encodeURIComponent(runId)}`,
    portalRunDetailResponseSchema
  );
}

export async function fetchPortalLaunchView() {
  if (isLocalHostname(window.location.hostname)) {
    return portalLaunchViewResponseSchema.parse(localLaunchView);
  }

  return fetchPortalBenchmarkOpsJson("/portal/launch", portalLaunchViewResponseSchema);
}

export async function fetchPortalWorkersView() {
  if (isLocalHostname(window.location.hostname)) {
    return portalWorkersViewResponseSchema.parse(localWorkersView);
  }

  return fetchPortalBenchmarkOpsJson("/portal/workers", portalWorkersViewResponseSchema);
}
