import type { RunKind } from "./run-control.js";

export type RunFailureReason =
  | "worker_crash"
  | "worker_lease_timeout"
  | "provider_rate_limited"
  | "provider_transport_error"
  | "artifact_upload_transient"
  | "internal_transient"
  | "validation_error"
  | "artifact_contract_error"
  | "budget_exhausted"
  | "manual_cancel";

export type RunFailureReasonCatalogEntry = {
  consumesRetryBudget: boolean;
  id: RunFailureReason;
  retryable: boolean;
  terminalRunFailure: boolean;
  rationale: string;
};

export type RunRetryPolicy = {
  initialBackoffSeconds: number;
  maxAttemptsPerJob: number;
  maxAttemptsPerRun: number;
  maxBackoffSeconds: number;
  backoffMultiplier: number;
  retryableReasons: RunFailureReason[];
};

export type RunCancellationPolicy = {
  heartbeatStaleSeconds: number;
  cancelRequestGraceSeconds: number;
  forcedCancelAfterSeconds: number;
};

export type RunConcurrencyPolicy = {
  maxActiveRunsGlobal: number;
  maxActiveRunsPerContributor: number;
  maxConcurrentJobsPerRun: number;
  maxQueuedRunsPerContributor: number;
};

export type RunBudgetPolicy = {
  maxEstimatedUsdPerRun: number;
  maxInputTokensPerRun: number;
  maxOutputTokensPerRun: number;
  maxWallClockMinutesPerRun: number;
  budgetExceededTerminalState: "failed";
};

export type RunControlPolicy = {
  budget: RunBudgetPolicy;
  cancellation: RunCancellationPolicy;
  concurrency: RunConcurrencyPolicy;
  retry: RunRetryPolicy;
};

export type RunKindConcurrencyOverride = {
  id: RunKind;
  maxConcurrentJobsPerRun: number;
  rationale: string;
};
