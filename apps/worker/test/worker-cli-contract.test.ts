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
import { classifyWorkerCliError, workerCliExitCodes } from "../src/lib/cli-contract.ts";
import { materializeProblem9RunBundle } from "../src/lib/problem9-run-bundle.ts";

const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerEntryPoint = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/index.ts"
);
const bunInvocation = process.versions.bun
  ? { command: process.execPath, prelude: [] as string[] }
  : process.platform === "win32"
    ? { command: process.env.ComSpec ?? "cmd.exe", prelude: ["/d", "/s", "/c", "bun"] }
    : { command: "bun", prelude: [] as string[] };

test("worker entrypoint exits 2 and prefixes validation errors for unsupported auth-mode input", () => {
  const result = spawnWorkerCli(
    [
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

  assert.equal(readSpawnStatus(result), 2);
  assert.match(result.stderr, /^Validation error: Unsupported --auth-mode value /u);
  assert.equal(result.stdout, "");
});

test("worker entrypoint exits 2 for unknown commands and prints usage", () => {
  const result = spawnWorkerCli(["totally-unknown-command"], {
    cwd: workerRoot,
    encoding: "utf8"
  });

  assert.equal(readSpawnStatus(result), 2);
  assert.match(result.stderr, /^Validation error: Unknown worker command: totally-unknown-command/u);
  assert.match(result.stderr, /\nUsage:\n/u);
  assert.equal(result.stdout, "");
});

test("worker CLI classifies pass-verdict artifact consistency errors as validation failures", () => {
  const validationMessages = [
    "Passing verdicts may not include a failure classification.",
    "Passing verdicts require semanticEquality=matched.",
    "Passing verdicts may not contain sorry or admit.",
    "Passing verdicts require axiomCheck=passed.",
    "Passing verdicts require diagnosticGate=passed."
  ];

  for (const message of validationMessages) {
    const failure = classifyWorkerCliError(new Error(message));
    assert.equal(failure.kind, "validation");
    assert.equal(failure.exitCode, workerCliExitCodes.validation);
  }
});

test("worker entrypoint exits 2 when hosted claim-loop env includes trusted-local mount markers", () => {
  const result = spawnWorkerCli(
    [
      "run-worker-claim-loop",
      "--worker-id",
      "worker-contract-test",
      "--worker-pool",
      "modal-dev",
      "--worker-version",
      "worker-smoke-1",
      "--workspace-root",
      path.join(os.tmpdir(), "worker-workspace"),
      "--output-root",
      path.join(os.tmpdir(), "worker-output"),
      "--once"
    ],
    {
      cwd: workerRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        API_BASE_URL: "https://api.paretoproof.com",
        CODEX_API_KEY: "worker-api-key",
        PARETOPROOF_TRUSTED_LOCAL_AUTH_MOUNT: "readonly_auth_json",
        WORKER_BOOTSTRAP_TOKEN: "worker-bootstrap-token"
      }
    }
  );

  assert.equal(readSpawnStatus(result), 2);
  assert.match(
    result.stderr,
    /^Validation error: Invalid worker runtime environment: PARETOPROOF_TRUSTED_LOCAL_AUTH_MOUNT: trusted-local auth mounts are not allowed for worker_claim_loop\./u
  );
  assert.equal(result.stdout, "");
});

test("worker entrypoint exits 2 for unsupported hosted auth-mode input", () => {
  const result = spawnWorkerCli(
    [
      "run-worker-claim-loop",
      "--worker-id",
      "worker-contract-test",
      "--worker-pool",
      "modal-dev",
      "--worker-version",
      "worker-smoke-1",
      "--workspace-root",
      path.join(os.tmpdir(), "worker-workspace"),
      "--output-root",
      path.join(os.tmpdir(), "worker-output"),
      "--auth-mode",
      "machine_oauth",
      "--once"
    ],
    {
      cwd: workerRoot,
      encoding: "utf8"
    }
  );

  assert.equal(readSpawnStatus(result), 2);
  assert.match(
    result.stderr,
    /^Validation error: \[[\s\S]*"received": "machine_oauth"[\s\S]*"machine_api_key"[\s\S]*\]\r?\n$/u
  );
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
      bunInvocation.command,
      [
        ...bunInvocation.prelude,
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

    assert.equal(readSpawnStatus(result), 3);
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
  await writeFile(
    compilerDiagnosticsPath,
    JSON.stringify(
      {
        compilerDiagnosticsSchemaVersion: "1",
        diagnostics: [],
        success: true
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(compilerOutputPath, "No compiler output\n", "utf8");
  await writeFile(
    verifierOutputPath,
    JSON.stringify(
      {
        axiomCheck: {
          output: "No axioms detected.",
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
      },
      null,
      2
    ),
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
        benchmarkPackageRoot,
        candidateSourcePath,
        compilerDiagnosticsPath,
        compilerOutputPath,
        environmentInputPath,
        failureClassificationPath: null,
        outputRoot: path.join(tempRoot, "run-bundle"),
        promptPackageRoot,
        verifierOutputPath
      })
    ).outputRoot,
    tempRoot
  };
}

function readSpawnStatus(result: { exitCode?: number | null; status?: number | null }) {
  return result.status ?? result.exitCode ?? null;
}

function spawnWorkerCli(args: string[], options: Parameters<typeof spawnSync>[2]) {
  return spawnSync(bunInvocation.command, [...bunInvocation.prelude, workerEntryPoint, ...args], options);
}
