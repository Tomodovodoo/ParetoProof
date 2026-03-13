import { createHash } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

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

const benchmarkPackageManifestSchema = z.object({
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
  packageDigest: sha256Schema,
  packageDigestMode: z.literal("metadata_plus_file_inventory_v1"),
  packageId: z.literal("firstproof/Problem9"),
  packageRoot: z.literal("firstproof/Problem9"),
  packageVersion: z.string().min(1),
  sourceManifestDigest: sha256Schema
});

const promptPackageManifestSchema = z.object({
  authMode: z.enum(["machine", "trusted_local_codex", "trusted_local_provider"]),
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

const runEnvelopeSchema = z
  .object({
    attemptId: z.string().min(1),
    authMode: promptPackageManifestSchema.shape.authMode,
    benchmarkItemId: z.literal("Problem9"),
    benchmarkPackageDigest: sha256Schema,
    benchmarkPackageId: z.literal("firstproof/Problem9"),
    benchmarkPackageVersion: z.string().min(1),
    harnessRevision: z.string().min(1),
    jobId: z.string().min(1).nullable(),
    laneId: z.string().min(1),
    modelConfigId: z.string().min(1),
    promptProtocolVersion: z.string().min(1),
    providerFamily: promptPackageManifestSchema.shape.providerFamily,
    runEnvelopeSchemaVersion: z.literal("1"),
    runId: z.string().min(1),
    runMode: promptPackageManifestSchema.shape.runMode,
    toolProfile: promptPackageManifestSchema.shape.toolProfile
  })
  .passthrough();

const failureClassificationSchema = z.object({
  evidenceArtifactRefs: z.array(z.string().min(1)).min(1),
  failureCode: z.enum([
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
  ]),
  failureFamily: z.enum([
    "provider",
    "harness",
    "tooling",
    "budget",
    "compile",
    "verification",
    "input_contract"
  ]),
  phase: z.enum(["prepare", "generate", "tool", "compile", "verify", "finalize", "cancel"]),
  retryEligibility: z.enum(["never", "outer_retry_allowed", "manual_retry_only"]),
  summary: z.string().min(1),
  terminality: z.enum(["terminal_attempt", "retryable_outer", "cancelled"]),
  userVisibility: z.enum(["user_visible", "user_visible_sanitized", "internal_only"])
});

const environmentInputSchema = z.object({
  environmentSchemaVersion: z.string().min(1).default("1"),
  executionImageDigest: sha256Schema.nullable().default(null),
  executionTargetKind: z.enum(["problem9-devbox", "problem9-execution"]),
  lakeSnapshotId: z.string().min(1),
  leanVersion: z.string().min(1),
  localDevboxDigest: sha256Schema.nullable().default(null),
  metadata: z.record(z.string(), recordValueSchema).default({}),
  modelSnapshotId: z.string().min(1),
  os: z.object({
    arch: z.string().min(1),
    platform: z.string().min(1),
    release: z.string().min(1)
  }),
  runtime: z.object({
    bunVersion: z.string().min(1).nullable().default(null),
    nodeVersion: z.string().min(1),
    tsxVersion: z.string().min(1).nullable().default(null)
  }),
  verifierVersion: z.string().min(1)
});

const bundleResultSchema = z.enum(["pass", "fail"]);
const bundleSemanticEqualitySchema = z.enum(["matched", "mismatched", "not_evaluated"]);
const bundleSurfaceEqualitySchema = z.enum(["matched", "drifted", "not_evaluated"]);
const bundleAxiomCheckSchema = z.enum(["passed", "failed", "not_evaluated"]);
const bundleDiagnosticGateSchema = z.enum(["passed", "failed"]);

const materializeProblem9RunBundleOptionsSchema = z
  .object({
    axiomCheck: bundleAxiomCheckSchema,
    benchmarkPackageRoot: z.string().min(1),
    candidateSourcePath: z.string().min(1),
    compilerDiagnosticsPath: z.string().min(1),
    compilerOutputPath: z.string().min(1),
    containsAdmit: z.boolean(),
    containsSorry: z.boolean(),
    diagnosticGate: bundleDiagnosticGateSchema,
    environmentInputPath: z.string().min(1),
    failureClassificationPath: z.string().min(1).nullable(),
    outputRoot: z.string().min(1),
    promptPackageRoot: z.string().min(1),
    result: bundleResultSchema,
    semanticEquality: bundleSemanticEqualitySchema,
    stopReason: z.string().min(1),
    surfaceEquality: bundleSurfaceEqualitySchema,
    verifierOutputPath: z.string().min(1)
  })
  .superRefine((value, context) => {
    if (value.result === "fail" && value.failureClassificationPath === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Failing bundles require --failure-classification <path>."
      });
    }

    if (value.result === "pass" && value.failureClassificationPath !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passing bundles may not include a failure classification."
      });
    }
  });

const benchmarkPackageManifestRelativePath = "benchmark-package.json";
const benchmarkPackageSourceSchemaVersion = "1";
const expectedBenchmarkHashPaths = [
  "FirstProof/Problem9/Gold.lean",
  "FirstProof/Problem9/Statement.lean",
  "FirstProof/Problem9/Support.lean",
  "LICENSE",
  "README.md",
  "lake-manifest.json",
  "lakefile.toml",
  "lean-toolchain",
  "statements/problem.md"
] as const;
const requiredBenchmarkPackagePaths = [
  benchmarkPackageManifestRelativePath,
  ...expectedBenchmarkHashPaths
] as const;

const promptLayerFilenames = ["benchmark.md", "item.md", "run-envelope.json", "system.md"] as const;
const promptPackageManifestFilename = "prompt-package.json";
const requiredPromptPackagePaths = [promptPackageManifestFilename, ...promptLayerFilenames] as const;

const requiredBundleFiles = [
  "candidate/Candidate.lean",
  "environment/environment.json",
  "package/benchmark-package.json",
  "package/package-ref.json",
  "prompt/prompt-package.json",
  "verification/compiler-diagnostics.json",
  "verification/compiler-output.txt",
  "verification/verdict.json",
  "verification/verifier-output.json"
] as const;

type BenchmarkPackageManifest = z.infer<typeof benchmarkPackageManifestSchema>;
type PromptPackageManifest = z.infer<typeof promptPackageManifestSchema>;
type RunEnvelope = z.infer<typeof runEnvelopeSchema>;
type FailureClassification = z.infer<typeof failureClassificationSchema>;
type EnvironmentInput = z.infer<typeof environmentInputSchema>;
type MaterializeProblem9RunBundleOptions = z.infer<
  typeof materializeProblem9RunBundleOptionsSchema
>;

export type MaterializedProblem9RunBundle = {
  artifactManifestDigest: string;
  bundleDigest: string;
  candidateDigest: string;
  environmentDigest: string;
  outputRoot: string;
  promptPackageDigest: string;
  runConfigDigest: string;
  verdictDigest: string;
};

export async function materializeProblem9RunBundle(
  rawOptions: MaterializeProblem9RunBundleOptions
): Promise<MaterializedProblem9RunBundle> {
  const options = materializeProblem9RunBundleOptionsSchema.parse(rawOptions);
  const outputParentRoot = path.resolve(options.outputRoot);
  const bundleRoot = path.join(outputParentRoot, "problem9-run-bundle");
  const benchmarkPackageRoot = path.resolve(options.benchmarkPackageRoot);
  const promptPackageRoot = path.resolve(options.promptPackageRoot);
  const candidateSourcePath = path.resolve(options.candidateSourcePath);
  const compilerDiagnosticsPath = path.resolve(options.compilerDiagnosticsPath);
  const compilerOutputPath = path.resolve(options.compilerOutputPath);
  const verifierOutputPath = path.resolve(options.verifierOutputPath);
  const environmentInputPath = path.resolve(options.environmentInputPath);
  const failureClassificationPath =
    options.failureClassificationPath === null
      ? null
      : path.resolve(options.failureClassificationPath);

  assertOutputRootIsNotFilesystemRoot(outputParentRoot);

  await assertNoPathOverlap(benchmarkPackageRoot, bundleRoot, "benchmark package input");
  await assertNoPathOverlap(promptPackageRoot, bundleRoot, "prompt package input");
  await assertNoPathOverlap(candidateSourcePath, bundleRoot, "candidate source input");
  await assertNoPathOverlap(
    compilerDiagnosticsPath,
    bundleRoot,
    "compiler diagnostics input"
  );
  await assertNoPathOverlap(compilerOutputPath, bundleRoot, "compiler output input");
  await assertNoPathOverlap(verifierOutputPath, bundleRoot, "verifier output input");
  await assertNoPathOverlap(environmentInputPath, bundleRoot, "environment input");

  if (failureClassificationPath !== null) {
    await assertNoPathOverlap(
      failureClassificationPath,
      bundleRoot,
      "failure classification input"
    );
  }

  const benchmarkManifest = await loadBenchmarkPackageManifest(benchmarkPackageRoot);
  const { promptManifest, runEnvelope } = await loadPromptPackage(promptPackageRoot);
  assertBundleInputsAreConsistent(benchmarkManifest, promptManifest, runEnvelope);

  const environmentInput = await loadJsonFile(environmentInputPath, environmentInputSchema);
  const failureClassification =
    failureClassificationPath === null
      ? null
      : await loadJsonFile(failureClassificationPath, failureClassificationSchema);
  const candidateContents = await loadNormalizedText(candidateSourcePath);
  const compilerDiagnostics = await loadLooseJsonFile(compilerDiagnosticsPath);
  const verifierOutput = await loadLooseJsonFile(verifierOutputPath);
  const compilerOutput = await loadNormalizedText(compilerOutputPath);

  const environmentManifest = buildEnvironmentManifest({
    environmentInput,
    promptManifest
  });
  const environmentDigest = sha256Text(stableStringify(environmentManifest));
  const candidateDigest = sha256Text(candidateContents);
  const verdict = buildVerdict({
    attemptId: runEnvelope.attemptId,
    axiomCheck: options.axiomCheck,
    benchmarkPackageDigest: benchmarkManifest.packageDigest,
    candidateDigest,
    containsAdmit: options.containsAdmit,
    containsSorry: options.containsSorry,
    diagnosticGate: options.diagnosticGate,
    failureClassification,
    laneId: promptManifest.laneId,
    result: options.result,
    runId: runEnvelope.runId,
    semanticEquality: options.semanticEquality,
    surfaceEquality: options.surfaceEquality
  });
  const verdictDigest = sha256Text(stableStringify(verdict));
  const packageRef = buildPackageRef({
    benchmarkManifest,
    laneId: promptManifest.laneId
  });
  const runConfigDigest = sha256Text(
    stableStringify({
      authMode: promptManifest.authMode,
      benchmarkItemId: benchmarkManifest.benchmarkItemId,
      benchmarkPackageDigest: benchmarkManifest.packageDigest,
      benchmarkPackageId: benchmarkManifest.packageId,
      benchmarkPackageVersion: benchmarkManifest.packageVersion,
      environmentDigest,
      harnessRevision: promptManifest.harnessRevision,
      laneId: promptManifest.laneId,
      modelConfigId: promptManifest.modelConfigId,
      modelSnapshotId: environmentInput.modelSnapshotId,
      promptPackageDigest: promptManifest.promptPackageDigest,
      promptProtocolVersion: promptManifest.promptProtocolVersion,
      providerFamily: promptManifest.providerFamily,
      runMode: promptManifest.runMode,
      toolProfile: promptManifest.toolProfile,
      verifierVersion: environmentInput.verifierVersion
    })
  );

  const runBundleWithoutDigests = {
    attemptId: runEnvelope.attemptId,
    authMode: promptManifest.authMode,
    benchmarkItemId: benchmarkManifest.benchmarkItemId,
    benchmarkPackageDigest: benchmarkManifest.packageDigest,
    benchmarkPackageId: benchmarkManifest.packageId,
    benchmarkPackageVersion: benchmarkManifest.packageVersion,
    bundleSchemaVersion: "1",
    candidateDigest,
    environmentDigest,
    harnessRevision: promptManifest.harnessRevision,
    jobId: runEnvelope.jobId,
    laneId: promptManifest.laneId,
    modelConfigId: promptManifest.modelConfigId,
    modelSnapshotId: environmentInput.modelSnapshotId,
    promptPackageDigest: promptManifest.promptPackageDigest,
    promptProtocolVersion: promptManifest.promptProtocolVersion,
    providerFamily: promptManifest.providerFamily,
    runConfigDigest,
    runId: runEnvelope.runId,
    runMode: promptManifest.runMode,
    status: options.result === "pass" ? "success" : "failure",
    stopReason: options.stopReason,
    toolProfile: promptManifest.toolProfile,
    verifierVersion: environmentInput.verifierVersion,
    verdictDigest
  };

  await rm(bundleRoot, { force: true, recursive: true });
  await mkdir(path.join(bundleRoot, "package"), { recursive: true });
  await mkdir(path.join(bundleRoot, "prompt"), { recursive: true });
  await mkdir(path.join(bundleRoot, "candidate"), { recursive: true });
  await mkdir(path.join(bundleRoot, "verification"), { recursive: true });
  await mkdir(path.join(bundleRoot, "environment"), { recursive: true });

  await copyNormalizedTextFile(
    path.join(benchmarkPackageRoot, benchmarkPackageManifestRelativePath),
    path.join(bundleRoot, "package", "benchmark-package.json")
  );
  await copyNormalizedTextFile(
    path.join(promptPackageRoot, promptPackageManifestFilename),
    path.join(bundleRoot, "prompt", "prompt-package.json")
  );
  await writeNormalizedText(path.join(bundleRoot, "candidate", "Candidate.lean"), candidateContents);
  await writeJsonFile(
    path.join(bundleRoot, "verification", "compiler-diagnostics.json"),
    compilerDiagnostics
  );
  await writeNormalizedText(
    path.join(bundleRoot, "verification", "compiler-output.txt"),
    compilerOutput
  );
  await writeJsonFile(
    path.join(bundleRoot, "verification", "verifier-output.json"),
    verifierOutput
  );
  await writeJsonFile(path.join(bundleRoot, "verification", "verdict.json"), verdict);
  await writeJsonFile(path.join(bundleRoot, "environment", "environment.json"), environmentManifest);
  await writeJsonFile(path.join(bundleRoot, "package", "package-ref.json"), packageRef);

  const artifactEntries = await collectArtifactManifestEntries(bundleRoot);
  await writeJsonFile(path.join(bundleRoot, "artifact-manifest.json"), {
    artifactManifestSchemaVersion: "1",
    artifacts: artifactEntries,
    hashAlgorithm: "sha256"
  });

  const artifactManifestDigest = await sha256NormalizedFile(
    path.join(bundleRoot, "artifact-manifest.json")
  );
  const bundleDigest = sha256Text(
    stableStringify({
      artifactInventory: artifactEntries,
      runBundle: omitDigestFields(runBundleWithoutDigests)
    })
  );

  await writeJsonFile(path.join(bundleRoot, "run-bundle.json"), {
    ...runBundleWithoutDigests,
    artifactManifestDigest,
    bundleDigest
  });

  return {
    artifactManifestDigest,
    bundleDigest,
    candidateDigest,
    environmentDigest,
    outputRoot: bundleRoot,
    promptPackageDigest: promptManifest.promptPackageDigest,
    runConfigDigest,
    verdictDigest
  };
}

async function loadBenchmarkPackageManifest(
  benchmarkPackageRoot: string
): Promise<BenchmarkPackageManifest> {
  const rawManifest = await readFile(
    path.join(benchmarkPackageRoot, benchmarkPackageManifestRelativePath),
    "utf8"
  );
  const benchmarkManifest = benchmarkPackageManifestSchema.parse(
    JSON.parse(normalizeText(rawManifest))
  );
  await validateBenchmarkPackageInput(benchmarkPackageRoot, benchmarkManifest);
  return benchmarkManifest;
}

async function loadPromptPackage(
  promptPackageRoot: string
): Promise<{
  promptManifest: PromptPackageManifest;
  runEnvelope: RunEnvelope;
}> {
  await ensurePromptPackageFiles(promptPackageRoot);

  const promptManifest = promptPackageManifestSchema.parse(
    JSON.parse(
      normalizeText(
        await readFile(path.join(promptPackageRoot, promptPackageManifestFilename), "utf8")
      )
    )
  );
  await validatePromptPackageInput(promptPackageRoot, promptManifest);

  const runEnvelope = runEnvelopeSchema.parse(
    JSON.parse(
      normalizeText(await readFile(path.join(promptPackageRoot, "run-envelope.json"), "utf8"))
    )
  );

  return {
    promptManifest,
    runEnvelope
  };
}

async function validateBenchmarkPackageInput(
  benchmarkPackageRoot: string,
  benchmarkManifest: BenchmarkPackageManifest
): Promise<void> {
  const declaredHashPaths = Object.keys(benchmarkManifest.hashes).sort();
  const expectedHashPaths = [...expectedBenchmarkHashPaths].sort();
  const discoveredPaths = await listRelativeFiles(benchmarkPackageRoot);
  const expectedPaths = [...requiredBenchmarkPackagePaths].sort();

  if (stableStringify(discoveredPaths) !== stableStringify(expectedPaths)) {
    throw new Error(
      [
        "Benchmark package tree does not match the required path set.",
        `Expected: ${expectedPaths.join(", ")}`,
        `Found: ${discoveredPaths.join(", ")}`
      ].join(" ")
    );
  }

  if (stableStringify(declaredHashPaths) !== stableStringify(expectedHashPaths)) {
    throw new Error(
      [
        "Benchmark package hash coverage does not match the required immutable file set.",
        `Expected: ${expectedHashPaths.join(", ")}`,
        `Found: ${declaredHashPaths.join(", ")}`
      ].join(" ")
    );
  }

  const validatedHashes: Array<[string, string]> = [];

  for (const [relativePath, expectedHash] of Object.entries(benchmarkManifest.hashes).sort(
    ([left], [right]) => left.localeCompare(right)
  )) {
    const actualHash = await sha256NormalizedFile(path.join(benchmarkPackageRoot, relativePath));

    if (actualHash !== expectedHash.toLowerCase()) {
      throw new Error(
        `Benchmark package hash mismatch for ${relativePath}: expected ${expectedHash}, got ${actualHash}.`
      );
    }

    validatedHashes.push([relativePath, actualHash]);
  }

  const recomputedPackageDigest = sha256Text(
    stableStringify({
      benchmarkFamily: benchmarkManifest.benchmarkFamily,
      benchmarkItemId: benchmarkManifest.benchmarkItemId,
      canonicalModules: benchmarkManifest.canonicalModules,
      fileHashes: Object.fromEntries(validatedHashes),
      lanePolicy: benchmarkManifest.lanePolicy,
      packageId: benchmarkManifest.packageId,
      packageRoot: benchmarkManifest.packageRoot,
      packageVersion: benchmarkManifest.packageVersion,
      sourceManifestDigest: benchmarkManifest.sourceManifestDigest,
      sourceSchemaVersion: benchmarkPackageSourceSchemaVersion
    })
  );

  if (recomputedPackageDigest !== benchmarkManifest.packageDigest.toLowerCase()) {
    throw new Error(
      `Benchmark package digest mismatch: expected ${benchmarkManifest.packageDigest}, got ${recomputedPackageDigest}.`
    );
  }
}

async function ensurePromptPackageFiles(promptPackageRoot: string): Promise<void> {
  for (const relativePath of requiredPromptPackagePaths) {
    await ensureFile(path.join(promptPackageRoot, relativePath));
  }
}

async function validatePromptPackageInput(
  promptPackageRoot: string,
  promptManifest: PromptPackageManifest
): Promise<void> {
  const discoveredPaths = await listRelativeFiles(promptPackageRoot);
  const expectedPaths = [...requiredPromptPackagePaths].sort();

  if (stableStringify(discoveredPaths) !== stableStringify(expectedPaths)) {
    throw new Error(
      [
        "Prompt package tree does not match the required path set.",
        `Expected: ${expectedPaths.join(", ")}`,
        `Found: ${discoveredPaths.join(", ")}`
      ].join(" ")
    );
  }

  const layerDigests = Object.fromEntries(
    await Promise.all(
      [...promptLayerFilenames]
        .sort((left, right) => left.localeCompare(right))
        .map(async (filename) => [
          filename,
          await sha256NormalizedFile(path.join(promptPackageRoot, filename))
        ] as const)
    )
  );

  if (stableStringify(layerDigests) !== stableStringify(promptManifest.layerDigests)) {
    throw new Error("Prompt package layer digests do not match the materialized layer files.");
  }

  const recomputedPromptDigest = sha256Text(
    stableStringify({
      authMode: promptManifest.authMode,
      benchmarkPackageDigest: promptManifest.benchmarkPackageDigest,
      benchmarkPackageId: promptManifest.benchmarkPackageId,
      benchmarkPackageVersion: promptManifest.benchmarkPackageVersion,
      harnessRevision: promptManifest.harnessRevision,
      laneId: promptManifest.laneId,
      layerDigests: promptManifest.layerDigests,
      layerVersions: promptManifest.layerVersions,
      modelConfigId: promptManifest.modelConfigId,
      promptProtocolVersion: promptManifest.promptProtocolVersion,
      providerFamily: promptManifest.providerFamily,
      runMode: promptManifest.runMode,
      toolProfile: promptManifest.toolProfile
    })
  );

  if (recomputedPromptDigest !== promptManifest.promptPackageDigest.toLowerCase()) {
    throw new Error(
      `Prompt package digest mismatch: expected ${promptManifest.promptPackageDigest}, got ${recomputedPromptDigest}.`
    );
  }
}

function assertBundleInputsAreConsistent(
  benchmarkManifest: BenchmarkPackageManifest,
  promptManifest: PromptPackageManifest,
  runEnvelope: RunEnvelope
): void {
  if (promptManifest.benchmarkPackageId !== benchmarkManifest.packageId) {
    throw new Error("Prompt package benchmarkPackageId does not match the benchmark package.");
  }

  if (promptManifest.benchmarkPackageVersion !== benchmarkManifest.packageVersion) {
    throw new Error("Prompt package benchmarkPackageVersion does not match the benchmark package.");
  }

  if (promptManifest.benchmarkPackageDigest !== benchmarkManifest.packageDigest) {
    throw new Error("Prompt package benchmarkPackageDigest does not match the benchmark package.");
  }

  if (runEnvelope.benchmarkPackageId !== promptManifest.benchmarkPackageId) {
    throw new Error("Run envelope benchmarkPackageId does not match the prompt package.");
  }

  if (runEnvelope.benchmarkPackageDigest !== promptManifest.benchmarkPackageDigest) {
    throw new Error("Run envelope benchmarkPackageDigest does not match the prompt package.");
  }

  if (runEnvelope.benchmarkPackageVersion !== promptManifest.benchmarkPackageVersion) {
    throw new Error("Run envelope benchmarkPackageVersion does not match the prompt package.");
  }

  if (runEnvelope.harnessRevision !== promptManifest.harnessRevision) {
    throw new Error("Run envelope harnessRevision does not match the prompt package.");
  }

  if (runEnvelope.laneId !== promptManifest.laneId) {
    throw new Error("Run envelope laneId does not match the prompt package.");
  }

  if (runEnvelope.providerFamily !== promptManifest.providerFamily) {
    throw new Error("Run envelope providerFamily does not match the prompt package.");
  }

  if (runEnvelope.authMode !== promptManifest.authMode) {
    throw new Error("Run envelope authMode does not match the prompt package.");
  }

  if (runEnvelope.modelConfigId !== promptManifest.modelConfigId) {
    throw new Error("Run envelope modelConfigId does not match the prompt package.");
  }

  if (runEnvelope.promptProtocolVersion !== promptManifest.promptProtocolVersion) {
    throw new Error("Run envelope promptProtocolVersion does not match the prompt package.");
  }

  if (runEnvelope.runMode !== promptManifest.runMode) {
    throw new Error("Run envelope runMode does not match the prompt package.");
  }

  if (runEnvelope.toolProfile !== promptManifest.toolProfile) {
    throw new Error("Run envelope toolProfile does not match the prompt package.");
  }
}

function buildEnvironmentManifest(options: {
  environmentInput: EnvironmentInput;
  promptManifest: PromptPackageManifest;
}): Record<string, unknown> {
  return {
    authMode: options.promptManifest.authMode,
    environmentSchemaVersion: options.environmentInput.environmentSchemaVersion,
    executionImageDigest: options.environmentInput.executionImageDigest,
    executionTargetKind: options.environmentInput.executionTargetKind,
    harnessRevision: options.promptManifest.harnessRevision,
    lakeSnapshotId: options.environmentInput.lakeSnapshotId,
    laneId: options.promptManifest.laneId,
    leanVersion: options.environmentInput.leanVersion,
    localDevboxDigest: options.environmentInput.localDevboxDigest,
    metadata: options.environmentInput.metadata,
    modelConfigId: options.promptManifest.modelConfigId,
    modelSnapshotId: options.environmentInput.modelSnapshotId,
    os: options.environmentInput.os,
    promptProtocolVersion: options.promptManifest.promptProtocolVersion,
    providerFamily: options.promptManifest.providerFamily,
    runMode: options.promptManifest.runMode,
    runtime: options.environmentInput.runtime,
    toolProfile: options.promptManifest.toolProfile,
    verifierVersion: options.environmentInput.verifierVersion
  };
}

function buildVerdict(options: {
  attemptId: string;
  axiomCheck: z.infer<typeof bundleAxiomCheckSchema>;
  benchmarkPackageDigest: string;
  candidateDigest: string;
  containsAdmit: boolean;
  containsSorry: boolean;
  diagnosticGate: z.infer<typeof bundleDiagnosticGateSchema>;
  failureClassification: FailureClassification | null;
  laneId: string;
  result: z.infer<typeof bundleResultSchema>;
  runId: string;
  semanticEquality: z.infer<typeof bundleSemanticEqualitySchema>;
  surfaceEquality: z.infer<typeof bundleSurfaceEqualitySchema>;
}): Record<string, unknown> {
  if (options.result === "pass") {
    if (options.failureClassification !== null) {
      throw new Error("Passing verdicts may not include a failure classification.");
    }

    if (options.semanticEquality !== "matched") {
      throw new Error("Passing verdicts require semanticEquality=matched.");
    }

    if (options.containsSorry || options.containsAdmit) {
      throw new Error("Passing verdicts may not contain sorry or admit.");
    }

    if (options.axiomCheck !== "passed") {
      throw new Error("Passing verdicts require axiomCheck=passed.");
    }

    if (options.diagnosticGate !== "passed") {
      throw new Error("Passing verdicts require diagnosticGate=passed.");
    }
  }

  const verdict = {
    attemptId: options.attemptId,
    axiomCheck: options.axiomCheck,
    benchmarkPackageDigest: options.benchmarkPackageDigest,
    candidateDigest: options.candidateDigest,
    containsAdmit: options.containsAdmit,
    containsSorry: options.containsSorry,
    diagnosticGate: options.diagnosticGate,
    failureCode:
      options.result === "fail" ? options.failureClassification?.failureCode ?? null : null,
    laneId: options.laneId,
    primaryFailure: options.failureClassification,
    result: options.result,
    runId: options.runId,
    semanticEquality: options.semanticEquality,
    surfaceEquality: options.surfaceEquality,
    surface_drift: options.surfaceEquality === "drifted",
    verdictSchemaVersion: "1"
  };

  if (options.result === "fail") {
    return verdict;
  }

  const { failureCode: _failureCode, ...passingVerdict } = verdict;
  return passingVerdict;
}

function buildPackageRef(options: {
  benchmarkManifest: BenchmarkPackageManifest;
  laneId: string;
}): Record<string, unknown> {
  return {
    benchmarkItemId: options.benchmarkManifest.benchmarkItemId,
    benchmarkPackageDigest: options.benchmarkManifest.packageDigest,
    benchmarkPackageId: options.benchmarkManifest.packageId,
    benchmarkPackageVersion: options.benchmarkManifest.packageVersion,
    canonicalModules: options.benchmarkManifest.canonicalModules,
    laneId: options.laneId,
    packageRefSchemaVersion: "1",
    packageRoot: options.benchmarkManifest.packageRoot
  };
}

async function collectArtifactManifestEntries(
  bundleRoot: string
): Promise<
  Array<{
    artifactRole: string;
    byteSize: number;
    contentEncoding: null;
    mediaType: string | null;
    relativePath: string;
    requiredForIngest: true;
    sha256: string;
  }>
> {
  const entries = await Promise.all(
    [...requiredBundleFiles].map(async (relativePath) => {
      const fullPath = path.join(bundleRoot, relativePath);
      const fileStats = await stat(fullPath);

      if (!fileStats.isFile()) {
        throw new Error(`Expected materialized bundle file: ${fullPath}`);
      }

      return {
        artifactRole: artifactRoleForPath(relativePath),
        byteSize: fileStats.size,
        contentEncoding: null,
        mediaType: mediaTypeForPath(relativePath),
        relativePath,
        requiredForIngest: true as const,
        sha256: await sha256NormalizedFile(fullPath)
      };
    })
  );

  return entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function artifactRoleForPath(relativePath: string): string {
  switch (relativePath) {
    case "package/package-ref.json":
    case "package/benchmark-package.json":
      return "package_reference";
    case "prompt/prompt-package.json":
      return "prompt_package";
    case "candidate/Candidate.lean":
      return "candidate_source";
    case "verification/verdict.json":
      return "verdict_record";
    case "verification/compiler-output.txt":
      return "compiler_output";
    case "verification/compiler-diagnostics.json":
      return "compiler_diagnostics";
    case "verification/verifier-output.json":
      return "verifier_output";
    case "environment/environment.json":
      return "environment_snapshot";
    default:
      throw new Error(`Unsupported artifact role path: ${relativePath}`);
  }
}

function mediaTypeForPath(relativePath: string): string | null {
  if (relativePath.endsWith(".json")) {
    return "application/json";
  }

  if (relativePath.endsWith(".txt") || relativePath.endsWith(".lean")) {
    return "text/plain";
  }

  return null;
}

async function copyNormalizedTextFile(sourcePath: string, destinationPath: string): Promise<void> {
  await writeNormalizedText(destinationPath, await loadNormalizedText(sourcePath));
}

async function ensureFile(filePath: string): Promise<void> {
  const fileStats = await stat(filePath);

  if (!fileStats.isFile()) {
    throw new Error(`Expected file path for run-bundle input: ${filePath}`);
  }
}

async function listRelativeFiles(root: string): Promise<string[]> {
  const paths: string[] = [];
  await walkDirectory(root, root, paths);
  return paths.sort();
}

async function walkDirectory(
  root: string,
  currentDirectory: string,
  results: string[]
): Promise<void> {
  const entries = await readdir(currentDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentDirectory, entry.name);
    const normalizedRelativePath = normalizePath(path.relative(root, fullPath));

    if (entry.isDirectory()) {
      await walkDirectory(root, fullPath, results);
      continue;
    }

    if (!entry.isFile()) {
      throw new Error(`Unsupported non-file bundle input entry: ${fullPath}`);
    }

    results.push(normalizedRelativePath);
  }
}

async function loadNormalizedText(filePath: string): Promise<string> {
  await ensureFile(filePath);
  return normalizeText(await readFile(filePath, "utf8"));
}

async function loadLooseJsonFile(filePath: string): Promise<unknown> {
  await ensureFile(filePath);
  return JSON.parse(normalizeText(await readFile(filePath, "utf8")));
}

async function loadJsonFile<TSchema extends z.ZodTypeAny>(
  filePath: string,
  schema: TSchema
): Promise<z.output<TSchema>> {
  await ensureFile(filePath);
  return schema.parse(JSON.parse(normalizeText(await readFile(filePath, "utf8"))));
}

async function writeNormalizedText(filePath: string, contents: string): Promise<void> {
  await writeFile(filePath, toWrittenText(contents), "utf8");
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeNormalizedText(filePath, stableStringify(value));
}

async function sha256NormalizedFile(filePath: string): Promise<string> {
  return sha256Text(await loadNormalizedText(filePath));
}

function sha256Text(text: string): string {
  return createHash("sha256").update(Buffer.from(normalizeText(text), "utf8")).digest("hex");
}

function normalizeText(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function toWrittenText(text: string): string {
  return `${normalizeText(text).replace(/\n?$/, "\n")}`;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value), null, 2);
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortJsonValue(nestedValue)])
    );
  }

  return value;
}

function omitNullValues<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, nestedValue]) => nestedValue !== null)
  );
}

function omitDigestFields<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !key.toLowerCase().endsWith("digest"))
  );
}

function normalizePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function assertOutputRootIsNotFilesystemRoot(outputRoot: string): void {
  if (path.parse(outputRoot).root === outputRoot) {
    throw new Error(
      "Run bundle output may not be a filesystem root. Choose a dedicated output directory."
    );
  }
}

async function assertNoPathOverlap(
  protectedPath: string,
  outputRoot: string,
  protectedDescription: string
): Promise<void> {
  const normalizedProtectedPath = await resolvePathForComparison(protectedPath);
  const normalizedOutputRoot = await resolvePathForComparison(outputRoot);

  const protectedContainsOutput =
    normalizedOutputRoot === normalizedProtectedPath ||
    normalizedOutputRoot.startsWith(`${normalizedProtectedPath}/`);
  const outputContainsProtected =
    normalizedProtectedPath.startsWith(`${normalizedOutputRoot}/`);

  if (protectedContainsOutput || outputContainsProtected) {
    throw new Error(
      `Run bundle output overlaps the ${protectedDescription}. Choose a different output directory.`
    );
  }
}

async function resolvePathForComparison(filePath: string): Promise<string> {
  const absolutePath = path.resolve(filePath);
  const unresolvedSegments: string[] = [];
  let currentPath = absolutePath;

  while (true) {
    try {
      const resolvedPath = await realpath(currentPath);
      return normalizePath(path.join(resolvedPath, ...unresolvedSegments.reverse())).toLowerCase();
    } catch {
      const parentPath = path.dirname(currentPath);

      if (parentPath === currentPath) {
        throw new Error(`Could not resolve filesystem path for comparison: ${filePath}`);
      }

      unresolvedSegments.push(path.basename(currentPath));
      currentPath = parentPath;
    }
  }
}
