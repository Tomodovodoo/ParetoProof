import { z } from "zod";
import {
  getProblem9ModelConfigIdPrefix,
  problem9LocalAuthModes,
  problem9ProviderFamilies,
  problem9RunModes,
  problem9ToolProfiles
} from "../contracts/problem9-execution.js";
import {
  offlineIngestAttemptLifecycleStateSchema,
  offlineIngestJobLifecycleStateSchema,
  offlineIngestRunLifecycleStateSchema
} from "./run-control.js";
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

const problem9SourceMetadataSchema = z.object({
  laneEvidence: z.object({
    lean422_exact: z.literal("lean-toolchain")
  }),
  license: z.object({
    file: z.literal("LICENSE"),
    spdxId: z.literal("Apache-2.0")
  }),
  provenance: z.object({
    goldModule: z.literal("FirstProof/Problem9/Gold.lean"),
    humanStatement: z.literal("statements/problem.md"),
    statementModule: z.literal("FirstProof/Problem9/Statement.lean"),
    supportModule: z.literal("FirstProof/Problem9/Support.lean")
  }),
  regressionEvidence: z.object({
    cohesionCheck: z.literal("bun run check:problem9-package-cohesion"),
    integrityTest: z.literal("node --import tsx --test test/problem9-integrity.test.ts")
  })
});

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
  sourceMetadata: problem9SourceMetadataSchema.optional(),
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

const problem9PromptPackageManifestBaseSchema = z.object({
  authMode: z.enum(problem9LocalAuthModes),
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
  providerFamily: z.enum(problem9ProviderFamilies),
  runMode: z.enum(problem9RunModes),
  toolProfile: z.enum(problem9ToolProfiles)
});

export const problem9PromptPackageManifestSchema = problem9PromptPackageManifestBaseSchema.superRefine((value, context) => {
  const expectedModelConfigPrefix = getProblem9ModelConfigIdPrefix(value.authMode);
  if (!value.modelConfigId.startsWith(expectedModelConfigPrefix)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `modelConfigId must start with ${expectedModelConfigPrefix} for authMode ${value.authMode}.`
    });
  }
});

export const problem9EnvironmentManifestSchema = z.object({
  authMode: problem9PromptPackageManifestBaseSchema.shape.authMode,
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
  providerFamily: problem9PromptPackageManifestBaseSchema.shape.providerFamily,
  runMode: problem9PromptPackageManifestBaseSchema.shape.runMode,
  runtime: z.object({
    bunVersion: z.string().min(1).nullable(),
    nodeVersion: z.string().min(1),
    tsxVersion: z.string().min(1).nullable()
  }),
  toolProfile: problem9PromptPackageManifestBaseSchema.shape.toolProfile,
  verifierVersion: z.string().min(1)
});

export const problem9RunBundleManifestSchema = z.object({
  artifactManifestDigest: sha256Schema,
  attemptId: z.string().min(1),
  authMode: problem9PromptPackageManifestBaseSchema.shape.authMode,
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
  providerFamily: problem9PromptPackageManifestBaseSchema.shape.providerFamily,
  runConfigDigest: sha256Schema,
  runId: z.string().min(1),
  runMode: problem9PromptPackageManifestBaseSchema.shape.runMode,
  status: z.enum(["success", "failure"]),
  stopReason: z.string().min(1),
  toolProfile: problem9PromptPackageManifestBaseSchema.shape.toolProfile,
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

export const problem9BenchmarkSourceFilesSchema = z.object({
  "FirstProof/Problem9/Gold.lean": z.string().min(1),
  "FirstProof/Problem9/Statement.lean": z.string().min(1),
  "FirstProof/Problem9/Support.lean": z.string().min(1),
  LICENSE: z.string().min(1),
  "README.md": z.string().min(1),
  "lake-manifest.json": z.string().min(1),
  "lakefile.toml": z.string().min(1),
  "lean-toolchain": z.string().min(1),
  "statements/problem.md": z.string().min(1)
});

export const problem9PromptLayerContentsSchema = z.object({
  "benchmark.md": z.string().min(1),
  "item.md": z.string().min(1),
  "run-envelope.json": z.string().min(1),
  "system.md": z.string().min(1)
});

const problem9OfflineIngestBundleBaseSchema = z.object({
  artifactManifest: problem9OfflineArtifactManifestSchema,
  benchmarkPackage: problem9BenchmarkPackageManifestSchema,
  benchmarkSources: problem9BenchmarkSourceFilesSchema,
  candidateSource: z.string().min(1),
  compilerDiagnostics: recordValueSchema,
  compilerOutput: z.string(),
  environment: problem9EnvironmentManifestSchema,
  packageRef: problem9PackageRefSchema,
  promptPackage: problem9PromptPackageManifestSchema,
  promptLayers: problem9PromptLayerContentsSchema,
  runBundle: problem9RunBundleManifestSchema,
  usage: recordValueSchema.nullable(),
  verifierOutput: recordValueSchema
});

const problem9PassingOfflineIngestBundleSchema = problem9OfflineIngestBundleBaseSchema.extend({
  failureClassification: z.null().optional().transform(() => null),
  verdict: problem9PassingVerifierVerdictSchema
});

const problem9FailingOfflineIngestBundleSchema = problem9OfflineIngestBundleBaseSchema.extend({
  failureClassification: workerFailureClassificationSchema,
  verdict: problem9FailingVerifierVerdictSchema
});

export const problem9OfflineIngestBundleSchema = z.union([
  problem9PassingOfflineIngestBundleSchema,
  problem9FailingOfflineIngestBundleSchema
]);

export const problem9OfflineIngestRequestSchema = z.object({
  bundle: problem9OfflineIngestBundleSchema,
  ingestRequestSchemaVersion: z.literal("1")
});

export const problem9OfflineIngestResponseSchema = z.object({
  artifactCount: z.number().int().nonnegative(),
  attempt: z.object({
    id: z.string().min(1),
    sourceAttemptId: z.string().min(1),
    state: offlineIngestAttemptLifecycleStateSchema,
    verdictClass: z.enum(["pass", "fail"])
  }),
  job: z.object({
    id: z.string().min(1),
    sourceJobId: z.string().min(1).nullable(),
    state: offlineIngestJobLifecycleStateSchema
  }),
  run: z.object({
    id: z.string().min(1),
    sourceRunId: z.string().min(1),
    state: offlineIngestRunLifecycleStateSchema
  })
});
