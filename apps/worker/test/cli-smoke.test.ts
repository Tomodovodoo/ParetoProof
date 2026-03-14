import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(workerRoot, "..", "..");
const workerEntryPoint = path.join(workerRoot, "src", "index.ts");
const bunCommand = process.platform === "win32" ? "bun.exe" : "bun";
type CliResult = {
  status: number;
  stderr: string;
  stdout: string;
};

test(
  "worker CLI smoke suite covers the local success surfaces without live provider credentials",
  { timeout: 120000 },
  async (t) => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-cli-smoke-"));

    t.after(async () => {
      await rm(tempRoot, { force: true, recursive: true });
    });

    const benchmarkPackageOutputRoot = path.join(tempRoot, "benchmark-package");
    const benchmarkResult = await runWorkerCli([
      "materialize-problem9-package",
      "--output",
      benchmarkPackageOutputRoot
    ]);
    const materializedBenchmarkPackage = readJsonStdout<{
      outputRoot: string;
      packageDigest: string;
      packageId: string;
      packageVersion: string;
    }>(benchmarkResult);
    const benchmarkPackageRoot = materializedBenchmarkPackage.outputRoot;

    assert.equal(
      benchmarkPackageRoot,
      path.join(benchmarkPackageOutputRoot, "firstproof", "Problem9")
    );
    assert.equal(materializedBenchmarkPackage.packageId, "firstproof/Problem9");
    assert.match(materializedBenchmarkPackage.packageDigest, /^[a-f0-9]{64}$/);

    const benchmarkManifest = JSON.parse(
      await readFile(path.join(benchmarkPackageRoot, "benchmark-package.json"), "utf8")
    ) as Record<string, unknown>;
    assert.equal(benchmarkManifest.packageId, "firstproof/Problem9");

    const promptPackageRoot = path.join(tempRoot, "prompt-package");
    const promptResult = await runWorkerCli([
      "materialize-problem9-prompt-package",
      "--output",
      promptPackageRoot,
      "--benchmark-package-root",
      benchmarkPackageRoot,
      "--run-id",
      "run-cli-smoke-001",
      "--attempt-id",
      "attempt-cli-smoke-001",
      "--lane-id",
      "lean422_exact",
      "--run-mode",
      "bounded_agentic_attempt",
      "--tool-profile",
      "workspace_edit_limited",
      "--provider-family",
      "openai",
      "--auth-mode",
      "local_stub",
      "--model-config-id",
      "local_stub/problem9_cli_smoke.v1",
      "--harness-revision",
      "cli-smoke-harness-rev"
    ]);
    const materializedPromptPackage = readJsonStdout<{
      outputRoot: string;
      promptPackageDigest: string;
    }>(promptResult);

    assert.equal(materializedPromptPackage.outputRoot, promptPackageRoot);
    assert.match(materializedPromptPackage.promptPackageDigest, /^[a-f0-9]{64}$/);

    const promptManifest = JSON.parse(
      await readFile(path.join(promptPackageRoot, "prompt-package.json"), "utf8")
    ) as Record<string, unknown>;
    assert.equal(promptManifest.authMode, "local_stub");

    const candidateSourcePath = path.join(tempRoot, "candidate.lean");
    const compilerDiagnosticsPath = path.join(tempRoot, "compiler-diagnostics.json");
    const compilerOutputPath = path.join(tempRoot, "compiler-output.txt");
    const verifierOutputPath = path.join(tempRoot, "verifier-output.json");
    const environmentInputPath = path.join(tempRoot, "environment-input.json");
    await writeSmokeRunBundleInputs({
      candidateSourcePath,
      compilerDiagnosticsPath,
      compilerOutputPath,
      environmentInputPath,
      verifierOutputPath
    });

    const runBundleOutputRoot = path.join(tempRoot, "run-bundle");
    const runBundleResult = await runWorkerCli([
      "materialize-problem9-run-bundle",
      "--output",
      runBundleOutputRoot,
      "--benchmark-package-root",
      benchmarkPackageRoot,
      "--prompt-package-root",
      promptPackageRoot,
      "--candidate-source",
      candidateSourcePath,
      "--compiler-diagnostics",
      compilerDiagnosticsPath,
      "--compiler-output",
      compilerOutputPath,
      "--verifier-output",
      verifierOutputPath,
      "--environment-input",
      environmentInputPath,
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
    const materializedRunBundle = readJsonStdout<{
      artifactManifestDigest: string;
      bundleDigest: string;
      candidateDigest: string;
      environmentDigest: string;
      outputRoot: string;
      promptPackageDigest: string;
      runConfigDigest: string;
      verdictDigest: string;
    }>(runBundleResult);
    const runBundleRoot = materializedRunBundle.outputRoot;

    assert.equal(runBundleRoot, path.join(runBundleOutputRoot, "problem9-run-bundle"));
    assert.match(materializedRunBundle.bundleDigest, /^[a-f0-9]{64}$/);

    const runBundleManifest = JSON.parse(
      await readFile(path.join(runBundleRoot, "run-bundle.json"), "utf8")
    ) as Record<string, unknown>;
    assert.equal(runBundleManifest.status, "success");

    const attemptOutputParentRoot = path.join(tempRoot, "attempt-output");
    const attemptWorkspaceRoot = path.join(tempRoot, "attempt-workspace");
    const attemptResult = await runWorkerCli([
      "run-problem9-attempt",
      "--benchmark-package-root",
      benchmarkPackageRoot,
      "--prompt-package-root",
      promptPackageRoot,
      "--workspace",
      attemptWorkspaceRoot,
      "--output",
      attemptOutputParentRoot,
      "--auth-mode",
      "local_stub",
      "--stub-scenario",
      "exact_canonical"
    ]);
    const attemptOutput = readJsonStdout<{
      authMode: string;
      bundleDigest: string;
      outputRoot: string;
      result: string;
      stopReason: string;
    }>(attemptResult);
    const attemptOutputRoot = attemptOutput.outputRoot;

    assert.equal(attemptOutput.authMode, "local_stub");
    assert.equal(attemptOutputRoot, path.join(attemptOutputParentRoot, "problem9-run-bundle"));
    assert.equal(attemptOutput.result, "pass");
    assert.equal(attemptOutput.stopReason, "verification_passed");

    const attemptBundle = JSON.parse(
      await readFile(path.join(attemptOutputRoot, "run-bundle.json"), "utf8")
    ) as Record<string, unknown>;
    assert.equal(attemptBundle.status, "success");

    const requests: Array<{
      body: Record<string, unknown>;
      headers: Record<string, string | string[] | undefined>;
      method: string | undefined;
      url: string | undefined;
    }> = [];
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }

      requests.push({
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>,
        headers: request.headers,
        method: request.method,
        url: request.url
      });

      response.statusCode = 201;
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          artifactCount: 11,
          attempt: {
            id: "attempt-row-1",
            sourceAttemptId: "attempt-cli-smoke-001",
            state: "succeeded",
            verdictClass: "pass"
          },
          job: {
            id: "job-row-1",
            sourceJobId: null,
            state: "completed"
          },
          run: {
            id: "run-row-1",
            sourceRunId: "run-cli-smoke-001",
            state: "succeeded"
          }
        })
      );
    });
    const closeServer = async () => {
      if (!server.listening) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    };

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(closeServer);

    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");

    const ingestResult = await runWorkerCli(
      [
        "ingest-problem9-run-bundle",
        "--bundle-root",
        runBundleRoot,
        "--access-jwt",
        "smoke-access-jwt"
      ],
      {
        env: {
          ALL_PROXY: "",
          API_BASE_URL: `http://127.0.0.1:${address.port}`,
          HTTP_PROXY: "",
          HTTPS_PROXY: "",
          NO_PROXY: "127.0.0.1,localhost",
          all_proxy: "",
          http_proxy: "",
          https_proxy: "",
          no_proxy: "127.0.0.1,localhost"
        }
      }
    );
    const ingestOutput = readJsonStdout<{
      artifactCount: number;
      bundleRoot: string;
      endpoint: string;
      status: string;
    }>(ingestResult);

    assert.equal(ingestOutput.status, "accepted");
    assert.equal(ingestOutput.bundleRoot, runBundleRoot);
    assert.equal(
      ingestOutput.endpoint,
      `http://127.0.0.1:${address.port}/portal/admin/offline-ingest/problem9-run-bundles`
    );
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.method, "POST");
    assert.equal(requests[0]?.url, "/portal/admin/offline-ingest/problem9-run-bundles");
    assert.equal(requests[0]?.headers["cf-access-jwt-assertion"], "smoke-access-jwt");
    assert.equal(requests[0]?.body.ingestRequestSchemaVersion, "1");
    await closeServer();
  }
);

test("run-problem9-attempt-in-devbox fails clearly when trusted-local auth is unavailable", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-devbox-smoke-"));

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const result = await runWorkerCli(
    ["run-problem9-attempt-in-devbox", "--image", "paretoproof-problem9-devbox:local", "--preflight-only"],
    {
      env: {
        CODEX_HOME: tempRoot
      }
    }
  );

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /trusted_local_user requires a readable Codex auth\.json/
  );
  assert.equal(result.stdout, "");
});

test("run-worker-claim-loop fails clearly when hosted bootstrap credentials are missing", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-claim-smoke-"));

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const result = await runWorkerCli(
    [
      "run-worker-claim-loop",
      "--once",
      "--worker-id",
      "worker-cli-smoke-1",
      "--worker-pool",
      "modal-dev",
      "--worker-version",
      "worker.v1",
      "--workspace-root",
      path.join(tempRoot, "workspace"),
      "--output-root",
      path.join(tempRoot, "output")
    ],
    {
      env: {
        API_BASE_URL: "https://api.paretoproof.test",
        CODEX_API_KEY: "worker-api-key"
      }
    }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /WORKER_BOOTSTRAP_TOKEN: is required/);
  assert.equal(result.stdout, "");
});

async function runWorkerCli(
  args: string[],
  options: {
    env?: Partial<Record<string, string | undefined>>;
  } = {}
): Promise<CliResult> {
  return await new Promise<CliResult>((resolve, reject) => {
    const child = spawn(bunCommand, ["x", "tsx", workerEntryPoint, ...args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...options.env
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.once("error", reject);
    child.once("close", (status) => {
      resolve({
        status: status ?? 1,
        stderr,
        stdout
      });
    });
  });
}

function readJsonStdout<T>(result: CliResult): T {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout) as T;
}

async function writeSmokeRunBundleInputs(paths: {
  candidateSourcePath: string;
  compilerDiagnosticsPath: string;
  compilerOutputPath: string;
  environmentInputPath: string;
  verifierOutputPath: string;
}) {
  await writeFile(
    paths.candidateSourcePath,
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
    paths.compilerDiagnosticsPath,
    JSON.stringify({ diagnostics: [] }, null, 2),
    "utf8"
  );
  await writeFile(paths.compilerOutputPath, "No compiler output\n", "utf8");
  await writeFile(
    paths.verifierOutputPath,
    JSON.stringify({ checked: true, result: "pass" }, null, 2),
    "utf8"
  );
  await writeFile(
    paths.environmentInputPath,
    JSON.stringify(
      {
        environmentSchemaVersion: "1",
        executionImageDigest: null,
        executionTargetKind: "problem9-devbox",
        lakeSnapshotId: "lake-snapshot-cli-smoke",
        leanVersion: "4.22.0",
        localDevboxDigest: null,
        metadata: {
          source: "cli-smoke"
        },
        modelSnapshotId: "local_stub/problem9_cli_smoke.v1",
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
}
