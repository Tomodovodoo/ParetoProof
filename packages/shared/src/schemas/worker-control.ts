import { z } from "zod";
import { runKindSchema } from "./run-control.js";

const timestampSchema = z.string().min(1);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i);
const recordValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(recordValueSchema),
    z.record(z.string(), recordValueSchema)
  ])
);
const metadataSchema = z.record(z.string(), recordValueSchema);

export const workerControlEndpointIdSchema = z.enum([
  "internal.worker.claim",
  "internal.worker.heartbeat",
  "internal.worker.event.report",
  "internal.worker.artifact-manifest.submit",
  "internal.worker.result.submit",
  "internal.worker.failure.submit"
]);

export const workerLeaseStatusSchema = z.enum([
  "idle",
  "active",
  "cancel_requested",
  "expired"
]);

export const workerExecutionPhaseSchema = z.enum([
  "prepare",
  "generate",
  "tool",
  "compile",
  "verify",
  "finalize",
  "cancel"
]);

export const workerJobTokenScopeSchema = z.enum([
  "heartbeat",
  "event_append",
  "artifact_manifest_write",
  "verifier_verdict_write",
  "result_finalize",
  "failure_finalize"
]);

export const workerBundleArtifactRoleSchema = z.enum([
  "run_manifest",
  "package_reference",
  "prompt_package",
  "candidate_source",
  "verdict_record",
  "compiler_output",
  "compiler_diagnostics",
  "verifier_output",
  "environment_snapshot",
  "usage_summary",
  "execution_trace"
]);

export const workerExecutionEventKindSchema = z.enum([
  "attempt_started",
  "compile_started",
  "compile_succeeded",
  "compile_failed",
  "compile_repair_requested",
  "compile_repair_applied",
  "verifier_started",
  "verifier_passed",
  "verifier_failed",
  "verifier_repair_requested",
  "verifier_repair_applied",
  "budget_exhausted",
  "artifact_manifest_written",
  "bundle_finalized"
]);

export const workerFailureFamilySchema = z.enum([
  "provider",
  "harness",
  "tooling",
  "budget",
  "compile",
  "verification",
  "input_contract"
]);

export const workerFailureTerminalitySchema = z.enum([
  "terminal_attempt",
  "retryable_outer",
  "cancelled"
]);

export const workerFailureRetryEligibilitySchema = z.enum([
  "never",
  "outer_retry_allowed",
  "manual_retry_only"
]);

export const workerFailureUserVisibilitySchema = z.enum([
  "user_visible",
  "user_visible_sanitized",
  "internal_only"
]);

export const workerFailureCodeSchema = z.enum([
  "provider_auth_error",
  "provider_rate_limited",
  "provider_transport_error",
  "provider_timeout",
  "provider_cancelled",
  "provider_refusal",
  "provider_unsupported_request",
  "provider_malformed_response",
  "provider_tool_contract_error",
  "provider_internal_error",
  "harness_bootstrap_failed",
  "harness_crashed",
  "harness_output_missing",
  "tool_bootstrap_failed",
  "tool_contract_violation",
  "tool_permission_violation",
  "tool_use_outside_policy",
  "tool_result_missing",
  "stuck_loop_detected",
  "wall_clock_budget_exhausted",
  "provider_usage_budget_exhausted",
  "turn_budget_exhausted",
  "compile_repair_budget_exhausted",
  "verifier_repair_budget_exhausted",
  "manual_cancelled",
  "compile_failed",
  "candidate_output_missing",
  "candidate_output_malformed",
  "candidate_file_outside_contract",
  "forbidden_placeholder_token",
  "theorem_reference_missing",
  "theorem_surface_drift_only",
  "theorem_semantic_mismatch",
  "extra_theorem_assumptions",
  "wrong_theorem_target",
  "forbidden_axiom_dependency",
  "environment_instability_detected",
  "proof_policy_failed",
  "benchmark_input_missing",
  "benchmark_input_digest_mismatch",
  "lane_configuration_invalid",
  "prompt_package_missing",
  "run_configuration_invalid",
  "worker_lease_lost"
]);

export const workerRunTargetSchema = z.discriminatedUnion("runKind", [
  z.object({
    benchmarkVersionId: z.string().min(1),
    modelConfigId: z.string().min(1),
    runKind: z.literal("full_benchmark")
  }),
  z.object({
    benchmarkVersionId: z.string().min(1),
    modelConfigId: z.string().min(1),
    runKind: z.literal("benchmark_slice"),
    sliceDefinition: z.string().min(1)
  }),
  z.object({
    benchmarkItemId: z.string().min(1),
    modelConfigId: z.string().min(1),
    runKind: z.literal("single_run")
  }),
  z.object({
    benchmarkTargetId: z.string().min(1),
    modelConfigId: z.string().min(1),
    repeatCount: z.number().int().positive(),
    runKind: z.literal("repeated_n")
  })
]);

export const workerFailureClassificationSchema = z.object({
  evidenceArtifactRefs: z.array(z.string().min(1)).min(1),
  failureCode: workerFailureCodeSchema,
  failureFamily: workerFailureFamilySchema,
  phase: workerExecutionPhaseSchema,
  retryEligibility: workerFailureRetryEligibilitySchema,
  summary: z.string().min(1),
  terminality: workerFailureTerminalitySchema,
  userVisibility: workerFailureUserVisibilitySchema
});

export const workerVerifierVerdictSchema = z.object({
  attemptId: z.string().min(1),
  axiomCheck: z.enum(["passed", "failed", "not_evaluated"]),
  benchmarkPackageDigest: sha256Schema,
  candidateDigest: sha256Schema,
  containsAdmit: z.boolean(),
  containsSorry: z.boolean(),
  diagnosticGate: z.enum(["passed", "failed"]),
  laneId: z.string().min(1),
  primaryFailure: workerFailureClassificationSchema.nullable(),
  result: z.enum(["pass", "fail"]),
  semanticEquality: z.enum(["matched", "mismatched", "not_evaluated"]),
  surfaceEquality: z.enum(["matched", "drifted", "not_evaluated"]),
  verdictSchemaVersion: z.string().min(1)
});

export const workerClaimRequestSchema = z.object({
  activeJobCount: z.number().int().min(0),
  availableRunKinds: z.array(runKindSchema),
  maxConcurrentJobs: z.number().int().positive(),
  supportedArtifactRoles: z.array(workerBundleArtifactRoleSchema).min(1),
  supportsOfflineBundleContract: z.boolean(),
  supportsTraceUploads: z.boolean(),
  workerId: z.string().min(1),
  workerPool: z.string().min(1),
  workerRuntime: z.enum(["local_docker", "modal"]),
  workerVersion: z.string().min(1)
});

export const workerClaimResponseSchema = z.union([
  z.object({
    leaseStatus: z.literal("idle"),
    pollAfterSeconds: z.number().int().min(0),
    workerJob: z.null()
  }),
  z.object({
    leaseStatus: z.literal("active"),
    pollAfterSeconds: z.number().int().min(0),
    workerJob: z.object({
      attemptId: z.string().min(1),
      heartbeatIntervalSeconds: z.number().int().positive(),
      heartbeatTimeoutSeconds: z.number().int().positive(),
      jobId: z.string().min(1),
      jobToken: z.string().min(1),
      jobTokenExpiresAt: timestampSchema,
      jobTokenScopes: z.array(workerJobTokenScopeSchema).min(1),
      leaseExpiresAt: timestampSchema,
      leaseId: z.string().min(1),
      offlineBundleCompatible: z.literal(true),
      requiredArtifactRoles: z.array(workerBundleArtifactRoleSchema).min(1),
      runBundleSchemaVersion: z.string().min(1),
      runId: z.string().min(1),
      target: workerRunTargetSchema
    })
  })
]);

export const workerHeartbeatRequestSchema = z.object({
  attemptId: z.string().min(1),
  jobId: z.string().min(1),
  lastEventSequence: z.number().int().nonnegative(),
  leaseId: z.string().min(1),
  observedAt: timestampSchema,
  phase: workerExecutionPhaseSchema,
  progressMessage: z.string().min(1).nullable()
});

export const workerHeartbeatResponseSchema = z.object({
  acknowledgedEventSequence: z.number().int().nonnegative(),
  cancelRequested: z.boolean(),
  jobToken: z.string().min(1).nullable(),
  jobTokenExpiresAt: timestampSchema.nullable(),
  leaseExpiresAt: timestampSchema.nullable(),
  leaseStatus: workerLeaseStatusSchema
});

export const workerExecutionEventSchema = z.object({
  attemptId: z.string().min(1),
  details: metadataSchema,
  eventKind: workerExecutionEventKindSchema,
  jobId: z.string().min(1),
  leaseId: z.string().min(1),
  phase: workerExecutionPhaseSchema,
  recordedAt: timestampSchema,
  sequence: z.number().int().nonnegative(),
  summary: z.string().min(1)
});

export const workerArtifactManifestEntrySchema = z.object({
  artifactRole: workerBundleArtifactRoleSchema,
  byteSize: z.number().int().nonnegative(),
  contentEncoding: z.string().min(1).nullable(),
  mediaType: z.string().min(1).nullable(),
  relativePath: z.string().min(1),
  requiredForIngest: z.boolean(),
  sha256: sha256Schema
});

export const workerArtifactManifestRequestSchema = z.object({
  artifacts: z.array(workerArtifactManifestEntrySchema).min(1),
  artifactManifestDigest: sha256Schema,
  attemptId: z.string().min(1),
  jobId: z.string().min(1),
  leaseId: z.string().min(1),
  recordedAt: timestampSchema
});

export const workerArtifactManifestResponseSchema = z.object({
  acceptedAt: timestampSchema,
  artifacts: z.array(
    z.object({
      artifactId: z.string().min(1),
      artifactRole: workerBundleArtifactRoleSchema,
      relativePath: z.string().min(1)
    })
  ),
  artifactManifestDigest: sha256Schema
});

export const workerResultMessageRequestSchema = z.object({
  artifactIds: z.array(z.string().min(1)).min(1),
  artifactManifestDigest: sha256Schema,
  attemptId: z.string().min(1),
  bundleDigest: sha256Schema,
  candidateDigest: sha256Schema,
  completedAt: timestampSchema,
  environmentDigest: sha256Schema,
  jobId: z.string().min(1),
  leaseId: z.string().min(1),
  offlineBundleCompatible: z.literal(true),
  runId: z.string().min(1),
  summary: z.string().min(1),
  usageSummary: metadataSchema.nullable(),
  verifierVerdict: workerVerifierVerdictSchema,
  verdictDigest: sha256Schema
});

export const workerTerminalFailureRequestSchema = z.object({
  artifactIds: z.array(z.string().min(1)),
  artifactManifestDigest: sha256Schema.nullable(),
  attemptId: z.string().min(1),
  bundleDigest: sha256Schema.nullable(),
  candidateDigest: sha256Schema.nullable(),
  failedAt: timestampSchema,
  failure: workerFailureClassificationSchema,
  jobId: z.string().min(1),
  leaseId: z.string().min(1),
  runId: z.string().min(1),
  summary: z.string().min(1),
  terminalState: z.enum(["failed", "cancelled"]),
  verifierVerdict: workerVerifierVerdictSchema.nullable(),
  verdictDigest: sha256Schema.nullable()
});

export const workerExecutionEventCatalogEntrySchema = z.object({
  id: workerExecutionEventKindSchema,
  purpose: z.string()
});

export const workerTerminalFailureCatalogEntrySchema = z.object({
  id: workerFailureCodeSchema,
  purpose: z.string()
});

export const workerJobTokenScopeCatalogEntrySchema = z.object({
  id: workerJobTokenScopeSchema,
  purpose: z.string()
});
