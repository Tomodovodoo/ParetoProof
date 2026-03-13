import type {
  WorkerExecutionEventCatalogEntry,
  WorkerTerminalFailureCatalogEntry
} from "../types/worker-control.js";

export const workerExecutionEventCatalog = [
  {
    id: "started",
    purpose:
      "The worker accepted the assignment locally and has started execution after any required setup."
  },
  {
    id: "progress",
    purpose:
      "The worker reached a non-terminal progress milestone worth storing as structured run history."
  },
  {
    id: "warning",
    purpose:
      "The worker hit a recoverable issue that should remain visible even if the assignment later succeeds."
  },
  {
    id: "log",
    purpose:
      "The worker emitted a diagnostic checkpoint that belongs in indexed event history rather than only raw log bundles."
  },
  {
    id: "checkpoint",
    purpose:
      "The worker completed a meaningful internal stage such as environment setup, proof generation, or validation."
  }
] satisfies WorkerExecutionEventCatalogEntry[];

export const workerTerminalFailureCatalog = [
  {
    id: "runtime_error",
    purpose:
      "The worker runtime or orchestration layer failed before it could produce a valid success payload."
  },
  {
    id: "harness_error",
    purpose:
      "Benchmark or harness logic failed in a way that prevented normal completion for the assigned job."
  },
  {
    id: "model_provider_error",
    purpose:
      "A model provider request or credential path failed terminally for this assignment."
  },
  {
    id: "artifact_error",
    purpose:
      "A required artifact registration or upload step failed and the run cannot complete successfully."
  },
  {
    id: "lease_lost",
    purpose:
      "The worker lost the assignment lease through expiry or revocation before a terminal success result was submitted."
  },
  {
    id: "cancelled",
    purpose:
      "The worker stopped because the control plane requested cancellation and no success result should be recorded."
  }
] satisfies WorkerTerminalFailureCatalogEntry[];
