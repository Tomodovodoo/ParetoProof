import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type {
  WorkerArtifactManifestRequest,
  WorkerArtifactManifestResponse,
  WorkerClaimRequest,
  WorkerClaimResponse,
  WorkerExecutionEvent,
  WorkerExecutionEventResponse,
  WorkerHeartbeatRequest,
  WorkerHeartbeatResponse,
  WorkerJobTokenScope,
  WorkerResultMessageRequest,
  WorkerResultMessageResponse,
  WorkerTerminalFailureRequest,
  WorkerTerminalFailureResponse
} from "@paretoproof/shared";
import { parseApiRuntimeEnv } from "../src/config/runtime.ts";
import {
  InternalWorkerControlError,
  internalWorkerControlTestUtils,
  type InternalWorkerJobAuthContext
} from "../src/lib/internal-worker-control.ts";
import { registerInternalWorkerRoutes } from "../src/routes/internal-worker.ts";

const supportedArtifactRoles = [
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
] as const;

function buildRuntimeEnv() {
  return parseApiRuntimeEnv({
    ACCESS_PROVIDER_STATE_SECRET: "state-secret",
    CF_ACCESS_PORTAL_AUD: "portal-audience",
    CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
    DATABASE_URL: "postgres://localhost:5432/paretoproof",
    WORKER_BOOTSTRAP_TOKEN: "worker-bootstrap-token"
  });
}

function buildClaimRequest(): WorkerClaimRequest {
  return {
    activeJobCount: 0,
    availableRunKinds: ["single_run"],
    maxConcurrentJobs: 1,
    supportedArtifactRoles: [...supportedArtifactRoles],
    supportsOfflineBundleContract: true,
    supportsTraceUploads: true,
    workerId: "worker-1",
    workerPool: "modal-dev",
    workerRuntime: "modal",
    workerVersion: "worker.v1"
  };
}

function buildHeartbeatRequest(): WorkerHeartbeatRequest {
  return {
    attemptId: "attempt-1",
    jobId: "job-1",
    lastEventSequence: 3,
    leaseId: "lease-1",
    observedAt: "2026-03-13T15:00:00.000Z",
    phase: "compile",
    progressMessage: "Compiling candidate"
  };
}

function buildEventRequest(): WorkerExecutionEvent {
  return {
    attemptId: "attempt-1",
    details: {
      compilerPass: 1
    },
    eventKind: "compile_started",
    jobId: "job-1",
    leaseId: "lease-1",
    phase: "compile",
    recordedAt: "2026-03-13T15:00:10.000Z",
    sequence: 4,
    summary: "Starting Lean compile"
  };
}

function buildArtifactManifestRequest(): WorkerArtifactManifestRequest {
  return {
    artifactManifestDigest: "b".repeat(64),
    artifacts: [
      {
        artifactRole: "candidate_source",
        byteSize: 128,
        contentEncoding: null,
        mediaType: "text/plain",
        relativePath: "candidate/Candidate.lean",
        requiredForIngest: true,
        sha256: "c".repeat(64)
      }
    ],
    attemptId: "attempt-1",
    jobId: "job-1",
    leaseId: "lease-1",
    recordedAt: "2026-03-13T15:02:00.000Z"
  };
}

function buildResultRequest(): WorkerResultMessageRequest {
  return {
    artifactIds: ["artifact-1"],
    artifactManifestDigest: "d".repeat(64),
    attemptId: "attempt-1",
    bundleDigest: "e".repeat(64),
    candidateDigest: "f".repeat(64),
    completedAt: "2026-03-13T15:05:00.000Z",
    environmentDigest: "1".repeat(64),
    jobId: "job-1",
    leaseId: "lease-1",
    offlineBundleCompatible: true,
    runId: "run-1",
    summary: "Verified successfully",
    usageSummary: {
      promptTokens: 100
    },
    verifierVerdict: {
      attemptId: "attempt-1",
      axiomCheck: "passed",
      benchmarkPackageDigest: "2".repeat(64),
      candidateDigest: "f".repeat(64),
      containsAdmit: false,
      containsSorry: false,
      diagnosticGate: "passed",
      laneId: "problem9-default",
      primaryFailure: null,
      result: "pass",
      semanticEquality: "matched",
      surfaceEquality: "matched",
      verdictSchemaVersion: "1"
    },
    verdictDigest: "3".repeat(64)
  };
}

function buildFailureRequest(): WorkerTerminalFailureRequest {
  return {
    artifactIds: ["artifact-1"],
    artifactManifestDigest: "d".repeat(64),
    attemptId: "attempt-1",
    bundleDigest: "e".repeat(64),
    candidateDigest: "f".repeat(64),
    failedAt: "2026-03-13T15:06:00.000Z",
    failure: {
      evidenceArtifactRefs: ["artifact-1"],
      failureCode: "compile_failed",
      failureFamily: "compile",
      phase: "compile",
      retryEligibility: "never",
      summary: "Lean compile failed",
      terminality: "terminal_attempt",
      userVisibility: "user_visible"
    },
    jobId: "job-1",
    leaseId: "lease-1",
    runId: "run-1",
    summary: "Compilation stopped the attempt",
    terminalState: "failed",
    verifierVerdict: {
      attemptId: "attempt-1",
      axiomCheck: "not_evaluated",
      benchmarkPackageDigest: "2".repeat(64),
      candidateDigest: "f".repeat(64),
      containsAdmit: false,
      containsSorry: false,
      diagnosticGate: "failed",
      laneId: "problem9-default",
      primaryFailure: {
        evidenceArtifactRefs: ["artifact-1"],
        failureCode: "compile_failed",
        failureFamily: "compile",
        phase: "compile",
        retryEligibility: "never",
        summary: "Lean compile failed",
        terminality: "terminal_attempt",
        userVisibility: "user_visible"
      },
      result: "fail",
      semanticEquality: "not_evaluated",
      surfaceEquality: "not_evaluated",
      verdictSchemaVersion: "1"
    },
    verdictDigest: "4".repeat(64)
  };
}

function buildJobAuthContext(scopes: WorkerJobTokenScope[] = [
  "heartbeat",
  "event_append",
  "artifact_manifest_write",
  "verifier_verdict_write",
  "result_finalize",
  "failure_finalize"
]): InternalWorkerJobAuthContext {
  return {
    attemptId: "attempt-1",
    attemptRowId: "attempt-row-1",
    attemptState: "active",
    heartbeatTimeoutSeconds: 180,
    jobId: "job-1",
    jobRowId: "job-row-1",
    jobState: "running",
    jobTokenScopes: scopes,
    lastEventSequence: 3,
    leaseExpiresAt: new Date("2026-03-13T15:03:00.000Z"),
    leaseId: "lease-1",
    leaseRowId: "lease-row-1",
    runId: "run-1",
    runRowId: "run-row-1",
    runState: "running"
  };
}

function createScopeError(scope: WorkerJobTokenScope) {
  return new InternalWorkerControlError({
    code: "worker_job_token_scope_missing",
    issues: [{ message: `Missing ${scope} scope.`, path: "authorization" }],
    statusCode: 403
  });
}

test("POST /internal/worker/claims returns an active lease when work is available", async (t) => {
  const app = Fastify();
  let receivedRequest: WorkerClaimRequest | null = null;

  t.after(async () => {
    await app.close();
  });

  registerInternalWorkerRoutes(app, {} as never, buildRuntimeEnv(), {
    authenticateWorkerJob: async () => buildJobAuthContext(),
    claimWorker: async (request) => {
      receivedRequest = request;

      return {
        leaseStatus: "active",
        pollAfterSeconds: 0,
        workerJob: {
          attemptId: "attempt-1",
          heartbeatIntervalSeconds: 60,
          heartbeatTimeoutSeconds: 180,
          jobId: "job-1",
          jobToken: "job-token-1",
          jobTokenExpiresAt: "2026-03-13T15:03:00.000Z",
          jobTokenScopes: ["heartbeat", "result_finalize"],
          leaseExpiresAt: "2026-03-13T15:03:00.000Z",
          leaseId: "lease-1",
          offlineBundleCompatible: true,
          requiredArtifactRoles: ["candidate_source", "verdict_record"],
          runBundleSchemaVersion: "1",
          runId: "run-1",
          target: {
            benchmarkItemId: "Problem9",
            modelConfigId: "openai/gpt-5",
            runKind: "single_run"
          }
        }
      } satisfies WorkerClaimResponse;
    },
    heartbeatWorker: async () => {
      throw new Error("heartbeat route was not expected in this test");
    }
  });

  const response = await app.inject({
    method: "POST",
    headers: {
      authorization: "Bearer worker-bootstrap-token"
    },
    payload: buildClaimRequest(),
    url: "/internal/worker/claims"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(receivedRequest?.workerId, "worker-1");
  assert.equal(response.json().workerJob?.jobId, "job-1");
});

test("POST /internal/worker/jobs/:jobId/heartbeat returns continue responses for active leases", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerInternalWorkerRoutes(app, {} as never, buildRuntimeEnv(), {
    authenticateWorkerJob: async () => buildJobAuthContext(),
    claimWorker: async () => ({ leaseStatus: "idle", pollAfterSeconds: 30, workerJob: null }),
    heartbeatWorker: async () =>
      ({
        acknowledgedEventSequence: 3,
        cancelRequested: false,
        jobToken: "job-token-2",
        jobTokenExpiresAt: "2026-03-13T15:06:00.000Z",
        leaseExpiresAt: "2026-03-13T15:06:00.000Z",
        leaseStatus: "active"
      }) satisfies WorkerHeartbeatResponse
  });

  const response = await app.inject({
    method: "POST",
    headers: {
      authorization: "Bearer job-token-1"
    },
    payload: buildHeartbeatRequest(),
    url: "/internal/worker/jobs/job-1/heartbeat"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().leaseStatus, "active");
});

test("POST /internal/worker/jobs/:jobId/events accepts structured execution events", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerInternalWorkerRoutes(app, {} as never, buildRuntimeEnv(), {
    authenticateWorkerJob: async () => buildJobAuthContext(),
    claimWorker: async () => ({ leaseStatus: "idle", pollAfterSeconds: 30, workerJob: null }),
    eventWorker: async () =>
      ({
        acceptedAt: "2026-03-13T15:00:11.000Z",
        acknowledgedSequence: 4
      }) satisfies WorkerExecutionEventResponse,
    heartbeatWorker: async () => {
      throw new Error("unexpected heartbeat");
    }
  });

  const response = await app.inject({
    method: "POST",
    headers: {
      authorization: "Bearer job-token-1"
    },
    payload: buildEventRequest(),
    url: "/internal/worker/jobs/job-1/events"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    acceptedAt: "2026-03-13T15:00:11.000Z",
    acknowledgedSequence: 4
  });
});

test("POST /internal/worker/jobs/:jobId/artifacts accepts artifact manifests", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerInternalWorkerRoutes(app, {} as never, buildRuntimeEnv(), {
    artifactManifestWorker: async () =>
      ({
        acceptedAt: "2026-03-13T15:02:01.000Z",
        artifactManifestDigest: "b".repeat(64),
        artifacts: [
          {
            artifactId: "artifact-1",
            artifactRole: "candidate_source",
            relativePath: "candidate/Candidate.lean"
          }
        ]
      }) satisfies WorkerArtifactManifestResponse,
    authenticateWorkerJob: async () => buildJobAuthContext(),
    claimWorker: async () => ({ leaseStatus: "idle", pollAfterSeconds: 30, workerJob: null }),
    heartbeatWorker: async () => {
      throw new Error("unexpected heartbeat");
    }
  });

  const response = await app.inject({
    method: "POST",
    headers: {
      authorization: "Bearer job-token-1"
    },
    payload: buildArtifactManifestRequest(),
    url: "/internal/worker/jobs/job-1/artifacts"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().artifacts[0].artifactId, "artifact-1");
});

test("POST /internal/worker/jobs/:jobId/result accepts terminal success payloads", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerInternalWorkerRoutes(app, {} as never, buildRuntimeEnv(), {
    authenticateWorkerJob: async () => buildJobAuthContext(),
    claimWorker: async () => ({ leaseStatus: "idle", pollAfterSeconds: 30, workerJob: null }),
    heartbeatWorker: async () => {
      throw new Error("unexpected heartbeat");
    },
    resultWorker: async () =>
      ({
        acceptedAt: "2026-03-13T15:05:01.000Z",
        attemptState: "succeeded",
        jobState: "completed",
        runState: "succeeded"
      }) satisfies WorkerResultMessageResponse
  });

  const response = await app.inject({
    method: "POST",
    headers: {
      authorization: "Bearer job-token-1"
    },
    payload: buildResultRequest(),
    url: "/internal/worker/jobs/job-1/result"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().runState, "succeeded");
});

test("POST /internal/worker/jobs/:jobId/failure accepts terminal failure payloads", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerInternalWorkerRoutes(app, {} as never, buildRuntimeEnv(), {
    authenticateWorkerJob: async () => buildJobAuthContext(),
    claimWorker: async () => ({ leaseStatus: "idle", pollAfterSeconds: 30, workerJob: null }),
    failureWorker: async () =>
      ({
        acceptedAt: "2026-03-13T15:06:01.000Z",
        attemptState: "failed",
        jobState: "failed",
        runState: "failed"
      }) satisfies WorkerTerminalFailureResponse,
    heartbeatWorker: async () => {
      throw new Error("unexpected heartbeat");
    }
  });

  const response = await app.inject({
    method: "POST",
    headers: {
      authorization: "Bearer job-token-1"
    },
    payload: buildFailureRequest(),
    url: "/internal/worker/jobs/job-1/failure"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().attemptState, "failed");
});

test("internal worker route maps invalid transition conflicts from event submission", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerInternalWorkerRoutes(app, {} as never, buildRuntimeEnv(), {
    authenticateWorkerJob: async () => buildJobAuthContext(),
    claimWorker: async () => ({ leaseStatus: "idle", pollAfterSeconds: 30, workerJob: null }),
    eventWorker: async () => {
      throw createScopeError("event_append");
    },
    heartbeatWorker: async () => {
      throw new Error("unexpected heartbeat");
    }
  });

  const response = await app.inject({
    method: "POST",
    headers: {
      authorization: "Bearer job-token-1"
    },
    payload: buildEventRequest(),
    url: "/internal/worker/jobs/job-1/events"
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error, "worker_job_token_scope_missing");
});

test("POST /internal/worker/jobs/:jobId/result rejects malformed payload structure", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerInternalWorkerRoutes(app, {} as never, buildRuntimeEnv(), {
    authenticateWorkerJob: async () => buildJobAuthContext(),
    claimWorker: async () => ({ leaseStatus: "idle", pollAfterSeconds: 30, workerJob: null }),
    heartbeatWorker: async () => {
      throw new Error("unexpected heartbeat");
    }
  });

  const payload = buildResultRequest() as Record<string, unknown>;
  delete payload.artifactIds;

  const response = await app.inject({
    method: "POST",
    headers: {
      authorization: "Bearer job-token-1"
    },
    payload,
    url: "/internal/worker/jobs/job-1/result"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "invalid_worker_result_payload");
});

test("result semantic validation rejects non-pass verdict payloads", () => {
  const request = buildResultRequest();
  request.verifierVerdict.result = "fail";
  request.verifierVerdict.primaryFailure = {
    evidenceArtifactRefs: ["artifact-1"],
    failureCode: "compile_failed",
    failureFamily: "compile",
    phase: "compile",
    retryEligibility: "never",
    summary: "not a passing verdict",
    terminality: "terminal_attempt",
    userVisibility: "user_visible"
  };

  assert.throws(
    () => internalWorkerControlTestUtils.assertResultPayload(request),
    (error: unknown) =>
      error instanceof InternalWorkerControlError &&
      error.code === "worker_result_requires_pass_verdict"
  );
});

test("failure semantic validation rejects cancelled submissions with terminality drift", () => {
  const request = buildFailureRequest();
  request.terminalState = "cancelled";

  assert.throws(
    () => internalWorkerControlTestUtils.assertFailurePayload(request),
    (error: unknown) =>
      error instanceof InternalWorkerControlError &&
      error.code === "worker_failure_terminality_mismatch"
  );
});

test("artifact manifest validation rejects digest drift when reusing an existing artifact row", () => {
  const request = buildArtifactManifestRequest();

  assert.throws(
    () =>
      internalWorkerControlTestUtils.assertArtifactRowsMatchManifest(
        {
          artifactClassId: "candidate_source",
          artifactManifestDigest: "z".repeat(64),
          bucketName: "paretoproof-dev-artifacts",
          byteSize: 128,
          contentEncoding: null,
          id: "artifact-1",
          lifecycleState: "registered",
          mediaType: "text/plain",
          objectKey: "runs/run-1/artifacts/attempt-1/candidate/Candidate.lean",
          prefixFamily: "run_artifacts",
          relativePath: "candidate/Candidate.lean",
          requiredForIngest: true,
          sha256: "c".repeat(64),
          storageProvider: "cloudflare_r2"
        },
        request.artifacts[0],
        buildJobAuthContext(),
        request.artifactManifestDigest
      ),
    (error: unknown) =>
      error instanceof InternalWorkerControlError &&
      error.code === "worker_artifact_manifest_conflict"
  );
});
