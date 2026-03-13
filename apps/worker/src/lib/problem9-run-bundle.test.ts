import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
      outputRoot: firstOutputRoot,
      result: "pass"
    });
    const secondResult = runRunBundleCli({
      fixturePaths,
      outputRoot: secondOutputRoot,
      result: "pass"
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
      outputRoot: path.join(tempRoot, "fixture-root"),
      result: "pass"
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

async function createFixtureInputs(root: string): Promise<FixturePaths> {
  const benchmarkOutputRoot = path.join(root, "benchmark-output");
  const benchmarkPackage = await materializeProblem9Package({
    outputRoot: benchmarkOutputRoot
  });
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
      "    triangular (Nat.succ n) = triangular n + Nat.succ n := by",
      "  rfl",
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
        "theorem problem9 (n : Nat) : triangular (Nat.succ n) = triangular n + Nat.succ n := by",
      candidate:
        "theorem problem9 (n : Nat) : triangular (Nat.succ n) = triangular n + Nat.succ n := by"
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
  fixturePaths: FixturePaths;
  outputRoot: string;
  result: "fail" | "pass";
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
    options.fixturePaths.environmentInputPath,
    "--result",
    options.result,
    "--semantic-equality",
    "matched",
    "--surface-equality",
    "matched",
    "--contains-sorry",
    "false",
    "--contains-admit",
    "false",
    "--axiom-check",
    "passed",
    "--diagnostic-gate",
    "passed",
    "--stop-reason",
    "verification_passed"
  ];

  if (options.result === "fail") {
    args.push("--failure-classification", options.fixturePaths.failureClassificationPath);
  }

  const result = spawnSync(process.execPath, args, {
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
