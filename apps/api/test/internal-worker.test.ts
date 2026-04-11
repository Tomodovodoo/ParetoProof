import assert from "node:assert/strict";
import test from "node:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
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
  createInternalWorkerControlService,
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
    CF_ACCESS_BRANDED_AUDS: "github-audience,google-audience",
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
      evidenceArtifactRefs: ["candidate/Candidate.lean"],
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
        evidenceArtifactRefs: ["candidate/Candidate.lean"],
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
    jobToken: "job-token-1",
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

function buildLeaseStateRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    artifactManifestDigest: null,
    attemptState: "active",
    bundleDigest: null,
    candidateDigest: null,
    heartbeatTimeoutSeconds: 180,
    jobState: "running",
    lastEventSequence: 3,
    leaseExpiresAt: new Date("2099-03-13T15:03:00.000Z"),
    revokedAt: null,
    runState: "running",
    verifierVerdict: null,
    workerInstanceId: null,
    verdictDigest: null,
    ...overrides
  };
}

function buildStoredArtifactRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    artifactClassId: "candidate_source",
    artifactManifestDigest: "d".repeat(64),
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
    sha256: "f".repeat(64),
    storageProvider: "cloudflare_r2",
    ...overrides
  };
}

function createLostClaimRaceDb() {
  const updateCalls: Array<{
    target: unknown;
    values: Record<string, unknown>;
  }> = [];
  const insertCalls: Array<{
    target: unknown;
    values: Record<string, unknown>;
  }> = [];
  let selectCount = 0;
  const leaseConflict = {
    code: "23505",
    constraint_name: "worker_job_leases_active_job_unique"
  };

  const fakeDb = {
    transaction: async (callback: (tx: unknown) => Promise<WorkerClaimResponse>) => {
      const tx = {
        select() {
          selectCount += 1;

          if (selectCount === 1) {
            return {
              from() {
                return {
                  innerJoin() {
                    return this;
                  },
                  where() {
                    return Promise.resolve([]);
                  }
                };
              }
            };
          }

          if (selectCount === 2) {
            return {
              from() {
                return {
                  innerJoin() {
                    return this;
                  },
                  leftJoin() {
                    return this;
                  },
                  where() {
                    return this;
                  },
                  orderBy() {
                    return this;
                  },
                  limit() {
                    return Promise.resolve([
                      {
                        authMode: "machine_api_key",
                        attemptId: "attempt-1",
                        attemptRowId: "attempt-row-1",
                        benchmarkItemId: "Problem9",
                        benchmarkPackageDigest: "a".repeat(64),
                        benchmarkPackageId: "firstproof/Problem9",
                        benchmarkPackageVersion: "2026.03.13",
                        harnessRevision: "worker-harness.v1",
                        jobId: "job-1",
                        jobRowId: "job-row-1",
                        laneId: "problem9-default",
                        modelConfigId: "openai/gpt-5",
                        modelSnapshotId: "openai/gpt-5.2026-03-13",
                        promptPackageDigest: "b".repeat(64),
                        promptProtocolVersion: "problem9-prompt-protocol.v1",
                        providerFamily: "openai",
                        runId: "run-1",
                        runKind: "single_run",
                        runMode: "bounded_agentic_attempt",
                        runRowId: "run-row-1",
                        runState: "queued",
                        toolProfile: "workspace_edit_limited"
                      }
                    ]);
                  }
                };
              }
            };
          }

          return {
            from() {
              return {
                where() {
                  return this;
                },
                limit() {
                  return Promise.resolve([]);
                }
              };
            }
          };
        },
        update(target: unknown) {
          return {
            set(values: Record<string, unknown>) {
              updateCalls.push({ target, values });

              return {
                where() {
                  return this;
                }
              };
            }
          };
        },
        insert(target: unknown) {
          return {
            values(values: Record<string, unknown>) {
              insertCalls.push({ target, values });

              if (insertCalls.length === 1) {
                return {
                  onConflictDoNothing() {
                    return {
                      returning() {
                        return Promise.resolve([{ id: "pool-def-1" }]);
                      }
                    };
                  }
                };
              }

              if (insertCalls.length === 2) {
                return {
                  onConflictDoUpdate() {
                    return {
                      returning() {
                        return Promise.resolve([{ id: "worker-instance-1" }]);
                      }
                    };
                  }
                };
              }

              return {
                returning() {
                  throw leaseConflict;
                }
              };
            }
          };
        }
      };

      return callback(tx);
    }
  };

  return {
    fakeDb,
    getSelectCount: () => selectCount,
    insertCalls,
    updateCalls
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

test("POST /internal/worker/claims returns idle when another claimer wins the lease insert race", async (t) => {
  const app = Fastify();
  const { fakeDb } = createLostClaimRaceDb();

  t.after(async () => {
    await app.close();
  });

  registerInternalWorkerRoutes(app, fakeDb as never, buildRuntimeEnv());

  const response = await app.inject({
    method: "POST",
    headers: {
      authorization: "Bearer worker-bootstrap-token"
    },
    payload: buildClaimRequest(),
    url: "/internal/worker/claims"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    leaseStatus: "idle",
    pollAfterSeconds: 30,
    workerJob: null
  });
});

test("POST /internal/worker/claims reclaims stale unstarted work without queued rewinds", async (t) => {
  const app = Fastify();
  const updateCalls: Array<{
    target: unknown;
    values: Record<string, unknown>;
  }> = [];
  const insertCalls: Array<{
    target: unknown;
    values: Record<string, unknown>;
  }> = [];
  let selectCount = 0;
  const fakeDb = {
    transaction: async (callback: (tx: unknown) => Promise<WorkerClaimResponse>) => {
      const tx = {
        select() {
          selectCount += 1;

          if (selectCount === 1) {
            return {
              from() {
                return {
                  innerJoin() {
                    return this;
                  },
                  where() {
                    return Promise.resolve([
                      {
                        leaseRowId: "lease-row-1",
                        workerInstanceId: "stale-worker-instance-1"
                      }
                    ]);
                  }
                };
              }
            };
          }

          if (selectCount === 2) {
            return {
              from() {
                return {
                  where() {
                    return Promise.resolve([]);
                  }
                };
              }
            };
          }

          return {
            from() {
              return {
                innerJoin() {
                  return this;
                },
                leftJoin() {
                  return this;
                },
                where() {
                  return this;
                },
                orderBy() {
                  return this;
                },
                limit() {
                  return Promise.resolve([
                    {
                      attemptId: "attempt-1",
                      attemptRowId: "attempt-row-1",
                      benchmarkItemId: "Problem9",
                      benchmarkPackageDigest: "a".repeat(64),
                      benchmarkPackageId: "firstproof/Problem9",
                      benchmarkPackageVersion: "2026.03.13",
                      harnessRevision: "worker-harness.v1",
                      jobId: "job-1",
                      jobRowId: "job-row-1",
                      laneId: "lean422_exact",
                      modelConfigId: "openai/gpt-5",
                      modelSnapshotId: "openai/gpt-5.2026-03-13",
                      promptPackageDigest: "b".repeat(64),
                      promptProtocolVersion: "problem9-prompt-protocol.v1",
                      providerFamily: "openai",
                      runId: "run-1",
                      runKind: "single_run",
                      runMode: "bounded_agentic_attempt",
                      runRowId: "run-row-1",
                      runState: "queued",
                      toolProfile: "workspace_edit_limited"
                    }
                  ]);
                }
              };
            }
          };
        },
        update(target: unknown) {
          return {
            set(values: Record<string, unknown>) {
              updateCalls.push({ target, values });

              return {
                where() {
                  return this;
                },
                returning() {
                  if (updateCalls.length === 1) {
                    return Promise.resolve([
                      {
                        workerInstanceId: "stale-worker-instance-1"
                      }
                    ]);
                  }

                  return Promise.resolve([{ leaseRowId: "lease-row-1" }]);
                }
              };
            }
          };
        },
        insert(target: unknown) {
          return {
            values(values: Record<string, unknown>) {
              insertCalls.push({ target, values });

              if (insertCalls.length === 1) {
                return {
                  onConflictDoNothing() {
                    return {
                      returning() {
                        return Promise.resolve([{ id: "pool-def-1" }]);
                      }
                    };
                  }
                };
              }

              if (insertCalls.length === 2) {
                return {
                  onConflictDoUpdate() {
                    return {
                      returning() {
                        return Promise.resolve([{ id: "worker-instance-1" }]);
                      }
                    };
                  }
                };
              }

              return {
                returning() {
                  return Promise.resolve([{ id: "lease-row-2" }]);
                }
              };
            }
          };
        }
      };

      return callback(tx);
    }
  };

  t.after(async () => {
    await app.close();
  });

  registerInternalWorkerRoutes(app, fakeDb as never, buildRuntimeEnv());

  const response = await app.inject({
    method: "POST",
    headers: {
      authorization: "Bearer worker-bootstrap-token"
    },
    payload: buildClaimRequest(),
    url: "/internal/worker/claims"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().leaseStatus, "active");
  assert.equal(response.json().workerJob?.jobId, "job-1");
  assert.equal(selectCount, 3);
  assert.equal(insertCalls.length, 3);
  assert.equal(insertCalls[0]?.values.workerPool, "modal-dev");
  assert.equal(insertCalls[1]?.values.currentLifecycleState, "running");
  assert.equal(insertCalls[2]?.values.workerInstanceId, "worker-instance-1");
  assert.equal(updateCalls.length, 4);
  assert.equal(updateCalls[0].values.revokedAt instanceof Date, true);
  assert.equal(updateCalls[1].values.currentLifecycleState, "ready");
  assert.equal(Object.hasOwn(updateCalls[1].values, "lastSeenAt"), false);
  assert.equal(updateCalls[2].values.state, "claimed");
  assert.equal(updateCalls[3].values.state, "running");
  assert.equal(
    updateCalls.some((call) => call.values.state === "queued"),
    false
  );
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

test("terminal artifact reference validation rejects quarantined artifacts", () => {
  assert.throws(
    () =>
      internalWorkerControlTestUtils.assertArtifactsReferenceableAtTerminalSubmission(
        [buildStoredArtifactRow({ lifecycleState: "quarantined" })],
        "artifactIds"
      ),
    (error: unknown) =>
      error instanceof InternalWorkerControlError && error.code === "worker_artifact_not_ready"
  );
});

test("terminal artifact reference validation rejects deleted artifacts", () => {
  assert.throws(
    () =>
      internalWorkerControlTestUtils.assertArtifactsReferenceableAtTerminalSubmission(
        [buildStoredArtifactRow({ lifecycleState: "deleted" })],
        "artifactIds"
      ),
    (error: unknown) =>
      error instanceof InternalWorkerControlError && error.code === "worker_artifact_not_ready"
  );
});

test("terminal artifact reference validation accepts missing artifacts", () => {
  internalWorkerControlTestUtils.assertArtifactsReferenceableAtTerminalSubmission(
    [buildStoredArtifactRow({ lifecycleState: "missing" })],
    "artifactIds"
  );
});

test("submitResult accepts registered and missing artifacts without mutating artifact lifecycle", async () => {
  const updateCalls: Array<{ target: unknown; values: Record<string, unknown> }> = [];
  let selectCount = 0;
  const fakeDb = {
    transaction: async (callback: (tx: unknown) => Promise<WorkerResultMessageResponse>) => {
      const tx = {
        select() {
          selectCount += 1;

          if (selectCount === 1) {
            return {
              from() {
                return {
                  innerJoin() {
                    return this;
                  },
                  where() {
                    return this;
                  },
                  limit() {
                    return Promise.resolve([buildLeaseStateRow()]);
                  }
                };
              }
            };
          }

          return {
            from() {
              return {
                where() {
                  return Promise.resolve([
                    buildStoredArtifactRow({
                      id: "artifact-1",
                      lifecycleState: "registered"
                    }),
                    buildStoredArtifactRow({
                      id: "artifact-2",
                      lifecycleState: "missing",
                      objectKey: "runs/run-1/logs/attempt-1/verification/compiler-output.txt",
                      relativePath: "verification/compiler-output.txt"
                    })
                  ]);
                }
              };
            }
          };
        },
        update(target: unknown) {
          return {
            set(values: Record<string, unknown>) {
              updateCalls.push({ target, values });

              return {
                where() {
                  return this;
                },
                returning() {
                  return Promise.resolve([{ id: "lease-row-1" }]);
                }
              };
            }
          };
        }
      };

      return callback(tx);
    }
  };
  const control = createInternalWorkerControlService(fakeDb as never);
  const request = {
    ...buildResultRequest(),
    artifactIds: ["artifact-1", "artifact-2"]
  };

  const response = await control.submitResult(request, buildJobAuthContext());

  assert.deepEqual(response, {
    acceptedAt: updateCalls[0]!.values.updatedAt.toISOString(),
    attemptState: "succeeded",
    jobState: "completed",
    runState: "succeeded"
  });
  assert.equal(selectCount, 2);
  assert.equal(updateCalls.length, 4);
  assert.equal(updateCalls[0]!.values.state, "succeeded");
  assert.equal(updateCalls[1]!.values.state, "completed");
  assert.equal(updateCalls[2]!.values.state, "succeeded");
  assert.equal(updateCalls[3]!.values.revokedAt instanceof Date, true);
  assert.equal(
    updateCalls.some((call) => Object.hasOwn(call.values, "lifecycleState")),
    false
  );
});

test("submitFailure accepts registered and missing artifacts without mutating artifact lifecycle", async () => {
  const updateCalls: Array<{ target: unknown; values: Record<string, unknown> }> = [];
  let selectCount = 0;
  const fakeDb = {
    transaction: async (callback: (tx: unknown) => Promise<WorkerTerminalFailureResponse>) => {
      const tx = {
        select() {
          selectCount += 1;

          if (selectCount === 1) {
            return {
              from() {
                return {
                  innerJoin() {
                    return this;
                  },
                  where() {
                    return this;
                  },
                  limit() {
                    return Promise.resolve([buildLeaseStateRow()]);
                  }
                };
              }
            };
          }

          return {
            from() {
              return {
                where() {
                  return Promise.resolve([
                    buildStoredArtifactRow({
                      id: "artifact-1",
                      lifecycleState: "registered"
                    }),
                    buildStoredArtifactRow({
                      id: "artifact-2",
                      lifecycleState: "missing",
                      objectKey: "runs/run-1/logs/attempt-1/verification/compiler-output.txt",
                      relativePath: "verification/compiler-output.txt"
                    })
                  ]);
                }
              };
            }
          };
        },
        update(target: unknown) {
          return {
            set(values: Record<string, unknown>) {
              updateCalls.push({ target, values });

              return {
                where() {
                  return this;
                },
                returning() {
                  return Promise.resolve([{ id: "lease-row-1" }]);
                }
              };
            }
          };
        }
      };

      return callback(tx);
    }
  };
  const control = createInternalWorkerControlService(fakeDb as never);
  const baselineRequest = buildFailureRequest();
  const request = {
    ...baselineRequest,
    artifactIds: ["artifact-1", "artifact-2"],
    failure: {
      ...baselineRequest.failure,
      evidenceArtifactRefs: ["candidate/Candidate.lean"]
    },
    verifierVerdict: {
      ...baselineRequest.verifierVerdict!,
      primaryFailure: {
        ...baselineRequest.verifierVerdict!.primaryFailure!,
        evidenceArtifactRefs: ["candidate/Candidate.lean"]
      }
    }
  };

  const response = await control.submitFailure(request, buildJobAuthContext());

  assert.deepEqual(response, {
    acceptedAt: updateCalls[0]!.values.updatedAt.toISOString(),
    attemptState: "failed",
    jobState: "failed",
    runState: "failed"
  });
  assert.equal(selectCount, 2);
  assert.equal(updateCalls.length, 4);
  assert.equal(updateCalls[0]!.values.state, "failed");
  assert.equal(updateCalls[1]!.values.state, "failed");
  assert.equal(updateCalls[2]!.values.state, "failed");
  assert.equal(updateCalls[3]!.values.revokedAt instanceof Date, true);
  assert.equal(
    updateCalls.some((call) => Object.hasOwn(call.values, "lifecycleState")),
    false
  );
});

test("submitFailure rejects failure evidence refs outside selected artifact relative paths", async () => {
  const control = createInternalWorkerControlService({
    transaction: async (callback: (tx: unknown) => Promise<WorkerTerminalFailureResponse>) => {
      let selectCount = 0;
      const tx = {
        select() {
          selectCount += 1;

          if (selectCount === 1) {
            return {
              from() {
                return {
                  innerJoin() {
                    return this;
                  },
                  where() {
                    return this;
                  },
                  limit() {
                    return Promise.resolve([buildLeaseStateRow()]);
                  }
                };
              }
            };
          }

          return {
            from() {
              return {
                where() {
                  return Promise.resolve([buildStoredArtifactRow()]);
                }
              };
            }
          };
        },
        update() {
          throw new Error("invalid failure evidence refs should reject before any updates");
        }
      };

      return callback(tx);
    }
  } as never);
  const request = buildFailureRequest();
  request.failure.evidenceArtifactRefs = ["verification/compiler-output.txt"];

  await assert.rejects(
    () => control.submitFailure(request, buildJobAuthContext()),
    (error: unknown) =>
      error instanceof InternalWorkerControlError &&
      error.code === "worker_failure_evidence_reference_invalid"
  );
});

test("submitFailure rejects verifier primary failure evidence refs outside selected artifact relative paths", async () => {
  const control = createInternalWorkerControlService({
    transaction: async (callback: (tx: unknown) => Promise<WorkerTerminalFailureResponse>) => {
      let selectCount = 0;
      const tx = {
        select() {
          selectCount += 1;

          if (selectCount === 1) {
            return {
              from() {
                return {
                  innerJoin() {
                    return this;
                  },
                  where() {
                    return this;
                  },
                  limit() {
                    return Promise.resolve([buildLeaseStateRow()]);
                  }
                };
              }
            };
          }

          return {
            from() {
              return {
                where() {
                  return Promise.resolve([buildStoredArtifactRow()]);
                }
              };
            }
          };
        },
        update() {
          throw new Error(
            "invalid verifier primary failure evidence refs should reject before any updates"
          );
        }
      };

      return callback(tx);
    }
  } as never);
  const request = buildFailureRequest();
  request.verifierVerdict = {
    ...request.verifierVerdict!,
    primaryFailure: {
      ...request.verifierVerdict!.primaryFailure!,
      evidenceArtifactRefs: ["verification/compiler-output.txt"]
    }
  };

  await assert.rejects(
    () => control.submitFailure(request, buildJobAuthContext()),
    (error: unknown) =>
      error instanceof InternalWorkerControlError &&
      error.code === "worker_failure_evidence_reference_invalid"
  );
});

test("submitFailure accepts pre-bundle harness failures with omitted artifactIds", async () => {
  const updateCalls: Array<{ target: unknown; values: Record<string, unknown> }> = [];
  let selectCount = 0;
  const fakeDb = {
    transaction: async (callback: (tx: unknown) => Promise<WorkerTerminalFailureResponse>) => {
      const tx = {
        select() {
          selectCount += 1;

          return {
            from() {
              return {
                innerJoin() {
                  return this;
                },
                where() {
                  return this;
                },
                limit() {
                  return Promise.resolve([buildLeaseStateRow()]);
                }
              };
            }
          };
        },
        update(target: unknown) {
          return {
            set(values: Record<string, unknown>) {
              updateCalls.push({ target, values });

              return {
                where() {
                  return this;
                },
                returning() {
                  return Promise.resolve([{ id: "lease-row-1" }]);
                }
              };
            }
          };
        }
      };

      return callback(tx);
    }
  };
  const control = createInternalWorkerControlService(fakeDb as never);
  const { artifactIds: _artifactIds, ...baseRequest } = buildFailureRequest();
  const request: WorkerTerminalFailureRequest = {
    ...baseRequest,
    artifactManifestDigest: null,
    bundleDigest: null,
    candidateDigest: null,
    failure: {
      ...buildFailureRequest().failure,
      evidenceArtifactRefs: ["worker-control/pre-bundle-failure"],
      failureCode: "provider_auth_error",
      failureFamily: "provider",
      phase: "generate",
      summary: "provider auth failed for hosted attempt"
    },
    verifierVerdict: null,
    verdictDigest: null
  };

  const response = await control.submitFailure(request, buildJobAuthContext());

  assert.deepEqual(response, {
    acceptedAt: updateCalls[0]!.values.updatedAt.toISOString(),
    attemptState: "failed",
    jobState: "failed",
    runState: "failed"
  });
  assert.equal(selectCount, 1);
  assert.equal(updateCalls.length, 4);
  assert.equal(updateCalls[0]!.values.state, "failed");
  assert.equal(updateCalls[1]!.values.state, "failed");
  assert.equal(updateCalls[2]!.values.state, "failed");
  assert.equal(updateCalls[3]!.values.revokedAt instanceof Date, true);
  assert.equal(
    updateCalls.some((call) => Object.hasOwn(call.values, "lifecycleState")),
    false
  );
});

test("submitFailure rejects synthetic pre-bundle refs for non-pre-bundle failure codes", async () => {
  const control = createInternalWorkerControlService({
    transaction: async (callback: (tx: unknown) => Promise<WorkerTerminalFailureResponse>) => {
      const tx = {
        select() {
          return {
            from() {
              return {
                innerJoin() {
                  return this;
                },
                where() {
                  return this;
                },
                limit() {
                  return Promise.resolve([buildLeaseStateRow()]);
                }
              };
            }
          };
        },
        update() {
          throw new Error(
            "non-pre-bundle failure codes should reject synthetic refs before any updates"
          );
        }
      };

      return callback(tx);
    }
  } as never);
  const { artifactIds: _artifactIds, ...baseRequest } = buildFailureRequest();
  const request: WorkerTerminalFailureRequest = {
    ...baseRequest,
    artifactManifestDigest: null,
    bundleDigest: null,
    candidateDigest: null,
    failure: {
      ...buildFailureRequest().failure,
      evidenceArtifactRefs: ["worker-control/pre-bundle-failure"]
    },
    verifierVerdict: null,
    verdictDigest: null
  };

  await assert.rejects(
    () => control.submitFailure(request, buildJobAuthContext()),
    (error: unknown) =>
      error instanceof InternalWorkerControlError &&
      error.code === "worker_failure_evidence_reference_invalid"
  );
});

test("submitFailure rejects synthetic pre-bundle refs when persisted lease state is post-bundle", async () => {
  const control = createInternalWorkerControlService({
    transaction: async (callback: (tx: unknown) => Promise<WorkerTerminalFailureResponse>) => {
      let selectCount = 0;
      const tx = {
        select() {
          selectCount += 1;

          if (selectCount === 1) {
            return {
              from() {
                return {
                  innerJoin() {
                    return this;
                  },
                  where() {
                    return this;
                  },
                  limit() {
                    return Promise.resolve([
                      buildLeaseStateRow({
                        artifactManifestDigest: "a".repeat(64)
                      })
                    ]);
                  }
                };
              }
            };
          }

          return {
            from() {
              return {
                where() {
                  return Promise.resolve([]);
                }
              };
            }
          };
        },
        update() {
          throw new Error(
            "synthetic pre-bundle refs with persisted bundle state should reject before any updates"
          );
        }
      };

      return callback(tx);
    }
  } as never);
  const { artifactIds: _artifactIds, ...baseRequest } = buildFailureRequest();
  const request: WorkerTerminalFailureRequest = {
    ...baseRequest,
    artifactManifestDigest: null,
    bundleDigest: null,
    candidateDigest: null,
    failure: {
      ...buildFailureRequest().failure,
      evidenceArtifactRefs: ["worker-control/pre-bundle-failure"],
      failureCode: "provider_auth_error",
      failureFamily: "provider",
      phase: "generate",
      summary: "provider auth failed for hosted attempt"
    },
    verifierVerdict: null,
    verdictDigest: null
  };

  await assert.rejects(
    () => control.submitFailure(request, buildJobAuthContext()),
    (error: unknown) =>
      error instanceof InternalWorkerControlError &&
      error.code === "worker_failure_evidence_reference_invalid"
  );
});

test("submitResult rejects quarantined artifacts at terminal submission", async () => {
  const control = createInternalWorkerControlService({
    transaction: async (callback: (tx: unknown) => Promise<WorkerResultMessageResponse>) => {
      let selectCount = 0;
      const tx = {
        select() {
          selectCount += 1;

          if (selectCount === 1) {
            return {
              from() {
                return {
                  innerJoin() {
                    return this;
                  },
                  where() {
                    return this;
                  },
                  limit() {
                    return Promise.resolve([buildLeaseStateRow()]);
                  }
                };
              }
            };
          }

          return {
            from() {
              return {
                where() {
                  return Promise.resolve([
                    buildStoredArtifactRow({
                      lifecycleState: "quarantined"
                    })
                  ]);
                }
              };
            }
          };
        },
        update() {
          throw new Error("quarantined artifacts should reject before any terminal updates");
        }
      };

      return callback(tx);
    }
  } as never);

  await assert.rejects(
    () => control.submitResult(buildResultRequest(), buildJobAuthContext()),
    (error: unknown) =>
      error instanceof InternalWorkerControlError && error.code === "worker_artifact_not_ready"
  );
});

test("submitFailure rejects deleted artifacts at terminal submission", async () => {
  const control = createInternalWorkerControlService({
    transaction: async (callback: (tx: unknown) => Promise<WorkerTerminalFailureResponse>) => {
      let selectCount = 0;
      const tx = {
        select() {
          selectCount += 1;

          if (selectCount === 1) {
            return {
              from() {
                return {
                  innerJoin() {
                    return this;
                  },
                  where() {
                    return this;
                  },
                  limit() {
                    return Promise.resolve([buildLeaseStateRow()]);
                  }
                };
              }
            };
          }

          return {
            from() {
              return {
                where() {
                  return Promise.resolve([
                    buildStoredArtifactRow({
                      lifecycleState: "deleted"
                    })
                  ]);
                }
              };
            }
          };
        },
        update() {
          throw new Error("deleted artifacts should reject before any terminal updates");
        }
      };

      return callback(tx);
    }
  } as never);

  await assert.rejects(
    () => control.submitFailure(buildFailureRequest(), buildJobAuthContext()),
    (error: unknown) =>
      error instanceof InternalWorkerControlError && error.code === "worker_artifact_not_ready"
  );
});

test("claim fences stale unstarted leases and reclaims work without queued rewinds", async () => {
  const updateCalls: Array<{
    target: unknown;
    values: Record<string, unknown>;
  }> = [];
  const insertCalls: Array<{
    target: unknown;
    values: Record<string, unknown>;
  }> = [];
  let selectCount = 0;
  const fakeDb = {
    transaction: async (callback: (tx: unknown) => Promise<WorkerClaimResponse>) => {
      const tx = {
        select() {
          selectCount += 1;

          if (selectCount === 1) {
            return {
              from() {
                return {
                  innerJoin() {
                    return this;
                  },
                  where() {
                    return Promise.resolve([
                      {
                        leaseRowId: "lease-row-1",
                        workerInstanceId: "stale-worker-instance-1"
                      }
                    ]);
                  }
                };
              }
            };
          }

          if (selectCount === 2) {
            return {
              from() {
                return {
                  where() {
                    return Promise.resolve([]);
                  }
                };
              }
            };
          }

          return {
            from() {
              return {
                innerJoin() {
                  return this;
                },
                leftJoin() {
                  return this;
                },
                where() {
                  return this;
                },
                orderBy() {
                  return this;
                },
                limit() {
                  return Promise.resolve([
                    {
                      attemptId: "attempt-1",
                      attemptRowId: "attempt-row-1",
                      benchmarkItemId: "Problem9",
                      jobId: "job-1",
                      jobRowId: "job-row-1",
                      modelConfigId: "openai/gpt-5",
                      runId: "run-1",
                      runKind: "single_run",
                      runRowId: "run-row-1",
                      runState: "queued"
                    }
                  ]);
                }
              };
            }
          };
        },
        update(target: unknown) {
          return {
            set(values: Record<string, unknown>) {
              updateCalls.push({ target, values });

              return {
                where() {
                  return this;
                },
                returning() {
                  if (updateCalls.length === 1) {
                    return Promise.resolve([
                      {
                        workerInstanceId: "stale-worker-instance-1"
                      }
                    ]);
                  }

                  return Promise.resolve([{ id: "job-row-1" }]);
                }
              };
            }
          };
        },
        insert(target: unknown) {
          return {
            values(values: Record<string, unknown>) {
              insertCalls.push({ target, values });

              if (insertCalls.length === 1) {
                return {
                  onConflictDoNothing() {
                    return {
                      returning() {
                        return Promise.resolve([{ id: "pool-def-1" }]);
                      }
                    };
                  }
                };
              }

              if (insertCalls.length === 2) {
                return {
                  onConflictDoUpdate() {
                    return {
                      returning() {
                        return Promise.resolve([{ id: "worker-instance-1" }]);
                      }
                    };
                  }
                };
              }

              return {
                returning() {
                  return Promise.resolve([{ id: "lease-row-2" }]);
                }
              };
            }
          };
        }
      };

      return callback(tx);
    }
  };
  const control = createInternalWorkerControlService(fakeDb as never);

  const response = await control.claim(buildClaimRequest());

  assert.equal(response.leaseStatus, "active");
  assert.equal(response.workerJob?.jobId, "job-1");
  assert.equal(selectCount, 3);
  assert.equal(insertCalls.length, 3);
  assert.equal(insertCalls[0]?.values.workerPool, "modal-dev");
  assert.equal(insertCalls[1]?.values.currentLifecycleState, "running");
  assert.equal(insertCalls[2]?.values.workerInstanceId, "worker-instance-1");
  assert.equal(updateCalls.length, 4);
  assert.equal(updateCalls[0].values.revokedAt instanceof Date, true);
  assert.equal(updateCalls[1].values.currentLifecycleState, "ready");
  assert.equal(Object.hasOwn(updateCalls[1].values, "lastSeenAt"), false);
  assert.equal(updateCalls[2].values.state, "claimed");
  assert.equal(updateCalls[3].values.state, "running");
  assert.equal(
    updateCalls.some((call) => call.values.state === "queued"),
    false
  );
});

test("stale-lease recovery does not rewind durable job or run state", async () => {
  const updateCalls: Array<Record<string, unknown>> = [];
  const insertCalls: Array<Record<string, unknown>> = [];
  let selectCount = 0;
  const fakeDb = {
    transaction: async (callback: (tx: unknown) => Promise<WorkerClaimResponse>) => {
      const tx = {
        select() {
          selectCount += 1;

          if (selectCount === 1) {
            return {
              from() {
                return {
                  innerJoin() {
                    return this;
                  },
                  where() {
                    return Promise.resolve([
                      {
                        leaseRowId: "lease-row-1",
                        workerInstanceId: "stale-worker-instance-2"
                      }
                    ]);
                  }
                };
              }
            };
          }

          if (selectCount === 2) {
            return {
              from() {
                return {
                  where() {
                    return Promise.resolve([]);
                  }
                };
              }
            };
          }

          return {
            from() {
              return {
                innerJoin() {
                  return this;
                },
                leftJoin() {
                  return this;
                },
                where() {
                  return this;
                },
                orderBy() {
                  return this;
                },
                limit() {
                  return Promise.resolve([
                    {
                      attemptId: "attempt-1",
                      attemptRowId: "attempt-row-1",
                      benchmarkItemId: "Problem9",
                      jobId: "job-1",
                      jobRowId: "job-row-1",
                      modelConfigId: "openai/gpt-5",
                      runId: "run-1",
                      runKind: "single_run",
                      runRowId: "run-row-1",
                      runState: "running"
                    }
                  ]);
                }
              };
            }
          };
        },
        update() {
          return {
            set(values: Record<string, unknown>) {
              updateCalls.push(values);

              return {
                where() {
                  return this;
                },
                returning() {
                  if (updateCalls.length === 1) {
                    return Promise.resolve([
                      {
                        workerInstanceId: "stale-worker-instance-2"
                      }
                    ]);
                  }

                  return Promise.resolve([{ id: "job-row-1" }]);
                }
              };
            }
          };
        },
        insert() {
          return {
            values(values: Record<string, unknown>) {
              insertCalls.push(values);

              if (insertCalls.length === 1) {
                return {
                  onConflictDoNothing() {
                    return {
                      returning() {
                        return Promise.resolve([{ id: "pool-def-1" }]);
                      }
                    };
                  }
                };
              }

              if (insertCalls.length === 2) {
                return {
                  onConflictDoUpdate() {
                    return {
                      returning() {
                        return Promise.resolve([{ id: "worker-instance-1" }]);
                      }
                    };
                  }
                };
              }

              return {
                returning() {
                  return Promise.resolve([{ id: "lease-row-2" }]);
                }
              };
            }
          };
        }
      };

      return callback(tx);
    }
  };
  const control = createInternalWorkerControlService(fakeDb as never);

  const response = await control.claim(buildClaimRequest());

  assert.equal(response.leaseStatus, "active");
  assert.equal(selectCount, 3);
  assert.equal(insertCalls.length, 3);
  assert.equal(insertCalls[1]?.currentLifecycleState, "running");
  assert.equal(insertCalls[2]?.workerInstanceId, "worker-instance-1");
  assert.equal(updateCalls.length, 3);
  assert.equal(updateCalls[0].revokedAt instanceof Date, true);
  assert.equal(updateCalls[1].currentLifecycleState, "ready");
  assert.equal(Object.hasOwn(updateCalls[1], "lastSeenAt"), false);
  assert.equal(updateCalls[2].state, "claimed");
  assert.equal(updateCalls.some((call) => call.state === "queued"), false);
});

test("claim terminal-fails expired started work before polling for new candidates", async () => {
  const updateCalls: Array<Record<string, unknown>> = [];
  const insertCalls: Array<Record<string, unknown>> = [];
  let selectCount = 0;
  const fakeDb = {
    transaction: async (callback: (tx: unknown) => Promise<WorkerClaimResponse>) => {
      const tx = {
        select() {
          selectCount += 1;

          if (selectCount === 1) {
            return {
              from() {
                return {
                  innerJoin() {
                    return this;
                  },
                  where() {
                    return Promise.resolve([
                      {
                        attemptRowId: "attempt-row-1",
                        attemptState: "active",
                        jobRowId: "job-row-1",
                        jobState: "running",
                        leaseRowId: "lease-row-1",
                        runRowId: "run-row-1",
                        runState: "running",
                        workerInstanceId: "stale-worker-instance-3"
                      }
                    ]);
                  }
                };
              }
            };
          }

          if (selectCount === 2) {
            return {
              from() {
                return {
                  where() {
                    return Promise.resolve([]);
                  }
                };
              }
            };
          }

          return {
            from() {
              return {
                innerJoin() {
                  return this;
                },
                leftJoin() {
                  return this;
                },
                where() {
                  return this;
                },
                orderBy() {
                  return this;
                },
                limit() {
                  return Promise.resolve([]);
                }
              };
            }
          };
        },
        update() {
          return {
            set(values: Record<string, unknown>) {
              updateCalls.push(values);

              return {
                where() {
                  return this;
                },
                returning() {
                  if (updateCalls.length === 1) {
                    return Promise.resolve([
                      {
                        leaseRowId: "lease-row-1",
                        workerInstanceId: "stale-worker-instance-3"
                      }
                    ]);
                  }

                  return Promise.resolve([{ id: "updated-row-1" }]);
                }
              };
            }
          };
        },
        insert() {
          return {
            values(values: Record<string, unknown>) {
              insertCalls.push(values);

              if (insertCalls.length === 1) {
                return {
                  onConflictDoNothing() {
                    return {
                      returning() {
                        return Promise.resolve([{ id: "pool-def-1" }]);
                      }
                    };
                  }
                };
              }

              return {
                onConflictDoUpdate() {
                  return {
                    returning() {
                      return Promise.resolve([{ id: "worker-instance-1" }]);
                    }
                  };
                }
              };
            }
          };
        }
      };

      return callback(tx);
    }
  };
  const control = createInternalWorkerControlService(fakeDb as never);

  const response = await control.claim(buildClaimRequest());

  assert.deepEqual(response, {
    leaseStatus: "idle",
    pollAfterSeconds: 30,
    workerJob: null
  });
  assert.equal(selectCount, 3);
  assert.equal(insertCalls.length, 2);
  assert.equal(insertCalls[1]?.currentLifecycleState, "ready");
  assert.equal(updateCalls.length, 5);
  assert.equal(updateCalls[0].revokedAt instanceof Date, true);
  assert.equal(updateCalls[1].state, "failed");
  assert.equal(updateCalls[1].verdictClass, "invalid_result");
  assert.equal(updateCalls[1].primaryFailureCode, "worker_lease_lost");
  assert.equal(updateCalls[1].primaryFailureFamily, "harness");
  assert.equal(updateCalls[1].primaryFailureSummary, "The active worker lease expired before the attempt finished.");
  assert.equal(
    (updateCalls[1].failureClassification as Record<string, unknown>).failureCode,
    "worker_lease_lost"
  );
  assert.deepEqual(
    (updateCalls[1].failureClassification as Record<string, unknown>).evidenceArtifactRefs,
    ["worker-control/lease-expired-recovery"]
  );
  assert.equal(updateCalls[2].state, "failed");
  assert.equal(updateCalls[2].primaryFailureCode, "worker_lease_lost");
  assert.equal(updateCalls[3].state, "failed");
  assert.equal(updateCalls[3].primaryFailureCode, "worker_lease_lost");
  assert.equal(updateCalls[4].currentLifecycleState, "ready");
  assert.equal(Object.hasOwn(updateCalls[4], "lastSeenAt"), false);
  assert.equal(updateCalls.some((call) => call.state === "queued"), false);
  assert.equal(updateCalls.some((call) => call.state === "claimed"), false);
});

test("claim keeps any still-unrevoked lease row blocking candidate selection", async () => {
  let capturedLeaseJoin: SQL | null = null;
  const insertCalls: Array<Record<string, unknown>> = [];
  let updateCalled = false;
  let selectCount = 0;
  const fakeDb = {
    transaction: async (callback: (tx: unknown) => Promise<WorkerClaimResponse>) => {
      const tx = {
        select() {
          selectCount += 1;

          if (selectCount === 1) {
            return {
              from() {
                return {
                  innerJoin() {
                    return this;
                  },
                  where() {
                    return Promise.resolve([]);
                  }
                };
              }
            };
          }

          return {
            from() {
              return {
                innerJoin() {
                  return this;
                },
                leftJoin(_target: unknown, condition: SQL) {
                  capturedLeaseJoin = condition;
                  return this;
                },
                where() {
                  return this;
                },
                orderBy() {
                  return this;
                },
                limit() {
                  return Promise.resolve([]);
                }
              };
            }
          };
        },
        update() {
          updateCalled = true;
          throw new Error("claim should stay idle when a prior lease row is still unrevoked");
        },
        insert() {
          return {
            values(values: Record<string, unknown>) {
              insertCalls.push(values);

              if (insertCalls.length === 1) {
                return {
                  onConflictDoNothing() {
                    return {
                      returning() {
                        return Promise.resolve([{ id: "pool-def-1" }]);
                      }
                    };
                  }
                };
              }

              return {
                onConflictDoUpdate() {
                  return {
                    returning() {
                      return Promise.resolve([{ id: "worker-instance-1" }]);
                    }
                  };
                }
              };
            }
          };
        }
      };

      return callback(tx);
    }
  };
  const control = createInternalWorkerControlService(fakeDb as never);

  const response = await control.claim(buildClaimRequest());
  const query = new PgDialect().sqlToQuery(capturedLeaseJoin!);

  assert.equal(response.leaseStatus, "idle");
  assert.equal(selectCount, 2);
  assert.equal(updateCalled, false);
  assert.equal(insertCalls.length, 2);
  assert.equal(insertCalls[0]?.workerPool, "modal-dev");
  assert.equal(insertCalls[1]?.currentLifecycleState, "ready");
  assert.match(query.sql, /"worker_job_leases"\."revoked_at" is null/i);
  assert.doesNotMatch(query.sql, /"worker_job_leases"\."lease_expires_at"/i);
  assert.equal(query.params.length, 0);
});

test("claim returns idle when another claimer wins the active lease uniqueness race", async () => {
  const { fakeDb, getSelectCount, insertCalls, updateCalls } = createLostClaimRaceDb();
  const control = createInternalWorkerControlService(fakeDb as never);

  const response = await control.claim(buildClaimRequest());

  assert.deepEqual(response, {
    leaseStatus: "idle",
    pollAfterSeconds: 30,
    workerJob: null
  });
  assert.equal(getSelectCount(), 3);
  assert.equal(insertCalls.length, 3);
  assert.equal(insertCalls[1]?.values.currentLifecycleState, "running");
  assert.equal(insertCalls[2]?.values.workerInstanceId, "worker-instance-1");
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0]?.values.currentLifecycleState, "ready");
  assert.equal(updateCalls[0]?.values.lastSeenAt instanceof Date, true);
  assert.equal(updateCalls[0]?.values.updatedAt instanceof Date, true);
  assert.equal("state" in updateCalls[0]!.values, false);
});

test("claim reuses existing worker pool definitions without hot-row updates", async () => {
  let selectCount = 0;
  let insertCount = 0;
  let poolInsertUsedConflictDoNothing = false;
  const fakeDb = {
    transaction: async (callback: (tx: unknown) => Promise<WorkerClaimResponse>) => {
      const tx = {
        select() {
          selectCount += 1;

          if (selectCount === 1) {
            return {
              from() {
                return {
                  innerJoin() {
                    return this;
                  },
                  where() {
                    return Promise.resolve([]);
                  }
                };
              }
            };
          }

          if (selectCount === 3) {
            return {
              from() {
                return {
                  where() {
                    return this;
                  },
                  limit() {
                    return Promise.resolve([{ id: "pool-def-1", workerRuntime: "modal" }]);
                  }
                };
              }
            };
          }

          return {
            from() {
              return {
                innerJoin() {
                  return this;
                },
                leftJoin() {
                  return this;
                },
                where() {
                  return this;
                },
                orderBy() {
                  return this;
                },
                limit() {
                  return Promise.resolve([]);
                }
              };
            }
          };
        },
        update() {
          throw new Error("idle claims should not issue updates");
        },
        insert() {
          insertCount += 1;

          return {
            values() {
              if (insertCount === 1) {
                return {
                  onConflictDoNothing() {
                    poolInsertUsedConflictDoNothing = true;

                    return {
                      returning() {
                        return Promise.resolve([]);
                      }
                    };
                  }
                };
              }

              return {
                onConflictDoUpdate() {
                  return {
                    returning() {
                      return Promise.resolve([{ id: "worker-instance-1" }]);
                    }
                  };
                }
              };
            }
          };
        }
      };

      return callback(tx);
    }
  };
  const control = createInternalWorkerControlService(fakeDb as never);

  const response = await control.claim(buildClaimRequest());

  assert.equal(response.leaseStatus, "idle");
  assert.equal(selectCount, 3);
  assert.equal(insertCount, 2);
  assert.equal(poolInsertUsedConflictDoNothing, true);
});

test("claim rejects worker runtime mismatches against existing pool definitions", async () => {
  let selectCount = 0;
  let insertCount = 0;
  const control = createInternalWorkerControlService({
    transaction: async (callback: (tx: unknown) => Promise<WorkerClaimResponse>) => {
      const tx = {
        select() {
          selectCount += 1;

          if (selectCount === 1) {
            return {
              from() {
                return {
                  innerJoin() {
                    return this;
                  },
                  where() {
                    return Promise.resolve([]);
                  }
                };
              }
            };
          }

          if (selectCount === 2) {
            return {
              from() {
                return {
                  innerJoin() {
                    return this;
                  },
                  leftJoin() {
                    return this;
                  },
                  where() {
                    return this;
                  },
                  orderBy() {
                    return this;
                  },
                  limit() {
                    return Promise.resolve([]);
                  }
                };
              }
            };
          }

          return {
            from() {
              return {
                where() {
                  return this;
                },
                limit() {
                  return Promise.resolve([
                    { id: "pool-def-1", workerRuntime: "local_docker" }
                  ]);
                }
              };
            }
          };
        },
        insert() {
          insertCount += 1;

          return {
            values() {
              return {
                onConflictDoNothing() {
                  return {
                    returning() {
                      return Promise.resolve([]);
                    }
                  };
                }
              };
            }
          };
        },
        update() {
          throw new Error("runtime mismatches should reject before any updates");
        }
      };

      return callback(tx);
    }
  } as never);

  await assert.rejects(
    () => control.claim(buildClaimRequest()),
    (error: unknown) =>
      error instanceof InternalWorkerControlError &&
      error.code === "worker_pool_runtime_mismatch"
  );

  assert.equal(selectCount, 3);
  assert.equal(insertCount, 1);
});

test("reportEvent rejects submissions whose lease is revoked after the initial read", async () => {
  let selectCount = 0;
  const control = createInternalWorkerControlService({
    transaction: async (callback: (tx: unknown) => Promise<WorkerExecutionEventResponse>) => {
      const tx = {
        select() {
          selectCount += 1;
          return {
            from() {
              const chain = {
                innerJoin() {
                  return chain;
                },
                where() {
                  return chain;
                },
                limit() {
                  return Promise.resolve([buildLeaseStateRow()]);
                }
              };

              return chain;
            }
          };
        },
        insert() {
          return {
            values() {
              return Promise.resolve();
            }
          };
        },
        update() {
          return {
            set(values: Record<string, unknown>) {
              return {
                where() {
                  return {
                    returning() {
                      return Promise.resolve([]);
                    }
                  };
                }
              };
            }
          };
        }
      };

      return callback(tx);
    }
  } as never);

  await assert.rejects(
    () => control.reportEvent(buildEventRequest(), buildJobAuthContext()),
    (error: unknown) =>
      error instanceof InternalWorkerControlError &&
      error.code === "worker_lease_not_active"
  );

  assert.equal(selectCount, 1);
});

test("reportEvent rejects duplicate retries once the lease has been revoked", async () => {
  let selectCount = 0;
  const control = createInternalWorkerControlService({
    transaction: async (callback: (tx: unknown) => Promise<WorkerExecutionEventResponse>) => {
      const tx = {
        select() {
          selectCount += 1;

          if (selectCount === 1) {
            return {
              from() {
                const chain = {
                  innerJoin() {
                    return chain;
                  },
                  where() {
                    return chain;
                  },
                  limit() {
                    return Promise.resolve([
                      buildLeaseStateRow({
                        lastEventSequence: 4
                      })
                    ]);
                  }
                };

                return chain;
              }
            };
          }

          return {
            from() {
              const chain = {
                where() {
                  return chain;
                },
                limit() {
                  return Promise.resolve([
                    {
                      createdAt: new Date("2026-03-13T15:00:10.000Z"),
                      details: buildEventRequest().details,
                      eventKind: buildEventRequest().eventKind,
                      phase: buildEventRequest().phase,
                      recordedAt: new Date(buildEventRequest().recordedAt),
                      sequence: buildEventRequest().sequence,
                      summary: buildEventRequest().summary
                    }
                  ]);
                }
              };

              return chain;
            }
          };
        },
        insert() {
          throw new Error("duplicate event retries should not insert a new event row");
        },
        update() {
          return {
            set() {
              return {
                where() {
                  return {
                    returning() {
                      return Promise.resolve([]);
                    }
                  };
                }
              };
            }
          };
        }
      };

      return callback(tx);
    }
  } as never);

  await assert.rejects(
    () => control.reportEvent(buildEventRequest(), buildJobAuthContext()),
    (error: unknown) =>
      error instanceof InternalWorkerControlError &&
      error.code === "worker_lease_not_active"
  );

  assert.ok(selectCount >= 1);
});

test("submitArtifactManifest rejects submissions whose lease is revoked after the initial read", async () => {
  let selectCount = 0;
  const control = createInternalWorkerControlService({
    transaction: async (callback: (tx: unknown) => Promise<WorkerArtifactManifestResponse>) => {
      const tx = {
        select() {
          selectCount += 1;

          if (selectCount === 1) {
            return {
              from() {
                const chain = {
                  innerJoin() {
                    return chain;
                  },
                  where() {
                    return chain;
                  },
                  limit() {
                    return Promise.resolve([buildLeaseStateRow()]);
                  }
                };

                return chain;
              }
            };
          }

          return {
            from() {
              return {
                where() {
                  return Promise.resolve([]);
                }
              };
            }
          };
        },
        insert() {
          return {
            values() {
              return {
                returning() {
                  return Promise.resolve([]);
                }
              };
            }
          };
        },
        update() {
          return {
            set() {
              return {
                where() {
                  return {
                    returning() {
                      return Promise.resolve([]);
                    }
                  };
                }
              };
            }
          };
        }
      };

      return callback(tx);
    }
  } as never);
  const request = {
    ...buildArtifactManifestRequest(),
    artifacts: []
  };

  await assert.rejects(
    () => control.submitArtifactManifest(request, buildJobAuthContext()),
    (error: unknown) =>
      error instanceof InternalWorkerControlError &&
      error.code === "worker_lease_not_active"
  );

  assert.ok(selectCount >= 1);
});

test("submitResult rejects terminal updates whose lease is revoked after the initial read", async () => {
  let selectCount = 0;
  const control = createInternalWorkerControlService({
    transaction: async (callback: (tx: unknown) => Promise<WorkerResultMessageResponse>) => {
      const tx = {
        select() {
          selectCount += 1;

          if (selectCount === 1) {
            return {
              from() {
                const chain = {
                  innerJoin() {
                    return chain;
                  },
                  where() {
                    return chain;
                  },
                  limit() {
                    return Promise.resolve([buildLeaseStateRow()]);
                  }
                };

                return chain;
              }
            };
          }

          return {
            from() {
              return {
                where() {
                  return Promise.resolve([]);
                }
              };
            }
          };
        },
        update() {
          return {
            set(values: Record<string, unknown>) {
              return {
                where() {
                  return {
                    returning() {
                      return Promise.resolve([]);
                    }
                  };
                }
              };
            }
          };
        }
      };

      return callback(tx);
    }
  } as never);
  const request = {
    ...buildResultRequest(),
    artifactIds: []
  };

  await assert.rejects(
    () => control.submitResult(request, buildJobAuthContext()),
    (error: unknown) =>
      error instanceof InternalWorkerControlError &&
      error.code === "worker_lease_not_active"
  );

  assert.equal(selectCount, 1);
});

test("submitFailure rejects terminal updates whose lease is revoked after the initial read", async () => {
  let selectCount = 0;
  const control = createInternalWorkerControlService({
    transaction: async (callback: (tx: unknown) => Promise<WorkerTerminalFailureResponse>) => {
      const tx = {
        select() {
          selectCount += 1;

          if (selectCount === 1) {
            return {
              from() {
                const chain = {
                  innerJoin() {
                    return chain;
                  },
                  where() {
                    return chain;
                  },
                  limit() {
                    return Promise.resolve([buildLeaseStateRow()]);
                  }
                };

                return chain;
              }
            };
          }

          return {
            from() {
              return {
                where() {
                  return Promise.resolve([]);
                }
              };
            }
          };
        },
        update() {
          return {
            set() {
              return {
                where() {
                  return {
                    returning() {
                      return Promise.resolve([]);
                    }
                  };
                }
              };
            }
          };
        }
      };

      return callback(tx);
    }
  } as never);
  const request = {
    ...buildFailureRequest(),
    artifactIds: [],
    artifactManifestDigest: null,
    bundleDigest: null,
    candidateDigest: null,
    failure: {
      ...buildFailureRequest().failure,
      evidenceArtifactRefs: []
    },
    verifierVerdict: null,
    verdictDigest: null
  };

  await assert.rejects(
    () => control.submitFailure(request, buildJobAuthContext()),
    (error: unknown) =>
      error instanceof InternalWorkerControlError &&
      error.code === "worker_lease_not_active"
  );

  assert.equal(selectCount, 1);
});

test("heartbeat rotates the job token while extending the lease", async () => {
  const updateCalls: Array<Record<string, unknown>> = [];
  const fakeDb = {
    transaction: async (callback: (tx: unknown) => Promise<WorkerHeartbeatResponse>) => {
      const tx = {
        select() {
          return {
            from() {
              return {
                innerJoin() {
                  return this;
                },
                where() {
                  return this;
                },
                limit() {
                  return Promise.resolve([
                    {
                      artifactManifestDigest: "a".repeat(64),
                      attemptState: "prepared",
                      bundleDigest: "b".repeat(64),
                      candidateDigest: "c".repeat(64),
                      heartbeatTimeoutSeconds: 180,
                      jobState: "claimed",
                      lastEventSequence: 2,
                      leaseExpiresAt: new Date(Date.now() + 60_000),
                      revokedAt: null,
                      runState: "queued",
                      verifierVerdict: {},
                      workerInstanceId: "worker-instance-1",
                      verdictDigest: "d".repeat(64)
                    }
                  ]);
                }
              };
            }
          };
        },
        update() {
          return {
            set(values: Record<string, unknown>) {
              updateCalls.push(values);

              return {
                where() {
                  return this;
                },
                returning() {
                  return Promise.resolve([{ id: "lease-row-1" }]);
                }
              };
            }
          };
        }
      };

      return callback(tx);
    }
  };
  const control = createInternalWorkerControlService(fakeDb as never);

  const response = await control.heartbeat(buildHeartbeatRequest(), buildJobAuthContext());

  assert.equal(response.cancelRequested, false);
  assert.ok(typeof response.jobToken === "string" && response.jobToken.length > 0);
  assert.notEqual(response.jobToken, "job-token-1");
  assert.ok(response.jobTokenExpiresAt);
  assert.equal(typeof updateCalls[0].jobTokenHash, "string");
  assert.equal(updateCalls[1].currentLifecycleState, "running");
  assert.equal(updateCalls[1].lastHeartbeatAt instanceof Date, true);
  assert.equal(updateCalls[2].state, "running");
  assert.equal(updateCalls[3].state, "active");
  assert.equal(updateCalls[4].state, "running");
});

test("heartbeat returns expired when lease renewal loses the race with recovery revocation", async () => {
  const updateCalls: Array<Record<string, unknown>> = [];
  let selectCount = 0;
  const fakeDb = {
    transaction: async (callback: (tx: unknown) => Promise<WorkerHeartbeatResponse>) => {
      const tx = {
        select() {
          selectCount += 1;

          if (selectCount === 1) {
            return {
              from() {
                return {
                  innerJoin() {
                    return this;
                  },
                  where() {
                    return this;
                  },
                  limit() {
                    return Promise.resolve([
                      {
                        artifactManifestDigest: "a".repeat(64),
                        attemptState: "prepared",
                        bundleDigest: "b".repeat(64),
                        candidateDigest: "c".repeat(64),
                        heartbeatTimeoutSeconds: 180,
                        jobState: "claimed",
                        lastEventSequence: 2,
                        leaseExpiresAt: new Date(Date.now() + 60_000),
                        revokedAt: null,
                        runState: "queued",
                        verifierVerdict: {},
                        workerInstanceId: "worker-instance-1",
                        verdictDigest: "d".repeat(64)
                      }
                    ]);
                  }
                };
              }
            };
          }

          return {
            from() {
              return {
                where() {
                  return this;
                },
                limit() {
                  return Promise.resolve([]);
                }
              };
            }
          };
        },
        update() {
          return {
            set(values: Record<string, unknown>) {
              updateCalls.push(values);

              return {
                where() {
                  return this;
                },
                returning() {
                  return Promise.resolve([]);
                }
              };
            }
          };
        }
      };

      return callback(tx);
    }
  };
  const control = createInternalWorkerControlService(fakeDb as never);

  const response = await control.heartbeat(buildHeartbeatRequest(), buildJobAuthContext());

  assert.deepEqual(response, {
    acknowledgedEventSequence: 3,
    cancelRequested: false,
    jobToken: null,
    jobTokenExpiresAt: null,
    leaseExpiresAt: null,
    leaseStatus: "expired"
  });
  assert.equal(selectCount, 2);
  assert.equal(updateCalls.length, 2);
  assert.equal(updateCalls[1]?.currentLifecycleState, "ready");
});
