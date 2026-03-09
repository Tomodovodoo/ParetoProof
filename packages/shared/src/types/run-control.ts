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
