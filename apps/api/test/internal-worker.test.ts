import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type {
  WorkerClaimRequest,
  WorkerClaimResponse,
  WorkerHeartbeatRequest,
  WorkerHeartbeatResponse
} from "@paretoproof/shared";
import { parseApiRuntimeEnv } from "../src/config/runtime.ts";
import { createInternalWorkerControlService } from "../src/lib/internal-worker-control.ts";
import { registerInternalWorkerRoutes } from "../src/routes/internal-worker.ts";
import type { InternalWorkerJobAuthContext } from "../src/lib/internal-worker-control.ts";

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

function buildJobAuthContext(): InternalWorkerJobAuthContext {
  return {
    attemptId: "attempt-1",
    attemptRowId: "attempt-row-1",
    attemptState: "active",
    heartbeatTimeoutSeconds: 180,
    jobId: "job-1",
    jobToken: "job-token-1",
    jobRowId: "job-row-1",
    jobState: "running",
    lastEventSequence: 2,
    leaseExpiresAt: new Date("2026-03-13T15:03:00.000Z"),
    leaseId: "lease-1",
    leaseRowId: "lease-row-1",
    runId: "run-1",
    runRowId: "run-row-1",
    runState: "running"
  };
}

test("POST /internal/worker/claims returns an active lease when work is available", async (t) => {
  const app = Fastify();
  let receivedRequest: WorkerClaimRequest | null = null;

  t.after(async () => {
    await app.close();
  });

  registerInternalWorkerRoutes(app, {} as never, buildRuntimeEnv(), {
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
    authenticateWorkerJob: async () => buildJobAuthContext(),
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
  assert.deepEqual(response.json(), {
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
  });
});

test("POST /internal/worker/claims returns idle when no work is available", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerInternalWorkerRoutes(app, {} as never, buildRuntimeEnv(), {
    claimWorker: async () => ({
      leaseStatus: "idle",
      pollAfterSeconds: 30,
      workerJob: null
    }),
    authenticateWorkerJob: async () => buildJobAuthContext(),
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
  assert.deepEqual(response.json(), {
    leaseStatus: "idle",
    pollAfterSeconds: 30,
    workerJob: null
  });
});

test("POST /internal/worker/claims rejects invalid bootstrap auth", async (t) => {
  const app = Fastify();
  let claimCalled = false;

  t.after(async () => {
    await app.close();
  });

  registerInternalWorkerRoutes(app, {} as never, buildRuntimeEnv(), {
    claimWorker: async () => {
      claimCalled = true;
      return {
        leaseStatus: "idle",
        pollAfterSeconds: 30,
        workerJob: null
      };
    },
    authenticateWorkerJob: async () => buildJobAuthContext(),
    heartbeatWorker: async () => {
      throw new Error("heartbeat route was not expected in this test");
    }
  });

  const response = await app.inject({
    method: "POST",
    headers: {
      authorization: "Bearer wrong-token"
    },
    payload: buildClaimRequest(),
    url: "/internal/worker/claims"
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), {
    error: "invalid_worker_bootstrap_token"
  });
  assert.equal(claimCalled, false);
});

test("POST /internal/worker/jobs/:jobId/heartbeat returns continue responses for active leases", async (t) => {
  const app = Fastify();
  let receivedAuthContext: InternalWorkerJobAuthContext | null = null;

  t.after(async () => {
    await app.close();
  });

  registerInternalWorkerRoutes(app, {} as never, buildRuntimeEnv(), {
    authenticateWorkerJob: async () => buildJobAuthContext(),
    claimWorker: async () => ({
      leaseStatus: "idle",
      pollAfterSeconds: 30,
      workerJob: null
    }),
    heartbeatWorker: async (_request, authContext) => {
      receivedAuthContext = authContext;

      return {
        acknowledgedEventSequence: 3,
        cancelRequested: false,
        jobToken: "job-token-2",
        jobTokenExpiresAt: "2026-03-13T15:06:00.000Z",
        leaseExpiresAt: "2026-03-13T15:06:00.000Z",
        leaseStatus: "active"
      } satisfies WorkerHeartbeatResponse;
    }
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
  assert.equal(receivedAuthContext?.leaseId, "lease-1");
  assert.deepEqual(response.json(), {
    acknowledgedEventSequence: 3,
    cancelRequested: false,
    jobToken: "job-token-2",
    jobTokenExpiresAt: "2026-03-13T15:06:00.000Z",
    leaseExpiresAt: "2026-03-13T15:06:00.000Z",
    leaseStatus: "active"
  });
});

test("POST /internal/worker/jobs/:jobId/heartbeat returns cancel responses when the API requests shutdown", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerInternalWorkerRoutes(app, {} as never, buildRuntimeEnv(), {
    authenticateWorkerJob: async () => buildJobAuthContext(),
    claimWorker: async () => ({
      leaseStatus: "idle",
      pollAfterSeconds: 30,
      workerJob: null
    }),
    heartbeatWorker: async () => ({
      acknowledgedEventSequence: 4,
      cancelRequested: true,
      jobToken: null,
      jobTokenExpiresAt: null,
      leaseExpiresAt: null,
      leaseStatus: "cancel_requested"
    })
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
  assert.deepEqual(response.json(), {
    acknowledgedEventSequence: 4,
    cancelRequested: true,
    jobToken: null,
    jobTokenExpiresAt: null,
    leaseExpiresAt: null,
    leaseStatus: "cancel_requested"
  });
});

test("POST /internal/worker/jobs/:jobId/heartbeat rejects invalid job auth", async (t) => {
  const app = Fastify();
  let heartbeatCalled = false;

  t.after(async () => {
    await app.close();
  });

  registerInternalWorkerRoutes(app, {} as never, buildRuntimeEnv(), {
    authenticateWorkerJob: async () => null,
    claimWorker: async () => ({
      leaseStatus: "idle",
      pollAfterSeconds: 30,
      workerJob: null
    }),
    heartbeatWorker: async () => {
      heartbeatCalled = true;
      return {
        acknowledgedEventSequence: 0,
        cancelRequested: false,
        jobToken: null,
        jobTokenExpiresAt: null,
        leaseExpiresAt: null,
        leaseStatus: "expired"
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    headers: {
      authorization: "Bearer wrong-job-token"
    },
    payload: buildHeartbeatRequest(),
    url: "/internal/worker/jobs/job-1/heartbeat"
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), {
    error: "invalid_worker_job_token"
  });
  assert.equal(heartbeatCalled, false);
});

test("claim requeues stale unstarted leases before assigning work", async () => {
  const updateCalls: Array<{
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
                        jobRowId: "job-row-1",
                        leaseRowId: "lease-row-1",
                        runRowId: "run-row-1"
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
                  return Promise.resolve([{ id: "job-row-1" }]);
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
  assert.equal(selectCount, 2);
  assert.equal(updateCalls.length, 5);
  assert.equal(updateCalls[0].values.revokedAt instanceof Date, true);
  assert.equal(updateCalls[1].values.state, "queued");
  assert.equal(updateCalls[2].values.state, "queued");
  assert.equal(updateCalls[3].values.state, "claimed");
  assert.equal(updateCalls[4].values.state, "running");
});

test("heartbeat preserves the current job token while extending the lease", async () => {
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
                      attemptState: "prepared",
                      heartbeatTimeoutSeconds: 180,
                      jobState: "claimed",
                      lastEventSequence: 2,
                      leaseExpiresAt: new Date(Date.now() + 60_000),
                      revokedAt: null,
                      runState: "queued"
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
                  return Promise.resolve();
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
  assert.equal(response.jobToken, "job-token-1");
  assert.ok(response.jobTokenExpiresAt);
  assert.equal(updateCalls[0].jobTokenHash, undefined);
  assert.equal(updateCalls[1].state, "running");
  assert.equal(updateCalls[2].state, "active");
  assert.equal(updateCalls[3].state, "running");
});
