import type {
  RunControlPolicy,
  RunFailureReasonCatalogEntry,
  RunKindConcurrencyOverride
} from "../types/run-governance.js";

export const runFailureReasonCatalog = [
  {
    consumesRetryBudget: true,
    id: "worker_crash",
    retryable: true,
    terminalRunFailure: false,
    rationale:
      "The worker process crashed before producing a valid terminal result; retry is likely to recover."
  },
  {
    consumesRetryBudget: true,
    id: "worker_lease_timeout",
    retryable: true,
    terminalRunFailure: false,
    rationale:
      "The job lease expired or heartbeats stalled; retry may succeed on a healthy worker."
  },
  {
    consumesRetryBudget: false,
    id: "provider_rate_limited",
    retryable: true,
    terminalRunFailure: false,
    rationale:
      "Upstream provider throttling is expected to clear and should not consume the normal retry budget."
  },
  {
    consumesRetryBudget: true,
    id: "provider_transport_error",
    retryable: true,
    terminalRunFailure: false,
    rationale:
      "Network or transient provider transport failures can recover on subsequent attempts."
  },
  {
    consumesRetryBudget: true,
    id: "artifact_upload_transient",
    retryable: true,
    terminalRunFailure: false,
    rationale:
      "Temporary storage write failures can recover and should be retried with backoff."
  },
  {
    consumesRetryBudget: true,
    id: "internal_transient",
    retryable: true,
    terminalRunFailure: false,
    rationale:
      "Known transient internal control-plane errors should be retried within limits."
  },
  {
    consumesRetryBudget: false,
    id: "validation_error",
    retryable: false,
    terminalRunFailure: true,
    rationale:
      "Invalid launch payload or run configuration is deterministic and should fail immediately."
  },
  {
    consumesRetryBudget: false,
    id: "artifact_contract_error",
    retryable: false,
    terminalRunFailure: true,
    rationale:
      "Artifact checksum or contract violations indicate deterministic incompatibility, not transient failure."
  },
  {
    consumesRetryBudget: false,
    id: "budget_exhausted",
    retryable: false,
    terminalRunFailure: true,
    rationale:
      "Budget guardrail trips are policy outcomes; auto-retry would overspend by definition."
  },
  {
    consumesRetryBudget: false,
    id: "manual_cancel",
    retryable: false,
    terminalRunFailure: false,
    rationale:
      "User or admin cancellation is terminal for the current run and should not auto-restart."
  }
] satisfies RunFailureReasonCatalogEntry[];

export const defaultRunControlPolicy = {
  budget: {
    budgetExceededTerminalState: "failed",
    maxEstimatedUsdPerRun: 25,
    maxInputTokensPerRun: 5_000_000,
    maxOutputTokensPerRun: 1_000_000,
    maxWallClockMinutesPerRun: 120
  },
  cancellation: {
    cancelRequestGraceSeconds: 120,
    forcedCancelAfterSeconds: 600,
    heartbeatStaleSeconds: 180
  },
  concurrency: {
    maxActiveRunsGlobal: 20,
    maxActiveRunsPerContributor: 3,
    maxConcurrentJobsPerRun: 4,
    maxQueuedRunsPerContributor: 6
  },
  retry: {
    backoffMultiplier: 2,
    initialBackoffSeconds: 30,
    maxAttemptsPerJob: 3,
    maxAttemptsPerRun: 12,
    maxBackoffSeconds: 600,
    retryableReasons: runFailureReasonCatalog
      .filter((entry) => entry.retryable)
      .map((entry) => entry.id)
  }
} satisfies RunControlPolicy;

export const runKindConcurrencyOverrides = [
  {
    id: "full_benchmark",
    maxConcurrentJobsPerRun: 8,
    rationale:
      "Full benchmark runs are throughput-oriented and can use wider worker fan-out."
  },
  {
    id: "benchmark_slice",
    maxConcurrentJobsPerRun: 4,
    rationale:
      "Slices should finish quickly without starving full benchmark capacity."
  },
  {
    id: "single_run",
    maxConcurrentJobsPerRun: 1,
    rationale:
      "Single-run diagnostics are serialized for deterministic debugging."
  },
  {
    id: "repeated_n",
    maxConcurrentJobsPerRun: 2,
    rationale:
      "Variance probes run with light parallelism to preserve budget control."
  }
] satisfies RunKindConcurrencyOverride[];
