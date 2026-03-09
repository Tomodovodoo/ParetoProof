import type {
  RunKindCatalogEntry,
  RunLifecycleStateCatalogEntry
} from "../types/run-control";

export const runKindCatalog = [
  {
    description:
      "Launch the full published benchmark version against one model configuration.",
    id: "full_benchmark",
    requiredFields: ["benchmarkVersionId", "modelConfigId"]
  },
  {
    description:
      "Launch a bounded subset of one benchmark version, typically for smoke checks or focused regression work.",
    id: "benchmark_slice",
    requiredFields: ["benchmarkVersionId", "modelConfigId", "sliceDefinition"]
  },
  {
    description:
      "Execute one benchmark item or one curated prompt/problem pair end-to-end.",
    id: "single_run",
    requiredFields: ["benchmarkItemId", "modelConfigId"]
  },
  {
    description:
      "Repeat the same benchmark item or slice multiple times to measure variance or flaky behavior.",
    id: "repeated_n",
    requiredFields: ["benchmarkTargetId", "modelConfigId", "repeatCount"]
  }
] satisfies RunKindCatalogEntry[];

// The control plane stays linear in MVP so later worker and budgeting logic can assume one durable terminal state per run.
export const runLifecycleCatalog = [
  {
    allowedNextStates: ["queued", "cancelled"],
    id: "created",
    rationale:
      "The run record exists and has passed initial request validation, but it has not entered the scheduling queue yet.",
    terminal: false
  },
  {
    allowedNextStates: ["running", "cancel_requested", "failed", "cancelled"],
    id: "queued",
    rationale:
      "The run is accepted by the control plane and waiting for execution capacity or worker assignment.",
    terminal: false
  },
  {
    allowedNextStates: ["succeeded", "failed", "cancel_requested"],
    id: "running",
    rationale:
      "A worker has started execution and the run is expected to emit heartbeats, logs, and result updates.",
    terminal: false
  },
  {
    allowedNextStates: ["cancelled", "failed"],
    id: "cancel_requested",
    rationale:
      "An authorized actor has asked to stop the run, but the worker or control plane has not finalized that shutdown yet.",
    terminal: false
  },
  {
    allowedNextStates: [],
    id: "succeeded",
    rationale:
      "The run completed normally and produced a final result set that no longer changes.",
    terminal: true
  },
  {
    allowedNextStates: [],
    id: "failed",
    rationale:
      "The run stopped with a terminal error that needs operator or developer intervention before retrying.",
    terminal: true
  },
  {
    allowedNextStates: [],
    id: "cancelled",
    rationale:
      "The run was intentionally stopped and the control plane should treat it as a closed terminal outcome.",
    terminal: true
  }
] satisfies RunLifecycleStateCatalogEntry[];
