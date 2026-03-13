import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type {
  WorkerClaimResponse,
  WorkerExecutionEvent,
  WorkerFailureClassification
} from "@paretoproof/shared";
import { runWorkerClaimLoop } from "../src/lib/worker-claim-loop.ts";

type RecordedRequest = {
  headers: Headers;
  json: any;
  method: string;
  path: string;
};

type ResponseSpec = {
  path: string;
  response: any | ((request: RecordedRequest) => any);
  status?: number;
};

function buildActiveClaimResponse(): Extract<WorkerClaimResponse, { leaseStatus: "active" }> {
  return {
    leaseStatus: "active",
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
      requiredArtifactRoles: ["candidate_source", "verdict_record"],
      runBundleSchemaVersion: "1",
      runId: "run-1",
      target: {
        authMode: "machine_api_key",
        benchmarkItemId: "Problem9",
        benchmarkPackageDigest: "a".repeat(64),
        benchmarkPackageId: "firstproof/Problem9",
        benchmarkPackageVersion: "2026.03.13",
        harnessRevision: "worker-harness.v1",
        laneId: "lean422_exact",
        modelConfigId: "openai/gpt-5",
        modelSnapshotId: "openai/gpt-5.2026-03-13",
        promptPackageDigest: "b".repeat(64),
        promptProtocolVersion: "problem9-prompt-protocol.v1",
        providerFamily: "openai",
        runKind: "single_run",
        runMode: "bounded_agentic_attempt",
        toolProfile: "workspace_edit_limited"
      }
    }
  };
}

function createFetchStub(responseSpecs: ResponseSpec[]) {
  const requests: RecordedRequest[] = [];
  const queue = [...responseSpecs];

  const fetchImpl: typeof fetch = async (input, init) => {
    const next = queue.shift();
    assert.ok(next, `Unexpected fetch for ${String(input)}`);

    const url = new URL(typeof input === "string" ? input : input.toString());
    const headers = new Headers(init?.headers);
    const bodyText = typeof init?.body === "string" ? init.body : "";
    const recordedRequest = {
      headers,
      json: bodyText ? JSON.parse(bodyText) : null,
      method: init?.method ?? "GET",
      path: url.pathname
    };

    requests.push(recordedRequest);
    assert.equal(recordedRequest.path, next.path);

    const responseBody =
      typeof next.response === "function" ? next.response(recordedRequest) : next.response;

    return new Response(JSON.stringify(responseBody), {
      headers: {
        "content-type": "application/json"
      },
      status: next.status ?? 200
    });
  };

  return {
    fetchImpl,
    requests,
    assertExhausted() {
      assert.equal(queue.length, 0, `Unconsumed fetch responses remain: ${queue.length}`);
    }
  };
}

async function writeBundleFixture(options: {
  outputRoot: string;
  result: "pass" | "fail";
}): Promise<{
  artifactManifestDigest: string;
  bundleDigest: string;
  candidateDigest: string;
  environmentDigest: string;
  verdictDigest: string;
}> {
  const bundleRoot = path.join(options.outputRoot, "problem9-run-bundle");
  await mkdir(path.join(bundleRoot, "verification"), { recursive: true });

  const artifactManifestDigest = "c".repeat(64);
  const bundleDigest = "d".repeat(64);
  const candidateDigest = "e".repeat(64);
  const environmentDigest = "f".repeat(64);
  const verdictDigest = "1".repeat(64);
  const failure: WorkerFailureClassification = {
    evidenceArtifactRefs: ["candidate/Candidate.lean"],
    failureCode: "compile_failed",
    failureFamily: "compile",
    phase: "compile",
    retryEligibility: "manual_retry_only",
    summary: "Lean compile failed",
    terminality: "terminal_attempt",
    userVisibility: "user_visible"
  };

  await writeFile(
    path.join(bundleRoot, "artifact-manifest.json"),
    JSON.stringify(
      {
        artifacts: [
          {
            artifactRole: "candidate_source",
            byteSize: 128,
            contentEncoding: null,
            mediaType: "text/plain",
            relativePath: "candidate/Candidate.lean",
            requiredForIngest: true,
            sha256: "2".repeat(64)
          },
          {
            artifactRole: "verdict_record",
            byteSize: 64,
            contentEncoding: null,
            mediaType: "application/json",
            relativePath: "verification/verdict.json",
            requiredForIngest: true,
            sha256: "3".repeat(64)
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    path.join(bundleRoot, "run-bundle.json"),
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
    path.join(bundleRoot, "verification", "verdict.json"),
    JSON.stringify(
      {
        attemptId: "attempt-1",
        axiomCheck: options.result === "pass" ? "passed" : "not_evaluated",
        benchmarkPackageDigest: "a".repeat(64),
        candidateDigest,
        containsAdmit: false,
        containsSorry: false,
        diagnosticGate: options.result === "pass" ? "passed" : "failed",
        laneId: "lean422_exact",
        primaryFailure: options.result === "pass" ? null : failure,
        result: options.result,
        semanticEquality: options.result === "pass" ? "matched" : "not_evaluated",
        surfaceEquality: options.result === "pass" ? "matched" : "not_evaluated",
        verdictSchemaVersion: "1"
      },
      null,
      2
    ),
    "utf8"
  );

  return {
    artifactManifestDigest,
    bundleDigest,
    candidateDigest,
    environmentDigest,
    verdictDigest
  };
}

async function buildTempRoots() {
  const root = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-claim-loop-"));
  return {
    outputRoot: path.join(root, "output"),
    workspaceRoot: path.join(root, "workspace")
  };
}

function buildLoopOptions(overrides: Partial<Parameters<typeof runWorkerClaimLoop>[0]> = {}) {
  return {
    authMode: "machine_api_key" as const,
    once: true,
    outputRoot: "C:/tmp/output",
    workerId: "worker-1",
    workerPool: "modal-dev",
    workerVersion: "worker.v1",
    workspaceRoot: "C:/tmp/workspace",
    ...overrides
  };
}

function buildHostedRawEnv() {
  return {
    API_BASE_URL: "https://api.paretoproof.test",
    CODEX_API_KEY: "worker-api-key",
    WORKER_BOOTSTRAP_TOKEN: "worker-bootstrap-token"
  };
}

test("runWorkerClaimLoop claims work, records lifecycle events, and submits a passing result", async () => {
  const roots = await buildTempRoots();
  const claim = buildActiveClaimResponse();
  const bundleDigests = {
    artifactManifestDigest: "c".repeat(64),
    bundleDigest: "d".repeat(64),
    candidateDigest: "e".repeat(64),
    environmentDigest: "f".repeat(64),
    verdictDigest: "1".repeat(64)
  };
  const requests: RecordedRequest[] = [];
  let heartbeatCount = 0;
  let eventSequence = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const headers = new Headers(init?.headers);
    const bodyText = typeof init?.body === "string" ? init.body : "";
    const recordedRequest = {
      headers,
      json: bodyText ? JSON.parse(bodyText) : null,
      method: init?.method ?? "GET",
      path: url.pathname
    };

    requests.push(recordedRequest);

    switch (url.pathname) {
      case "/internal/worker/claims":
        return new Response(JSON.stringify(claim), {
          headers: { "content-type": "application/json" },
          status: 200
        });
      case "/internal/worker/jobs/job-1/heartbeat":
        heartbeatCount += 1;
        return new Response(
          JSON.stringify({
            acknowledgedEventSequence: eventSequence,
            cancelRequested: false,
            jobToken: `job-token-${heartbeatCount + 1}`,
            jobTokenExpiresAt: "2026-03-13T15:05:00.000Z",
            leaseExpiresAt: "2026-03-13T15:05:00.000Z",
            leaseStatus: "active"
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200
          }
        );
      case "/internal/worker/jobs/job-1/events":
        eventSequence += 1;
        return new Response(
          JSON.stringify({
            acceptedAt: `2026-03-13T15:00:0${eventSequence}.000Z`,
            acknowledgedSequence: eventSequence
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200
          }
        );
      case "/internal/worker/jobs/job-1/artifacts":
        return new Response(
          JSON.stringify({
            acceptedAt: "2026-03-13T15:00:05.000Z",
            artifactManifestDigest: bundleDigests.artifactManifestDigest,
            artifacts: [
              {
                artifactId: "artifact-1",
                artifactRole: "candidate_source",
                relativePath: "candidate/Candidate.lean"
              },
              {
                artifactId: "artifact-2",
                artifactRole: "verdict_record",
                relativePath: "verification/verdict.json"
              }
            ]
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200
          }
        );
      case "/internal/worker/jobs/job-1/result":
        return new Response(
          JSON.stringify({
            acceptedAt: "2026-03-13T15:00:06.000Z",
            attemptState: "succeeded",
            jobState: "completed",
            runState: "succeeded"
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200
          }
        );
      default:
        throw new Error(`Unexpected fetch path ${url.pathname}`);
    }
  };

  const result = await runWorkerClaimLoop(
    buildLoopOptions(roots),
    {
      attemptRunner: async (options) => {
        const digests = await writeBundleFixture({
          outputRoot: options.outputRoot,
          result: "pass"
        });

        return {
          ...digests,
          attemptId: "attempt-1",
          authMode: "machine_api_key",
          compileRepairCount: 0,
          outputRoot: path.join(options.outputRoot, "problem9-run-bundle"),
          promptPackageDigest: claim.workerJob.target.promptPackageDigest,
          providerFamily: "openai",
          providerTurnsUsed: 1,
          result: "pass",
          runConfigDigest: "4".repeat(64),
          runId: "run-1",
          stopReason: "verification_passed",
          verifierRepairCount: 0
        };
      },
      fetchImpl,
      materializeBenchmarkPackage: async ({ outputRoot }) => ({
        outputRoot: path.join(outputRoot, "firstproof", "Problem9"),
        packageDigest: claim.workerJob.target.benchmarkPackageDigest,
        packageId: claim.workerJob.target.benchmarkPackageId,
        packageVersion: claim.workerJob.target.benchmarkPackageVersion
      }),
      materializePromptPackage: async ({ outputRoot }) => ({
        outputRoot,
        promptPackageDigest: claim.workerJob.target.promptPackageDigest
      }),
      rawEnv: buildHostedRawEnv(),
      sleep: async (ms) => {
        await new Promise((resolve) => setTimeout(resolve, Math.min(ms, 5)));
      }
    }
  );

  assert.deepEqual(result, {
    claimedJobs: 1,
    completedJobs: 1,
    idlePollCount: 0,
    stoppedReason: "idle_once"
  });

  assert.equal(requests[0].json.availableRunKinds[0], "single_run");
  assert.deepEqual(
    requests
      .filter((request) => request.path.endsWith("/events"))
      .map((request) => (request.json as WorkerExecutionEvent).eventKind),
    ["attempt_started", "artifact_manifest_written", "bundle_finalized"]
  );
  assert.equal(requests.at(-1)?.path, "/internal/worker/jobs/job-1/result");
  assert.ok(heartbeatCount >= 2);
});

test("runWorkerClaimLoop submits terminal failures for pre-bundle attempt errors", async () => {
  const roots = await buildTempRoots();
  const claim = buildActiveClaimResponse();
  const fetchStub = createFetchStub([
    {
      path: "/internal/worker/claims",
      response: claim
    },
    {
      path: "/internal/worker/jobs/job-1/heartbeat",
      response: {
        acknowledgedEventSequence: 0,
        cancelRequested: false,
        jobToken: "job-token-2",
        jobTokenExpiresAt: "2026-03-13T15:04:00.000Z",
        leaseExpiresAt: "2026-03-13T15:04:00.000Z",
        leaseStatus: "active"
      }
    },
    {
      path: "/internal/worker/jobs/job-1/events",
      response: {
        acceptedAt: "2026-03-13T15:00:01.000Z",
        acknowledgedSequence: 1
      }
    },
    {
      path: "/internal/worker/jobs/job-1/failure",
      response: {
        acceptedAt: "2026-03-13T15:00:02.000Z",
        attemptState: "failed",
        jobState: "failed",
        runState: "failed"
      }
    }
  ]);

  const result = await runWorkerClaimLoop(
    buildLoopOptions(roots),
    {
      attemptRunner: async () => {
        throw new Error("Provider response did not contain candidate Lean source.");
      },
      fetchImpl: fetchStub.fetchImpl,
      materializeBenchmarkPackage: async ({ outputRoot }) => ({
        outputRoot: path.join(outputRoot, "firstproof", "Problem9"),
        packageDigest: claim.workerJob.target.benchmarkPackageDigest,
        packageId: claim.workerJob.target.benchmarkPackageId,
        packageVersion: claim.workerJob.target.benchmarkPackageVersion
      }),
      materializePromptPackage: async ({ outputRoot }) => ({
        outputRoot,
        promptPackageDigest: claim.workerJob.target.promptPackageDigest
      }),
      rawEnv: buildHostedRawEnv(),
      sleep: async (ms) => {
        await new Promise((resolve) => setTimeout(resolve, Math.min(ms, 5)));
      }
    }
  );

  assert.equal(result.completedJobs, 1);
  assert.equal(fetchStub.requests.at(-1)?.path, "/internal/worker/jobs/job-1/failure");
  assert.equal(fetchStub.requests.at(-1)?.json.failure.failureCode, "provider_malformed_response");
  fetchStub.assertExhausted();
});

test("runWorkerClaimLoop drops terminal submission when a cancel request arrives during the attempt", async () => {
  const roots = await buildTempRoots();
  const claim = buildActiveClaimResponse();
  let sleepCalls = 0;
  let releaseAttempt: (() => void) | null = null;
  const attemptFinished = new Promise<void>((resolve) => {
    releaseAttempt = resolve;
  });
  const fetchStub = createFetchStub([
    {
      path: "/internal/worker/claims",
      response: claim
    },
    {
      path: "/internal/worker/jobs/job-1/heartbeat",
      response: {
        acknowledgedEventSequence: 0,
        cancelRequested: false,
        jobToken: "job-token-2",
        jobTokenExpiresAt: "2026-03-13T15:04:00.000Z",
        leaseExpiresAt: "2026-03-13T15:04:00.000Z",
        leaseStatus: "active"
      }
    },
    {
      path: "/internal/worker/jobs/job-1/events",
      response: {
        acceptedAt: "2026-03-13T15:00:01.000Z",
        acknowledgedSequence: 1
      }
    },
    {
      path: "/internal/worker/jobs/job-1/heartbeat",
      response: () => {
        releaseAttempt?.();
        return {
          acknowledgedEventSequence: 1,
          cancelRequested: true,
          jobToken: "job-token-3",
          jobTokenExpiresAt: "2026-03-13T15:05:00.000Z",
          leaseExpiresAt: "2026-03-13T15:05:00.000Z",
          leaseStatus: "cancel_requested"
        };
      }
    }
  ]);

  const result = await runWorkerClaimLoop(
    buildLoopOptions(roots),
    {
      attemptRunner: async (options) => {
        await attemptFinished;
        const digests = await writeBundleFixture({
          outputRoot: options.outputRoot,
          result: "pass"
        });

        return {
          ...digests,
          attemptId: "attempt-1",
          authMode: "machine_api_key",
          compileRepairCount: 0,
          outputRoot: path.join(options.outputRoot, "problem9-run-bundle"),
          promptPackageDigest: claim.workerJob.target.promptPackageDigest,
          providerFamily: "openai",
          providerTurnsUsed: 1,
          result: "pass",
          runConfigDigest: "4".repeat(64),
          runId: "run-1",
          stopReason: "verification_passed",
          verifierRepairCount: 0
        };
      },
      fetchImpl: fetchStub.fetchImpl,
      materializeBenchmarkPackage: async ({ outputRoot }) => ({
        outputRoot: path.join(outputRoot, "firstproof", "Problem9"),
        packageDigest: claim.workerJob.target.benchmarkPackageDigest,
        packageId: claim.workerJob.target.benchmarkPackageId,
        packageVersion: claim.workerJob.target.benchmarkPackageVersion
      }),
      materializePromptPackage: async ({ outputRoot }) => ({
        outputRoot,
        promptPackageDigest: claim.workerJob.target.promptPackageDigest
      }),
      rawEnv: buildHostedRawEnv(),
      sleep: async () => {
        sleepCalls += 1;
        assert.equal(sleepCalls, 1);
      }
    }
  );

  assert.equal(result.completedJobs, 0);
  assert.equal(
    fetchStub.requests.some((request) => request.path.endsWith("/result") || request.path.endsWith("/failure")),
    false
  );
  fetchStub.assertExhausted();
});

test("runWorkerClaimLoop drops terminal submission when the worker lease expires during the attempt", async () => {
  const roots = await buildTempRoots();
  const claim = buildActiveClaimResponse();
  let sleepCalls = 0;
  let releaseAttempt: (() => void) | null = null;
  const attemptFinished = new Promise<void>((resolve) => {
    releaseAttempt = resolve;
  });
  const fetchStub = createFetchStub([
    {
      path: "/internal/worker/claims",
      response: claim
    },
    {
      path: "/internal/worker/jobs/job-1/heartbeat",
      response: {
        acknowledgedEventSequence: 0,
        cancelRequested: false,
        jobToken: "job-token-2",
        jobTokenExpiresAt: "2026-03-13T15:04:00.000Z",
        leaseExpiresAt: "2026-03-13T15:04:00.000Z",
        leaseStatus: "active"
      }
    },
    {
      path: "/internal/worker/jobs/job-1/events",
      response: {
        acceptedAt: "2026-03-13T15:00:01.000Z",
        acknowledgedSequence: 1
      }
    },
    {
      path: "/internal/worker/jobs/job-1/heartbeat",
      response: () => {
        releaseAttempt?.();
        return {
          acknowledgedEventSequence: 1,
          cancelRequested: false,
          jobToken: null,
          jobTokenExpiresAt: null,
          leaseExpiresAt: null,
          leaseStatus: "expired"
        };
      }
    }
  ]);

  const result = await runWorkerClaimLoop(
    buildLoopOptions(roots),
    {
      attemptRunner: async (options) => {
        await attemptFinished;
        const digests = await writeBundleFixture({
          outputRoot: options.outputRoot,
          result: "pass"
        });

        return {
          ...digests,
          attemptId: "attempt-1",
          authMode: "machine_api_key",
          compileRepairCount: 0,
          outputRoot: path.join(options.outputRoot, "problem9-run-bundle"),
          promptPackageDigest: claim.workerJob.target.promptPackageDigest,
          providerFamily: "openai",
          providerTurnsUsed: 1,
          result: "pass",
          runConfigDigest: "4".repeat(64),
          runId: "run-1",
          stopReason: "verification_passed",
          verifierRepairCount: 0
        };
      },
      fetchImpl: fetchStub.fetchImpl,
      materializeBenchmarkPackage: async ({ outputRoot }) => ({
        outputRoot: path.join(outputRoot, "firstproof", "Problem9"),
        packageDigest: claim.workerJob.target.benchmarkPackageDigest,
        packageId: claim.workerJob.target.benchmarkPackageId,
        packageVersion: claim.workerJob.target.benchmarkPackageVersion
      }),
      materializePromptPackage: async ({ outputRoot }) => ({
        outputRoot,
        promptPackageDigest: claim.workerJob.target.promptPackageDigest
      }),
      rawEnv: buildHostedRawEnv(),
      sleep: async () => {
        sleepCalls += 1;
        assert.equal(sleepCalls, 1);
      }
    }
  );

  assert.equal(result.completedJobs, 0);
  assert.equal(
    fetchStub.requests.some((request) => request.path.endsWith("/result") || request.path.endsWith("/failure")),
    false
  );
  fetchStub.assertExhausted();
});
