export type Problem9OfflineIngestRequest = {
  ingestRequestSchemaVersion: "1";
  bundle: Problem9OfflineIngestBundle;
};

export type Problem9OfflineIngestBundle = {
  artifactManifest: Problem9OfflineArtifactManifest;
  benchmarkPackage: Problem9BenchmarkPackageManifest;
  candidateSource: string;
  compilerDiagnostics: unknown;
  compilerOutput: string;
  environment: Problem9EnvironmentManifest;
  packageRef: Problem9PackageRef;
  promptPackage: Problem9PromptPackageManifest;
  runBundle: Problem9RunBundleManifest;
  usage: unknown | null;
  verifierOutput: unknown;
  verdict: Problem9VerifierVerdict;
};

export type Problem9OfflineIngestResponse = {
  artifactCount: number;
  attempt: {
    id: string;
    sourceAttemptId: string;
    state: "succeeded" | "failed";
    verdictClass: "pass" | "fail";
  };
  job: {
    id: string;
    sourceJobId: string | null;
    state: "completed" | "failed";
  };
  run: {
    id: string;
    sourceRunId: string;
    state: "succeeded" | "failed";
  };
};

export type Problem9OfflineArtifactManifest = {
  artifactManifestSchemaVersion: "1";
  artifacts: Problem9OfflineArtifactManifestEntry[];
  hashAlgorithm: "sha256";
};

export type Problem9OfflineArtifactManifestEntry = {
  artifactRole:
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
  byteSize: number;
  contentEncoding: string | null;
  mediaType: string | null;
  relativePath: string;
  requiredForIngest: boolean;
  sha256: string;
};

export type Problem9BenchmarkPackageManifest = {
  benchmarkFamily: "firstproof";
  benchmarkItemId: "Problem9";
  canonicalModules: {
    gold: string;
    statement: string;
    support: string;
  };
  hashAlgorithm: "sha256";
  hashes: Record<string, string>;
  lanePolicy: {
    primaryLane: string;
    supportedLanes: string[];
  };
  manifestSchemaVersion: "1";
  packageDigest: string;
  packageDigestMode: "metadata_plus_file_inventory_v1";
  packageId: "firstproof/Problem9";
  packageRoot: "firstproof/Problem9";
  packageVersion: string;
  sourceManifestDigest: string;
};

export type Problem9PackageRef = {
  benchmarkItemId: "Problem9";
  benchmarkPackageDigest: string;
  benchmarkPackageId: "firstproof/Problem9";
  benchmarkPackageVersion: string;
  canonicalModules: {
    gold: string;
    statement: string;
    support: string;
  };
  laneId: string;
  packageRefSchemaVersion: "1";
  packageRoot: "firstproof/Problem9";
};

export type Problem9PromptPackageManifest = {
  authMode:
    | "trusted_local_user"
    | "machine_api_key"
    | "machine_oauth"
    | "local_stub";
  benchmarkItemId: "Problem9";
  benchmarkPackageDigest: string;
  benchmarkPackageId: "firstproof/Problem9";
  benchmarkPackageVersion: string;
  harnessRevision: string;
  laneId: string;
  layerDigests: {
    "benchmark.md": string;
    "item.md": string;
    "run-envelope.json": string;
    "system.md": string;
  };
  layerVersions: {
    benchmark: string;
    item: string;
    runEnvelope: string;
    system: string;
  };
  layers: {
    benchmark: "benchmark.md";
    item: "item.md";
    runEnvelope: "run-envelope.json";
    system: "system.md";
  };
  modelConfigId: string;
  promptPackageDigest: string;
  promptPackageDigestMode: "metadata_plus_layer_inventory_v1";
  promptPackageSchemaVersion: "1";
  promptProtocolVersion: string;
  providerFamily: "openai" | "anthropic" | "google" | "aristotle" | "axle" | "custom";
  runMode: "single_pass_probe" | "pass_k_probe" | "bounded_agentic_attempt";
  toolProfile: "no_tools" | "lean_mcp_readonly" | "workspace_edit_limited";
};

export type Problem9EnvironmentManifest = {
  authMode: Problem9PromptPackageManifest["authMode"];
  environmentSchemaVersion: string;
  executionImageDigest: string | null;
  executionTargetKind: "problem9-devbox" | "problem9-execution";
  harnessRevision: string;
  lakeSnapshotId: string;
  laneId: string;
  leanVersion: string;
  localDevboxDigest: string | null;
  metadata: Record<string, unknown>;
  modelConfigId: string;
  modelSnapshotId: string;
  os: {
    arch: string;
    platform: string;
    release: string;
  };
  promptProtocolVersion: string;
  providerFamily: Problem9PromptPackageManifest["providerFamily"];
  runMode: Problem9PromptPackageManifest["runMode"];
  runtime: {
    bunVersion: string | null;
    nodeVersion: string;
    tsxVersion: string | null;
  };
  toolProfile: Problem9PromptPackageManifest["toolProfile"];
  verifierVersion: string;
};

export type Problem9RunBundleManifest = {
  artifactManifestDigest: string;
  attemptId: string;
  authMode: Problem9PromptPackageManifest["authMode"];
  benchmarkItemId: "Problem9";
  benchmarkPackageDigest: string;
  benchmarkPackageId: "firstproof/Problem9";
  benchmarkPackageVersion: string;
  bundleDigest: string;
  bundleSchemaVersion: "1";
  candidateDigest: string;
  environmentDigest: string;
  harnessRevision: string;
  jobId: string | null;
  laneId: string;
  modelConfigId: string;
  modelSnapshotId: string;
  promptPackageDigest: string;
  promptProtocolVersion: string;
  providerFamily: Problem9PromptPackageManifest["providerFamily"];
  runConfigDigest: string;
  runId: string;
  runMode: Problem9PromptPackageManifest["runMode"];
  status: "success" | "failure";
  stopReason: string;
  toolProfile: Problem9PromptPackageManifest["toolProfile"];
  verifierVersion: string;
  verdictDigest: string;
};

type Problem9VerifierVerdictBase = {
  attemptId: string;
  axiomCheck: "passed" | "failed" | "not_evaluated";
  benchmarkPackageDigest: string;
  candidateDigest: string;
  containsAdmit: boolean;
  containsSorry: boolean;
  diagnosticGate: "passed" | "failed";
  runId: string;
  laneId: string;
  semanticEquality: "matched" | "mismatched" | "not_evaluated";
  surfaceEquality: "matched" | "drifted" | "not_evaluated";
  surface_drift: boolean;
  verdictSchemaVersion: "1";
};

export type Problem9PassingVerifierVerdict = Problem9VerifierVerdictBase & {
  failureCode?: undefined;
  primaryFailure: null;
  result: "pass";
};

export type Problem9FailingVerifierVerdict = Problem9VerifierVerdictBase & {
  failureCode: string;
  primaryFailure: Problem9FailureClassification;
  result: "fail";
};

export type Problem9VerifierVerdict =
  | Problem9PassingVerifierVerdict
  | Problem9FailingVerifierVerdict;

export type Problem9FailureClassification = {
  evidenceArtifactRefs: string[];
  failureCode: string;
  failureFamily:
    | "provider"
    | "harness"
    | "tooling"
    | "budget"
    | "compile"
    | "verification"
    | "input_contract";
  phase: "prepare" | "generate" | "tool" | "compile" | "verify" | "finalize" | "cancel";
  retryEligibility: "never" | "outer_retry_allowed" | "manual_retry_only";
  summary: string;
  terminality: "terminal_attempt" | "retryable_outer" | "cancelled";
  userVisibility: "user_visible" | "user_visible_sanitized" | "internal_only";
};
