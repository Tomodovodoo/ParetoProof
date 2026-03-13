import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type {
  WorkerArtifactManifestEntry,
  WorkerClaimRequest,
  WorkerResultMessageRequest,
  WorkerTerminalFailureRequest
} from "@paretoproof/shared";
import { runWorkerClaimLoop } from "../src/lib/worker-claim-loop.ts";

const fixedNow = new Date("2026-03-13T18:00:00.000Z");
const benchmarkDigest = "a".repeat(64);
const promptDigest = "b".repeat(64);
const artifactManifestDigest = "c".repeat(64);
const bundleDigest = "d".repeat(64);
const candidateDigest = "e".repeat(64);
const environmentDigest = "f".repeat(64);
const verdictDigest = "1".repeat(64);

type ApiCall = {
  body: unknown;
  path: string;
  token: string;
};

type ApiMockResponse = {
  body: unknown;
  path: string;
  status?: number;
};

test("runWorkerClaimLoop submits manifest and terminal result for a claimed single_run", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-claim-success-"));

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    const artifactEntries = buildArtifactEntries();
    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 0,
            jobToken: "job-token-2"
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 1
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 1
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            artifactManifestDigest,
            artifacts: artifactEntries.map((artifact, index) => ({
              artifactId: `artifact-${index + 1}`,
              artifactRole: artifact.artifactRole,
              relativePath: artifact.relativePath
            }))
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/artifacts`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 2
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 3
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            attemptState: "succeeded",
            jobState: "completed",
            runState: "succeeded"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/result`
        }
      ],
      calls
    );
    const attemptCalls: Array<Record<string, unknown>> = [];

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async (options) => {
          attemptCalls.push(options);
          await writeBundleOutputs(options.outputRoot, artifactEntries);

          return {
            artifactManifestDigest,
            attemptId: workerJob.attemptId,
            authMode: "machine_api_key",
            bundleDigest,
            compileRepairCount: 1,
            outputRoot: options.outputRoot,
            promptPackageDigest: promptDigest,
            providerFamily: "openai",
            providerTurnsUsed: 2,
            result: "pass",
            runConfigDigest: "2".repeat(64),
            runId: workerJob.runId,
            stopReason: "verification_passed",
            verifierRepairCount: 0,
            verdictDigest
          };
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 1,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });
    assert.equal(attemptCalls.length, 1);
    assert.equal(attemptCalls[0]?.providerModel, "gpt-5");
    assert.equal(attemptCalls[0]?.stubScenario, "exact_canonical");

    const claimBody = calls[0]?.body as WorkerClaimRequest;
    assert.equal(calls[0]?.path, "/internal/worker/claims");
    assert.equal(calls[0]?.token, "bootstrap-token");
    assert.deepEqual(claimBody, {
      activeJobCount: 0,
      availableRunKinds: ["single_run"],
      maxConcurrentJobs: 1,
      supportedArtifactRoles: [
        "run_manifest",
        "package_reference",
        "prompt_package",
        "candidate_source",
        "verdict_record",
        "compiler_output",
        "compiler_diagnostics",
        "verifier_output",
        "environment_snapshot",
        "usage_summary",
        "execution_trace"
      ],
      supportsOfflineBundleContract: true,
      supportsTraceUploads: false,
      workerId: "worker-1",
      workerPool: "modal-dev",
      workerRuntime: "modal",
      workerVersion: "worker.v1"
    });

    const resultBody = calls.at(-1)?.body as WorkerResultMessageRequest;
    assert.equal(calls.at(-1)?.path, `/internal/worker/jobs/${workerJob.jobId}/result`);
    assert.equal(calls.at(-1)?.token, "job-token-2");
    assert.deepEqual(resultBody.artifactIds, ["artifact-1", "artifact-2"]);
    assert.deepEqual(resultBody.usageSummary, {
      compileRepairCount: 1,
      providerTurnsUsed: 2,
      stopReason: "verification_passed",
      verifierRepairCount: 0
    });
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop exits explicitly when the first heartbeat requests cancellation", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-claim-cancel-"));

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    let attemptRunnerCalled = false;
    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: {
            acknowledgedEventSequence: 0,
            cancelRequested: true,
            jobToken: null,
            jobTokenExpiresAt: fixedNow.toISOString(),
            leaseExpiresAt: fixedNow.toISOString(),
            leaseStatus: "cancel_requested"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        }
      ],
      calls
    );

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async () => {
          attemptRunnerCalled = true;
          throw new Error("attempt runner should not have executed");
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.equal(attemptRunnerCalled, false);
    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 0,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });
    assert.deepEqual(
      calls.map((call) => call.path),
      ["/internal/worker/claims", `/internal/worker/jobs/${workerJob.jobId}/heartbeat`]
    );
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop heartbeats do not advertise unsent finalize event sequences", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-claim-sequence-"));

  try {
    const workerJob = buildWorkerJob();
    const artifactEntries = buildArtifactEntries();
    let heartbeatCount = 0;
    let sleepCount = 0;
    let resolveAttemptFinish: (() => void) | null = null;
    let resolveSecondSleep: (() => void) | null = null;
    let resolvePendingFinalizeEvent: (() => void) | null = null;
    let concurrentHeartbeatSequence: number | null = null;
    const attemptMayFinish = new Promise<void>((resolve) => {
      resolveAttemptFinish = resolve;
    });
    const secondSleepReleased = new Promise<void>((resolve) => {
      resolveSecondSleep = resolve;
    });
    const pendingFinalizeHeartbeat = new Promise<void>((resolve) => {
      resolvePendingFinalizeEvent = resolve;
    });

    const fetchImpl = async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const bodyText = typeof init?.body === "string" ? init.body : "";
      const body = bodyText.length > 0 ? JSON.parse(bodyText) : null;

      if (url.pathname === "/internal/worker/claims") {
        return jsonResponse({
          leaseStatus: "active",
          pollAfterSeconds: 0,
          workerJob
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/heartbeat`) {
        heartbeatCount += 1;

        if (heartbeatCount === 2) {
          resolveAttemptFinish?.();
        }

        if (heartbeatCount === 4) {
          concurrentHeartbeatSequence = body.lastEventSequence;
          resolvePendingFinalizeEvent?.();
        }

        return jsonResponse(buildHeartbeatResponse());
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/events`) {
        if (body.sequence === 2) {
          resolveSecondSleep?.();
          await pendingFinalizeHeartbeat;
          return jsonResponse({
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 2
          });
        }

        return jsonResponse({
          acceptedAt: fixedNow.toISOString(),
          acknowledgedSequence: body.sequence
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/artifacts`) {
        return jsonResponse({
          acceptedAt: fixedNow.toISOString(),
          artifactManifestDigest,
          artifacts: artifactEntries.map((artifact, index) => ({
            artifactId: `artifact-${index + 1}`,
            artifactRole: artifact.artifactRole,
            relativePath: artifact.relativePath
          }))
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/result`) {
        return jsonResponse({
          acceptedAt: fixedNow.toISOString(),
          attemptState: "succeeded",
          jobState: "completed",
          runState: "succeeded"
        });
      }

      throw new Error(`Unexpected fetch path ${url.pathname}.`);
    };

    await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async (options) => {
          await attemptMayFinish;
          await writeBundleOutputs(options.outputRoot, artifactEntries);

          return {
            artifactManifestDigest,
            attemptId: workerJob.attemptId,
            authMode: "machine_api_key",
            bundleDigest,
            compileRepairCount: 0,
            outputRoot: options.outputRoot,
            promptPackageDigest: promptDigest,
            providerFamily: "openai",
            providerTurnsUsed: 1,
            result: "pass",
            runConfigDigest: "2".repeat(64),
            runId: workerJob.runId,
            stopReason: "verification_passed",
            verifierRepairCount: 0,
            verdictDigest
          };
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: async () => {
          sleepCount += 1;

          if (sleepCount === 1) {
            return;
          }

          if (sleepCount === 2) {
            await secondSleepReleased;
            return;
          }

          return neverSleep();
        }
      }
    );

    assert.equal(concurrentHeartbeatSequence, 1);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop submits a canonical pre-bundle failure when the inner attempt runner fails", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-claim-failure-"));

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: buildHeartbeatResponse(),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 1
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            attemptState: "failed",
            jobState: "failed",
            runState: "failed"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/failure`
        }
      ],
      calls
    );

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async () => {
          throw new Error("provider auth failed for hosted attempt");
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 1,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });

    const failureBody = calls.at(-1)?.body as WorkerTerminalFailureRequest;
    assert.equal(calls.at(-1)?.path, `/internal/worker/jobs/${workerJob.jobId}/failure`);
    assert.equal(failureBody.failure.failureCode, "provider_auth_error");
    assert.deepEqual(failureBody.failure.evidenceArtifactRefs, [
      "worker-control/pre-bundle-failure"
    ]);
    assert.equal(failureBody.bundleDigest, null);
    assert.equal(failureBody.verifierVerdict, null);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop constrains claimed job filesystem paths under the configured roots", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-claim-paths-"));

  try {
    const calls: ApiCall[] = [];
    const workerJob = {
      ...buildWorkerJob(),
      jobId: "C:\\danger"
    };
    const benchmarkRoots: string[] = [];
    const attemptCalls: Array<Record<string, unknown>> = [];
    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: buildHeartbeatResponse(),
          path: jobEndpointPath(workerJob.jobId, "heartbeat")
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 1
          },
          path: jobEndpointPath(workerJob.jobId, "events")
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            attemptState: "failed",
            jobState: "failed",
            runState: "failed"
          },
          path: jobEndpointPath(workerJob.jobId, "failure")
        }
      ],
      calls
    );

    await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async (options) => {
          attemptCalls.push(options);
          throw new Error("provider auth failed for hosted attempt");
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => {
          benchmarkRoots.push(outputRoot);
          return {
            outputRoot,
            packageDigest: benchmarkDigest,
            packageId: "firstproof/Problem9",
            packageVersion: "2026.03.13"
          };
        },
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.equal(benchmarkRoots.length, 1);
    assert.match(benchmarkRoots[0]!, /C__danger/i);
    assert.ok(benchmarkRoots[0]!.startsWith(path.join(tempRoot, "workspace")));
    assert.ok(!benchmarkRoots[0]!.includes("C:\\danger"));
    assert.equal(attemptCalls.length, 1);
    assert.ok(
      String(attemptCalls[0]!.workspaceRoot).startsWith(path.join(tempRoot, "workspace"))
    );
    assert.ok(String(attemptCalls[0]!.outputRoot).startsWith(path.join(tempRoot, "output")));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

function buildWorkerJob() {
  return {
    attemptId: "attempt-1",
    heartbeatIntervalSeconds: 30,
    heartbeatTimeoutSeconds: 90,
    jobId: "job-1",
    jobToken: "job-token-1",
    jobTokenExpiresAt: fixedNow.toISOString(),
    jobTokenScopes: [
      "heartbeat",
      "event_append",
      "artifact_manifest_write",
      "result_finalize",
      "failure_finalize"
    ],
    leaseExpiresAt: fixedNow.toISOString(),
    leaseId: "lease-1",
    offlineBundleCompatible: true as const,
    requiredArtifactRoles: ["run_manifest", "verdict_record"],
    runBundleSchemaVersion: "problem9-run-bundle.v1",
    runId: "run-1",
    target: {
      authMode: "machine_api_key" as const,
      benchmarkItemId: "Problem9",
      benchmarkPackageDigest: benchmarkDigest,
      benchmarkPackageId: "firstproof/Problem9",
      benchmarkPackageVersion: "2026.03.13",
      harnessRevision: "worker-harness.v1",
      laneId: "lean422_exact",
      modelConfigId: "openai/gpt-5",
      modelSnapshotId: "openai/gpt-5.2026-03-13",
      promptPackageDigest: promptDigest,
      promptProtocolVersion: "problem9-prompt-protocol.v1",
      providerFamily: "openai" as const,
      runKind: "single_run" as const,
      runMode: "bounded_agentic_attempt" as const,
      toolProfile: "workspace_edit_limited" as const
    }
  };
}

function buildHeartbeatResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    acknowledgedEventSequence: 0,
    cancelRequested: false,
    jobToken: null,
    jobTokenExpiresAt: fixedNow.toISOString(),
    leaseExpiresAt: fixedNow.toISOString(),
    leaseStatus: "active",
    ...overrides
  };
}

function buildArtifactEntries(): WorkerArtifactManifestEntry[] {
  return [
    {
      artifactRole: "run_manifest",
      byteSize: 128,
      contentEncoding: null,
      mediaType: "application/json",
      relativePath: "run-bundle.json",
      requiredForIngest: true,
      sha256: "3".repeat(64)
    },
    {
      artifactRole: "verdict_record",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "application/json",
      relativePath: "verification/verdict.json",
      requiredForIngest: true,
      sha256: "4".repeat(64)
    }
  ];
}

async function writeBundleOutputs(outputRoot: string, artifactEntries: WorkerArtifactManifestEntry[]) {
  await mkdir(path.join(outputRoot, "verification"), { recursive: true });
  await writeFile(
    path.join(outputRoot, "artifact-manifest.json"),
    JSON.stringify({ artifacts: artifactEntries }, null, 2),
    "utf8"
  );
  await writeFile(
    path.join(outputRoot, "run-bundle.json"),
    JSON.stringify(
      {
        artifactManifestDigest,
        bundleDigest,
        candidateDigest,
        environmentDigest,
        runId: "run-1",
        verdictDigest
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(outputRoot, "verification", "verdict.json"),
    JSON.stringify(
      {
        attemptId: "attempt-1",
        axiomCheck: "passed",
        benchmarkPackageDigest: benchmarkDigest,
        candidateDigest,
        containsAdmit: false,
        containsSorry: false,
        diagnosticGate: "passed",
        laneId: "lean422_exact",
        primaryFailure: null,
        result: "pass",
        semanticEquality: "matched",
        surfaceEquality: "matched",
        verdictSchemaVersion: "problem9-verdict.v1"
      },
      null,
      2
    ),
    "utf8"
  );
}

function createFetchMock(script: ApiMockResponse[], calls: ApiCall[]) {
  return async (input: URL | RequestInfo, init?: RequestInit) => {
    const next = script.shift();

    if (!next) {
      throw new Error(`Unexpected extra fetch to ${String(input)}.`);
    }

    const url = new URL(typeof input === "string" ? input : input.toString());
    const bodyText = typeof init?.body === "string" ? init.body : "";

    calls.push({
      body: bodyText.length > 0 ? JSON.parse(bodyText) : null,
      path: url.pathname,
      token:
        new Headers(init?.headers).get("authorization")?.replace(/^Bearer\s+/u, "") ?? ""
    });

    assert.equal(url.pathname, next.path);

    return new Response(JSON.stringify(next.body), {
      headers: {
        "content-type": "application/json"
      },
      status: next.status ?? 200
    });
  };
}

function neverSleep(): Promise<void> {
  return new Promise(() => {});
}

function jobEndpointPath(jobId: string, suffix: string): string {
  return new URL(
    `/internal/worker/jobs/${jobId}/${suffix}`,
    "https://api.paretoproof.test"
  ).pathname;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    status: 200
  });
}
