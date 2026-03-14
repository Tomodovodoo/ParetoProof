import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { materializeProblem9Package } from "../src/lib/problem9-package.ts";
import {
  getDefaultProblem9PromptPackageOptions,
  materializeProblem9PromptPackage
} from "../src/lib/problem9-prompt-package.ts";
import { materializeProblem9RunBundle } from "../src/lib/problem9-run-bundle.ts";

const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerEntryPoint = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/index.ts"
);
const bunCommand = process.platform === "win32" ? "bun.exe" : "bun";

test("worker entrypoint exits 2 and prefixes validation errors for unsupported auth-mode input", () => {
  const result = spawnSync(
    bunCommand,
    [
      workerEntryPoint,
      "run-problem9-attempt",
      "--benchmark-package-root",
      "ignored-benchmark",
      "--prompt-package-root",
      "ignored-prompt",
      "--workspace",
      "ignored-workspace",
      "--output",
      "ignored-output",
      "--auth-mode",
      "trusted_local_usr"
    ],
    {
      cwd: workerRoot,
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /^Validation error: Unsupported --auth-mode value /u);
  assert.equal(result.stdout, "");
});

test("worker entrypoint exits 2 for unknown commands and prints usage", () => {
  const result = spawnSync(bunCommand, [workerEntryPoint, "totally-unknown-command"], {
    cwd: workerRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /^Validation error: Unknown worker command: totally-unknown-command/u);
  assert.match(result.stderr, /\nUsage:\n/u);
  assert.equal(result.stdout, "");
});

test(
  "worker entrypoint exits 3 and preserves machine-readable offline-ingest remote rejections",
  { timeout: 120000 },
  async (t) => {
    const { bundleRoot, tempRoot } = await buildOfflineIngestBundleRoot();

    t.after(async () => {
      await rm(tempRoot, { force: true, recursive: true });
    });

    const result = spawnSync(
      bunCommand,
      [
        workerEntryPoint,
        "ingest-problem9-run-bundle",
        "--bundle-root",
        bundleRoot,
        "--access-jwt",
        "worker-cli-contract-jwt"
      ],
      {
        cwd: workerRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          API_BASE_URL: "http://127.0.0.1:9"
        }
      }
    );

    assert.equal(result.status, 3);
    assert.equal(result.stdout, "");

    const parsed = JSON.parse(result.stderr) as {
      bundleRoot: string;
      endpoint: string;
      error: string;
      issues: Array<{ message: string }>;
      stage: string;
      status: string;
    };

    assert.equal(parsed.status, "rejected");
    assert.equal(parsed.stage, "remote_rejection");
    assert.equal(parsed.error, "offline_ingest_transport_error");
    assert.equal(parsed.bundleRoot, bundleRoot);
    assert.equal(
      parsed.endpoint,
      "http://127.0.0.1:9/portal/admin/offline-ingest/problem9-run-bundles"
    );
    assert.match(parsed.issues[0]?.message ?? "", /.+/u);
  }
);

async function buildOfflineIngestBundleRoot(): Promise<{
  bundleRoot: string;
  tempRoot: string;
}> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-cli-contract-"));
  const benchmarkPackageRoot = (
    await materializeProblem9Package({
      outputRoot: path.join(tempRoot, "benchmark-package")
    })
  ).outputRoot;
  const promptDefaults = getDefaultProblem9PromptPackageOptions();
  const promptPackageRoot = (
    await materializeProblem9PromptPackage({
      attemptId: "attempt-cli-contract-001",
      authMode: "local_stub",
      benchmarkPackageRoot,
      harnessRevision: "cli-contract-harness-rev",
      jobId: null,
      laneId: "lean422_exact",
      modelConfigId: "local_stub/problem9_cli_contract.v1",
      outputRoot: path.join(tempRoot, "prompt-package"),
      passKCount: null,
      passKIndex: null,
      promptLayerVersions: promptDefaults.promptLayerVersions,
      promptProtocolVersion: promptDefaults.promptProtocolVersion,
      providerFamily: "openai",
      runId: "run-cli-contract-001",
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
        lakeSnapshotId: "lake-snapshot-cli-contract",
        leanVersion: "4.22.0",
        localDevboxDigest: null,
        metadata: {
          source: "worker-cli-contract-test"
        },
        modelSnapshotId: "local_stub/problem9_cli_contract.v1",
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
    bundleRoot: (
      await materializeProblem9RunBundle({
        axiomCheck: "passed",
        benchmarkPackageRoot,
        candidateSourcePath,
        compilerDiagnosticsPath,
        compilerOutputPath,
        containsAdmit: false,
        containsSorry: false,
        diagnosticGate: "passed",
        environmentInputPath,
        failureClassificationPath: null,
        outputRoot: path.join(tempRoot, "run-bundle"),
        promptPackageRoot,
        result: "pass",
        semanticEquality: "matched",
        stopReason: "verification_complete",
        surfaceEquality: "matched",
        verifierOutputPath
      })
    ).outputRoot,
    tempRoot
  };
}
