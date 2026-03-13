export type RunKind =
  | "full_benchmark"
  | "benchmark_slice"
  | "single_run"
  | "repeated_n";

export type RunLifecycleState =
  | "created"
  | "queued"
  | "running"
  | "cancel_requested"
  | "succeeded"
  | "failed"
  | "cancelled";

export type JobLifecycleState =
  | "queued"
  | "claimed"
  | "running"
  | "cancel_requested"
  | "completed"
  | "failed"
  | "cancelled";

export type AttemptLifecycleState =
  | "prepared"
  | "active"
  | "succeeded"
  | "failed"
  | "cancelled";

export type EvaluationVerdictClass = "pass" | "fail" | "invalid_result";

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
