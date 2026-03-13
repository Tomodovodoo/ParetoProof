import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Fastify from "fastify";
import type {
  WorkerArtifactManifestRequest,
  WorkerExecutionEvent,
  WorkerFailureClassification,
  WorkerHeartbeatRequest,
  WorkerResultMessageRequest,
  WorkerTerminalFailureRequest
} from "@paretoproof/shared";
import { materializeProblem9RunBundle } from "../src/lib/problem9-run-bundle.ts";
import { runWorkerClaimLoop } from "../src/lib/worker-claim-loop.ts";

function nextTick() {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

async function createTempRoot() {
  return fsMkdtemp(path.join(os.tmpdir(), "paretoproof-worker-claim-loop-"));
}

function buildActiveClaim() {
  return {
    leaseStatus: "active" as const,
    pollAfterSeconds: 0,
    workerJob: {
      attemptId: "attempt-1",
      heartbeatIntervalSeconds: 1,
      heartbeatTimeoutSeconds: 180,
      jobId: "job-1",
      jobToken: "job-token-1",
      jobTokenExpiresAt: "2026-03-13T15:03:00.000Z",
      jobTokenScopes: [
        "heartbeat",
        "event_append",
        "artifact_manifest_write",
        "verifier_verdict_write",
        "result_finalize",
        "failure_finalize"
      ],
      leaseExpiresAt: "2026-03-13T15:03:00.000Z",
      leaseId: "lease-1",
      offlineBundleCompatible: true,
      requiredArtifactRoles: [
        "run_manifest",
        "package_reference",
        "prompt_package",
        "candidate_source",
        "verdict_record",
        "compiler_output",
        "compiler_diagnostics",
        "verifier_output",
        "environment_snapshot"
      ],
      runBundleSchemaVersion: "1",
      runId: "run-1",
      target: {
        benchmarkItemId: "Problem9",
        modelConfigId: "openai/gpt-5",
        runKind: "single_run" as const
      }
    }
  };
}

async function fsMkdtemp(prefix: string) {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(prefix);
}

async function materializeFixtureBundle(options: {
  benchmarkPackageRoot: string;
  outputRoot: string;
  promptPackageRoot: string;
  result: "fail" | "pass";
}) {
  const artifactRoot = path.join(path.dirname(options.outputRoot), ".fixture-artifacts");
  await rm(artifactRoot, { force: true, recursive: true });
  await mkdir(artifactRoot, { recursive: true });

  const candidateSourcePath = path.join(artifactRoot, "Candidate.lean");
  const compilerDiagnosticsPath = path.join(artifactRoot, "compiler-diagnostics.json");
  const compilerOutputPath = path.join(artifactRoot, "compiler-output.txt");
  const verifierOutputPath = path.join(artifactRoot, "verifier-output.json");
  const environmentInputPath = path.join(artifactRoot, "environment-input.json");
  const failureClassificationPath = path.join(artifactRoot, "failure-classification.json");

  await writeFile(
    candidateSourcePath,
    [
      "import FirstProof.Problem9.Support",
      "",
      "namespace FirstProof.Problem9",
      "",
      "theorem problem9 (n : Nat) :",
      "    triangular (Nat.succ n) = triangular n + Nat.succ n := by",
      options.result === "pass" ? "  rfl" : "  sorry",
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
        success: options.result === "pass"
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    compilerOutputPath,
    options.result === "pass" ? "Build completed successfully.\n" : "error: compile failed\n",
    "utf8"
  );
  await writeFile(
    verifierOutputPath,
    JSON.stringify(
      {
        axiomCheck: {
          output: "",
          result: options.result === "pass" ? "passed" : "not_evaluated"
        },
        diagnosticGate: {
          result: options.result === "pass" ? "passed" : "failed"
        },
        forbiddenTokens: {
          containsAdmit: false,
          containsSorry: options.result === "fail"
        },
        result: options.result,
        semanticCheck: {
          output: "",
          result: options.result === "pass" ? "matched" : "not_evaluated"
        },
        surfaceEquality: options.result === "pass" ? "matched" : "not_evaluated",
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
        modelSnapshotId: "openai/gpt-5",
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

  if (options.result === "fail") {
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
        } satisfies WorkerFailureClassification,
        null,
        2
      ),
      "utf8"
    );
  }

  return materializeProblem9RunBundle({
    axiomCheck: options.result === "pass" ? "passed" : "not_evaluated",
    benchmarkPackageRoot: options.benchmarkPackageRoot,
    candidateSourcePath,
    compilerDiagnosticsPath,
    compilerOutputPath,
    containsAdmit: false,
    containsSorry: options.result === "fail",
    diagnosticGate: options.result === "pass" ? "passed" : "failed",
    environmentInputPath,
    failureClassificationPath: options.result === "fail" ? failureClassificationPath : null,
    outputRoot: options.outputRoot,
    promptPackageRoot: options.promptPackageRoot,
    result: options.result,
    semanticEquality: options.result === "pass" ? "matched" : "not_evaluated",
    stopReason: options.result === "pass" ? "verification_passed" : "compile_failed",
    surfaceEquality: options.result === "pass" ? "matched" : "not_evaluated",
    verifierOutputPath
  });
}

test("runWorkerClaimLoop submits a successful hosted Problem 9 result", async (t) => {
  const app = Fastify();
  const events: WorkerExecutionEvent[] = [];
  const heartbeats: WorkerHeartbeatRequest[] = [];
  const manifests: WorkerArtifactManifestRequest[] = [];
  const results: WorkerResultMessageRequest[] = [];
  const logs: string[] = [];
  let heartbeatSeen = false;

  t.after(async () => {
    await app.close();
  });

  app.post("/internal/worker/claims", async () => buildActiveClaim());
  app.post("/internal/worker/jobs/:jobId/heartbeat", async ({ body }) => {
    heartbeats.push(body as WorkerHeartbeatRequest);
    heartbeatSeen = true;
    return {
      acknowledgedEventSequence: 1,
      cancelRequested: false,
      jobToken: "job-token-1",
      jobTokenExpiresAt: "2026-03-13T15:06:00.000Z",
      leaseExpiresAt: "2026-03-13T15:06:00.000Z",
      leaseStatus: "active"
    };
  });
  app.post("/internal/worker/jobs/:jobId/events", async ({ body }) => {
    events.push(body as WorkerExecutionEvent);
    return {
      acceptedAt: "2026-03-13T15:00:11.000Z",
      acknowledgedSequence: (body as WorkerExecutionEvent).sequence
    };
  });
  app.post("/internal/worker/jobs/:jobId/artifacts", async ({ body }) => {
    const payload = body as WorkerArtifactManifestRequest;
    manifests.push(payload);
    return {
      acceptedAt: "2026-03-13T15:02:01.000Z",
      artifactManifestDigest: payload.artifactManifestDigest,
      artifacts: payload.artifacts.map((artifact, index) => ({
        artifactId: `artifact-${index + 1}`,
        artifactRole: artifact.artifactRole,
        relativePath: artifact.relativePath
      }))
    };
  });
  app.post("/internal/worker/jobs/:jobId/result", async ({ body }) => {
    results.push(body as WorkerResultMessageRequest);
    return {
      acceptedAt: "2026-03-13T15:05:01.000Z",
      attemptState: "succeeded",
      jobState: "completed",
      runState: "succeeded"
    };
  });
  app.post("/internal/worker/jobs/:jobId/failure", async () => ({
    acceptedAt: "2026-03-13T15:06:01.000Z",
    attemptState: "failed",
    jobState: "failed",
    runState: "failed"
  }));

  await app.listen({ host: "127.0.0.1", port: 0 });
  const baseUrl = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  process.env.API_BASE_URL = baseUrl;
  process.env.WORKER_BOOTSTRAP_TOKEN = "worker-bootstrap-token";
  process.env.CODEX_API_KEY = "test-key";
  const tempRoot = await createTempRoot();

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const result = await runWorkerClaimLoop(
    {
      authMode: "machine_api_key",
      baseWorkingRoot: tempRoot,
      once: true,
      providerModel: "gpt-5",
      workerId: "worker-1",
      workerPool: "test-pool",
      workerRuntime: "modal",
      workerVersion: "worker.v1"
    },
    {
      executeAttempt: async (attemptOptions) => {
        while (!heartbeatSeen) {
          await nextTick();
        }

        const bundle = await materializeFixtureBundle({
          benchmarkPackageRoot: attemptOptions.benchmarkPackageRoot,
          outputRoot: attemptOptions.outputRoot,
          promptPackageRoot: attemptOptions.promptPackageRoot,
          result: "pass"
        });

        return {
          artifactManifestDigest: bundle.artifactManifestDigest,
          attemptId: "attempt-1",
          authMode: "machine_api_key",
          bundleDigest: bundle.bundleDigest,
          compileRepairCount: 0,
          outputRoot: bundle.outputRoot,
          promptPackageDigest: bundle.promptPackageDigest,
          providerFamily: "openai",
          providerTurnsUsed: 1,
          result: "pass",
          runConfigDigest: bundle.runConfigDigest,
          runId: "run-1",
          stopReason: "verification_passed",
          verifierRepairCount: 0,
          verdictDigest: bundle.verdictDigest
        };
      },
      logInfo: ({ message }) => {
        logs.push(message);
      },
      sleep: async () => {
        await nextTick();
      }
    }
  );

  assert.equal(result.lastJobOutcome, "succeeded");
  assert.ok(heartbeats.length >= 1);
  assert.deepEqual(
    events.map((event) => event.eventKind),
    ["attempt_started", "bundle_finalized", "artifact_manifest_written"]
  );
  assert.equal(results.length, 1);
  assert.ok(manifests[0].artifacts.some((artifact) => artifact.artifactRole === "run_manifest"));
  assert.ok(logs.includes("claim"));
  assert.ok(logs.includes("heartbeat"));
  assert.ok(logs.includes("terminal_result"));
});

test("runWorkerClaimLoop submits a failing hosted Problem 9 result", async (t) => {
  const app = Fastify();
  const failures: WorkerTerminalFailureRequest[] = [];

  t.after(async () => {
    await app.close();
  });

  app.post("/internal/worker/claims", async () => buildActiveClaim());
  app.post("/internal/worker/jobs/:jobId/heartbeat", async () => ({
    acknowledgedEventSequence: 0,
    cancelRequested: false,
    jobToken: "job-token-1",
    jobTokenExpiresAt: "2026-03-13T15:06:00.000Z",
    leaseExpiresAt: "2026-03-13T15:06:00.000Z",
    leaseStatus: "active"
  }));
  app.post("/internal/worker/jobs/:jobId/events", async ({ body }) => ({
    acceptedAt: "2026-03-13T15:00:11.000Z",
    acknowledgedSequence: (body as WorkerExecutionEvent).sequence
  }));
  app.post("/internal/worker/jobs/:jobId/artifacts", async ({ body }) => {
    const payload = body as WorkerArtifactManifestRequest;
    return {
      acceptedAt: "2026-03-13T15:02:01.000Z",
      artifactManifestDigest: payload.artifactManifestDigest,
      artifacts: payload.artifacts.map((artifact, index) => ({
        artifactId: `artifact-${index + 1}`,
        artifactRole: artifact.artifactRole,
        relativePath: artifact.relativePath
      }))
    };
  });
  app.post("/internal/worker/jobs/:jobId/failure", async ({ body }) => {
    failures.push(body as WorkerTerminalFailureRequest);
    return {
      acceptedAt: "2026-03-13T15:06:01.000Z",
      attemptState: "failed",
      jobState: "failed",
      runState: "failed"
    };
  });

  await app.listen({ host: "127.0.0.1", port: 0 });
  process.env.API_BASE_URL = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  process.env.WORKER_BOOTSTRAP_TOKEN = "worker-bootstrap-token";
  process.env.CODEX_API_KEY = "test-key";
  const tempRoot = await createTempRoot();

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const result = await runWorkerClaimLoop(
    {
      authMode: "machine_api_key",
      baseWorkingRoot: tempRoot,
      once: true,
      providerModel: "gpt-5",
      workerId: "worker-1",
      workerPool: "test-pool",
      workerRuntime: "modal",
      workerVersion: "worker.v1"
    },
    {
      executeAttempt: async (attemptOptions) => {
        const bundle = await materializeFixtureBundle({
          benchmarkPackageRoot: attemptOptions.benchmarkPackageRoot,
          outputRoot: attemptOptions.outputRoot,
          promptPackageRoot: attemptOptions.promptPackageRoot,
          result: "fail"
        });

        return {
          artifactManifestDigest: bundle.artifactManifestDigest,
          attemptId: "attempt-1",
          authMode: "machine_api_key",
          bundleDigest: bundle.bundleDigest,
          compileRepairCount: 0,
          outputRoot: bundle.outputRoot,
          promptPackageDigest: bundle.promptPackageDigest,
          providerFamily: "openai",
          providerTurnsUsed: 1,
          result: "fail",
          runConfigDigest: bundle.runConfigDigest,
          runId: "run-1",
          stopReason: "compile_failed",
          verifierRepairCount: 0,
          verdictDigest: bundle.verdictDigest
        };
      },
      logError: () => {},
      logInfo: () => {},
      sleep: async () => {
        await nextTick();
      }
    }
  );

  assert.equal(result.lastJobOutcome, "failed");
  assert.equal(failures.length, 1);
  assert.equal(failures[0].failure.failureCode, "compile_failed");
  assert.equal(failures[0].verifierVerdict?.result, "fail");
});

test("runWorkerClaimLoop stops when heartbeat reports cancellation", async (t) => {
  const app = Fastify();
  const failures: WorkerTerminalFailureRequest[] = [];
  const results: WorkerResultMessageRequest[] = [];

  t.after(async () => {
    await app.close();
  });

  app.post("/internal/worker/claims", async () => buildActiveClaim());
  app.post("/internal/worker/jobs/:jobId/heartbeat", async () => ({
    acknowledgedEventSequence: 0,
    cancelRequested: true,
    jobToken: null,
    jobTokenExpiresAt: null,
    leaseExpiresAt: null,
    leaseStatus: "cancel_requested"
  }));
  app.post("/internal/worker/jobs/:jobId/events", async ({ body }) => ({
    acceptedAt: "2026-03-13T15:00:11.000Z",
    acknowledgedSequence: (body as WorkerExecutionEvent).sequence
  }));
  app.post("/internal/worker/jobs/:jobId/failure", async ({ body }) => {
    failures.push(body as WorkerTerminalFailureRequest);
    return {
      acceptedAt: "2026-03-13T15:06:01.000Z",
      attemptState: "cancelled",
      jobState: "cancelled",
      runState: "cancelled"
    };
  });
  app.post("/internal/worker/jobs/:jobId/result", async ({ body }) => {
    results.push(body as WorkerResultMessageRequest);
    return {
      acceptedAt: "2026-03-13T15:05:01.000Z",
      attemptState: "succeeded",
      jobState: "completed",
      runState: "succeeded"
    };
  });

  await app.listen({ host: "127.0.0.1", port: 0 });
  process.env.API_BASE_URL = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  process.env.WORKER_BOOTSTRAP_TOKEN = "worker-bootstrap-token";
  process.env.CODEX_API_KEY = "test-key";
  const tempRoot = await createTempRoot();

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const result = await runWorkerClaimLoop(
    {
      authMode: "machine_api_key",
      baseWorkingRoot: tempRoot,
      once: true,
      providerModel: "gpt-5",
      workerId: "worker-1",
      workerPool: "test-pool",
      workerRuntime: "modal",
      workerVersion: "worker.v1"
    },
    {
      executeAttempt: async ({ signal }) =>
        new Promise((_, reject) => {
          signal?.addEventListener(
            "abort",
            () => {
              reject(signal.reason ?? new Error("aborted"));
            },
            { once: true }
          );
        }),
      logError: () => {},
      logInfo: () => {},
      sleep: async () => {
        await nextTick();
      }
    }
  );

  assert.equal(result.lastJobOutcome, "lease_lost");
  assert.equal(failures.length, 0);
  assert.equal(results.length, 0);
});
