import type {
  AttemptLifecycleStateCatalogEntry,
  JobLifecycleStateCatalogEntry,
  RunKindCatalogEntry,
  RunLifecycleStateCatalogEntry
} from "../types/run-control.js";

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

export const jobLifecycleCatalog = [
  {
    allowedNextStates: ["claimed", "cancel_requested"],
    id: "queued",
    rationale:
      "The job exists in durable state and is waiting for an ingest processor or worker assignment.",
    terminal: false
  },
  {
    allowedNextStates: ["running", "cancel_requested", "failed"],
    id: "claimed",
    rationale:
      "The job is leased to one processor, but active execution or import has not fully started yet.",
    terminal: false
  },
  {
    allowedNextStates: ["completed", "failed", "cancel_requested"],
    id: "running",
    rationale:
      "The job is actively executing or importing artifacts and is expected to produce one terminal outcome.",
    terminal: false
  },
  {
    allowedNextStates: ["cancelled", "failed"],
    id: "cancel_requested",
    rationale:
      "An authorized actor requested stop, but the control plane has not finalized the job outcome yet.",
    terminal: false
  },
  {
    allowedNextStates: [],
    id: "completed",
    rationale:
      "The job reached a normal terminal completion and produced its canonical result payload.",
    terminal: true
  },
  {
    allowedNextStates: [],
    id: "failed",
    rationale:
      "The job ended with a terminal failure and requires a new job or operator intervention before retrying.",
    terminal: true
  },
  {
    allowedNextStates: [],
    id: "cancelled",
    rationale:
      "The job was intentionally stopped and should be treated as a closed terminal outcome.",
    terminal: true
  }
] satisfies JobLifecycleStateCatalogEntry[];

export const attemptLifecycleCatalog = [
  {
    allowedNextStates: ["active"],
    id: "prepared",
    rationale:
      "Attempt identity and inputs are allocated, but execution has not fully started yet.",
    terminal: false
  },
  {
    allowedNextStates: ["succeeded", "failed", "cancelled"],
    id: "active",
    rationale:
      "The attempt is live inside the execution phase machine and may still emit progress before it terminates.",
    terminal: false
  },
  {
    allowedNextStates: [],
    id: "succeeded",
    rationale:
      "The attempt completed with a structurally valid terminal success payload.",
    terminal: true
  },
  {
    allowedNextStates: [],
    id: "failed",
    rationale:
      "The attempt completed with a terminal benchmark failure or invalid imported result.",
    terminal: true
  },
  {
    allowedNextStates: [],
    id: "cancelled",
    rationale:
      "The attempt was intentionally stopped before normal completion.",
    terminal: true
  }
] satisfies AttemptLifecycleStateCatalogEntry[];
