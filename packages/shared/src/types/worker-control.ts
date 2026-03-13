import type { RunKind } from "./run-control.js";

export type WorkerControlEndpointId =
  | "internal.worker.claim"
  | "internal.worker.heartbeat"
  | "internal.worker.event.report"
  | "internal.worker.artifact-manifest.submit"
  | "internal.worker.result.submit"
  | "internal.worker.failure.submit";

export type WorkerExecutionEventType =
  | "started"
  | "progress"
  | "warning"
  | "log"
  | "checkpoint";

export type WorkerTerminalFailureCode =
  | "runtime_error"
  | "harness_error"
  | "model_provider_error"
  | "artifact_error"
  | "lease_lost"
  | "cancelled";

export type WorkerLeaseStatus = "active" | "cancel_requested" | "expired";

export type WorkerRunTarget =
  | {
      benchmarkVersionId: string;
      modelConfigId: string;
      runKind: "full_benchmark";
    }
  | {
      benchmarkVersionId: string;
      modelConfigId: string;
      runKind: "benchmark_slice";
      sliceDefinition: string;
    }
  | {
      benchmarkItemId: string;
      modelConfigId: string;
      runKind: "single_run";
    }
  | {
      benchmarkTargetId: string;
      modelConfigId: string;
      repeatCount: number;
      runKind: "repeated_n";
    };

export type WorkerClaimRequest = {
  activeJobCount: number;
  availableRunKinds: RunKind[];
  maxConcurrentJobs: number;
  supportsArtifactUploads: boolean;
  supportsTraceUploads: boolean;
  workerId: string;
  workerPool: string;
  workerRuntime: "local_docker" | "modal";
  workerVersion: string;
};

export type WorkerClaimResponse =
  | {
      leaseStatus: "idle";
      pollAfterSeconds: number;
      workerJob: null;
    }
  | {
      leaseStatus: "active";
      pollAfterSeconds: number;
      workerJob: {
        attemptId: string;
        heartbeatIntervalSeconds: number;
        jobId: string;
        leaseId: string;
        leaseExpiresAt: string;
        jobToken: string;
        jobTokenExpiresAt: string;
        runId: string;
        target: WorkerRunTarget;
      };
    };

export type WorkerHeartbeatRequest = {
  attemptId: string;
  jobId: string;
  leaseId: string;
  observedAt: string;
  progressMessage: string | null;
};

export type WorkerHeartbeatResponse = {
  jobToken: string | null;
  jobTokenExpiresAt: string | null;
  leaseExpiresAt: string | null;
  leaseStatus: WorkerLeaseStatus;
};

export type WorkerExecutionEvent = {
  attemptId: string;
  details: Record<string, unknown>;
  eventType: WorkerExecutionEventType;
  jobId: string;
  leaseId: string;
  message: string;
  recordedAt: string;
  sequence: number;
};

export type WorkerArtifactManifestEntry = {
  artifactClassId: string;
  byteSize: number | null;
  contentEncoding: string | null;
  fileName: string;
  mediaType: string | null;
  relativePath: string;
  sha256: string | null;
};

export type WorkerArtifactManifestRequest = {
  artifacts: WorkerArtifactManifestEntry[];
  attemptId: string;
  jobId: string;
  leaseId: string;
  recordedAt: string;
};

export type WorkerArtifactManifestResponse = {
  acceptedAt: string;
  artifacts: Array<{
    artifactClassId: string;
    artifactId: string;
    relativePath: string;
  }>;
};

export type WorkerResultMessageRequest = {
  attemptId: string;
  completedAt: string;
  jobId: string;
  leaseId: string;
  resultArtifacts: string[];
  resultData: Record<string, unknown>;
  status: "succeeded";
  summary: string;
};

export type WorkerTerminalFailureRequest = {
  attemptId: string;
  code: WorkerTerminalFailureCode;
  details: Record<string, unknown>;
  failedAt: string;
  jobId: string;
  leaseId: string;
  message: string;
};

export type WorkerExecutionEventCatalogEntry = {
  id: WorkerExecutionEventType;
  purpose: string;
};

export type WorkerTerminalFailureCatalogEntry = {
  id: WorkerTerminalFailureCode;
  purpose: string;
};
