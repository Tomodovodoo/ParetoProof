import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { materializeProblem9Package } from "./problem9-package.js";
import {
  getDefaultProblem9PromptPackageOptions,
  materializeProblem9PromptPackage
} from "./problem9-prompt-package.js";

const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

type FixturePaths = {
  benchmarkPackageRoot: string;
  candidateSourcePath: string;
  compilerDiagnosticsPath: string;
  compilerOutputPath: string;
  environmentInputPath: string;
  failureClassificationPath: string;
  promptPackageRoot: string;
  verifierOutputPath: string;
};

type RunBundleCliResult = {
  artifactManifestDigest: string;
  bundleDigest: string;
  candidateDigest: string;
  environmentDigest: string;
  outputRoot: string;
  promptPackageDigest: string;
  runConfigDigest: string;
  verdictDigest: string;
};

type CliExecution = {
  status: number | null;
  stderr: string;
  stdout: string;
};

test("materialize-problem9-run-bundle CLI is deterministic for identical fixture inputs", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-run-bundle-"));

  try {
    const fixturePaths = await createFixtureInputs(tempRoot);
    const firstOutputRoot = path.join(tempRoot, "outputs", "first");
    const secondOutputRoot = path.join(tempRoot, "outputs", "second");

    const firstResult = runRunBundleCli({
      fixturePaths,
      outputRoot: firstOutputRoot
    });
    const secondResult = runRunBundleCli({
      fixturePaths,
      outputRoot: secondOutputRoot
    });

    assert.equal(firstResult.status, 0, firstResult.stderr);
    assert.equal(secondResult.status, 0, secondResult.stderr);

    const firstBundle = JSON.parse(firstResult.stdout) as RunBundleCliResult;
    const secondBundle = JSON.parse(secondResult.stdout) as RunBundleCliResult;

    assert.deepEqual(
      {
        artifactManifestDigest: firstBundle.artifactManifestDigest,
        bundleDigest: firstBundle.bundleDigest,
        candidateDigest: firstBundle.candidateDigest,
        environmentDigest: firstBundle.environmentDigest,
        promptPackageDigest: firstBundle.promptPackageDigest,
        runConfigDigest: firstBundle.runConfigDigest,
        verdictDigest: firstBundle.verdictDigest
      },
      {
        artifactManifestDigest: secondBundle.artifactManifestDigest,
        bundleDigest: secondBundle.bundleDigest,
        candidateDigest: secondBundle.candidateDigest,
        environmentDigest: secondBundle.environmentDigest,
        promptPackageDigest: secondBundle.promptPackageDigest,
        runConfigDigest: secondBundle.runConfigDigest,
        verdictDigest: secondBundle.verdictDigest
      }
    );

    assert.equal(
      await readNormalizedText(path.join(firstBundle.outputRoot, "artifact-manifest.json")),
      await readNormalizedText(path.join(secondBundle.outputRoot, "artifact-manifest.json"))
    );
    assert.equal(
      await readNormalizedText(path.join(firstBundle.outputRoot, "run-bundle.json")),
      await readNormalizedText(path.join(secondBundle.outputRoot, "run-bundle.json"))
    );
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("materialize-problem9-run-bundle rejects output roots that contain fixture inputs", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-run-bundle-"));

  try {
    const fixturePaths = await createFixtureInputs(path.join(tempRoot, "fixture-root"));
    const result = runRunBundleCli({
      fixturePaths,
      outputRoot: path.join(tempRoot, "fixture-root")
    });

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /Run bundle output overlaps the benchmark package input\. Choose a different output directory\./u
    );
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("materialize-problem9-run-bundle accepts legacy v1 benchmark manifests without sourceMetadata", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-run-bundle-"));

  try {
    const fixturePaths = await createFixtureInputs(tempRoot, {
      legacyBenchmarkManifest: true
    });
    const result = runRunBundleCli({
      fixturePaths,
      outputRoot: path.join(tempRoot, "outputs", "legacy")
    });

    assert.equal(result.status, 0, result.stderr);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("materialize-problem9-run-bundle rejects deprecated truth-bearing CLI flags", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-run-bundle-"));

  try {
    const fixturePaths = await createFixtureInputs(tempRoot);
    const result = runRunBundleCli({
      extraArgs: ["--result", "pass", "--stop-reason", "verification_passed"],
      fixturePaths,
      outputRoot: path.join(tempRoot, "outputs", "deprecated-flags")
    });

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /Canonical run-bundle truth is now derived from bundled verifier artifacts; remove --result, --stop-reason\./u
    );
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("materialize-problem9-run-bundle rejects failing verifier artifacts without a failure classification", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-run-bundle-"));

  try {
    const fixturePaths = await createFixtureInputs(tempRoot);
    const failingVerifierOutputPath = fixturePaths.verifierOutputPath;
    const failingVerifierOutput = JSON.parse(
      await readNormalizedText(failingVerifierOutputPath)
    ) as Record<string, unknown>;

    failingVerifierOutput.axiomCheck = {
      output: "",
      result: "not_evaluated"
    };
    failingVerifierOutput.diagnosticGate = {
      result: "failed"
    };
    failingVerifierOutput.result = "fail";
    failingVerifierOutput.semanticCheck = {
      output: "Compile gate failed before semantic verification.",
      result: "not_evaluated"
    };
    failingVerifierOutput.surfaceEquality = "not_evaluated";
    await writeJsonFile(failingVerifierOutputPath, failingVerifierOutput);

    const result = runRunBundleCli({
      fixturePaths,
      outputRoot: path.join(tempRoot, "outputs", "failing-verifier")
    });

    assert.equal(result.status, 2);
    assert.match(
      result.stderr,
      /Failing bundles require --failure-classification <path>\./u
    );
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("materialize-problem9-run-bundle bundles failure classification artifacts for failing runs", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-run-bundle-"));

  try {
    const fixturePaths = await createFixtureInputs(tempRoot);

    await writeJsonFile(fixturePaths.compilerDiagnosticsPath, {
      compilerDiagnosticsSchemaVersion: "1",
      diagnostics: [{ message: "type mismatch", severity: "error", terminal: true }],
      success: false
    });
    await writeNormalizedText(
      fixturePaths.compilerOutputPath,
      "error: type mismatch\n"
    );
    await writeJsonFile(fixturePaths.verifierOutputPath, {
      axiomCheck: {
        output: "",
        result: "not_evaluated"
      },
      diagnosticGate: {
        result: "failed"
      },
      forbiddenTokens: {
        containsAdmit: false,
        containsSorry: false
      },
      result: "fail",
      semanticCheck: {
        output: "Compile gate failed before semantic verification.",
        result: "not_evaluated"
      },
      surfaceEquality: "not_evaluated",
      surface_drift: false,
      theoremHeaders: {
        canonical: "",
        candidate: ""
      },
      verifierOutputSchemaVersion: "1"
    });

    const result = runRunBundleCli({
      fixturePaths,
      includeFailureClassification: true,
      outputRoot: path.join(tempRoot, "outputs", "failing-bundle")
    });

    assert.equal(result.status, 0, result.stderr);

    const payload = JSON.parse(result.stdout) as RunBundleCliResult;
    const artifactManifest = JSON.parse(
      await readNormalizedText(path.join(payload.outputRoot, "artifact-manifest.json"))
    ) as {
      artifacts: Array<{ relativePath: string }>;
    };
    const runBundle = JSON.parse(
      await readNormalizedText(path.join(payload.outputRoot, "run-bundle.json"))
    ) as {
      status: string;
      stopReason: string;
    };

    assert.equal(runBundle.status, "failure");
    assert.equal(runBundle.stopReason, "compile_failed");
    assert.deepEqual(
      artifactManifest.artifacts.map((artifact) => artifact.relativePath),
      [
        "candidate/Candidate.lean",
        "environment/environment.json",
        "package/benchmark-package.json",
        "package/package-ref.json",
        "prompt/prompt-package.json",
        "verification/compiler-diagnostics.json",
        "verification/compiler-output.txt",
        "verification/failure-classification.json",
        "verification/verdict.json",
        "verification/verifier-output.json"
      ]
    );
    assert.equal(
      await readNormalizedText(
        path.join(payload.outputRoot, "verification", "failure-classification.json")
      ),
      await readNormalizedText(fixturePaths.failureClassificationPath)
    );
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("materialize-problem9-run-bundle allows later non-compile failures after stale compile diagnostics", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-run-bundle-"));

  try {
    const fixturePaths = await createFixtureInputs(tempRoot);

    await writeJsonFile(fixturePaths.compilerDiagnosticsPath, {
      compilerDiagnosticsSchemaVersion: "1",
      diagnostics: [{ message: "type mismatch", severity: "error", terminal: true }],
      success: false
    });
    await writeNormalizedText(
      fixturePaths.compilerOutputPath,
      "error: type mismatch\n"
    );
    await writeJsonFile(fixturePaths.verifierOutputPath, {
      axiomCheck: {
        output: "",
        result: "not_evaluated"
      },
      diagnosticGate: {
        result: "failed"
      },
      forbiddenTokens: {
        containsAdmit: false,
        containsSorry: false
      },
      result: "fail",
      semanticCheck: {
        output: "Compile gate failed before semantic verification.",
        result: "not_evaluated"
      },
      surfaceEquality: "not_evaluated",
      surface_drift: false,
      theoremHeaders: {
        canonical: "",
        candidate: ""
      },
      verifierOutputSchemaVersion: "1"
    });
    await writeJsonFile(fixturePaths.failureClassificationPath, {
      evidenceArtifactRefs: [
        "candidate/Candidate.lean",
        "verification/compiler-diagnostics.json",
        "verification/compiler-output.txt"
      ],
      failureCode: "provider_timeout",
      failureFamily: "provider",
      phase: "generate",
      retryEligibility: "manual_retry_only",
      summary: "Provider timed out after the last compile repair request.",
      terminality: "terminal_attempt",
      userVisibility: "user_visible"
    });

    const result = runRunBundleCli({
      fixturePaths,
      includeFailureClassification: true,
      outputRoot: path.join(tempRoot, "outputs", "stale-compile-provider-failure")
    });

    assert.equal(result.status, 0, result.stderr);

    const payload = JSON.parse(result.stdout) as RunBundleCliResult;
    const runBundle = JSON.parse(
      await readNormalizedText(path.join(payload.outputRoot, "run-bundle.json"))
    ) as {
      status: string;
      stopReason: string;
    };
    const verdict = JSON.parse(
      await readNormalizedText(path.join(payload.outputRoot, "verification", "verdict.json"))
    ) as {
      diagnosticGate: string;
      primaryFailure: { failureCode: string };
      result: string;
    };

    assert.equal(runBundle.status, "failure");
    assert.equal(runBundle.stopReason, "provider_failed");
    assert.equal(verdict.result, "fail");
    assert.equal(verdict.diagnosticGate, "failed");
    assert.equal(verdict.primaryFailure.failureCode, "provider_timeout");
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("materialize-problem9-run-bundle rejects passing verifier artifacts when the candidate still contains sorry", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-run-bundle-"));

  try {
    const fixturePaths = await createFixtureInputs(tempRoot);

    await writeNormalizedText(
      fixturePaths.candidateSourcePath,
      [
        "import FirstProof.Problem9.Support",
        "",
        "namespace FirstProof.Problem9",
        "",
        "theorem problem9 (n : Nat) :",
        "    2 * triangular n = n * Nat.succ n := by",
        "  sorry",
        "",
        "end FirstProof.Problem9"
      ].join("\n")
    );

    const result = runRunBundleCli({
      fixturePaths,
      outputRoot: path.join(tempRoot, "outputs", "candidate-sorry")
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /Passing verdicts may not contain sorry or admit\./u);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

async function createFixtureInputs(
  root: string,
  options: {
    legacyBenchmarkManifest?: boolean;
  } = {}
): Promise<FixturePaths> {
  const benchmarkOutputRoot = path.join(root, "benchmark-output");
  const benchmarkPackage = await materializeProblem9Package({
    outputRoot: benchmarkOutputRoot
  });

  if (options.legacyBenchmarkManifest) {
    await rewriteBenchmarkManifestForLegacyCompatibility(benchmarkPackage.outputRoot);
  }

  const promptOutputRoot = path.join(root, "prompt-output");
  const promptDefaults = getDefaultProblem9PromptPackageOptions();
  const promptPackage = await materializeProblem9PromptPackage({
    attemptId: "attempt-fixture-001",
    authMode: "local_stub",
    benchmarkPackageRoot: benchmarkPackage.outputRoot,
    harnessRevision: "fixture-harness-rev",
    jobId: null,
    laneId: "lean422_exact",
    modelConfigId: "local_stub/problem9_fixture.v1",
    outputRoot: promptOutputRoot,
    passKCount: null,
    passKIndex: null,
    promptLayerVersions: promptDefaults.promptLayerVersions,
    promptProtocolVersion: promptDefaults.promptProtocolVersion,
    providerFamily: "openai",
    runId: "run-fixture-001",
    runMode: "single_pass_probe",
    toolProfile: "workspace_edit_limited"
  });

  const inputsRoot = path.join(root, "inputs");
  await writeNormalizedText(
    path.join(inputsRoot, "Candidate.lean"),
    [
      "import FirstProof.Problem9.Support",
      "",
      "namespace FirstProof.Problem9",
      "",
      "theorem problem9 (n : Nat) :",
      "    2 * triangular n = n * Nat.succ n := by",
      "  induction n with",
      "  | zero =>",
      "      rfl",
      "  | succ n ih =>",
      "      calc",
      "        2 * triangular (Nat.succ n)",
      "            = 2 * (triangular n + Nat.succ n) := by",
      "                exact congrArg (fun value => 2 * value) (triangular_succ n)",
      "        _ = 2 * triangular n + 2 * Nat.succ n := by",
      "              exact Nat.left_distrib 2 (triangular n) (Nat.succ n)",
      "        _ = n * Nat.succ n + 2 * Nat.succ n := by",
      "              exact congrArg (fun value => value + 2 * Nat.succ n) ih",
      "        _ = n * Nat.succ n + (Nat.succ n + Nat.succ n) := by",
      "              exact congrArg (fun value => n * Nat.succ n + value) (two_mul_nat (Nat.succ n))",
      "        _ = Nat.succ n * n + (Nat.succ n + Nat.succ n) := by",
      "              exact congrArg",
      "                (fun value => value + (Nat.succ n + Nat.succ n))",
      "                (Nat.mul_comm n (Nat.succ n))",
      "        _ = (Nat.succ n * n + Nat.succ n) + Nat.succ n := by",
      "              exact (Nat.add_assoc (Nat.succ n * n) (Nat.succ n) (Nat.succ n)).symm",
      "        _ = Nat.succ n * Nat.succ n + Nat.succ n := by",
      "              exact congrArg",
      "                (fun value => value + Nat.succ n)",
      "                (Nat.mul_succ (Nat.succ n) n).symm",
      "        _ = Nat.succ n * Nat.succ (Nat.succ n) := by",
      "              exact (Nat.mul_succ (Nat.succ n) (Nat.succ n)).symm",
      "",
      "end FirstProof.Problem9"
    ].join("\n")
  );
  await writeJsonFile(path.join(inputsRoot, "compiler-diagnostics.json"), {
    compilerDiagnosticsSchemaVersion: "1",
    diagnostics: [],
    success: true
  });
  await writeNormalizedText(
    path.join(inputsRoot, "compiler-output.txt"),
    "Build completed successfully."
  );
  await writeJsonFile(path.join(inputsRoot, "verifier-output.json"), {
    axiomCheck: {
      output: "FirstProof.Problem9.problem9 does not depend on any axioms",
      result: "passed"
    },
    diagnosticGate: {
      result: "passed"
    },
    forbiddenTokens: {
      containsAdmit: false,
      containsSorry: false
    },
    result: "pass",
    semanticCheck: {
      output: "",
      result: "matched"
    },
    surfaceEquality: "matched",
    surface_drift: false,
    theoremHeaders: {
      canonical:
        "declaration problem9 (n : Nat) : 2 * triangular n = n * Nat.succ n",
      candidate:
        "declaration problem9 (n : Nat) : 2 * triangular n = n * Nat.succ n"
    },
    verifierOutputSchemaVersion: "1"
  });
  await writeJsonFile(path.join(inputsRoot, "environment-input.json"), {
    environmentSchemaVersion: "1",
    executionImageDigest: null,
    executionTargetKind: "problem9-devbox",
    lakeSnapshotId: "fixture-lake-snapshot",
    leanVersion: "Lean (version 4.22.0, fixture)",
    localDevboxDigest: null,
    metadata: {
      fixture: true
    },
    modelSnapshotId: "local_stub/problem9_fixture_snapshot.v1",
    os: {
      arch: "x64",
      platform: "linux",
      release: "fixture-kernel"
    },
    runtime: {
      bunVersion: "1.3.10",
      nodeVersion: "v22.14.0",
      tsxVersion: "4.20.5"
    },
    verifierVersion: "problem9-local-verifier.v1"
  });
  await writeJsonFile(path.join(inputsRoot, "failure-classification.json"), {
    evidenceArtifactRefs: [
      "candidate/Candidate.lean",
      "verification/compiler-diagnostics.json",
      "verification/compiler-output.txt",
      "verification/verifier-output.json"
    ],
    failureCode: "compile_failed",
    failureFamily: "compile",
    phase: "compile",
    retryEligibility: "manual_retry_only",
    summary: "Fixture compile failure",
    terminality: "terminal_attempt",
    userVisibility: "user_visible"
  });

  return {
    benchmarkPackageRoot: benchmarkPackage.outputRoot,
    candidateSourcePath: path.join(inputsRoot, "Candidate.lean"),
    compilerDiagnosticsPath: path.join(inputsRoot, "compiler-diagnostics.json"),
    compilerOutputPath: path.join(inputsRoot, "compiler-output.txt"),
    environmentInputPath: path.join(inputsRoot, "environment-input.json"),
    failureClassificationPath: path.join(inputsRoot, "failure-classification.json"),
    promptPackageRoot: promptPackage.outputRoot,
    verifierOutputPath: path.join(inputsRoot, "verifier-output.json")
  };
}

function runRunBundleCli(options: {
  extraArgs?: string[];
  fixturePaths: FixturePaths;
  includeFailureClassification?: boolean;
  outputRoot: string;
}): CliExecution {
  const args = [
    "--import",
    "tsx",
    path.join(workerRoot, "src", "index.ts"),
    "materialize-problem9-run-bundle",
    "--output",
    options.outputRoot,
    "--benchmark-package-root",
    options.fixturePaths.benchmarkPackageRoot,
    "--prompt-package-root",
    options.fixturePaths.promptPackageRoot,
    "--candidate-source",
    options.fixturePaths.candidateSourcePath,
    "--compiler-diagnostics",
    options.fixturePaths.compilerDiagnosticsPath,
    "--compiler-output",
    options.fixturePaths.compilerOutputPath,
    "--verifier-output",
    options.fixturePaths.verifierOutputPath,
    "--environment-input",
    options.fixturePaths.environmentInputPath
  ];

  if (options.includeFailureClassification) {
    args.push("--failure-classification", options.fixturePaths.failureClassificationPath);
  }

  if (options.extraArgs) {
    args.push(...options.extraArgs);
  }

  const result = spawnSync(resolveNodeBinary(), args, {
    cwd: workerRoot,
    encoding: "utf8"
  });

  return {
    status: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? ""
  };
}

async function readNormalizedText(filePath: string): Promise<string> {
  return normalizeText(await readFile(filePath, "utf8"));
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeNormalizedText(filePath, JSON.stringify(value, null, 2));
}

async function writeNormalizedText(filePath: string, value: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${normalizeText(value).replace(/\n?$/u, "\n")}`, "utf8");
}

function normalizeText(value: string): string {
  return value.replace(/^\uFEFF/u, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

async function rewriteBenchmarkManifestForLegacyCompatibility(
  benchmarkPackageRoot: string
): Promise<void> {
  const manifestPath = path.join(benchmarkPackageRoot, "benchmark-package.json");
  const manifest = JSON.parse(await readNormalizedText(manifestPath)) as Record<string, unknown>;

  delete manifest.sourceMetadata;
  manifest.lanePolicy = {
    primaryLane: "lean422_exact",
    supportedLanes: ["lean422_exact", "lean424_interop"]
  };
  manifest.packageDigest = computeLegacyBenchmarkPackageDigest(manifest);

  await writeJsonFile(manifestPath, manifest);
}

function computeLegacyBenchmarkPackageDigest(manifest: Record<string, unknown>): string {
  return sha256Text(
    JSON.stringify(
      sortJsonValue({
        benchmarkFamily: manifest.benchmarkFamily,
        benchmarkItemId: manifest.benchmarkItemId,
        canonicalModules: manifest.canonicalModules,
        fileHashes: manifest.hashes,
        lanePolicy: manifest.lanePolicy,
        packageId: manifest.packageId,
        packageRoot: manifest.packageRoot,
        packageVersion: manifest.packageVersion,
        sourceManifestDigest: manifest.sourceManifestDigest,
        sourceSchemaVersion: "1"
      }),
      null,
      2
    )
  );
}

function sha256Text(text: string): string {
  return createHash("sha256").update(Buffer.from(normalizeText(text), "utf8")).digest("hex");
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

function resolveNodeBinary(): string {
  const bunRuntime = (globalThis as { Bun?: { which(command: string): string | null } }).Bun;
  return bunRuntime?.which("node") ?? process.execPath;
}
