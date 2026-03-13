import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { portalBenchmarkOperationsContract } from "@paretoproof/shared";
import {
  artifacts,
  attempts,
  jobs,
  runs,
  workerJobLeases
} from "../src/db/schema.ts";
import { registerPortalRoutes } from "../src/routes/portal.ts";

function createApprovedPortalGuard(roles: string[] = ["collaborator"]) {
  return () => (request: {
    accessIdentity?: unknown;
    accessRbacContext?: unknown;
  }, _reply: unknown, done: () => void) => {
    request.accessIdentity = {
      email: "operator@paretoproof.com",
      provider: "cloudflare_google",
      subject: "portal-subject"
    };
    request.accessRbacContext = {
      email: "operator@paretoproof.com",
      identityId: "11111111-1111-4111-8111-111111111111",
      roles,
      status: "approved",
      subject: "portal-subject",
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    };
    done();
  };
}

const noopPortalAccessResolver = async () => null;

function buildRun(
  overrides: Partial<typeof runs.$inferSelect> = {}
): typeof runs.$inferSelect {
  return {
    authMode: "cloudflare_access",
    benchmarkItemId: "theorem-1",
    benchmarkPackageDigest: "sha256:benchmark-a",
    benchmarkPackageId: "mathlib4-mini",
    benchmarkPackageVersion: "2026.03.13",
    bundleDigest: "sha256:bundle-a",
    completedAt: new Date("2026-03-13T19:00:00.000Z"),
    createdAt: new Date("2026-03-13T18:00:00.000Z"),
    environmentDigest: "sha256:env-a",
    harnessRevision: "harness-a",
    id: "00000000-0000-4000-8000-000000000001",
    importedAt: new Date("2026-03-13T19:05:00.000Z"),
    laneId: "lane-alpha",
    modelConfigId: "model-config-a",
    modelSnapshotId: "model-snapshot-a",
    primaryFailureCode: null,
    primaryFailureFamily: null,
    primaryFailureSummary: null,
    promptPackageDigest: "sha256:prompt-a",
    promptProtocolVersion: "2026-03-01",
    providerFamily: "openai",
    runConfigDigest: "sha256:run-config-a",
    runKind: "single_run",
    runMode: "offline_ingest",
    sourceRunId: "source-run-a",
    state: "succeeded",
    stopReason: "completed",
    toolProfile: "lean4",
    updatedAt: new Date("2026-03-13T19:06:00.000Z"),
    verifierVersion: "lean-4.12",
    verdictClass: "pass",
    ...overrides
  };
}

function buildJob(
  overrides: Partial<typeof jobs.$inferSelect> = {}
): typeof jobs.$inferSelect {
  return {
    completedAt: new Date("2026-03-13T18:55:00.000Z"),
    createdAt: new Date("2026-03-13T18:01:00.000Z"),
    id: "10000000-0000-4000-8000-000000000001",
    importedAt: new Date("2026-03-13T18:56:00.000Z"),
    primaryFailureCode: null,
    primaryFailureFamily: null,
    primaryFailureSummary: null,
    runId: "00000000-0000-4000-8000-000000000001",
    sourceJobId: "source-job-a",
    state: "completed",
    stopReason: "completed",
    updatedAt: new Date("2026-03-13T18:56:30.000Z"),
    verdictClass: "pass",
    ...overrides
  };
}

function buildAttempt(
  overrides: Partial<typeof attempts.$inferSelect> = {}
): typeof attempts.$inferSelect {
  return {
    artifactManifestDigest: "sha256:artifact-manifest-a",
    authMode: "cloudflare_access",
    benchmarkPackageDigest: "sha256:benchmark-a",
    bundleDigest: "sha256:bundle-a",
    candidateDigest: "sha256:candidate-a",
    completedAt: new Date("2026-03-13T18:54:00.000Z"),
    createdAt: new Date("2026-03-13T18:02:00.000Z"),
    environmentDigest: "sha256:env-a",
    failureClassification: null,
    harnessRevision: "harness-a",
    id: "20000000-0000-4000-8000-000000000001",
    importedAt: new Date("2026-03-13T18:54:30.000Z"),
    jobId: "10000000-0000-4000-8000-000000000001",
    laneId: "lane-alpha",
    modelConfigId: "model-config-a",
    modelSnapshotId: "model-snapshot-a",
    primaryFailureCode: null,
    primaryFailureFamily: null,
    primaryFailureSummary: null,
    promptPackageDigest: "sha256:prompt-a",
    promptProtocolVersion: "2026-03-01",
    providerFamily: "openai",
    runId: "00000000-0000-4000-8000-000000000001",
    runMode: "offline_ingest",
    sourceAttemptId: "source-attempt-a",
    state: "succeeded",
    stopReason: "completed",
    toolProfile: "lean4",
    updatedAt: new Date("2026-03-13T18:54:45.000Z"),
    usageSummary: null,
    verifierResult: "passed",
    verifierVerdict: { result: "pass" },
    verifierVersion: "lean-4.12",
    verdictClass: "pass",
    verdictDigest: "sha256:verdict-a",
    ...overrides
  };
}

function buildArtifact(
  overrides: Partial<typeof artifacts.$inferSelect> = {}
): typeof artifacts.$inferSelect {
  return {
    artifactClassId: "verdict_record",
    artifactManifestDigest: "sha256:artifact-manifest-a",
    attemptId: "20000000-0000-4000-8000-000000000001",
    benchmarkVersionId: null,
    bucketName: "paretoproof-artifacts",
    byteSize: 128,
    contentEncoding: null,
    deletedAt: null,
    exportId: null,
    finalizedAt: new Date("2026-03-13T18:54:10.000Z"),
    id: "30000000-0000-4000-8000-000000000001",
    jobId: "10000000-0000-4000-8000-000000000001",
    lastVerifiedAt: new Date("2026-03-13T19:00:00.000Z"),
    lifecycleState: "available",
    mediaType: "application/json",
    missingDetectedAt: null,
    objectKey: "runs/run-a/verdict.json",
    ownerScope: "run_attempt",
    prefixFamily: "run_artifacts",
    providerEtag: null,
    registeredAt: new Date("2026-03-13T18:54:05.000Z"),
    relativePath: "verification/verdict.json",
    requiredForIngest: true,
    runId: "00000000-0000-4000-8000-000000000001",
    sha256: "sha256:artifact-a",
    storageProvider: "cloudflare_r2",
    ...overrides
  };
}

function buildLease(
  overrides: Partial<typeof workerJobLeases.$inferSelect> = {}
): typeof workerJobLeases.$inferSelect {
  return {
    attemptId: "20000000-0000-4000-8000-000000000001",
    createdAt: new Date("2026-03-13T18:10:00.000Z"),
    heartbeatIntervalSeconds: 30,
    heartbeatTimeoutSeconds: 90,
    id: "40000000-0000-4000-8000-000000000001",
    jobId: "10000000-0000-4000-8000-000000000001",
    jobTokenExpiresAt: new Date("2026-03-13T19:10:00.000Z"),
    jobTokenHash: "job-token-hash-a",
    jobTokenScopes: ["attempt:write"],
    lastEventSequence: 4,
    lastHeartbeatAt: new Date("2026-03-14T18:59:00.000Z"),
    leaseExpiresAt: new Date("2026-03-14T19:01:00.000Z"),
    revokedAt: null,
    runId: "00000000-0000-4000-8000-000000000001",
    updatedAt: new Date("2026-03-13T18:59:00.000Z"),
    workerId: "worker-a",
    workerPool: "modal-eu",
    workerRuntime: "modal",
    workerVersion: "2026.03.13",
    ...overrides
  };
}

test("GET /portal/runs returns the benchmark operations run index contract", async (t) => {
  let runsFindManyCallCount = 0;
  const primaryRun = buildRun();
  const siblingRun = buildRun({
    createdAt: new Date("2026-03-12T18:00:00.000Z"),
    id: "00000000-0000-4000-8000-000000000002",
    sourceRunId: "source-run-b"
  });
  const queueRun = buildRun({
    completedAt: new Date("2026-03-13T20:00:00.000Z"),
    id: "00000000-0000-4000-8000-000000000003",
    runConfigDigest: "sha256:run-config-b",
    runKind: "benchmark_slice",
    sourceRunId: "source-run-c",
    state: "queued",
    stopReason: "queued",
    verdictClass: "invalid_result"
  });
  const db = {
    query: {
      attempts: {
        findMany: async () => [
          buildAttempt(),
          buildAttempt({
            id: "20000000-0000-4000-8000-000000000002",
            runId: queueRun.id,
            state: "active",
            verdictClass: "invalid_result"
          })
        ]
      },
      jobs: {
        findMany: async () => [
          buildJob(),
          buildJob({
            id: "10000000-0000-4000-8000-000000000002",
            runId: queueRun.id,
            state: "queued",
            stopReason: "queued",
            verdictClass: "invalid_result"
          })
        ]
      },
      runs: {
        findMany: async () => {
          runsFindManyCallCount += 1;
          return runsFindManyCallCount === 1
            ? [primaryRun, queueRun]
            : [primaryRun, siblingRun, queueRun];
        }
      }
    }
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    db as never,
    createApprovedPortalGuard(["helper"]) as never,
    {
      resolvePortalAccess: noopPortalAccessResolver as never
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/runs"
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(
    portalBenchmarkOperationsContract.runListResponse.safeParse(payload).success,
    true
  );
  assert.equal(payload.items[0]?.lineage.relatedRunCount, 2);
  assert.equal(payload.items[1]?.activeJobCount, 1);
  assert.equal(payload.items[1]?.latestAttemptState, "active");
});

test("GET /portal/runs/:runId returns run detail with jobs, attempts, artifacts, and leases", async (t) => {
  let runsFindManyCallCount = 0;
  const primaryRun = buildRun();
  const siblingRun = buildRun({
    createdAt: new Date("2026-03-12T18:00:00.000Z"),
    id: "00000000-0000-4000-8000-000000000002",
    sourceRunId: "source-run-b"
  });
  const db = {
    query: {
      artifacts: {
        findMany: async () => [buildArtifact()]
      },
      attempts: {
        findMany: async () => [buildAttempt()]
      },
      jobs: {
        findMany: async () => [buildJob()]
      },
      runs: {
        findFirst: async () => primaryRun,
        findMany: async () => {
          runsFindManyCallCount += 1;
          return runsFindManyCallCount === 1 ? [primaryRun, siblingRun] : [primaryRun, siblingRun];
        }
      },
      workerJobLeases: {
        findMany: async () => [buildLease()]
      }
    }
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    db as never,
    createApprovedPortalGuard(["helper"]) as never,
    {
      resolvePortalAccess: noopPortalAccessResolver as never
    }
  );

  const response = await app.inject({
    method: "GET",
    url: `/portal/runs/${primaryRun.id}`
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(
    portalBenchmarkOperationsContract.runDetailResponse.safeParse(payload).success,
    true
  );
  assert.equal(payload.item.jobs.length, 1);
  assert.equal(payload.item.attempts[0]?.verifierResult, "passed");
  assert.equal(payload.item.artifacts[0]?.relativePath, "verification/verdict.json");
  assert.equal(payload.item.activeLeases[0]?.workerPool, "modal-eu");
  assert.equal(payload.item.relatedRuns[0]?.id, siblingRun.id);
});

test("GET /portal/runs/:runId rejects malformed run ids before querying storage", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {
      query: {
        runs: {
          findFirst: async () => {
            throw new Error("should not query runs for malformed ids");
          }
        }
      }
    } as never,
    createApprovedPortalGuard(["helper"]) as never,
    {
      resolvePortalAccess: noopPortalAccessResolver as never
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/runs/not-a-uuid"
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json().error, "invalid_portal_run_id");
});

test("GET /portal/launch returns benchmark targets, model options, and run kinds", async (t) => {
  const db = {
    query: {
      runs: {
        findMany: async () => [
          buildRun(),
          buildRun({
            benchmarkItemId: "theorem-2",
            createdAt: new Date("2026-03-13T18:30:00.000Z"),
            id: "00000000-0000-4000-8000-000000000002"
          }),
          buildRun({
            authMode: "service_token",
            createdAt: new Date("2026-03-12T18:30:00.000Z"),
            id: "00000000-0000-4000-8000-000000000003",
            modelConfigId: "model-config-b",
            modelSnapshotId: "model-snapshot-b",
            providerFamily: "anthropic"
          })
        ]
      }
    }
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    db as never,
    createApprovedPortalGuard(["collaborator"]) as never,
    {
      resolvePortalAccess: noopPortalAccessResolver as never
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/launch"
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(
    portalBenchmarkOperationsContract.launchViewResponse.safeParse(payload).success,
    true
  );
  assert.equal(payload.item.launchMode, "preflight_only");
  assert.deepEqual(payload.item.benchmarkTargets[0]?.benchmarkItemIds, ["theorem-1", "theorem-2"]);
  assert.equal(payload.item.modelOptions.length, 2);
  assert.equal(payload.item.runKindOptions.length >= 4, true);
});

test("GET /portal/workers returns queue, pool, lease, and incident posture", async (t) => {
  const activeLease = buildLease();
  const staleLease = buildLease({
    id: "40000000-0000-4000-8000-000000000002",
    jobId: "10000000-0000-4000-8000-000000000002",
    leaseExpiresAt: new Date("2026-03-13T18:00:00.000Z"),
    runId: "00000000-0000-4000-8000-000000000002",
    workerId: "worker-b"
  });
  let jobsFindManyCallCount = 0;
  const terminalJobs = Array.from({ length: 12 }, (_, index) =>
    buildJob({
      id: `10000000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`,
      primaryFailureSummary: index < 9 ? `failed job ${index}` : null,
      runId: `00000000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`,
      state: index < 9 ? "failed" : index < 11 ? "completed" : "cancelled",
      stopReason: index < 9 ? "failed" : index < 11 ? "completed" : "cancelled",
      updatedAt: new Date(`2026-03-13T19:${String(index).padStart(2, "0")}:00.000Z`),
      verdictClass: index < 9 ? "invalid_result" : "pass"
    })
  );
  const db = {
    query: {
      jobs: {
        findMany: async () => {
          jobsFindManyCallCount += 1;
          if (jobsFindManyCallCount === 2) {
            return terminalJobs
              .filter((jobRow) => jobRow.state === "failed")
              .slice(0, 10);
          }

          return [
            buildJob({
              id: "10000000-0000-4000-8000-000000000001",
              state: "queued",
              stopReason: "queued",
              verdictClass: "invalid_result"
            }),
            buildJob({
              id: "10000000-0000-4000-8000-000000000002",
              state: "running",
              stopReason: "running",
              verdictClass: "pass"
            }),
            buildJob({
              id: "10000000-0000-4000-8000-000000000004",
              state: "cancel_requested",
              stopReason: "cancel_requested",
              verdictClass: "invalid_result"
            })
          ];
        }
      },
      workerJobLeases: {
        findMany: async () => [activeLease, staleLease]
      }
    },
    select: () => ({
      from: () => ({
        where: async () => [{ count: terminalJobs.length }]
      })
    })
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    db as never,
    createApprovedPortalGuard(["collaborator"]) as never,
    {
      resolvePortalAccess: noopPortalAccessResolver as never
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/workers"
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(
    portalBenchmarkOperationsContract.workersViewResponse.safeParse(payload).success,
    true
  );
  assert.equal(payload.item.queue.queuedJobs, 1);
  assert.equal(payload.item.queue.runningJobs, 1);
  assert.equal(payload.item.queue.terminalJobs, 12);
  assert.equal(payload.item.pools[0]?.staleLeaseCount, 1);
  assert.equal(payload.item.activeLeases.length, 2);
  assert.equal(
    payload.item.incidents.filter((incident: { kind: string }) => incident.kind === "failed_job").length,
    9
  );
  assert.equal(
    payload.item.incidents.some((incident: { kind: string }) => incident.kind === "stale_lease"),
    true
  );
});
