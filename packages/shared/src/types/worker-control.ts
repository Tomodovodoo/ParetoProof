import type { RunKind } from "./run-control.js";

export type WorkerControlEndpointId =
  | "internal.worker.claim"
  | "internal.worker.heartbeat"
  | "internal.worker.event.report"
  | "internal.worker.artifact-manifest.submit"
  | "internal.worker.result.submit"
  | "internal.worker.failure.submit";

export type WorkerLeaseStatus =
  | "idle"
  | "active"
  | "cancel_requested"
  | "expired";

export type WorkerExecutionPhase =
  | "prepare"
  | "generate"
  | "tool"
  | "compile"
  | "verify"
  | "finalize"
  | "cancel";

export type WorkerJobTokenScope =
  | "heartbeat"
  | "event_append"
  | "artifact_manifest_write"
  | "verifier_verdict_write"
  | "result_finalize"
  | "failure_finalize";

export type WorkerBundleArtifactRole =
  | "run_manifest"
  | "package_reference"
  | "prompt_package"
  | "candidate_source"
  | "verdict_record"
  | "compiler_output"
  | "compiler_diagnostics"
  | "verifier_output"
  | "environment_snapshot"
  | "usage_summary"
  | "execution_trace";

export type WorkerExecutionEventKind =
  | "attempt_started"
  | "compile_started"
  | "compile_succeeded"
  | "compile_failed"
  | "compile_repair_requested"
  | "compile_repair_applied"
  | "verifier_started"
  | "verifier_passed"
  | "verifier_failed"
  | "verifier_repair_requested"
  | "verifier_repair_applied"
  | "budget_exhausted"
  | "artifact_manifest_written"
  | "bundle_finalized";

export type WorkerFailureFamily =
  | "provider"
  | "harness"
  | "tooling"
  | "budget"
  | "compile"
  | "verification"
  | "input_contract";

export type WorkerFailureTerminality =
  | "terminal_attempt"
  | "retryable_outer"
  | "cancelled";

export type WorkerFailureRetryEligibility =
  | "never"
  | "outer_retry_allowed"
  | "manual_retry_only";

export type WorkerFailureUserVisibility =
  | "user_visible"
  | "user_visible_sanitized"
  | "internal_only";

export type WorkerFailureCode =
  | "provider_auth_error"
  | "provider_rate_limited"
  | "provider_transport_error"
  | "provider_timeout"
  | "provider_cancelled"
  | "provider_refusal"
  | "provider_unsupported_request"
  | "provider_malformed_response"
  | "provider_tool_contract_error"
  | "provider_internal_error"
  | "harness_bootstrap_failed"
  | "harness_crashed"
  | "harness_output_missing"
  | "tool_bootstrap_failed"
  | "tool_contract_violation"
  | "tool_permission_violation"
  | "tool_use_outside_policy"
  | "tool_result_missing"
  | "stuck_loop_detected"
  | "wall_clock_budget_exhausted"
  | "provider_usage_budget_exhausted"
  | "turn_budget_exhausted"
  | "compile_repair_budget_exhausted"
  | "verifier_repair_budget_exhausted"
  | "manual_cancelled"
  | "compile_failed"
  | "candidate_output_missing"
  | "candidate_output_malformed"
  | "candidate_file_outside_contract"
  | "forbidden_placeholder_token"
  | "theorem_reference_missing"
  | "theorem_semantic_mismatch"
  | "extra_theorem_assumptions"
  | "wrong_theorem_target"
  | "forbidden_axiom_dependency"
  | "environment_instability_detected"
  | "proof_policy_failed"
  | "benchmark_input_missing"
  | "benchmark_input_digest_mismatch"
  | "lane_configuration_invalid"
  | "prompt_package_missing"
  | "run_configuration_invalid"
  | "worker_lease_lost";

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

export type WorkerFailureClassification = {
  evidenceArtifactRefs: string[];
  failureCode: WorkerFailureCode;
  failureFamily: WorkerFailureFamily;
  phase: WorkerExecutionPhase;
  retryEligibility: WorkerFailureRetryEligibility;
  summary: string;
  terminality: WorkerFailureTerminality;
  userVisibility: WorkerFailureUserVisibility;
};

export type WorkerVerifierVerdict = {
  attemptId: string;
  axiomCheck: "passed" | "failed" | "not_evaluated";
  benchmarkPackageDigest: string;
  candidateDigest: string;
  containsAdmit: boolean;
  containsSorry: boolean;
  diagnosticGate: "passed" | "failed";
  laneId: string;
  primaryFailure: WorkerFailureClassification | null;
  result: "pass" | "fail";
  semanticEquality: "matched" | "mismatched" | "not_evaluated";
  surfaceEquality: "matched" | "drifted" | "not_evaluated";
  verdictSchemaVersion: string;
};

export type WorkerClaimRequest = {
  activeJobCount: number;
  availableRunKinds: RunKind[];
  maxConcurrentJobs: number;
  supportedArtifactRoles: WorkerBundleArtifactRole[];
  supportsOfflineBundleContract: boolean;
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
        heartbeatTimeoutSeconds: number;
        jobId: string;
        jobToken: string;
        jobTokenExpiresAt: string;
        jobTokenScopes: WorkerJobTokenScope[];
        leaseExpiresAt: string;
        leaseId: string;
        offlineBundleCompatible: true;
        requiredArtifactRoles: WorkerBundleArtifactRole[];
        runBundleSchemaVersion: string;
        runId: string;
        target: WorkerRunTarget;
      };
    };

export type WorkerHeartbeatRequest = {
  attemptId: string;
  jobId: string;
  lastEventSequence: number;
  leaseId: string;
  observedAt: string;
  phase: WorkerExecutionPhase;
  progressMessage: string | null;
};

export type WorkerHeartbeatResponse = {
  acknowledgedEventSequence: number;
  cancelRequested: boolean;
  jobToken: string | null;
  jobTokenExpiresAt: string | null;
  leaseExpiresAt: string | null;
  leaseStatus: WorkerLeaseStatus;
};

export type WorkerExecutionEvent = {
  attemptId: string;
  details: Record<string, unknown>;
  eventKind: WorkerExecutionEventKind;
  jobId: string;
  leaseId: string;
  phase: WorkerExecutionPhase;
  recordedAt: string;
  sequence: number;
  summary: string;
};

export type WorkerArtifactManifestEntry = {
  artifactRole: WorkerBundleArtifactRole;
  byteSize: number;
  contentEncoding: string | null;
  mediaType: string | null;
  relativePath: string;
  requiredForIngest: boolean;
  sha256: string;
};

export type WorkerArtifactManifestRequest = {
  artifacts: WorkerArtifactManifestEntry[];
  artifactManifestDigest: string;
  attemptId: string;
  jobId: string;
  leaseId: string;
  recordedAt: string;
};

export type WorkerArtifactManifestResponse = {
  acceptedAt: string;
  artifactManifestDigest: string;
  artifacts: Array<{
    artifactId: string;
    artifactRole: WorkerBundleArtifactRole;
    relativePath: string;
  }>;
};

export type WorkerResultMessageRequest = {
  artifactIds: string[];
  artifactManifestDigest: string;
  attemptId: string;
  bundleDigest: string;
  candidateDigest: string;
  completedAt: string;
  environmentDigest: string;
  jobId: string;
  leaseId: string;
  offlineBundleCompatible: true;
  runId: string;
  summary: string;
  usageSummary: Record<string, unknown> | null;
  verifierVerdict: WorkerVerifierVerdict;
  verdictDigest: string;
};

export type WorkerTerminalFailureRequest = {
  artifactIds?: string[];
  artifactManifestDigest: string | null;
  attemptId: string;
  bundleDigest: string | null;
  candidateDigest: string | null;
  failedAt: string;
  failure: WorkerFailureClassification;
  jobId: string;
  leaseId: string;
  runId: string;
  summary: string;
  terminalState: "failed" | "cancelled";
  verifierVerdict: WorkerVerifierVerdict | null;
  verdictDigest: string | null;
};

export type WorkerExecutionEventCatalogEntry = {
  id: WorkerExecutionEventKind;
  purpose: string;
};

export type WorkerTerminalFailureCatalogEntry = {
  id: WorkerFailureCode;
  purpose: string;
};

export type WorkerJobTokenScopeCatalogEntry = {
  id: WorkerJobTokenScope;
  purpose: string;
};
