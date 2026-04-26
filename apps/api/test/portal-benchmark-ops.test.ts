import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type {
  PortalBenchmarkDatasetResponse,
  PortalBenchmarksListResponse,
  PortalLaunchViewResponse,
  PortalOverviewResponse,
  PortalRunDetailResponse,
  PortalRunsListQuery,
  PortalRunsListResponse,
  PortalWorkersViewResponse
} from "@paretoproof/shared";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { portalBenchmarkOpsReadModelsContract } from "@paretoproof/shared";
import type { PortalBenchmarkOpsReadModelService } from "../src/lib/portal-benchmark-ops.ts";
import {
  createPortalBenchmarkOpsReadModelService,
  portalBenchmarkOpsReadModelTestUtils
} from "../src/lib/portal-benchmark-ops.ts";
import { registerPortalRoutes } from "../src/routes/portal.ts";
import { attempts, jobs, runs } from "../src/db/schema.ts";

const pgDialect = new PgDialect();

function renderOrderBySql(orderBy: ReadonlyArray<unknown>) {
  return pgDialect.sqlToQuery(sql.join(orderBy as never[], sql`, `)).sql;
}

function renderSqlFragment(fragment: unknown) {
  return pgDialect.sqlToQuery(fragment as never).sql;
}

function createRequireAccessStub(roles: Array<"admin" | "collaborator" | "helper">) {
  return (requiredAccess: string) =>
    (request: Record<string, unknown>, reply: { code: (statusCode: number) => { send: (payload: unknown) => void; }; send: (payload: unknown) => void; }, done: () => void) => {
      request.accessIdentity = {
        email: "person@example.com",
        issuer: "https://paretoproof.cloudflareaccess.com",
        provider: "cloudflare_google",
        subject: "subject-1"
      };
      request.accessRbacContext = {
        email: "person@example.com",
        identityId: "identity-1",
        role: roles[0] ?? null,
        status: "approved",
        subject: "subject-1",
        userId: "user-1"
      };

      const allow =
        requiredAccess === "authenticated_access_identity" ||
        requiredAccess === "approved_helper_or_higher" ||
        (requiredAccess === "approved_collaborator_or_higher" &&
          (roles.includes("collaborator") || roles.includes("admin"))) ||
        (requiredAccess === "admin_only" && roles.includes("admin"));

      if (!allow) {
        reply.code(403).send({
          error: "forbidden"
        });
        return;
      }

      done();
    };
}

function buildRunsListResponse(
  query: PortalRunsListQuery
): PortalRunsListResponse {
  return {
    filters: {
      modelConfigs: [
        {
          count: 1,
          modelConfigId: "gpt-oss",
          modelConfigLabel: "gpt-oss",
          providerFamily: "openai"
        }
      ],
      providerFamilies: [
        {
          count: 1,
          providerFamily: "openai"
        }
      ]
    },
    items: [
      {
        authMode: "machine_api_key",
        benchmarkItemId: "item-1",
        benchmarkLabel: "problem9 @ 2026.03",
        benchmarkPackageDigest: "a".repeat(64),
        benchmarkPackageId: "problem9",
        benchmarkPackageVersion: "2026.03",
        benchmarkVersionId: "problem9@2026.03",
        completedAt: "2026-03-13T20:00:00.000Z",
        durationMs: 120000,
        failure: {
          code: null,
          family: null,
          summary: null
        },
        laneId: "problem9-default",
        latestAttemptId: "attempt-1",
        latestJobId: "job-1",
        lineage: {
          attemptCount: 1,
          attemptIds: ["attempt-1"],
          jobCount: 1,
          jobIds: ["job-1"],
          latestAttemptId: "attempt-1",
          latestJobId: "job-1"
        },
        modelConfigId: "gpt-oss",
        modelConfigLabel: "gpt-oss",
        modelSnapshotId: "gpt-oss-2026-03-13",
        providerFamily: "openai",
        runId: "PP-318",
        runKind: "single_run",
        runLifecycleBucket: "terminal_success",
        runMode: "bounded_agentic_attempt",
        runState: "succeeded",
        startedAt: "2026-03-13T19:58:00.000Z",
        toolProfile: "workspace_edit_limited",
        verdictClass: "pass"
      }
    ],
    query,
    summary: {
      activeRuns: 0,
      failedRuns: 0,
      returnedCount: 1,
      totalMatches: 1,
      verdictCounts: {
        fail: 0,
        invalid_result: 0,
        pass: 1
      }
    }
  };
}

test("shared benchmark-ops contracts allow null terminal fields for non-terminal rows", () => {
  const parsed = portalBenchmarkOpsReadModelsContract.runsListResponse.parse({
    filters: {
      modelConfigs: [],
      providerFamilies: []
    },
    items: [
      {
        authMode: "machine_api_key",
        benchmarkItemId: "item-2",
        benchmarkLabel: "problem9 @ 2026.03",
        benchmarkPackageDigest: "b".repeat(64),
        benchmarkPackageId: "problem9",
        benchmarkPackageVersion: "2026.03",
        benchmarkVersionId: "problem9@2026.03",
        completedAt: null,
        durationMs: null,
        failure: {
          code: null,
          family: null,
          summary: null
        },
        laneId: "problem9-default",
        latestAttemptId: "attempt-2",
        latestJobId: "job-2",
        lineage: {
          attemptCount: 1,
          attemptIds: ["attempt-2"],
          jobCount: 1,
          jobIds: ["job-2"],
          latestAttemptId: "attempt-2",
          latestJobId: "job-2"
        },
        modelConfigId: "gpt-oss",
        modelConfigLabel: "gpt-oss",
        modelSnapshotId: "gpt-oss-2026-03-13",
        providerFamily: "openai",
        runId: "PP-319",
        runKind: "single_run",
        runLifecycleBucket: "active",
        runMode: "bounded_agentic_attempt",
        runState: "running",
        startedAt: "2026-03-13T19:58:00.000Z",
        toolProfile: "workspace_edit_limited",
        verdictClass: null
      }
    ],
    query: {
      attemptId: null,
      authMode: null,
      benchmarkPackageDigest: null,
      benchmarkPackageId: null,
      benchmarkPackageVersion: null,
      failureCode: null,
      failureFamily: null,
      jobId: null,
      lifecycleBucket: null,
      limit: 25,
      modelConfigId: null,
      providerFamily: null,
      q: null,
      runId: null,
      runLifecycle: [],
      runMode: null,
      runKind: null,
      sort: "started_at_desc",
      toolProfile: null,
      verdict: []
    },
    summary: {
      activeRuns: 1,
      failedRuns: 0,
      returnedCount: 1,
      totalMatches: 1,
      verdictCounts: {
        fail: 0,
        invalid_result: 0,
        pass: 0
      }
    }
  });

  assert.equal(parsed.items[0]?.completedAt, null);
  assert.equal(parsed.items[0]?.verdictClass, null);
});

function buildRunDetailResponse(): PortalRunDetailResponse {
  return {
    artifacts: [],
    attempts: [],
    item: buildRunsListResponse({
      attemptId: null,
      authMode: null,
      benchmarkPackageDigest: null,
      benchmarkPackageId: null,
      benchmarkPackageVersion: null,
      failureCode: null,
      failureFamily: null,
      jobId: null,
      lifecycleBucket: null,
      limit: 25,
      modelConfigId: null,
      providerFamily: null,
      q: null,
      runId: null,
      runLifecycle: [],
      runMode: null,
      runKind: null,
      sort: "started_at_desc",
      toolProfile: null,
      verdict: []
    }).items[0],
    jobs: [],
    recentWorkerEvents: [],
    timeline: [],
    workerLeases: []
  };
}

function buildBenchmarksListResponse(): PortalBenchmarksListResponse {
  return {
    items: [
      {
        attemptCount: 1,
        benchmarkLabel: "problem9 @ 2026.03",
        benchmarkPackageId: "problem9",
        latestCompletedAt: "2026-03-13T20:00:00.000Z",
        latestRunId: "PP-318",
        modelConfigIds: ["gpt-oss"],
        providerFamilies: ["openai"],
        runCount: 1,
        versions: ["2026.03"],
        verdictCounts: {
          fail: 0,
          invalid_result: 0,
          pass: 1
        }
      }
    ]
  };
}

function buildBenchmarkDatasetResponse(): PortalBenchmarkDatasetResponse {
  return {
    attempts: [
      {
        attemptId: "attempt-1",
        completedAt: "2026-03-13T20:00:00.000Z",
        failure: {
          code: null,
          family: null,
          summary: null
        },
        jobId: "job-1",
        runId: "PP-318",
        startedAt: "2026-03-13T19:58:30.000Z",
        state: "succeeded",
        stopReason: "completed",
        verdictClass: "pass",
        verifierResult: "accepted"
      }
    ],
    benchmark: {
      benchmarkLabel: "problem9 @ 2026.03",
      benchmarkPackageId: "problem9",
      laneIds: ["problem9-default"],
      latestRunId: "PP-318",
      modelConfigIds: ["gpt-oss"],
      providerFamilies: ["openai"],
      versions: ["2026.03"]
    },
    jobs: [
      {
        completedAt: "2026-03-13T20:00:00.000Z",
        failure: {
          code: null,
          family: null,
          summary: null
        },
        jobId: "job-1",
        runId: "PP-318",
        startedAt: "2026-03-13T19:58:10.000Z",
        state: "completed",
        stopReason: "completed",
        verdictClass: "pass"
      }
    ],
    runs: buildRunsListResponse({
      attemptId: null,
      authMode: null,
      benchmarkPackageDigest: null,
      benchmarkPackageId: null,
      benchmarkPackageVersion: null,
      failureCode: null,
      failureFamily: null,
      jobId: null,
      lifecycleBucket: null,
      limit: 25,
      modelConfigId: null,
      providerFamily: null,
      q: null,
      runId: null,
      runLifecycle: [],
      runMode: null,
      runKind: null,
      sort: "started_at_desc",
      toolProfile: null,
      verdict: []
    }).items,
    summary: {
      attemptCount: 1,
      jobCount: 1,
      latestCompletedAt: "2026-03-13T20:00:00.000Z",
      runCount: 1,
      verdictCounts: {
        fail: 0,
        invalid_result: 0,
        pass: 1
      }
    }
  };
}

function buildLaunchViewResponse(): PortalLaunchViewResponse {
  return {
    benchmarks: [
      {
        benchmarkItemCount: 3,
        benchmarkLabel: "problem9 @ 2026.03",
        benchmarkPackageDigest: "a".repeat(64),
        benchmarkPackageId: "problem9",
        benchmarkPackageVersion: "2026.03",
        benchmarkVersionId: "problem9@2026.03",
        laneIds: ["problem9-default"],
        lastSeenRunId: "PP-318"
      }
    ],
    governance: {
      defaultPolicy: {
        budget: {
          budgetExceededTerminalState: "failed",
          maxEstimatedUsdPerRun: 25,
          maxInputTokensPerRun: 5_000_000,
          maxOutputTokensPerRun: 1_000_000,
          maxWallClockMinutesPerRun: 120
        },
        cancellation: {
          cancelRequestGraceSeconds: 120,
          forcedCancelAfterSeconds: 600,
          heartbeatStaleSeconds: 180
        },
        concurrency: {
          maxActiveRunsGlobal: 20,
          maxActiveRunsPerContributor: 3,
          maxConcurrentJobsPerRun: 4,
          maxQueuedRunsPerContributor: 6
        },
        retry: {
          backoffMultiplier: 2,
          initialBackoffSeconds: 30,
          maxAttemptsPerJob: 3,
          maxAttemptsPerRun: 12,
          maxBackoffSeconds: 600,
          retryableReasons: [
            "worker_crash",
            "worker_lease_timeout",
            "provider_rate_limited",
            "provider_transport_error",
            "artifact_upload_transient",
            "internal_transient"
          ]
        }
      },
      runKindConcurrencyOverrides: []
    },
    modelConfigs: [
      {
        authModes: ["machine_api_key"],
        modelConfigId: "gpt-oss",
        modelConfigLabel: "gpt-oss",
        modelSnapshotIds: ["gpt-oss-2026-03-13"],
        providerFamily: "openai",
        runModes: ["bounded_agentic_attempt"],
        toolProfiles: ["workspace_edit_limited"]
      }
    ],
    redirectPattern: "/runs/:runId",
    runKinds: [
      {
        description: "Launch one benchmark item or one curated prompt/problem pair end-to-end.",
        id: "single_run",
        requiredFields: ["benchmarkItemId", "modelConfigId"]
      }
    ],
    submissionMode: "preflight_only"
  };
}

function buildWorkersViewResponse(): PortalWorkersViewResponse {
  return {
    activeLeases: [],
    freshness: {
      degradationReason: null,
      freshnessStatus: "live",
      generatedAt: "2026-03-13T20:00:00.000Z",
      observedThrough: "2026-03-13T19:59:30.000Z",
      recommendedPollAfterSeconds: 15,
      staleAfterSeconds: 60
    },
    generatedAt: "2026-03-13T20:00:00.000Z",
    incidents: [],
    queueSummary: {
      activeRuns: 1,
      cancelRequestedJobs: 0,
      claimedJobs: 0,
      queuedJobs: 1,
      queuedRuns: 1,
      runningJobs: 1
    },
    workerPools: []
  };
}

function buildOverviewResponse(): PortalOverviewResponse {
  const runs = buildRunsListResponse({
    attemptId: null,
    authMode: null,
    benchmarkPackageDigest: null,
    benchmarkPackageId: null,
    benchmarkPackageVersion: null,
    failureCode: null,
    failureFamily: null,
    jobId: null,
    lifecycleBucket: null,
    limit: 5,
    modelConfigId: null,
    providerFamily: null,
    q: null,
    runId: null,
    runKind: null,
    runLifecycle: [],
    runMode: null,
    sort: "started_at_desc",
    toolProfile: null,
    verdict: []
  });
  const benchmarks = buildBenchmarksListResponse();
  const workers = buildWorkersViewResponse();

  return {
    benchmarkHighlights: benchmarks.items,
    generatedAt: workers.generatedAt,
    recentIncidents: workers.incidents,
    recentRuns: runs.items,
    summary: {
      activeLeases: workers.activeLeases.length,
      activeRuns: runs.summary.activeRuns,
      failedRuns: runs.summary.failedRuns,
      observedBenchmarkPackageCount: benchmarks.items.length,
      queuedJobs: workers.queueSummary.queuedJobs,
      queuedRuns: workers.queueSummary.queuedRuns,
      runningJobs: workers.queueSummary.runningJobs,
      staleLeaseCount: 0,
      totalRuns: runs.summary.totalMatches
    }
  };
}

function buildRunRow(overrides: Record<string, unknown> = {}) {
  return {
    authMode: "machine_api_key",
    benchmarkItemId: "item-1",
    benchmarkPackageDigest: "a".repeat(64),
    benchmarkPackageId: "problem9",
    benchmarkPackageVersion: "2026.03",
    createdAt: new Date("2026-03-13T19:58:00.000Z"),
    completedAt: new Date("2026-03-13T20:00:00.000Z"),
    id: "run-row-1",
    laneId: "problem9-default",
    modelConfigId: "gpt-oss",
    modelSnapshotId: "gpt-oss-2026-03-13",
    primaryFailureCode: null,
    primaryFailureFamily: null,
    primaryFailureSummary: null,
    providerFamily: "openai",
    runKind: "single_run",
    runMode: "bounded_agentic_attempt",
    sourceRunId: "PP-318",
    state: "succeeded",
    toolProfile: "workspace_edit_limited",
    updatedAt: new Date("2026-03-13T20:00:00.000Z"),
    verdictClass: "pass",
    ...overrides
  };
}

function createRunsListDbStub(options: {
  modelConfigRows: Array<{ count: number; modelConfigId: string; providerFamily: string }>;
  pageRunRows: Array<Record<string, unknown>>;
  providerRows: Array<{ count: number; providerFamily: string }>;
  summaryRow: {
    activeRuns: number;
    failedRuns: number;
    totalMatches: number;
    verdictFailCount: number;
    verdictInvalidResultCount: number;
    verdictPassCount: number;
  };
}) {
  return {
    select(selection?: Record<string, unknown>) {
      return {
        from(table: unknown) {
          if (
            selection &&
            "activeRuns" in selection &&
            "failedRuns" in selection &&
            "totalMatches" in selection
          ) {
            return {
              where: async () => [options.summaryRow]
            };
          }

          if (
            table === runs &&
            selection &&
            "count" in selection &&
            "providerFamily" in selection &&
            !("modelConfigId" in selection)
          ) {
            return {
              where() {
                return {
                  groupBy() {
                    return {
                      orderBy: async () => options.providerRows
                    };
                  }
                };
              }
            };
          }

          if (
            table === runs &&
            selection &&
            "count" in selection &&
            "modelConfigId" in selection
          ) {
            return {
              where() {
                return {
                  groupBy() {
                    return {
                      orderBy: async () => options.modelConfigRows
                    };
                  }
                };
              }
            };
          }

          if (table === runs) {
            return {
              where() {
                return {
                  orderBy() {
                    return {
                      limit: async () => options.pageRunRows
                    };
                  }
                };
              }
            };
          }

          if (table === jobs || table === attempts) {
            return {
              where: async () => []
            };
          }

          throw new Error("Unexpected select source in runs-list test stub.");
        }
      };
    }
  };
}

function createOverviewDbStub(options: {
  overviewBenchmarkRows: Array<{
    attemptCount: number;
    benchmarkPackageId: string;
    latestCompletedAt: Date | null;
    latestRunId: string | null;
    modelConfigIds: string[];
    providerFamilies: string[];
    runCount: number;
    totalObservedPackageCount: number;
    versions: string[];
    verdictFailCount: number;
    verdictInvalidResultCount: number;
    verdictPassCount: number;
  }>;
  recentRunRows: Array<Record<string, unknown>>;
  summaryRow: {
    activeRuns: number;
    failedRuns: number;
    totalMatches: number;
    verdictFailCount: number;
    verdictInvalidResultCount: number;
    verdictPassCount: number;
  };
}) {
  return {
    execute: async () => options.overviewBenchmarkRows,
    select(selection?: Record<string, unknown>) {
      return {
        from(table: unknown) {
          if (
            table === runs &&
            selection &&
            "activeRuns" in selection &&
            "failedRuns" in selection &&
            "totalMatches" in selection
          ) {
            return {
              where: async () => [options.summaryRow]
            };
          }

          if (table === runs) {
            return {
              where() {
                return {
                  orderBy() {
                    return {
                      limit: async () => options.recentRunRows
                    };
                  }
                };
              }
            };
          }

          if (table === jobs || table === attempts) {
            return {
              where: async () => []
            };
          }

          throw new Error("Unexpected select source in overview test stub.");
        }
      };
    }
  };
}

test("getRunsList summary counts stay aggregate when the returned page is limited", async () => {
  const query: PortalRunsListQuery = {
    attemptId: null,
    authMode: null,
    benchmarkPackageDigest: null,
    benchmarkPackageId: null,
    benchmarkPackageVersion: null,
    failureCode: null,
    failureFamily: null,
    jobId: null,
    lifecycleBucket: null,
    limit: 1,
    modelConfigId: null,
    providerFamily: null,
    q: null,
    runId: null,
    runLifecycle: [],
    runMode: null,
    runKind: null,
    sort: "started_at_desc",
    toolProfile: null,
    verdict: []
  };
  const readModels = createPortalBenchmarkOpsReadModelService(
    createRunsListDbStub({
      modelConfigRows: [
        {
          count: 2,
          modelConfigId: "gpt-oss",
          providerFamily: "openai"
        }
      ],
      pageRunRows: [
        buildRunRow({
          completedAt: null,
          sourceRunId: "PP-400",
          state: "running",
          updatedAt: new Date("2026-03-13T20:00:00.000Z"),
          verdictClass: null
        })
      ],
      providerRows: [
        {
          count: 2,
          providerFamily: "openai"
        }
      ],
      summaryRow: {
        activeRuns: 1,
        failedRuns: 1,
        totalMatches: 2,
        verdictFailCount: 1,
        verdictInvalidResultCount: 0,
        verdictPassCount: 0
      }
    }) as never
  );

  const payload = await readModels.getRunsList(query);

  assert.equal(payload.items.length, 1);
  assert.equal(payload.summary.returnedCount, 1);
  assert.equal(payload.summary.totalMatches, 2);
  assert.equal(payload.summary.activeRuns, 1);
  assert.equal(payload.summary.failedRuns, 1);
  assert.deepEqual(payload.summary.verdictCounts, {
    fail: 1,
    invalid_result: 0,
    pass: 0
  });
});

test("getOverview uses dedicated overview queries instead of the heavier runs and benchmarks paths", async () => {
  const readModels = createPortalBenchmarkOpsReadModelService(
    createOverviewDbStub({
      overviewBenchmarkRows: [
        {
          attemptCount: 2,
          benchmarkPackageId: "problem9",
          latestCompletedAt: new Date("2026-03-14T20:00:00.000Z"),
          latestRunId: "PP-319",
          modelConfigIds: ["gpt-oss"],
          providerFamilies: ["openai"],
          runCount: 2,
          totalObservedPackageCount: 7,
          versions: ["2026.03", "2026.04"],
          verdictFailCount: 0,
          verdictInvalidResultCount: 0,
          verdictPassCount: 2
        }
      ],
      recentRunRows: [
        buildRunRow({
          completedAt: null,
          id: "run-row-3",
          sourceRunId: "PP-400",
          state: "running",
          updatedAt: new Date("2026-03-15T20:00:00.000Z"),
          verdictClass: null
        })
      ],
      summaryRow: {
        activeRuns: 1,
        failedRuns: 0,
        totalMatches: 3,
        verdictFailCount: 0,
        verdictInvalidResultCount: 0,
        verdictPassCount: 2
      }
    }) as never
  );

  readModels.getBenchmarksList = async () => {
    throw new Error("getOverview should not call getBenchmarksList.");
  };
  readModels.getRunsList = async () => {
    throw new Error("getOverview should not call getRunsList.");
  };
  readModels.getWorkersView = async () => buildWorkersViewResponse();

  const payload = await readModels.getOverview();

  assert.equal(payload.summary.totalRuns, 3);
  assert.equal(payload.summary.activeRuns, 1);
  assert.equal(payload.summary.observedBenchmarkPackageCount, 7);
  assert.equal(payload.recentRuns[0]?.runId, "PP-400");
  assert.equal(payload.benchmarkHighlights[0]?.benchmarkPackageId, "problem9");
  assert.equal(payload.benchmarkHighlights[0]?.runCount, 2);
});

test("portal benchmark ops runs summary verdict aggregation only counts terminal run states", () => {
  const summarySelect = portalBenchmarkOpsReadModelTestUtils.buildRunsSummarySelect();
  const verdictSql = [
    renderSqlFragment(summarySelect.verdictFailCount),
    renderSqlFragment(summarySelect.verdictInvalidResultCount),
    renderSqlFragment(summarySelect.verdictPassCount)
  ];

  for (const statement of verdictSql) {
    assert.match(statement, /"runs"\."state" in \('succeeded', 'failed', 'cancelled'\)/);
    assert.match(statement, /"runs"\."verdict_class"/);
  }
});

test("portal worker-pool summaries include environment-filtered registered pools even before any worker lease is active", () => {
  const workerPools = portalBenchmarkOpsReadModelTestUtils.buildWorkerPoolSummaries({
    activeLeases: [],
    registeredWorkerPools: [
      {
        workerPool: "modal-dev",
        workerRuntime: "modal"
      }
    ]
  });

  assert.deepEqual(workerPools, [
    {
      activeLeaseCount: 0,
      activeRunIds: [],
      staleLeaseCount: 0,
      workerPool: "modal-dev",
      workerRuntime: "modal",
      workerVersion: null
    }
  ]);
});

test("portal worker-pool summaries do not synthesize zero-lease pools without an environment-filtered registry slice", () => {
  const workerPools = portalBenchmarkOpsReadModelTestUtils.buildWorkerPoolSummaries({
    activeLeases: []
  });

  assert.deepEqual(workerPools, []);
});

test("portal worker-pool summaries are derived only from observed leases", () => {
  const workerPools = portalBenchmarkOpsReadModelTestUtils.buildWorkerPoolSummaries({
    activeLeases: [
      {
        attemptId: "attempt-1",
        heartbeatIntervalSeconds: 60,
        heartbeatTimeoutSeconds: 180,
        health: "healthy",
        jobId: "job-1",
        lastEventSequence: 2,
        lastHeartbeatAt: "2026-03-13T20:00:00.000Z",
        leaseExpiresAt: "2026-03-13T20:03:00.000Z",
        runId: "PP-318",
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1"
      }
    ]
  });

  assert.deepEqual(workerPools, [
    {
      activeLeaseCount: 1,
      activeRunIds: ["PP-318"],
      staleLeaseCount: 0,
      workerPool: "modal-dev",
      workerRuntime: "modal",
      workerVersion: "worker.v1"
    }
  ]);
});

test("portal worker-pool registry selection filters the catalog by deployment environment", () => {
  const registeredWorkerPools =
    portalBenchmarkOpsReadModelTestUtils.readRegisteredWorkerPoolsForEnvironment({
      catalog: {
        items: [
          {
            defaultRolloutClass: "stable",
            deploymentTargets: [
              {
                environment: "dev",
                modalAppName: "paretoproof-worker-dev-modal-dev",
                secretName: "paretoproof-worker-modal-dev"
              }
            ],
            notes: [],
            ownershipSummary: null,
            workerPool: "modal-dev",
            workerRuntime: "modal"
          },
          {
            defaultRolloutClass: "stable",
            deploymentTargets: [
              {
                environment: "staging",
                modalAppName: "paretoproof-worker-staging-modal-staging",
                secretName: "paretoproof-worker-modal-staging"
              }
            ],
            notes: [],
            ownershipSummary: null,
            workerPool: "modal-staging",
            workerRuntime: "modal"
          }
        ],
        version: 1
      },
      environment: "dev"
    });

  assert.deepEqual(registeredWorkerPools, [
    {
      workerPool: "modal-dev",
      workerRuntime: "modal"
    }
  ]);
});

test("portal worker-ops freshness is stale only when control-plane observations are old", () => {
  const live = portalBenchmarkOpsReadModelTestUtils.buildPortalWorkerOpsFreshness({
    generatedAt: new Date("2026-04-26T18:00:00.000Z"),
    observedAtValues: [new Date("2026-04-26T17:59:30.000Z")]
  });
  const stale = portalBenchmarkOpsReadModelTestUtils.buildPortalWorkerOpsFreshness({
    generatedAt: new Date("2026-04-26T18:00:00.000Z"),
    observedAtValues: [new Date("2026-04-26T17:58:00.000Z")]
  });
  const empty = portalBenchmarkOpsReadModelTestUtils.buildPortalWorkerOpsFreshness({
    generatedAt: new Date("2026-04-26T18:00:00.000Z"),
    observedAtValues: []
  });
  const degraded = portalBenchmarkOpsReadModelTestUtils.buildPortalWorkerOpsFreshness({
    degradationReason: "worker_ops_partial_snapshot",
    generatedAt: new Date("2026-04-26T18:00:00.000Z"),
    observedAtValues: [new Date("2026-04-26T17:59:30.000Z")]
  });

  assert.equal(live.freshnessStatus, "live");
  assert.equal(stale.freshnessStatus, "stale");
  assert.equal(empty.freshnessStatus, "live");
  assert.equal(empty.observedThrough, null);
  assert.equal(degraded.freshnessStatus, "degraded");
  assert.equal(degraded.degradationReason, "worker_ops_partial_snapshot");
});

test("portal overview benchmark highlight query counts verdicts per run instead of per attempt row", () => {
  const statement = renderSqlFragment(
    portalBenchmarkOpsReadModelTestUtils.buildOverviewBenchmarkHighlightsQuery()
  );

  assert.match(
    statement,
    /count\(distinct case when r\.state in \('succeeded', 'failed', 'cancelled'\) and r\.verdict_class = 'fail' then r\.id end\)/
  );
  assert.match(
    statement,
    /count\(distinct case when r\.state in \('succeeded', 'failed', 'cancelled'\) and r\.verdict_class = 'invalid_result' then r\.id end\)/
  );
  assert.match(
    statement,
    /count\(distinct case when r\.state in \('succeeded', 'failed', 'cancelled'\) and r\.verdict_class = 'pass' then r\.id end\)/
  );
});

function createReadModelService(overrides?: {
  getBenchmarkDataset?: (packageId: string) => Promise<PortalBenchmarkDatasetResponse | null>;
  getBenchmarksList?: () => Promise<PortalBenchmarksListResponse>;
  getLaunchView?: () => Promise<PortalLaunchViewResponse>;
  getOverview?: () => Promise<PortalOverviewResponse>;
  getRunDetail?: (runId: string) => Promise<PortalRunDetailResponse | null>;
  getRunsList?: (query: PortalRunsListQuery) => Promise<PortalRunsListResponse>;
  getWorkersView?: () => Promise<PortalWorkersViewResponse>;
}): PortalBenchmarkOpsReadModelService {
  return {
    getBenchmarkDataset:
      overrides?.getBenchmarkDataset ?? (async () => buildBenchmarkDatasetResponse()),
    getBenchmarksList:
      overrides?.getBenchmarksList ?? (async () => buildBenchmarksListResponse()),
    getLaunchView: overrides?.getLaunchView ?? (async () => buildLaunchViewResponse()),
    getOverview: overrides?.getOverview ?? (async () => buildOverviewResponse()),
    getRunDetail: overrides?.getRunDetail ?? (async () => buildRunDetailResponse()),
    getRunsList: overrides?.getRunsList ?? (async (query) => buildRunsListResponse(query)),
    getWorkersView: overrides?.getWorkersView ?? (async () => buildWorkersViewResponse())
  };
}

test("GET /portal/overview returns the landing overview read model for approved helpers", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {} as never,
    createRequireAccessStub(["helper"]) as never,
    {
      portalBenchmarkOpsReadModels: createReadModelService(),
      resolvePortalAccess: createResolvePortalAccessStub(["helper"]) as never
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/overview"
  });

  assert.equal(response.statusCode, 200);
  const payload = portalBenchmarkOpsReadModelsContract.overviewResponse.parse(response.json());
  assert.equal(payload.summary.observedBenchmarkPackageCount, 1);
  assert.equal(payload.summary.totalRuns, 1);
  assert.equal(payload.recentRuns[0]?.runId, "PP-318");
});

function createResolvePortalAccessStub(
  roles: Array<"admin" | "collaborator" | "helper">
) {
  return async (request: Record<string, unknown>) => {
    request.accessIdentity = {
      email: "person@example.com",
      issuer: "https://paretoproof.cloudflareaccess.com",
      provider: "cloudflare_google",
      subject: "subject-1"
    };
    request.accessRbacContext = {
      email: "person@example.com",
      identityId: "identity-1",
      role: roles[0] ?? null,
      status: "approved",
      subject: "subject-1",
      userId: "user-1"
    };

    return request.accessRbacContext;
  };
}

test("GET /portal/runs parses canonical query state for approved helpers", async (t) => {
  const app = Fastify();
  let observedQuery: PortalRunsListQuery | null = null;

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {} as never,
    createRequireAccessStub(["helper"]) as never,
    {
      portalBenchmarkOpsReadModels: createReadModelService({
        getRunsList: async (query) => {
          observedQuery = query;
          return buildRunsListResponse(query);
        }
      }),
      resolvePortalAccess: createResolvePortalAccessStub(["helper"]) as never
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/runs?runLifecycle=queued,running&verdict=pass&limit=5&sort=finished_at_desc"
  });

  assert.equal(response.statusCode, 200);
  const payload = portalBenchmarkOpsReadModelsContract.runsListResponse.parse(response.json());

  assert.deepEqual(observedQuery, {
    attemptId: null,
    authMode: null,
    benchmarkPackageDigest: null,
    benchmarkPackageId: null,
    benchmarkPackageVersion: null,
    failureCode: null,
    failureFamily: null,
    jobId: null,
    lifecycleBucket: null,
    limit: 5,
    modelConfigId: null,
    providerFamily: null,
    q: null,
    runId: null,
    runLifecycle: ["queued", "running"],
    runMode: null,
    runKind: null,
    sort: "finished_at_desc",
    toolProfile: null,
    verdict: ["pass"]
  });
  assert.deepEqual(payload.filters.providerFamilies, [
    {
      count: 1,
      providerFamily: "openai"
    }
  ]);
});

test("GET /portal/runs rejects invalid benchmark-ops query params", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {} as never,
    createRequireAccessStub(["helper"]) as never,
    {
      portalBenchmarkOpsReadModels: createReadModelService(),
      resolvePortalAccess: createResolvePortalAccessStub(["helper"]) as never
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/runs?limit=0&sort=not_real"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "invalid_portal_runs_query");
});

test("GET /portal/runs accepts non-terminal rows without invented terminal fields", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {} as never,
    createRequireAccessStub(["helper"]) as never,
    {
      portalBenchmarkOpsReadModels: createReadModelService({
        getRunsList: async (query) => ({
          ...buildRunsListResponse(query),
          items: [
            {
              ...buildRunsListResponse(query).items[0],
              completedAt: null,
              durationMs: null,
              runLifecycleBucket: "active",
              runState: "running",
              verdictClass: null
            }
          ],
          summary: {
            activeRuns: 1,
            failedRuns: 0,
            returnedCount: 1,
            totalMatches: 1,
            verdictCounts: {
              fail: 0,
              invalid_result: 0,
              pass: 0
            }
          }
        })
      }),
      resolvePortalAccess: createResolvePortalAccessStub(["helper"]) as never
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/runs"
  });

  assert.equal(response.statusCode, 200);
  const payload = portalBenchmarkOpsReadModelsContract.runsListResponse.parse(response.json());
  assert.equal(payload.items[0]?.completedAt, null);
  assert.equal(payload.items[0]?.durationMs, null);
  assert.equal(payload.items[0]?.verdictClass, null);
  assert.equal(payload.summary.verdictCounts.pass, 0);
});

test("GET /portal/benchmarks returns a contract-valid package summary list", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {} as never,
    createRequireAccessStub(["helper"]) as never,
    {
      portalBenchmarkOpsReadModels: createReadModelService(),
      resolvePortalAccess: createResolvePortalAccessStub(["helper"]) as never
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/benchmarks"
  });

  assert.equal(response.statusCode, 200);
  const payload = portalBenchmarkOpsReadModelsContract.benchmarksListResponse.parse(
    response.json()
  );
  assert.equal(payload.items[0]?.benchmarkPackageId, "problem9");
});

test("GET /portal/benchmarks/:packageId/dataset returns 404 when the package is missing", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {} as never,
    createRequireAccessStub(["helper"]) as never,
    {
      portalBenchmarkOpsReadModels: createReadModelService({
        getBenchmarkDataset: async () => null
      }),
      resolvePortalAccess: createResolvePortalAccessStub(["helper"]) as never
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/benchmarks/problem9/dataset"
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, "portal_benchmark_dataset_not_found");
});

test("GET /portal/benchmarks/:packageId/export streams csv when requested", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {} as never,
    createRequireAccessStub(["helper"]) as never,
    {
      portalBenchmarkOpsReadModels: createReadModelService(),
      resolvePortalAccess: createResolvePortalAccessStub(["helper"]) as never
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/benchmarks/problem9/export?format=csv"
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /^text\/csv/);
  assert.match(response.body, /benchmarkPackageId,benchmarkVersions,runId/);
  assert.match(response.body, /problem9,2026\.03,PP-318/);
});

test("GET /portal/benchmarks/:packageId/export neutralizes whitespace-prefixed spreadsheet formulas", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {} as never,
    createRequireAccessStub(["helper"]) as never,
    {
      portalBenchmarkOpsReadModels: createReadModelService({
        getBenchmarkDataset: async () => {
          const dataset = buildBenchmarkDatasetResponse();

          dataset.benchmark.benchmarkPackageId = "  =problem9";
          dataset.benchmark.versions = ["\t=2026.03"];
          dataset.runs[0] = {
            ...dataset.runs[0],
            modelConfigId: "@gpt-oss",
            runId: "=PP-318"
          };
          dataset.attempts[0] = {
            ...dataset.attempts[0],
            attemptId: "-attempt-1",
            failure: {
              ...dataset.attempts[0].failure,
              summary: '  =SUM("a","b")'
            },
            jobId: "  +job-1",
            runId: "=PP-318",
            verifierResult: dataset.attempts[0].verifierResult
          };

          return dataset;
        }
      }),
      resolvePortalAccess: createResolvePortalAccessStub(["helper"]) as never
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/benchmarks/problem9/export?format=csv"
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /^benchmarkPackageId,benchmarkVersions,runId/m);
  assert.match(response.body, /'  =problem9,'\t=2026\.03,'=PP-318/);
  assert.match(response.body, /,openai,'@gpt-oss,/);
  assert.match(response.body, /,'  \+job-1,'-attempt-1,succeeded,pass,accepted,/);
  assert.match(response.body, /,"'  =SUM\(""a"",""b""\)"$/m);
});

test("GET /portal/benchmarks/:packageId/export leaves nullable run fields blank in API CSV output", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {} as never,
    createRequireAccessStub(["helper"]) as never,
    {
      portalBenchmarkOpsReadModels: createReadModelService({
        getBenchmarkDataset: async () => ({
          ...buildBenchmarkDatasetResponse(),
          attempts: [
            {
              attemptId: "attempt-2",
              completedAt: null,
              failure: { code: null, family: null, summary: null },
              jobId: "job-2",
              runId: "PP-319",
              startedAt: "2026-03-13T19:58:30.000Z",
              state: "active",
              stopReason: null,
              verdictClass: null,
              verifierResult: null
            }
          ],
          runs: [
            {
              ...buildBenchmarkDatasetResponse().runs[0],
              completedAt: null,
              durationMs: null,
              latestAttemptId: "attempt-2",
              latestJobId: "job-2",
              runId: "PP-319",
              runLifecycleBucket: "active",
              runState: "running",
              verdictClass: null
            }
          ],
          summary: {
            ...buildBenchmarkDatasetResponse().summary,
            latestCompletedAt: null,
            verdictCounts: {
              fail: 0,
              invalid_result: 0,
              pass: 0
            }
          }
        })
      }),
      resolvePortalAccess: createResolvePortalAccessStub(["helper"]) as never
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/benchmarks/problem9/export?format=csv"
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /PP-319,running,,openai,gpt-oss,2026-03-13T19:58:00.000Z,,,job-2,attempt-2,active,,,/);
});

test("GET /portal/runs/:runId returns 404 when the run read model is missing", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {} as never,
    createRequireAccessStub(["helper"]) as never,
    {
      portalBenchmarkOpsReadModels: createReadModelService({
        getRunDetail: async () => null
      }),
      resolvePortalAccess: createResolvePortalAccessStub(["helper"]) as never
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/runs/PP-404"
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, "portal_run_not_found");
});

test("GET /portal/runs/:runId returns a contract-valid detail payload for approved helpers", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {} as never,
    createRequireAccessStub(["helper"]) as never,
    {
      portalBenchmarkOpsReadModels: createReadModelService(),
      resolvePortalAccess: createResolvePortalAccessStub(["helper"]) as never
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/runs/PP-318"
  });

  assert.equal(response.statusCode, 200);
  const payload = portalBenchmarkOpsReadModelsContract.runDetailResponse.parse(response.json());
  assert.equal(payload.item.runId, "PP-318");
});

test("GET /portal/launch requires collaborator-or-higher access", async (t) => {
  const helperApp = Fastify();
  const collaboratorApp = Fastify();

  t.after(async () => {
    await helperApp.close();
    await collaboratorApp.close();
  });

  registerPortalRoutes(
    helperApp,
    {} as never,
    createRequireAccessStub(["helper"]) as never,
    {
      portalBenchmarkOpsReadModels: createReadModelService(),
      resolvePortalAccess: createResolvePortalAccessStub(["helper"]) as never
    }
  );
  registerPortalRoutes(
    collaboratorApp,
    {} as never,
    createRequireAccessStub(["collaborator"]) as never,
    {
      portalBenchmarkOpsReadModels: createReadModelService(),
      resolvePortalAccess: createResolvePortalAccessStub(["collaborator"]) as never
    }
  );

  const deniedResponse = await helperApp.inject({
    method: "GET",
    url: "/portal/launch"
  });
  const allowedResponse = await collaboratorApp.inject({
    method: "GET",
    url: "/portal/launch"
  });

  assert.equal(deniedResponse.statusCode, 403);
  assert.equal(allowedResponse.statusCode, 200);
  const payload = portalBenchmarkOpsReadModelsContract.launchViewResponse.parse(
    allowedResponse.json()
  );
  assert.equal(payload.submissionMode, "preflight_only");
});

test("GET /portal/workers returns the worker posture view for collaborators", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {} as never,
    createRequireAccessStub(["collaborator"]) as never,
    {
      portalBenchmarkOpsReadModels: createReadModelService(),
      resolvePortalAccess: createResolvePortalAccessStub(["collaborator"]) as never
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/workers"
  });

  assert.equal(response.statusCode, 200);
  const payload = portalBenchmarkOpsReadModelsContract.workersViewResponse.parse(
    response.json()
  );
  assert.equal(payload.queueSummary.queuedJobs, 1);
  assert.equal(payload.freshness.freshnessStatus, "live");
  assert.equal(payload.generatedAt, payload.freshness.generatedAt);
});

test("GET /portal/worker-ops/overview mirrors the worker posture compatibility view", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {} as never,
    createRequireAccessStub(["collaborator"]) as never,
    {
      portalBenchmarkOpsReadModels: createReadModelService(),
      resolvePortalAccess: createResolvePortalAccessStub(["collaborator"]) as never
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/worker-ops/overview"
  });

  assert.equal(response.statusCode, 200);
  const payload = portalBenchmarkOpsReadModelsContract.workersViewResponse.parse(
    response.json()
  );
  assert.equal(payload.queueSummary.queuedJobs, 1);
  assert.equal(payload.freshness.recommendedPollAfterSeconds, 15);
});

test("portal benchmark ops normalization helpers keep canonical lifecycle wording aligned", () => {
  assert.equal(
    portalBenchmarkOpsReadModelTestUtils.getRunLifecycleStateLabel("succeeded"),
    "Succeeded"
  );
  assert.equal(
    portalBenchmarkOpsReadModelTestUtils.getJobLifecycleStateLabel("completed"),
    "Completed"
  );
  assert.equal(
    portalBenchmarkOpsReadModelTestUtils.getAttemptLifecycleStateLabel("succeeded"),
    "Succeeded"
  );
  assert.equal(
    portalBenchmarkOpsReadModelTestUtils.getRunLifecycleBucket("succeeded"),
    "terminal_success"
  );
});

test("portal benchmark ops timestamp comparator keeps nulls last", () => {
  const items = [
    { id: "active-only", latestCompletedAt: null },
    { id: "recent", latestCompletedAt: "2026-03-13T20:00:00.000Z" },
    { id: "older", latestCompletedAt: "2026-03-13T19:00:00.000Z" }
  ];

  items.sort((left, right) =>
    portalBenchmarkOpsReadModelTestUtils.compareNullableTimestampDescNullsLast(
      left.latestCompletedAt,
      right.latestCompletedAt
    )
  );

  assert.deepEqual(items.map((item) => item.id), ["recent", "older", "active-only"]);
});

test("portal benchmark ops benchmark-list comparator keeps nulls last", () => {
  const items = [
    { benchmarkPackageId: "active-only", latestCompletedAt: null },
    { benchmarkPackageId: "completed", latestCompletedAt: "2026-03-13T20:00:00.000Z" }
  ];

  items.sort((left, right) =>
    portalBenchmarkOpsReadModelTestUtils.compareBenchmarkListItemLatestCompletedAtDesc(
      left,
      right
    )
  );

  assert.deepEqual(items.map((item) => item.benchmarkPackageId), [
    "completed",
    "active-only"
  ]);
});

test("portal benchmark ops benchmark-list comparator ties equal timestamps by package id", () => {
  const items = [
    { benchmarkPackageId: "problem9-zeta", latestCompletedAt: null },
    { benchmarkPackageId: "problem9-alpha", latestCompletedAt: null }
  ];

  items.sort((left, right) =>
    portalBenchmarkOpsReadModelTestUtils.compareBenchmarkListItemLatestCompletedAtDesc(
      left,
      right
    )
  );

  assert.deepEqual(items.map((item) => item.benchmarkPackageId), [
    "problem9-alpha",
    "problem9-zeta"
  ]);
});

test("portal benchmark ops runs-list finished-at ordering keeps non-terminal rows last in SQL", () => {
  const sqlText = renderOrderBySql(
    portalBenchmarkOpsReadModelTestUtils.buildRunOrderBy("finished_at_desc")
  );

  assert.match(sqlText, /then 0 else 1 end asc/i);
  assert.match(sqlText, /completed_at.*desc/i);
  assert.match(sqlText, /created_at.*desc/i);
});

test("portal benchmark ops runs-list duration ordering keeps non-terminal rows last in SQL", () => {
  const sqlText = renderOrderBySql(
    portalBenchmarkOpsReadModelTestUtils.buildRunOrderBy("duration_desc")
  );

  assert.match(sqlText, /then 0 else 1 end asc/i);
  assert.match(sqlText, /extract\(epoch from[\s\S]*completed_at[\s\S]*created_at[\s\S]*\)[\s\S]*desc/i);
  assert.match(sqlText, /created_at.*desc/i);
});

test("portal benchmark ops dataset ordering keeps non-terminal rows last in SQL", () => {
  const sqlText = renderOrderBySql(
    portalBenchmarkOpsReadModelTestUtils.buildBenchmarkDatasetRunOrderBy()
  );

  assert.match(sqlText, /then 0 else 1 end asc/i);
  assert.match(sqlText, /completed_at.*desc/i);
  assert.match(sqlText, /created_at.*desc/i);
});
