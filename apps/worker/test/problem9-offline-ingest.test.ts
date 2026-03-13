import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { type Problem9OfflineIngestResponse, problem9OfflineIngestRequestSchema } from "@paretoproof/shared";
import {
  Problem9OfflineIngestCliError,
  buildProblem9OfflineIngestRequestFromBundleRoot,
  ingestProblem9RunBundle
} from "../src/lib/problem9-offline-ingest.ts";
import { materializeProblem9Package } from "../src/lib/problem9-package.ts";
import {
  getDefaultProblem9PromptPackageOptions,
  materializeProblem9PromptPackage
} from "../src/lib/problem9-prompt-package.ts";
import { materializeProblem9RunBundle } from "../src/lib/problem9-run-bundle.ts";

async function buildOfflineIngestBundleFixture(options: {
  result: "pass" | "fail";
}) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-offline-ingest-"));
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
  await writeFile(compilerDiagnosticsPath, JSON.stringify({ diagnostics: [] }, null, 2), "utf8");
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
        harnessRevision: "harness-test-rev",
        lakeSnapshotId: "lake-snapshot-test",
        laneId: "lean422_exact",
        leanVersion: "4.22.0",
        localDevboxDigest: null,
        metadata: {
          source: "worker-test"
        },
        modelConfigId: "openai/gpt-5",
        modelSnapshotId: `model-snapshot-${idSuffix}`,
        os: {
          arch: "x64",
          platform: "linux",
          release: "6.8.0"
        },
        promptProtocolVersion: promptDefaults.promptProtocolVersion,
        providerFamily: "openai",
        runMode: "single_pass_probe",
        runtime: {
          bunVersion: null,
          nodeVersion: process.version,
          tsxVersion: null
        },
        toolProfile: "workspace_edit_limited",
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

  const bundleRoot = (
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
      stopReason: options.result === "pass" ? "verification_complete" : "compile_failed",
      surfaceEquality: options.result === "pass" ? "matched" : "not_evaluated",
      verifierOutputPath
    })
  ).outputRoot;

  return {
    bundleRoot,
    tempRoot
  };
}

test("buildProblem9OfflineIngestRequestFromBundleRoot reads the canonical bundle files", async (t) => {
  const fixture = await buildOfflineIngestBundleFixture({
    result: "pass"
  });

  t.after(async () => {
    await rm(fixture.tempRoot, { force: true, recursive: true });
  });

  const request = await buildProblem9OfflineIngestRequestFromBundleRoot(fixture.bundleRoot);
  const parsedRequest = problem9OfflineIngestRequestSchema.safeParse(request);

  assert.equal(parsedRequest.success, true);
  assert.equal(request.bundle.runBundle.runId, "run-pass-1");
  assert.equal(request.bundle.runBundle.attemptId, "attempt-pass-1");
  assert.equal(request.bundle.packageRef.benchmarkPackageId, "firstproof/Problem9");
});

test("buildProblem9OfflineIngestRequestFromBundleRoot rejects missing canonical files", async (t) => {
  const fixture = await buildOfflineIngestBundleFixture({
    result: "pass"
  });

  t.after(async () => {
    await rm(fixture.tempRoot, { force: true, recursive: true });
  });

  await unlink(path.join(fixture.bundleRoot, "verification", "verdict.json"));

  await assert.rejects(
    () => buildProblem9OfflineIngestRequestFromBundleRoot(fixture.bundleRoot),
    /Could not read verdict/
  );
});

test("ingestProblem9RunBundle posts the validated bundle with the Access assertion header", async (t) => {
  const fixture = await buildOfflineIngestBundleFixture({
    result: "pass"
  });

  t.after(async () => {
    await rm(fixture.tempRoot, { force: true, recursive: true });
  });

  let receivedRequestBody: unknown = null;
  let receivedAssertionHeader: string | null = null;
  let receivedUrl: string | null = null;
  const responseBody: Problem9OfflineIngestResponse = {
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
  };

  const result = await ingestProblem9RunBundle({
    accessJwt: "portal-access-token",
    apiBaseUrl: "https://api.paretoproof.com",
    bundleRoot: fixture.bundleRoot,
    fetchImpl: async (input, init) => {
      receivedUrl = String(input);
      receivedAssertionHeader =
        init?.headers && typeof Headers !== "undefined"
          ? new Headers(init.headers).get("Cf-Access-Jwt-Assertion")
          : null;
      receivedRequestBody = init?.body ? JSON.parse(String(init.body)) : null;

      return new Response(JSON.stringify(responseBody), {
        headers: {
          "Content-Type": "application/json"
        },
        status: 201
      });
    }
  });

  assert.equal(
    receivedUrl,
    "https://api.paretoproof.com/portal/admin/offline-ingest/problem9-run-bundles"
  );
  assert.equal(receivedAssertionHeader, "portal-access-token");
  assert.equal(result.ok, true);
  assert.equal(result.request.runId, "run-pass-1");
  assert.deepEqual(result.response, responseBody);
  assert.equal(
    problem9OfflineIngestRequestSchema.safeParse(receivedRequestBody).success,
    true
  );
});

test("ingestProblem9RunBundle emits machine-readable auth failures", async (t) => {
  const fixture = await buildOfflineIngestBundleFixture({
    result: "pass"
  });

  t.after(async () => {
    await rm(fixture.tempRoot, { force: true, recursive: true });
  });

  await assert.rejects(
    () =>
      ingestProblem9RunBundle({
        accessJwt: "expired-access-token",
        apiBaseUrl: "https://api.paretoproof.com",
        bundleRoot: fixture.bundleRoot,
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              error: "access_denied"
            }),
            {
              headers: {
                "Content-Type": "application/json"
              },
              status: 403
            }
          )
      }),
    (error: unknown) => {
      assert.ok(error instanceof Problem9OfflineIngestCliError);
      assert.equal(error.result.ok, false);
      assert.equal(error.result.kind, "auth_error");
      assert.equal(error.result.statusCode, 403);
      assert.equal(
        error.result.endpoint,
        "https://api.paretoproof.com/portal/admin/offline-ingest/problem9-run-bundles"
      );
      return true;
    }
  );
});

test("ingestProblem9RunBundle keeps compiler output text intact in the request payload", async (t) => {
  const fixture = await buildOfflineIngestBundleFixture({
    result: "pass"
  });

  t.after(async () => {
    await rm(fixture.tempRoot, { force: true, recursive: true });
  });

  const compilerOutput = await readFile(
    path.join(fixture.bundleRoot, "verification", "compiler-output.txt"),
    "utf8"
  );
  let receivedRequestBody: Problem9OfflineIngestResponse | Record<string, unknown> | null = null;

  await ingestProblem9RunBundle({
    accessJwt: "portal-access-token",
    apiBaseUrl: "https://api.paretoproof.com",
    bundleRoot: fixture.bundleRoot,
    fetchImpl: async (_input, init) => {
      receivedRequestBody = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;

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
        } satisfies Problem9OfflineIngestResponse),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 201
        }
      );
    }
  });

  assert.equal(
    (receivedRequestBody as { bundle: { compilerOutput: string } }).bundle.compilerOutput,
    compilerOutput
  );
});
