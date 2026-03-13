import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { materializeProblem9Package } from "../src/lib/problem9-package.ts";
import {
  getDefaultProblem9PromptPackageOptions,
  materializeProblem9PromptPackage
} from "../src/lib/problem9-prompt-package.ts";
import { materializeProblem9RunBundle } from "../src/lib/problem9-run-bundle.ts";
import { runProblem9OfflineIngestCli } from "../src/lib/problem9-offline-ingest-cli.ts";
import { runProblem9OfflineIngest } from "../src/lib/problem9-offline-ingest.ts";

async function buildOfflineIngestBundleRoot(options: {
  result: "pass" | "fail";
}): Promise<{
  bundleRoot: string;
  tempRoot: string;
}> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-ingest-"));
  const benchmarkPackageRoot = (
    await materializeProblem9Package({
      outputRoot: path.join(tempRoot, "benchmark-package")
    })
  ).outputRoot;
  const promptPackageRoot = path.join(tempRoot, "prompt-package");
  const candidateSourcePath = path.join(tempRoot, "candidate.lean");
  const compilerDiagnosticsPath = path.join(tempRoot, "compiler-diagnostics.json");
  const compilerOutputPath = path.join(tempRoot, "compiler-output.txt");
  const verifierOutputPath = path.join(tempRoot, "verifier-output.json");
  const environmentInputPath = path.join(tempRoot, "environment-input.json");
  const failureClassificationPath = path.join(tempRoot, "failure-classification.json");
  const promptDefaults = getDefaultProblem9PromptPackageOptions();
  const idSuffix = options.result === "pass" ? "pass" : "fail";

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
    JSON.stringify({ diagnostics: [] }, null, 2),
    "utf8"
  );
  await writeFile(compilerOutputPath, "No compiler output\n", "utf8");
  await writeFile(
    verifierOutputPath,
    JSON.stringify({ checked: true, result: options.result }, null, 2),
    "utf8"
  );
  await writeFile(
    environmentInputPath,
    JSON.stringify(
      {
        environmentSchemaVersion: "1",
        executionImageDigest: null,
        executionTargetKind: "problem9-devbox",
        lakeSnapshotId: "lake-snapshot-test",
        leanVersion: "4.22.0",
        localDevboxDigest: null,
        metadata: {
          source: "worker-test"
        },
        modelSnapshotId: `model-snapshot-${idSuffix}`,
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

  if (options.result === "fail") {
    await writeFile(
      failureClassificationPath,
      JSON.stringify(
        {
          evidenceArtifactRefs: ["verification/compiler-diagnostics.json"],
          failureCode: "compile_failed",
          failureFamily: "compile",
          phase: "compile",
          retryEligibility: "manual_retry_only",
          summary: "Compiler diagnostics reported a blocking error.",
          terminality: "terminal_attempt",
          userVisibility: "user_visible"
        },
        null,
        2
      ),
      "utf8"
    );
  }

  await materializeProblem9PromptPackage({
    attemptId: `attempt-${idSuffix}-1`,
    authMode: "trusted_local_user",
    benchmarkPackageRoot,
    harnessRevision: "harness-test-rev",
    jobId: `job-${idSuffix}-1`,
    laneId: "lean422_exact",
    modelConfigId: "openai/gpt-5",
    outputRoot: promptPackageRoot,
    passKCount: null,
    passKIndex: null,
    promptLayerVersions: promptDefaults.promptLayerVersions,
    promptProtocolVersion: promptDefaults.promptProtocolVersion,
    providerFamily: "openai",
    runId: `run-${idSuffix}-1`,
    runMode: "single_pass_probe",
    toolProfile: "workspace_edit_limited"
  });

  return {
    bundleRoot: (
      await materializeProblem9RunBundle({
        axiomCheck: options.result === "pass" ? "passed" : "not_evaluated",
        benchmarkPackageRoot,
        candidateSourcePath,
        compilerDiagnosticsPath,
        compilerOutputPath,
        containsAdmit: false,
        containsSorry: false,
        diagnosticGate: options.result === "pass" ? "passed" : "failed",
        environmentInputPath,
        failureClassificationPath:
          options.result === "fail" ? failureClassificationPath : null,
        outputRoot: path.join(tempRoot, "run-bundle"),
        promptPackageRoot,
        result: options.result,
        semanticEquality: options.result === "pass" ? "matched" : "not_evaluated",
        stopReason:
          options.result === "pass" ? "verification_complete" : "compile_failed",
        surfaceEquality: options.result === "pass" ? "matched" : "not_evaluated",
        verifierOutputPath
      })
    ).outputRoot,
    tempRoot
  };
}

test("runProblem9OfflineIngest posts canonical bundle requests with Access auth", async (t) => {
  const { bundleRoot, tempRoot } = await buildOfflineIngestBundleRoot({
    result: "pass"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  let receivedHeaders: Headers | null = null;
  let receivedRequestBody: unknown = null;

  const result = await runProblem9OfflineIngest(
    {
      accessJwt: "test-access-jwt",
      bundleRoot
    },
    {
      fetchImpl: async (input, init) => {
        receivedHeaders = new Headers(init?.headers);
        receivedRequestBody = init?.body ? JSON.parse(String(init.body)) : null;

        assert.equal(
          String(input),
          "https://api.paretoproof.com/portal/admin/offline-ingest/problem9-run-bundles"
        );
        assert.equal(init?.method, "POST");

        return new Response(
          JSON.stringify({
            artifactCount: 11,
            attempt: {
              id: "attempt-row-1",
              sourceAttemptId: "attempt-pass-1",
              state: "succeeded",
              verdictClass: "pass"
            },
            job: {
              id: "job-row-1",
              sourceJobId: "job-pass-1",
              state: "completed"
            },
            run: {
              id: "run-row-1",
              sourceRunId: "run-pass-1",
              state: "succeeded"
            }
          }),
          {
            headers: {
              "content-type": "application/json"
            },
            status: 201
          }
        );
      },
      runtimeEnv: {
        API_BASE_URL: "https://api.paretoproof.com"
      }
    }
  );

  assert.equal(receivedHeaders?.get("Cf-Access-Jwt-Assertion"), "test-access-jwt");
  assert.equal(receivedHeaders?.get("Content-Type"), "application/json");
  assert.equal(
    typeof receivedRequestBody === "object" &&
      receivedRequestBody !== null &&
      "ingestRequestSchemaVersion" in receivedRequestBody,
    true
  );
  assert.deepEqual(result, {
    artifactCount: 11,
    attempt: {
      id: "attempt-row-1",
      sourceAttemptId: "attempt-pass-1",
      state: "succeeded",
      verdictClass: "pass"
    },
    bundleRoot,
    endpoint: "https://api.paretoproof.com/portal/admin/offline-ingest/problem9-run-bundles",
    job: {
      id: "job-row-1",
      sourceJobId: "job-pass-1",
      state: "completed"
    },
    run: {
      id: "run-row-1",
      sourceRunId: "run-pass-1",
      state: "succeeded"
    },
    status: "accepted"
  });
});

test("runProblem9OfflineIngest rejects invalid local bundle roots before network submission", async (t) => {
  const { bundleRoot, tempRoot } = await buildOfflineIngestBundleRoot({
    result: "pass"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  await unlink(path.join(bundleRoot, "verification", "verifier-output.json"));

  let fetchCalled = false;
  const result = await runProblem9OfflineIngest(
    {
      accessJwt: "test-access-jwt",
      bundleRoot
    },
    {
      fetchImpl: async () => {
        fetchCalled = true;
        throw new Error("fetch should not be called for invalid local bundles");
      },
      runtimeEnv: {
        API_BASE_URL: "https://api.paretoproof.com"
      }
    }
  );

  assert.equal(fetchCalled, false);
  assert.deepEqual(result, {
    bundleRoot,
    endpoint: "https://api.paretoproof.com/portal/admin/offline-ingest/problem9-run-bundles",
    error: "invalid_problem9_offline_ingest_bundle_root",
    issues: [
      {
        message:
          "Missing required offline ingest bundle file verification/verifier-output.json.",
        path: "verification/verifier-output.json"
      }
    ],
    stage: "local_validation",
    status: "rejected"
  });
});

test("runProblem9OfflineIngest preserves API rejections for operator output", async (t) => {
  const { bundleRoot, tempRoot } = await buildOfflineIngestBundleRoot({
    result: "pass"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const result = await runProblem9OfflineIngest(
    {
      accessJwt: "test-access-jwt",
      bundleRoot
    },
    {
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: "offline_ingest_duplicate_run",
            issues: [
              {
                code: "too_small",
                minimum: 11,
                path: ["bundle", "artifactManifest", "artifacts"],
                received: 10
              }
            ]
          }),
          {
            headers: {
              "content-type": "application/json"
            },
            status: 409
          }
        ),
      runtimeEnv: {
        API_BASE_URL: "https://api.paretoproof.com"
      }
    }
  );

  assert.deepEqual(result, {
    bundleRoot,
    endpoint: "https://api.paretoproof.com/portal/admin/offline-ingest/problem9-run-bundles",
    error: "offline_ingest_duplicate_run",
    httpStatus: 409,
    issues: [
      {
        code: "too_small",
        minimum: 11,
        path: ["bundle", "artifactManifest", "artifacts"],
        received: 10
      }
    ],
    stage: "remote_rejection",
    status: "rejected"
  });
});

test("runProblem9OfflineIngest converts transport failures into rejected output", async (t) => {
  const { bundleRoot, tempRoot } = await buildOfflineIngestBundleRoot({
    result: "pass"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const result = await runProblem9OfflineIngest(
    {
      accessJwt: "test-access-jwt",
      bundleRoot
    },
    {
      fetchImpl: async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1");
      },
      runtimeEnv: {
        API_BASE_URL: "https://api.paretoproof.com"
      }
    }
  );

  assert.deepEqual(result, {
    bundleRoot,
    endpoint: "https://api.paretoproof.com/portal/admin/offline-ingest/problem9-run-bundles",
    error: "offline_ingest_transport_error",
    issues: [
      {
        message: "connect ECONNREFUSED 127.0.0.1"
      }
    ],
    stage: "remote_rejection",
    status: "rejected"
  });
});

test("runProblem9OfflineIngestCli emits JSON for missing required flags", async () => {
  const originalConsoleLog = console.log;
  const originalExitCode = process.exitCode;
  const loggedMessages: string[] = [];

  console.log = (...args: unknown[]) => {
    loggedMessages.push(args.map((argument) => String(argument)).join(" "));
  };

  try {
    process.exitCode = undefined;

    await runProblem9OfflineIngestCli(["--bundle-root", "problem9-run-bundle"]);

    assert.equal(process.exitCode, 1);
    assert.equal(loggedMessages.length, 1);
    assert.deepEqual(JSON.parse(loggedMessages[0] ?? ""), {
      bundleRoot: path.resolve("problem9-run-bundle"),
      endpoint: null,
      error: "invalid_problem9_offline_ingest_cli_arguments",
      issues: [
        {
          message: "Missing required --access-jwt <value> argument."
        }
      ],
      stage: "setup_failure",
      status: "rejected"
    });
  } finally {
    console.log = originalConsoleLog;
    process.exitCode = originalExitCode;
  }
});

test("runProblem9OfflineIngestCli emits JSON for missing runtime config", async (t) => {
  const { bundleRoot, tempRoot } = await buildOfflineIngestBundleRoot({
    result: "pass"
  });
  const originalConsoleLog = console.log;
  const originalExitCode = process.exitCode;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const loggedMessages: string[] = [];

  t.after(async () => {
    console.log = originalConsoleLog;
    process.exitCode = originalExitCode;

    if (typeof originalApiBaseUrl === "string") {
      process.env.API_BASE_URL = originalApiBaseUrl;
    } else {
      delete process.env.API_BASE_URL;
    }

    await rm(tempRoot, { force: true, recursive: true });
  });

  console.log = (...args: unknown[]) => {
    loggedMessages.push(args.map((argument) => String(argument)).join(" "));
  };
  delete process.env.API_BASE_URL;
  process.exitCode = undefined;

  await runProblem9OfflineIngestCli([
    "--bundle-root",
    bundleRoot,
    "--access-jwt",
    "test-access-jwt"
  ]);

  assert.equal(process.exitCode, 1);
  assert.equal(loggedMessages.length, 1);
  assert.deepEqual(JSON.parse(loggedMessages[0] ?? ""), {
    bundleRoot,
    endpoint: null,
    error: "invalid_problem9_offline_ingest_runtime_env",
    issues: [
      {
        message: "Invalid worker runtime environment: API_BASE_URL: is required"
      }
    ],
    stage: "setup_failure",
    status: "rejected"
  });
});
