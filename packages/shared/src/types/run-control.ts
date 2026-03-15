export const runKindValues = [
  "full_benchmark",
  "benchmark_slice",
  "single_run",
  "repeated_n"
] as const;

export type RunKind = (typeof runKindValues)[number];

export const runLifecycleStates = [
  "created",
  "queued",
  "running",
  "cancel_requested",
  "succeeded",
  "failed",
  "cancelled"
] as const;

export type RunLifecycleState = (typeof runLifecycleStates)[number];

export const jobLifecycleStates = [
  "queued",
  "claimed",
  "running",
  "cancel_requested",
  "completed",
  "failed",
  "cancelled"
] as const;

export type JobLifecycleState = (typeof jobLifecycleStates)[number];

export const attemptLifecycleStates = [
  "prepared",
  "active",
  "succeeded",
  "failed",
  "cancelled"
] as const;

export type AttemptLifecycleState = (typeof attemptLifecycleStates)[number];

export const evaluationVerdictClasses = [
  "pass",
  "fail",
  "invalid_result"
] as const;

export type EvaluationVerdictClass = (typeof evaluationVerdictClasses)[number];

export const offlineIngestRunLifecycleStates = [
  "succeeded",
  "failed"
] as const satisfies readonly RunLifecycleState[];

export type OfflineIngestRunLifecycleState =
  (typeof offlineIngestRunLifecycleStates)[number];

export const offlineIngestJobLifecycleStates = [
  "completed",
  "failed"
] as const satisfies readonly JobLifecycleState[];

export type OfflineIngestJobLifecycleState =
  (typeof offlineIngestJobLifecycleStates)[number];

export const offlineIngestAttemptLifecycleStates = [
  "succeeded",
  "failed"
] as const satisfies readonly AttemptLifecycleState[];

export type OfflineIngestAttemptLifecycleState =
  (typeof offlineIngestAttemptLifecycleStates)[number];

export const workerResultRunLifecycleStates = [
  "succeeded"
] as const satisfies readonly RunLifecycleState[];

export type WorkerResultRunLifecycleState =
  (typeof workerResultRunLifecycleStates)[number];

export const workerResultJobLifecycleStates = [
  "completed"
] as const satisfies readonly JobLifecycleState[];

export type WorkerResultJobLifecycleState =
  (typeof workerResultJobLifecycleStates)[number];

export const workerResultAttemptLifecycleStates = [
  "succeeded"
] as const satisfies readonly AttemptLifecycleState[];

export type WorkerResultAttemptLifecycleState =
  (typeof workerResultAttemptLifecycleStates)[number];

export const workerTerminalFailureRunLifecycleStates = [
  "failed",
  "cancelled"
] as const satisfies readonly RunLifecycleState[];

export type WorkerTerminalFailureRunLifecycleState =
  (typeof workerTerminalFailureRunLifecycleStates)[number];

export const workerTerminalFailureJobLifecycleStates = [
  "failed",
  "cancelled"
] as const satisfies readonly JobLifecycleState[];

export type WorkerTerminalFailureJobLifecycleState =
  (typeof workerTerminalFailureJobLifecycleStates)[number];

export const workerTerminalFailureAttemptLifecycleStates = [
  "failed",
  "cancelled"
] as const satisfies readonly AttemptLifecycleState[];

export type WorkerTerminalFailureAttemptLifecycleState =
  (typeof workerTerminalFailureAttemptLifecycleStates)[number];

export type RunKindCatalogEntry = {
  description: string;
  id: RunKind;
  requiredFields: string[];
};

export type RunLifecycleStateCatalogEntry = {
  allowedNextStates: RunLifecycleState[];
  id: RunLifecycleState;
  rationale: string;
  terminal: boolean;
};

export type JobLifecycleStateCatalogEntry = {
  allowedNextStates: JobLifecycleState[];
  id: JobLifecycleState;
  rationale: string;
  terminal: boolean;
};

export type AttemptLifecycleStateCatalogEntry = {
  allowedNextStates: AttemptLifecycleState[];
  id: AttemptLifecycleState;
  rationale: string;
  terminal: boolean;
};
