import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Fastify from "fastify";
import type { Problem9OfflineIngestRequest } from "@paretoproof/shared";
import {
  Problem9OfflineIngestDuplicateError,
  Problem9OfflineIngestValidationError,
  buildProblem9OfflineIngestPlan
} from "../src/lib/problem9-offline-ingest.ts";
import { registerOfflineIngestRoutes } from "../src/routes/offline-ingest.ts";
import { materializeProblem9Package } from "../../worker/src/lib/problem9-package.ts";
import {
  getDefaultProblem9PromptPackageOptions,
  materializeProblem9PromptPackage
} from "../../worker/src/lib/problem9-prompt-package.ts";
import { materializeProblem9RunBundle } from "../../worker/src/lib/problem9-run-bundle.ts";

async function readJsonFile<TValue>(filePath: string): Promise<TValue> {
  return JSON.parse(await readFile(filePath, "utf8")) as TValue;
}

async function buildOfflineIngestRequest(options: {
  result: "pass" | "fail";
}): Promise<{
  request: Problem9OfflineIngestRequest;
  tempRoot: string;
}> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-problem9-ingest-"));
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
          source: "api-test"
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
    authMode: "trusted_local_codex",
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
      stopReason:
        options.result === "pass" ? "verification_complete" : "compile_failed",
      surfaceEquality: options.result === "pass" ? "matched" : "not_evaluated",
      verifierOutputPath
    })
  ).outputRoot;

  return {
    request: {
      bundle: {
        artifactManifest: await readJsonFile(path.join(bundleRoot, "artifact-manifest.json")),
        benchmarkPackage: await readJsonFile(
          path.join(bundleRoot, "package", "benchmark-package.json")
        ),
        candidateSource: await readFile(
          path.join(bundleRoot, "candidate", "Candidate.lean"),
          "utf8"
        ),
        compilerDiagnostics: await readJsonFile(
          path.join(bundleRoot, "verification", "compiler-diagnostics.json")
        ),
        compilerOutput: await readFile(
          path.join(bundleRoot, "verification", "compiler-output.txt"),
          "utf8"
        ),
        environment: await readJsonFile(
          path.join(bundleRoot, "environment", "environment.json")
        ),
        packageRef: await readJsonFile(path.join(bundleRoot, "package", "package-ref.json")),
        promptPackage: await readJsonFile(
          path.join(bundleRoot, "prompt", "prompt-package.json")
        ),
        runBundle: await readJsonFile(path.join(bundleRoot, "run-bundle.json")),
        usage: null,
        verifierOutput: await readJsonFile(
          path.join(bundleRoot, "verification", "verifier-output.json")
        ),
        verdict: await readJsonFile(path.join(bundleRoot, "verification", "verdict.json"))
      },
      ingestRequestSchemaVersion: "1"
    },
    tempRoot
  };
}

test("buildProblem9OfflineIngestPlan maps canonical passing bundles to terminal imported states", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    result: "pass"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const plan = buildProblem9OfflineIngestPlan(request);

  assert.equal(plan.run.state, "succeeded");
  assert.equal(plan.job.state, "completed");
  assert.equal(plan.attempt.state, "succeeded");
  assert.equal(plan.attempt.verdictClass, "pass");
  assert.equal(plan.artifacts.length, 11);
  assert.equal(
    plan.artifacts.find((artifact) => artifact.relativePath === "artifact-manifest.json")?.objectKey,
    "runs/run-pass-1/artifacts/attempt-pass-1/artifact-manifest.json"
  );
  assert.equal(
    plan.artifacts.find((artifact) => artifact.relativePath === "candidate/Candidate.lean")?.bucketName,
    "paretoproof-dev-artifacts"
  );
});

test("buildProblem9OfflineIngestPlan preserves failure metadata for canonical failing bundles", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    result: "fail"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const plan = buildProblem9OfflineIngestPlan(request);

  assert.equal(plan.run.state, "failed");
  assert.equal(plan.job.state, "failed");
  assert.equal(plan.attempt.state, "failed");
  assert.equal(plan.attempt.verdictClass, "fail");
  assert.equal(plan.attempt.primaryFailureCode, "compile_failed");
  assert.equal(plan.attempt.failureClassification?.failureFamily, "compile");
});

test("buildProblem9OfflineIngestPlan rejects digest mismatches", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    result: "pass"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  request.bundle.candidateSource = `${request.bundle.candidateSource}\n-- tampered`;

  assert.throws(
    () => buildProblem9OfflineIngestPlan(request),
    (error: unknown) =>
      error instanceof Problem9OfflineIngestValidationError &&
      error.code === "bundle_digest_mismatch"
  );
});

test("POST /portal/admin/offline-ingest/problem9-run-bundles returns created responses", async (t) => {
  const app = Fastify();
  let receivedActorUserId: string | null = null;
  let receivedPayload: unknown = null;

  t.after(async () => {
    await app.close();
  });

  registerOfflineIngestRoutes(
    app,
    {} as never,
    () => (request, _reply, done) => {
      request.accessRbacContext = {
        email: "admin@paretoproof.com",
        identityId: "identity-1",
        roles: ["admin"],
        status: "approved",
        subject: "subject-1",
        userId: "user-1"
      };
      done();
    },
    {
      ingestProblem9OfflineBundle: async (rawRequest, actorUserId) => {
        receivedActorUserId = actorUserId;
        receivedPayload = rawRequest;

        return {
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
      }
    }
  );

  const payload = {
    ingestRequestSchemaVersion: "1"
  };
  const response = await app.inject({
    method: "POST",
    payload,
    url: "/portal/admin/offline-ingest/problem9-run-bundles"
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json(), {
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
  });
  assert.equal(receivedActorUserId, "user-1");
  assert.deepEqual(receivedPayload, payload);
});

test("POST /portal/admin/offline-ingest/problem9-run-bundles maps duplicate run conflicts to 409", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerOfflineIngestRoutes(
    app,
    {} as never,
    () => (request, _reply, done) => {
      request.accessRbacContext = {
        email: "admin@paretoproof.com",
        identityId: "identity-1",
        roles: ["admin"],
        status: "approved",
        subject: "subject-1",
        userId: "user-1"
      };
      done();
    },
    {
      ingestProblem9OfflineBundle: async () => {
        throw new Problem9OfflineIngestDuplicateError("run-pass-1");
      }
    }
  );

  const response = await app.inject({
    method: "POST",
    payload: {
      ingestRequestSchemaVersion: "1"
    },
    url: "/portal/admin/offline-ingest/problem9-run-bundles"
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "offline_ingest_duplicate_run"
  });
});
