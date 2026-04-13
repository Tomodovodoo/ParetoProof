import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { materializeProblem9Package } from "../src/lib/problem9-package.ts";
import {
  getDefaultProblem9PromptPackageOptions,
  materializeProblem9PromptPackage,
  type MaterializeProblem9PromptPackageOptions
} from "../src/lib/problem9-prompt-package.ts";
import { materializeProblem9RunBundle } from "../src/lib/problem9-run-bundle.ts";

const expectedIntegrityDigests = {
  benchmarkPackage: "2a613fe5717c5df32fc3c95b0cf4cbbc9a99312c0cac44948b0cd641acac8dcb",
  promptPackage: "f0fe26f4c426b6b51d524a6bcf23331556a590d0b621f5ccc74fe416c1f7f329",
  runBundle: "2dd7fae8adf2d9e9559dc0e1148dc3095f5668f15a4e6aa80394ec82c6139059"
} as const;

const expectedBenchmarkSourceMetadata = {
  laneEvidence: {
    lean422_exact: "lean-toolchain"
  },
  license: {
    file: "LICENSE",
    spdxId: "Apache-2.0"
  },
  provenance: {
    goldModule: "FirstProof/Problem9/Gold.lean",
    humanStatement: "statements/problem.md",
    statementModule: "FirstProof/Problem9/Statement.lean",
    supportModule: "FirstProof/Problem9/Support.lean"
  },
  regressionEvidence: {
    cohesionCheck: "bun run check:problem9-package-cohesion",
    integrityTest: "node --import tsx --test test/problem9-integrity.test.ts"
  }
} as const;

// Update these only when the checked-in canonical Problem 9 fixtures intentionally change.

type IntegrityFixture = {
  benchmarkPackageRoot: string;
  bundleInputs: {
    candidateSourcePath: string;
    compilerDiagnosticsPath: string;
    compilerOutputPath: string;
    environmentInputPath: string;
    verifierOutputPath: string;
  };
  promptOptions: Omit<
    MaterializeProblem9PromptPackageOptions,
    "benchmarkPackageRoot" | "outputRoot"
  >;
};

test("Problem 9 benchmark package materialization stays deterministic", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-integrity-"));

  try {
    const firstPackage = await materializeProblem9Package({
      outputRoot: path.join(tempRoot, "benchmark-first")
    });
    const secondPackage = await materializeProblem9Package({
      outputRoot: path.join(tempRoot, "benchmark-second")
    });

    assert.equal(firstPackage.packageDigest, expectedIntegrityDigests.benchmarkPackage);
    assert.equal(secondPackage.packageDigest, expectedIntegrityDigests.benchmarkPackage);

    const firstManifestText = await readNormalizedText(
      path.join(firstPackage.outputRoot, "benchmark-package.json")
    );
    const firstManifest = JSON.parse(firstManifestText) as Record<string, unknown>;

    assert.deepEqual(firstManifest.sourceMetadata, expectedBenchmarkSourceMetadata);
    assert.deepEqual(firstManifest.lanePolicy, {
      primaryLane: "lean422_exact",
      supportedLanes: ["lean422_exact"]
    });

    assert.equal(
      firstManifestText,
      await readNormalizedText(path.join(secondPackage.outputRoot, "benchmark-package.json"))
    );
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("Problem 9 prompt package materialization stays deterministic", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-integrity-"));

  try {
    const fixture = await createIntegrityFixture(tempRoot);
    const firstPrompt = await materializePromptPackage(
      fixture,
      path.join(tempRoot, "prompt-first")
    );
    const secondPrompt = await materializePromptPackage(
      fixture,
      path.join(tempRoot, "prompt-second")
    );

    assert.equal(firstPrompt.promptPackageDigest, expectedIntegrityDigests.promptPackage);
    assert.equal(secondPrompt.promptPackageDigest, expectedIntegrityDigests.promptPackage);
    assert.equal(
      await readNormalizedText(path.join(firstPrompt.outputRoot, "prompt-package.json")),
      await readNormalizedText(path.join(secondPrompt.outputRoot, "prompt-package.json"))
    );
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("Problem 9 run-bundle materialization stays deterministic", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-integrity-"));

  try {
    const fixture = await createIntegrityFixture(tempRoot);
    const promptPackage = await materializePromptPackage(
      fixture,
      path.join(tempRoot, "prompt-source")
    );
    const firstBundle = await materializeProblem9RunBundle({
      benchmarkPackageRoot: fixture.benchmarkPackageRoot,
      ...fixture.bundleInputs,
      failureClassificationPath: null,
      outputRoot: path.join(tempRoot, "bundle-first"),
      promptPackageRoot: promptPackage.outputRoot,
    });
    const secondBundle = await materializeProblem9RunBundle({
      benchmarkPackageRoot: fixture.benchmarkPackageRoot,
      ...fixture.bundleInputs,
      failureClassificationPath: null,
      outputRoot: path.join(tempRoot, "bundle-second"),
      promptPackageRoot: promptPackage.outputRoot,
    });

    assert.equal(firstBundle.bundleDigest, expectedIntegrityDigests.runBundle);
    assert.equal(secondBundle.bundleDigest, expectedIntegrityDigests.runBundle);
    assert.equal(
      await readNormalizedText(path.join(firstBundle.outputRoot, "run-bundle.json")),
      await readNormalizedText(path.join(secondBundle.outputRoot, "run-bundle.json"))
    );
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("Problem 9 run-bundle materialization rejects hosted worker provenance without a wrapper digest", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-integrity-"));

  try {
    const fixture = await createIntegrityFixture(tempRoot);
    const promptPackage = await materializePromptPackage(
      fixture,
      path.join(tempRoot, "prompt-source")
    );
    const environmentInput = JSON.parse(
      await readNormalizedText(fixture.bundleInputs.environmentInputPath)
    ) as Record<string, unknown>;

    await writeJsonFile(fixture.bundleInputs.environmentInputPath, {
      ...environmentInput,
      executionImageDigest: null,
      executionTargetKind: "paretoproof-worker",
      localDevboxDigest: null
    });

    await assert.rejects(
      materializeProblem9RunBundle({
        benchmarkPackageRoot: fixture.benchmarkPackageRoot,
        ...fixture.bundleInputs,
        failureClassificationPath: null,
        outputRoot: path.join(tempRoot, "bundle-invalid-hosted-digest"),
        promptPackageRoot: promptPackage.outputRoot,
      }),
      /executionImageDigest is required when executionTargetKind is paretoproof-worker/u
    );
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("Problem 9 run-bundle materialization rejects hosted worker provenance with a devbox digest", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-integrity-"));

  try {
    const fixture = await createIntegrityFixture(tempRoot);
    const promptPackage = await materializePromptPackage(
      fixture,
      path.join(tempRoot, "prompt-source")
    );
    const environmentInput = JSON.parse(
      await readNormalizedText(fixture.bundleInputs.environmentInputPath)
    ) as Record<string, unknown>;

    await writeJsonFile(fixture.bundleInputs.environmentInputPath, {
      ...environmentInput,
      executionImageDigest: "7".repeat(64),
      executionTargetKind: "paretoproof-worker",
      localDevboxDigest: "8".repeat(64)
    });

    await assert.rejects(
      materializeProblem9RunBundle({
        benchmarkPackageRoot: fixture.benchmarkPackageRoot,
        ...fixture.bundleInputs,
        failureClassificationPath: null,
        outputRoot: path.join(tempRoot, "bundle-invalid-hosted-devbox"),
        promptPackageRoot: promptPackage.outputRoot,
      }),
      /localDevboxDigest must be null when executionTargetKind is paretoproof-worker/u
    );
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("prompt-package materialization rejects tampered benchmark-package inputs", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-integrity-"));

  try {
    const fixture = await createIntegrityFixture(tempRoot);
    const tamperedStatementPath = path.join(
      fixture.benchmarkPackageRoot,
      "statements",
      "problem.md"
    );

    await writeNormalizedText(
      tamperedStatementPath,
      `${await readNormalizedText(tamperedStatementPath)}\nTampered benchmark fixture.\n`
    );

    await assert.rejects(
      materializePromptPackage(fixture, path.join(tempRoot, "prompt-after-benchmark-tamper")),
      /Benchmark package hash mismatch for statements\/problem\.md:/u
    );
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("run-bundle materialization rejects tampered prompt-package inputs", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-integrity-"));

  try {
    const fixture = await createIntegrityFixture(tempRoot);
    const promptPackage = await materializePromptPackage(
      fixture,
      path.join(tempRoot, "prompt-source")
    );
    const tamperedRunEnvelopePath = path.join(promptPackage.outputRoot, "run-envelope.json");
    const tamperedRunEnvelope = JSON.parse(
      await readNormalizedText(tamperedRunEnvelopePath)
    ) as Record<string, unknown>;

    tamperedRunEnvelope.modelConfigId = "local_stub/problem9_tampered_fixture.v1";
    await writeJsonFile(tamperedRunEnvelopePath, tamperedRunEnvelope);

    await assert.rejects(
      materializeProblem9RunBundle({
        benchmarkPackageRoot: fixture.benchmarkPackageRoot,
        ...fixture.bundleInputs,
        failureClassificationPath: null,
        outputRoot: path.join(tempRoot, "bundle-after-prompt-tamper"),
        promptPackageRoot: promptPackage.outputRoot
      }),
      /Prompt package layer digests do not match the materialized layer files\./u
    );
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

async function createIntegrityFixture(tempRoot: string): Promise<IntegrityFixture> {
  const benchmarkPackage = await materializeProblem9Package({
    outputRoot: path.join(tempRoot, "benchmark-source")
  });
  const promptDefaults = getDefaultProblem9PromptPackageOptions();
  const inputsRoot = path.join(tempRoot, "inputs");

  const candidateSourcePath = path.join(inputsRoot, "Candidate.lean");
  const compilerDiagnosticsPath = path.join(inputsRoot, "compiler-diagnostics.json");
  const compilerOutputPath = path.join(inputsRoot, "compiler-output.txt");
  const environmentInputPath = path.join(inputsRoot, "environment-input.json");
  const verifierOutputPath = path.join(inputsRoot, "verifier-output.json");

  await writeNormalizedText(
    candidateSourcePath,
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
  await writeJsonFile(compilerDiagnosticsPath, {
    compilerDiagnosticsSchemaVersion: "1",
    diagnostics: [],
    success: true
  });
  await writeNormalizedText(compilerOutputPath, "Build completed successfully.");
  await writeJsonFile(verifierOutputPath, {
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
  await writeJsonFile(environmentInputPath, {
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

  return {
    benchmarkPackageRoot: benchmarkPackage.outputRoot,
    bundleInputs: {
      candidateSourcePath,
      compilerDiagnosticsPath,
      compilerOutputPath,
      environmentInputPath,
      verifierOutputPath
    },
    promptOptions: {
      attemptId: "attempt-fixture-001",
      authMode: "local_stub",
      harnessRevision: "fixture-harness-rev",
      jobId: null,
      laneId: "lean422_exact",
      modelConfigId: "local_stub/problem9_fixture.v1",
      passKCount: null,
      passKIndex: null,
      promptLayerVersions: promptDefaults.promptLayerVersions,
      promptProtocolVersion: promptDefaults.promptProtocolVersion,
      providerFamily: "openai",
      runId: "run-fixture-001",
      runMode: "single_pass_probe",
      toolProfile: "workspace_edit_limited"
    }
  };
}

async function materializePromptPackage(
  fixture: IntegrityFixture,
  outputRoot: string
) {
  return materializeProblem9PromptPackage({
    ...fixture.promptOptions,
    benchmarkPackageRoot: fixture.benchmarkPackageRoot,
    outputRoot
  });
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
