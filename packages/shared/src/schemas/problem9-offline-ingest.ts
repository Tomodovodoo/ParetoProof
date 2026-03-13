import { z } from "zod";
import {
  workerArtifactManifestEntrySchema,
  workerFailureClassificationSchema,
  workerFailureCodeSchema
} from "./worker-control.js";

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

export const problem9BenchmarkPackageManifestSchema = z.object({
  benchmarkFamily: z.literal("firstproof"),
  benchmarkItemId: z.literal("Problem9"),
  canonicalModules: z.object({
    gold: z.string().min(1),
    statement: z.string().min(1),
    support: z.string().min(1)
  }),
  hashAlgorithm: z.literal("sha256"),
  hashes: z.record(z.string().min(1), sha256Schema),
  lanePolicy: z.object({
    primaryLane: z.string().min(1),
    supportedLanes: z.array(z.string().min(1)).min(1)
  }),
  manifestSchemaVersion: z.literal("1"),
  packageDigest: sha256Schema,
  packageDigestMode: z.literal("metadata_plus_file_inventory_v1"),
  packageId: z.literal("firstproof/Problem9"),
  packageRoot: z.literal("firstproof/Problem9"),
  packageVersion: z.string().min(1),
  sourceManifestDigest: sha256Schema
});

export const problem9PackageRefSchema = z.object({
  benchmarkItemId: z.literal("Problem9"),
  benchmarkPackageDigest: sha256Schema,
  benchmarkPackageId: z.literal("firstproof/Problem9"),
  benchmarkPackageVersion: z.string().min(1),
  canonicalModules: z.object({
    gold: z.string().min(1),
    statement: z.string().min(1),
    support: z.string().min(1)
  }),
  laneId: z.string().min(1),
  packageRefSchemaVersion: z.literal("1"),
  packageRoot: z.literal("firstproof/Problem9")
});

export const problem9PromptPackageManifestSchema = z.object({
  authMode: z.enum([
    "trusted_local_user",
    "machine_api_key",
    "machine_oauth",
    "local_stub"
  ]),
  benchmarkItemId: z.literal("Problem9"),
  benchmarkPackageDigest: sha256Schema,
  benchmarkPackageId: z.literal("firstproof/Problem9"),
  benchmarkPackageVersion: z.string().min(1),
  harnessRevision: z.string().min(1),
  laneId: z.string().min(1),
  layerDigests: z.object({
    "benchmark.md": sha256Schema,
    "item.md": sha256Schema,
    "run-envelope.json": sha256Schema,
    "system.md": sha256Schema
  }),
  layerVersions: z.object({
    benchmark: z.string().min(1),
    item: z.string().min(1),
    runEnvelope: z.string().min(1),
    system: z.string().min(1)
  }),
  layers: z.object({
    benchmark: z.literal("benchmark.md"),
    item: z.literal("item.md"),
    runEnvelope: z.literal("run-envelope.json"),
    system: z.literal("system.md")
  }),
  modelConfigId: z.string().min(1),
  promptPackageDigest: sha256Schema,
  promptPackageDigestMode: z.literal("metadata_plus_layer_inventory_v1"),
  promptPackageSchemaVersion: z.literal("1"),
  promptProtocolVersion: z.string().min(1),
  providerFamily: z.enum(["openai", "anthropic", "google", "aristotle", "axle", "custom"]),
  runMode: z.enum(["single_pass_probe", "pass_k_probe", "bounded_agentic_attempt"]),
  toolProfile: z.enum(["no_tools", "lean_mcp_readonly", "workspace_edit_limited"])
});

export const problem9EnvironmentManifestSchema = z.object({
  authMode: problem9PromptPackageManifestSchema.shape.authMode,
  environmentSchemaVersion: z.string().min(1),
  executionImageDigest: sha256Schema.nullable(),
  executionTargetKind: z.enum(["problem9-devbox", "problem9-execution"]),
  harnessRevision: z.string().min(1),
  lakeSnapshotId: z.string().min(1),
  laneId: z.string().min(1),
  leanVersion: z.string().min(1),
  localDevboxDigest: sha256Schema.nullable(),
  metadata: z.record(z.string(), recordValueSchema),
  modelConfigId: z.string().min(1),
  modelSnapshotId: z.string().min(1),
  os: z.object({
    arch: z.string().min(1),
    platform: z.string().min(1),
    release: z.string().min(1)
  }),
  promptProtocolVersion: z.string().min(1),
  providerFamily: problem9PromptPackageManifestSchema.shape.providerFamily,
  runMode: problem9PromptPackageManifestSchema.shape.runMode,
  runtime: z.object({
    bunVersion: z.string().min(1).nullable(),
    nodeVersion: z.string().min(1),
    tsxVersion: z.string().min(1).nullable()
  }),
  toolProfile: problem9PromptPackageManifestSchema.shape.toolProfile,
  verifierVersion: z.string().min(1)
});

export const problem9RunBundleManifestSchema = z.object({
  artifactManifestDigest: sha256Schema,
  attemptId: z.string().min(1),
  authMode: problem9PromptPackageManifestSchema.shape.authMode,
  benchmarkItemId: z.literal("Problem9"),
  benchmarkPackageDigest: sha256Schema,
  benchmarkPackageId: z.literal("firstproof/Problem9"),
  benchmarkPackageVersion: z.string().min(1),
  bundleDigest: sha256Schema,
  bundleSchemaVersion: z.literal("1"),
  candidateDigest: sha256Schema,
  environmentDigest: sha256Schema,
  harnessRevision: z.string().min(1),
  jobId: z.string().min(1).nullable(),
  laneId: z.string().min(1),
  modelConfigId: z.string().min(1),
  modelSnapshotId: z.string().min(1),
  promptPackageDigest: sha256Schema,
  promptProtocolVersion: z.string().min(1),
  providerFamily: problem9PromptPackageManifestSchema.shape.providerFamily,
  runConfigDigest: sha256Schema,
  runId: z.string().min(1),
  runMode: problem9PromptPackageManifestSchema.shape.runMode,
  status: z.enum(["success", "failure"]),
  stopReason: z.string().min(1),
  toolProfile: problem9PromptPackageManifestSchema.shape.toolProfile,
  verifierVersion: z.string().min(1),
  verdictDigest: sha256Schema
});

const baseProblem9VerifierVerdictSchema = z.object({
  attemptId: z.string().min(1),
  axiomCheck: z.enum(["passed", "failed", "not_evaluated"]),
  benchmarkPackageDigest: sha256Schema,
  candidateDigest: sha256Schema,
  containsAdmit: z.boolean(),
  containsSorry: z.boolean(),
  diagnosticGate: z.enum(["passed", "failed"]),
  laneId: z.string().min(1),
  runId: z.string().min(1),
  semanticEquality: z.enum(["matched", "mismatched", "not_evaluated"]),
  surfaceEquality: z.enum(["matched", "drifted", "not_evaluated"]),
  surface_drift: z.boolean(),
  verdictSchemaVersion: z.literal("1")
});

export const problem9PassingVerifierVerdictSchema = baseProblem9VerifierVerdictSchema.extend({
  failureCode: z.undefined().optional(),
  primaryFailure: z.null(),
  result: z.literal("pass")
});

export const problem9FailingVerifierVerdictSchema = baseProblem9VerifierVerdictSchema.extend({
  failureCode: workerFailureCodeSchema,
  primaryFailure: workerFailureClassificationSchema,
  result: z.literal("fail")
});

export const problem9VerifierVerdictSchema = z.discriminatedUnion("result", [
  problem9PassingVerifierVerdictSchema,
  problem9FailingVerifierVerdictSchema
]);

export const problem9OfflineArtifactManifestSchema = z.object({
  artifactManifestSchemaVersion: z.literal("1"),
  artifacts: z.array(workerArtifactManifestEntrySchema).min(1),
  hashAlgorithm: z.literal("sha256")
});

export const problem9OfflineIngestBundleSchema = z.object({
  artifactManifest: problem9OfflineArtifactManifestSchema,
  benchmarkPackage: problem9BenchmarkPackageManifestSchema,
  candidateSource: z.string().min(1),
  compilerDiagnostics: recordValueSchema,
  compilerOutput: z.string(),
  environment: problem9EnvironmentManifestSchema,
  packageRef: problem9PackageRefSchema,
  promptPackage: problem9PromptPackageManifestSchema,
  runBundle: problem9RunBundleManifestSchema,
  usage: recordValueSchema.nullable(),
  verifierOutput: recordValueSchema,
  verdict: problem9VerifierVerdictSchema
});

export const problem9OfflineIngestRequestSchema = z.object({
  bundle: problem9OfflineIngestBundleSchema,
  ingestRequestSchemaVersion: z.literal("1")
});

export const problem9OfflineIngestResponseSchema = z.object({
  artifactCount: z.number().int().nonnegative(),
  attempt: z.object({
    id: z.string().min(1),
    sourceAttemptId: z.string().min(1),
    state: z.enum(["succeeded", "failed"]),
    verdictClass: z.enum(["pass", "fail"])
  }),
  job: z.object({
    id: z.string().min(1),
    sourceJobId: z.string().min(1).nullable(),
    state: z.enum(["completed", "failed"])
  }),
  run: z.object({
    id: z.string().min(1),
    sourceRunId: z.string().min(1),
    state: z.enum(["succeeded", "failed"])
  })
});
