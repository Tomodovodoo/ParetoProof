import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type {
  PortalLaunchViewResponse,
  PortalRunDetailResponse,
  PortalRunsListQuery,
  PortalRunsListResponse,
  PortalWorkersViewResponse
} from "@paretoproof/shared";
import type { PortalBenchmarkOpsReadModelService } from "../src/lib/portal-benchmark-ops.ts";
import { registerPortalRoutes } from "../src/routes/portal.ts";

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
        roles,
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

function createReadModelService(overrides?: {
  getLaunchView?: () => Promise<PortalLaunchViewResponse>;
  getRunDetail?: (runId: string) => Promise<PortalRunDetailResponse | null>;
  getRunsList?: (query: PortalRunsListQuery) => Promise<PortalRunsListResponse>;
  getWorkersView?: () => Promise<PortalWorkersViewResponse>;
}): PortalBenchmarkOpsReadModelService {
  return {
    getLaunchView: overrides?.getLaunchView ?? (async () => buildLaunchViewResponse()),
    getRunDetail: overrides?.getRunDetail ?? (async () => buildRunDetailResponse()),
    getRunsList: overrides?.getRunsList ?? (async (query) => buildRunsListResponse(query)),
    getWorkersView: overrides?.getWorkersView ?? (async () => buildWorkersViewResponse())
  };
}

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
      roles,
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
  assert.equal(allowedResponse.json().submissionMode, "preflight_only");
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
  assert.equal(response.json().queueSummary.queuedJobs, 1);
});
