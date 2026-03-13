import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Fastify from "fastify";
import type {
  Problem9OfflineIngestRequest,
  Problem9OfflineIngestResponse
} from "@paretoproof/shared";
import { materializeProblem9Package } from "../src/lib/problem9-package.ts";
import {
  getDefaultProblem9PromptPackageOptions,
  materializeProblem9PromptPackage
} from "../src/lib/problem9-prompt-package.ts";
import { materializeProblem9RunBundle } from "../src/lib/problem9-run-bundle.ts";
import {
  buildProblem9OfflineIngestRequest,
  ingestProblem9RunBundle
} from "../src/lib/problem9-offline-ingest.ts";
import { runProblem9OfflineIngestCli } from "../src/lib/problem9-offline-ingest-cli.ts";

test("buildProblem9OfflineIngestRequest loads a canonical bundle root", async () => {
  const fixture = await createOfflineIngestFixture("pass");

  try {
    const request = await buildProblem9OfflineIngestRequest(fixture.bundleRoot);

    assert.equal(request.ingestRequestSchemaVersion, "1");
    assert.equal(request.bundle.runBundle.runId, "run-1");
    assert.equal(request.bundle.runBundle.status, "success");
    assert.equal(request.bundle.verdict.result, "pass");
    assert.equal(request.bundle.artifactManifest.artifacts.length, 9);
  } finally {
    await fixture.cleanup();
  }
});

test("buildProblem9OfflineIngestRequest rejects local digest drift before network submission", async () => {
  const fixture = await createOfflineIngestFixture("pass");

  try {
    await writeFile(
      path.join(fixture.bundleRoot, "candidate", "Candidate.lean"),
      [
        "import FirstProof.Problem9.Support",
        "",
        "namespace FirstProof.Problem9",
        "",
        "theorem tampered : True := by",
        "  trivial",
        "",
        "end FirstProof.Problem9",
        ""
      ].join("\n"),
      "utf8"
    );

    await assert.rejects(
      () => buildProblem9OfflineIngestRequest(fixture.bundleRoot),
      /candidateDigest mismatch|Artifact manifest digest mismatch|Artifact manifest byteSize mismatch/
    );
  } finally {
    await fixture.cleanup();
  }
});

test("ingestProblem9RunBundle posts the inline payload with the Access assertion header", async (t) => {
  const fixture = await createOfflineIngestFixture("pass");
  const app = Fastify();
  let receivedRequest: Problem9OfflineIngestRequest | null = null;

  t.after(async () => {
    await app.close();
    await fixture.cleanup();
  });

  app.post("/portal/admin/offline-ingest/problem9-run-bundles", async (request) => {
    assert.equal(request.headers["cf-access-jwt-assertion"], "portal-admin-jwt");
    receivedRequest = request.body as Problem9OfflineIngestRequest;

    return {
      artifactCount: 9,
      attempt: {
        id: "attempt-row-1",
        sourceAttemptId: "attempt-1",
        state: "succeeded",
        verdictClass: "pass"
      },
      job: {
        id: "job-row-1",
        sourceJobId: "job-1",
        state: "completed"
      },
      run: {
        id: "run-row-1",
        sourceRunId: "run-1",
        state: "succeeded"
      }
    } satisfies Problem9OfflineIngestResponse;
  });

  await app.listen({ host: "127.0.0.1", port: 0 });
  const apiBaseUrl = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;

  const submission = await ingestProblem9RunBundle({
    accessJwtAssertion: "portal-admin-jwt",
    apiBaseUrl,
    bundleRoot: fixture.bundleRoot
  });

  assert.ok(receivedRequest);
  assert.equal(receivedRequest?.bundle.runBundle.runId, "run-1");
  assert.equal(submission.response.run.sourceRunId, "run-1");
});

test("runProblem9OfflineIngestCli prints accepted machine-readable output", async (t) => {
  const fixture = await createOfflineIngestFixture("pass");
  const app = Fastify();
  const capturedLogs: string[] = [];
  const originalConsoleLog = console.log;

  t.after(async () => {
    console.log = originalConsoleLog;
    await app.close();
    await fixture.cleanup();
  });

  app.post("/portal/admin/offline-ingest/problem9-run-bundles", async () => ({
    artifactCount: 9,
    attempt: {
      id: "attempt-row-1",
      sourceAttemptId: "attempt-1",
      state: "succeeded",
      verdictClass: "pass"
    },
    job: {
      id: "job-row-1",
      sourceJobId: "job-1",
      state: "completed"
    },
    run: {
      id: "run-row-1",
      sourceRunId: "run-1",
      state: "succeeded"
    }
  } satisfies Problem9OfflineIngestResponse));

  await app.listen({ host: "127.0.0.1", port: 0 });
  const apiBaseUrl = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;

  console.log = (value?: unknown) => {
    capturedLogs.push(String(value));
  };

  await runProblem9OfflineIngestCli([
    "--bundle-root",
    fixture.bundleRoot,
    "--api-base-url",
    apiBaseUrl,
    "--access-jwt",
    "portal-admin-jwt"
  ]);

  assert.equal(capturedLogs.length, 1);
  const parsed = JSON.parse(capturedLogs[0]) as {
    result: Problem9OfflineIngestResponse;
    status: string;
  };
  assert.equal(parsed.status, "accepted");
  assert.equal(parsed.result.run.sourceRunId, "run-1");
});

test("runProblem9OfflineIngestCli rejects invalid local bundles with machine-readable output", async () => {
  const fixture = await createOfflineIngestFixture("pass");

  try {
    await writeFile(
      path.join(fixture.bundleRoot, "verification", "verdict.json"),
      "{}\n",
      "utf8"
    );

    await assert.rejects(
      () =>
        runProblem9OfflineIngestCli([
          "--bundle-root",
          fixture.bundleRoot,
          "--api-base-url",
          "https://api.paretoproof.com",
          "--access-jwt",
          "portal-admin-jwt"
        ]),
      (error: unknown) => {
        const payload = JSON.parse(
          error instanceof Error ? error.message : String(error)
        ) as {
          error: string;
          stage: string;
          status: string;
        };

        assert.equal(payload.status, "rejected");
        assert.equal(payload.stage, "local_validation");
        assert.equal(payload.error, "offline_ingest_local_validation_failed");
        return true;
      }
    );
  } finally {
    await fixture.cleanup();
  }
});

async function createOfflineIngestFixture(result: "fail" | "pass") {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-offline-ingest-"));
  const benchmarkMaterializationRoot = path.join(tempRoot, "benchmark-materialization");
  const promptPackageRoot = path.join(tempRoot, "prompt-package");
  const runBundleOutputRoot = path.join(tempRoot, "run-bundle-output");
  const artifactsRoot = path.join(tempRoot, "fixture-artifacts");

  const benchmarkPackage = await materializeProblem9Package({
    outputRoot: benchmarkMaterializationRoot
  });
  const promptDefaults = getDefaultProblem9PromptPackageOptions();
  await materializeProblem9PromptPackage({
    attemptId: "attempt-1",
    authMode: "machine_api_key",
    benchmarkPackageRoot: benchmarkPackage.outputRoot,
    harnessRevision: "test-harness-revision",
    jobId: "job-1",
    laneId: "lean422_exact",
    modelConfigId: "openai/gpt-5",
    outputRoot: promptPackageRoot,
    passKCount: null,
    passKIndex: null,
    promptLayerVersions: promptDefaults.promptLayerVersions,
    promptProtocolVersion: promptDefaults.promptProtocolVersion,
    providerFamily: "openai",
    runId: "run-1",
    runMode: "bounded_agentic_attempt",
    toolProfile: "workspace_edit_limited"
  });

  await mkdir(artifactsRoot, { recursive: true });

  const candidateSourcePath = path.join(artifactsRoot, "Candidate.lean");
  const compilerDiagnosticsPath = path.join(artifactsRoot, "compiler-diagnostics.json");
  const compilerOutputPath = path.join(artifactsRoot, "compiler-output.txt");
  const verifierOutputPath = path.join(artifactsRoot, "verifier-output.json");
  const environmentInputPath = path.join(artifactsRoot, "environment-input.json");
  const failureClassificationPath = path.join(artifactsRoot, "failure-classification.json");

  await writeFile(
    candidateSourcePath,
    [
      "import FirstProof.Problem9.Support",
      "",
      "namespace FirstProof.Problem9",
      "",
      "theorem problem9 (n : Nat) :",
      "    triangular (Nat.succ n) = triangular n + Nat.succ n := by",
      result === "pass" ? "  rfl" : "  sorry",
      "",
      "end FirstProof.Problem9",
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
        success: result === "pass"
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    compilerOutputPath,
    result === "pass" ? "Build completed successfully.\n" : "error: compile failed\n",
    "utf8"
  );
  await writeFile(
    verifierOutputPath,
    JSON.stringify(
      {
        axiomCheck: {
          output: "",
          result: result === "pass" ? "passed" : "not_evaluated"
        },
        diagnosticGate: {
          result: result === "pass" ? "passed" : "failed"
        },
        forbiddenTokens: {
          containsAdmit: false,
          containsSorry: result === "fail"
        },
        result,
        semanticCheck: {
          output: "",
          result: result === "pass" ? "matched" : "not_evaluated"
        },
        surfaceEquality: result === "pass" ? "matched" : "not_evaluated",
        surface_drift: false,
        theoremHeaders: {
          canonical: "",
          candidate: ""
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
        executionTargetKind: "problem9-execution",
        lakeSnapshotId: "lake-snapshot",
        leanVersion: "Lean 4.22.0",
        localDevboxDigest: null,
        metadata: {},
        modelSnapshotId: "openai/gpt-5.snapshot",
        os: {
          arch: "x64",
          platform: "linux",
          release: "test"
        },
        runtime: {
          bunVersion: "1.3.10",
          nodeVersion: process.version,
          tsxVersion: null
        },
        verifierVersion: "problem9-local-verifier.v1"
      },
      null,
      2
    ),
    "utf8"
  );

  if (result === "fail") {
    await writeFile(
      failureClassificationPath,
      JSON.stringify(
        {
          evidenceArtifactRefs: ["candidate/Candidate.lean"],
          failureCode: "compile_failed",
          failureFamily: "compile",
          phase: "compile",
          retryEligibility: "manual_retry_only",
          summary: "Lean compile failed",
          terminality: "terminal_attempt",
          userVisibility: "user_visible"
        },
        null,
        2
      ),
      "utf8"
    );
  }

  const bundle = await materializeProblem9RunBundle({
    axiomCheck: result === "pass" ? "passed" : "not_evaluated",
    benchmarkPackageRoot: benchmarkPackage.outputRoot,
    candidateSourcePath,
    compilerDiagnosticsPath,
    compilerOutputPath,
    containsAdmit: false,
    containsSorry: result === "fail",
    diagnosticGate: result === "pass" ? "passed" : "failed",
    environmentInputPath,
    failureClassificationPath: result === "fail" ? failureClassificationPath : null,
    outputRoot: runBundleOutputRoot,
    promptPackageRoot,
    result,
    semanticEquality: result === "pass" ? "matched" : "not_evaluated",
    stopReason: result === "pass" ? "verification_passed" : "compile_failed",
    surfaceEquality: result === "pass" ? "matched" : "not_evaluated",
    verifierOutputPath
  });

  return {
    bundleRoot: bundle.outputRoot,
    cleanup: async () => {
      await rm(tempRoot, { force: true, recursive: true });
    }
  };
}
