import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runProblem9AttemptInDevboxCli } from "../src/lib/problem9-attempt-devbox-cli.ts";
import { runProblem9PackageCli } from "../src/lib/problem9-package-cli.ts";
import { materializeProblem9Package } from "../src/lib/problem9-package.ts";
import { runProblem9PromptPackageCli } from "../src/lib/problem9-prompt-package-cli.ts";
import {
  getDefaultProblem9PromptPackageOptions,
  materializeProblem9PromptPackage
} from "../src/lib/problem9-prompt-package.ts";
import { runProblem9RunBundleCli } from "../src/lib/problem9-run-bundle-cli.ts";
import { runWorkerClaimLoopCli } from "../src/lib/worker-claim-loop-cli.ts";

test("runProblem9PackageCli materializes the canonical package and prints JSON output", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-cli-package-"));
  const captured = captureConsole(t);
  const outputRoot = path.join(tempRoot, "package-output");

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  await runProblem9PackageCli(["--output", outputRoot]);

  assert.equal(captured.stderrLines.length, 0);
  assert.equal(captured.stdoutLines.length, 1);

  const payload = JSON.parse(captured.stdoutLines[0] ?? "{}") as {
    outputRoot: string;
    packageDigest: string;
    packageId: string;
    packageVersion: string;
  };
  const manifest = JSON.parse(
    await readFile(path.join(payload.outputRoot, "benchmark-package.json"), "utf8")
  ) as {
    packageDigest: string;
    packageId: string;
    packageVersion: string;
  };

  assert.equal(payload.outputRoot, path.join(outputRoot, "firstproof", "Problem9"));
  assert.match(payload.packageDigest, /^[a-f0-9]{64}$/);
  assert.equal(payload.packageId, "firstproof/Problem9");
  assert.equal(payload.packageDigest, manifest.packageDigest);
  assert.equal(payload.packageVersion, manifest.packageVersion);
});

test("runProblem9PromptPackageCli materializes a prompt package and prints its digest", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-cli-prompt-"));
  const captured = captureConsole(t);
  const benchmarkPackageRoot = (
    await materializeProblem9Package({
      outputRoot: path.join(tempRoot, "benchmark-package")
    })
  ).outputRoot;
  const outputRoot = path.join(tempRoot, "prompt-package");

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  await runProblem9PromptPackageCli([
    "--output",
    outputRoot,
    "--benchmark-package-root",
    benchmarkPackageRoot,
    "--run-id",
    "run-cli-smoke-001",
    "--attempt-id",
    "attempt-cli-smoke-001",
    "--lane-id",
    "lean422_exact",
    "--run-mode",
    "single_pass_probe",
    "--tool-profile",
    "workspace_edit_limited",
    "--provider-family",
    "openai",
    "--auth-mode",
    "local_stub",
    "--model-config-id",
    "local_stub/problem9_fixture.v1",
    "--harness-revision",
    "smoke-harness-rev"
  ]);

  assert.equal(captured.stderrLines.length, 0);
  const payload = JSON.parse(captured.stdoutLines[0] ?? "{}") as {
    outputRoot: string;
    promptPackageDigest: string;
  };
  const promptPackage = JSON.parse(
    await readFile(path.join(payload.outputRoot, "prompt-package.json"), "utf8")
  ) as {
    promptPackageDigest: string;
  };

  assert.equal(payload.outputRoot, outputRoot);
  assert.match(payload.promptPackageDigest, /^[a-f0-9]{64}$/);
  assert.equal(payload.promptPackageDigest, promptPackage.promptPackageDigest);
});

test("runProblem9RunBundleCli materializes a canonical run bundle and prints digest output", async (t) => {
  const fixture = await createRunBundleFixture();
  const captured = captureConsole(t);

  t.after(async () => {
    await rm(fixture.tempRoot, { force: true, recursive: true });
  });

  await runProblem9RunBundleCli([
    "--output",
    fixture.outputRoot,
    "--benchmark-package-root",
    fixture.benchmarkPackageRoot,
    "--prompt-package-root",
    fixture.promptPackageRoot,
    "--candidate-source",
    fixture.candidateSourcePath,
    "--compiler-diagnostics",
    fixture.compilerDiagnosticsPath,
    "--compiler-output",
    fixture.compilerOutputPath,
    "--verifier-output",
    fixture.verifierOutputPath,
    "--environment-input",
    fixture.environmentInputPath,
    "--result",
    "pass",
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
    "verification_complete"
  ]);

  assert.equal(captured.stderrLines.length, 0);
  const payload = JSON.parse(captured.stdoutLines[0] ?? "{}") as {
    artifactManifestDigest: string;
    bundleDigest: string;
    outputRoot: string;
    promptPackageDigest: string;
    verdictDigest: string;
  };
  const bundle = JSON.parse(
    await readFile(path.join(payload.outputRoot, "run-bundle.json"), "utf8")
  ) as {
    bundleDigest: string;
    outputRoot?: string;
  };

  assert.equal(payload.outputRoot, path.join(fixture.outputRoot, "problem9-run-bundle"));
  assert.match(payload.bundleDigest, /^[a-f0-9]{64}$/);
  assert.match(payload.artifactManifestDigest, /^[a-f0-9]{64}$/);
  assert.match(payload.promptPackageDigest, /^[a-f0-9]{64}$/);
  assert.match(payload.verdictDigest, /^[a-f0-9]{64}$/);
  assert.equal(payload.bundleDigest, bundle.bundleDigest);
});

test("runWorkerClaimLoopCli fails clearly when required worker identity flags are missing", async () => {
  await assert.rejects(
    () =>
      runWorkerClaimLoopCli([
        "--worker-pool",
        "modal-dev",
        "--worker-version",
        "worker-smoke-1",
        "--workspace-root",
        path.join(os.tmpdir(), "worker-workspace"),
        "--output-root",
        path.join(os.tmpdir(), "worker-output"),
        "--once"
      ]),
    /Missing required --worker-id <value> argument\./
  );
});

test("runProblem9AttemptInDevboxCli rejects unsupported provider families before env preflight", async () => {
  await assert.rejects(
    () =>
      runProblem9AttemptInDevboxCli([
        "--image",
        "paretoproof-problem9-devbox:local",
        "--provider-family",
        "anthropic"
      ]),
    /Trusted-local devbox runs currently support only provider-family openai, received anthropic\./
  );
});

function captureConsole(t: test.TestContext) {
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  const stderrLines: string[] = [];
  const stdoutLines: string[] = [];

  console.error = (...args: unknown[]) => {
    stderrLines.push(args.map(String).join(" "));
  };
  console.log = (...args: unknown[]) => {
    stdoutLines.push(args.map(String).join(" "));
  };

  t.after(() => {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
  });

  return {
    stderrLines,
    stdoutLines
  };
}

async function createRunBundleFixture(): Promise<{
  benchmarkPackageRoot: string;
  candidateSourcePath: string;
  compilerDiagnosticsPath: string;
  compilerOutputPath: string;
  environmentInputPath: string;
  outputRoot: string;
  promptPackageRoot: string;
  tempRoot: string;
  verifierOutputPath: string;
}> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-cli-bundle-"));
  const benchmarkPackageRoot = (
    await materializeProblem9Package({
      outputRoot: path.join(tempRoot, "benchmark-package")
    })
  ).outputRoot;
  const promptDefaults = getDefaultProblem9PromptPackageOptions();
  const promptPackageRoot = (
    await materializeProblem9PromptPackage({
      attemptId: "attempt-cli-run-bundle-001",
      authMode: "local_stub",
      benchmarkPackageRoot,
      harnessRevision: "cli-smoke-harness-rev",
      jobId: null,
      laneId: "lean422_exact",
      modelConfigId: "local_stub/problem9_fixture.v1",
      outputRoot: path.join(tempRoot, "prompt-package"),
      passKCount: null,
      passKIndex: null,
      promptLayerVersions: promptDefaults.promptLayerVersions,
      promptProtocolVersion: promptDefaults.promptProtocolVersion,
      providerFamily: "openai",
      runId: "run-cli-run-bundle-001",
      runMode: "single_pass_probe",
      toolProfile: "workspace_edit_limited"
    })
  ).outputRoot;
  const candidateSourcePath = path.join(tempRoot, "candidate.lean");
  const compilerDiagnosticsPath = path.join(tempRoot, "compiler-diagnostics.json");
  const compilerOutputPath = path.join(tempRoot, "compiler-output.txt");
  const verifierOutputPath = path.join(tempRoot, "verifier-output.json");
  const environmentInputPath = path.join(tempRoot, "environment-input.json");

  await writeFile(
    candidateSourcePath,
    [
      "import FirstProof.Problem9.Statement",
      "",
      "theorem candidate : True := by",
      "  trivial",
      ""
    ].join("\n"),
    "utf8"
  );
  await writeFile(compilerDiagnosticsPath, JSON.stringify({ diagnostics: [] }, null, 2), "utf8");
  await writeFile(compilerOutputPath, "No compiler output\n", "utf8");
  await writeFile(
    verifierOutputPath,
    JSON.stringify({ checked: true, result: "pass" }, null, 2),
    "utf8"
  );
  await writeFile(
    environmentInputPath,
    JSON.stringify(
      {
        environmentSchemaVersion: "1",
        executionImageDigest: null,
        executionTargetKind: "problem9-devbox",
        lakeSnapshotId: "lake-snapshot-cli-smoke",
        leanVersion: "4.22.0",
        localDevboxDigest: null,
        metadata: {
          source: "worker-cli-smoke-test"
        },
        modelSnapshotId: "local_stub/problem9_fixture.v1",
        os: {
          arch: "x64",
          platform: "linux",
          release: "6.8.0"
        },
        runtime: {
          bunVersion: null,
          nodeVersion: process.version,
          tsxVersion: null
        },
        verifierVersion: "problem9-verifier.v1"
      },
      null,
      2
    ),
    "utf8"
  );

  return {
    benchmarkPackageRoot,
    candidateSourcePath,
    compilerDiagnosticsPath,
    compilerOutputPath,
    environmentInputPath,
    outputRoot: path.join(tempRoot, "run-bundle"),
    promptPackageRoot,
    tempRoot,
    verifierOutputPath
  };
}
