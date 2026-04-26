import { describe, expect, it } from "bun:test";
import {
  portalBenchmarkDatasetResponseSchema,
  portalWorkerOpsFreshnessSchema,
  portalWorkersViewResponseSchema,
  portalRunAttemptSummarySchema,
  portalRunJobSummarySchema,
  portalRunListItemSchema,
  portalRunsListResponseSchema
} from "../dist/index.js";

const baseRunItem = {
  authMode: "machine_api_key",
  benchmarkItemId: "item-1",
  benchmarkLabel: "problem9 @ 2026.03",
  benchmarkPackageDigest: "a".repeat(64),
  benchmarkPackageId: "problem9",
  benchmarkPackageVersion: "2026.03",
  benchmarkVersionId: "problem9@2026.03",
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
  runMode: "bounded_agentic_attempt",
  startedAt: "2026-03-13T19:58:00.000Z",
  toolProfile: "workspace_edit_limited"
};

describe("portal benchmark-ops lifecycle contracts", () => {
  it("requires explicit API-owned worker freshness for workers responses", () => {
    const baseWorkersResponse = {
      activeLeases: [],
      freshness: {
        degradationReason: null,
        freshnessStatus: "live",
        generatedAt: "2026-04-26T18:00:00.000Z",
        observedThrough: null,
        recommendedPollAfterSeconds: 15,
        staleAfterSeconds: 60
      },
      generatedAt: "2026-04-26T18:00:00.000Z",
      incidents: [],
      queueSummary: {
        activeRuns: 0,
        cancelRequestedJobs: 0,
        claimedJobs: 0,
        queuedJobs: 0,
        queuedRuns: 0,
        runningJobs: 0
      },
      workerPools: []
    };
    const parsed = portalWorkersViewResponseSchema.parse(baseWorkersResponse);

    expect(parsed.freshness.freshnessStatus).toBe("live");
    expect(parsed.freshness.observedThrough).toBeNull();

    expect(
      portalWorkersViewResponseSchema.safeParse({
        ...baseWorkersResponse,
        freshness: {
          ...baseWorkersResponse.freshness,
          generatedAt: "2026-04-26T18:00:01.000Z"
        }
      }).success
    ).toBe(false);
  });

  it("keeps worker degraded-state reasons explicit and absent from live states", () => {
    expect(
      portalWorkerOpsFreshnessSchema.parse({
        degradationReason: "worker_ops_partial_snapshot",
        freshnessStatus: "degraded",
        generatedAt: "2026-04-26T18:00:00.000Z",
        observedThrough: "2026-04-26T17:59:00.000Z",
        recommendedPollAfterSeconds: 15,
        staleAfterSeconds: 60
      }).degradationReason
    ).toBe("worker_ops_partial_snapshot");

    expect(
      portalWorkerOpsFreshnessSchema.safeParse({
        degradationReason: null,
        freshnessStatus: "degraded",
        generatedAt: "2026-04-26T18:00:00.000Z",
        observedThrough: "2026-04-26T17:59:00.000Z",
        recommendedPollAfterSeconds: 15,
        staleAfterSeconds: 60
      }).success
    ).toBe(false);

    expect(
      portalWorkerOpsFreshnessSchema.safeParse({
        degradationReason: "not_allowed_for_live",
        freshnessStatus: "live",
        generatedAt: "2026-04-26T18:00:00.000Z",
        observedThrough: "2026-04-26T17:59:00.000Z",
        recommendedPollAfterSeconds: 15,
        staleAfterSeconds: 60
      }).success
    ).toBe(false);
  });

  it("accepts non-terminal runs with null terminal-only fields", () => {
    const parsed = portalRunListItemSchema.parse({
      ...baseRunItem,
      completedAt: null,
      durationMs: null,
      latestAttemptId: null,
      latestJobId: null,
      lineage: {
        attemptCount: 0,
        attemptIds: [],
        jobCount: 0,
        jobIds: [],
        latestAttemptId: null,
        latestJobId: null
      },
      runId: "PP-321",
      runLifecycleBucket: "pending",
      runState: "queued",
      verdictClass: null
    });

    expect(parsed.completedAt).toBeNull();
    expect(parsed.durationMs).toBeNull();
    expect(parsed.verdictClass).toBeNull();
  });

  it("rejects non-terminal runs with invented terminal verdict data", () => {
    const parsed = portalRunListItemSchema.safeParse({
      ...baseRunItem,
      completedAt: "2026-03-13T16:18:00.000Z",
      durationMs: 0,
      latestAttemptId: null,
      latestJobId: null,
      lineage: {
        attemptCount: 0,
        attemptIds: [],
        jobCount: 0,
        jobIds: [],
        latestAttemptId: null,
        latestJobId: null
      },
      runId: "PP-321",
      runLifecycleBucket: "pending",
      runState: "queued",
      verdictClass: "pass"
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts non-terminal job and attempt summaries with null terminal-only fields", () => {
    const job = portalRunJobSummarySchema.parse({
      completedAt: null,
      failure: { code: null, family: null, summary: null },
      jobId: "job-1",
      runId: "PP-319",
      startedAt: "2026-03-13T15:50:39.000Z",
      state: "running",
      stopReason: null,
      verdictClass: null
    });
    const attempt = portalRunAttemptSummarySchema.parse({
      attemptId: "attempt-1",
      completedAt: null,
      failure: { code: null, family: null, summary: null },
      jobId: "job-1",
      runId: "PP-319",
      startedAt: "2026-03-13T15:50:39.000Z",
      state: "active",
      stopReason: null,
      verdictClass: null,
      verifierResult: null
    });

    expect(job.completedAt).toBeNull();
    expect(job.stopReason).toBeNull();
    expect(attempt.completedAt).toBeNull();
    expect(attempt.verifierResult).toBeNull();
  });

  it("allows active and pending runs to omit terminal-only fields in the list response", () => {
    const parsed = portalRunsListResponseSchema.parse({
      filters: {
        modelConfigs: [],
        providerFamilies: []
      },
      items: [
        {
          ...baseRunItem,
          completedAt: null,
          durationMs: null,
          runLifecycleBucket: "active",
          runState: "running",
          verdictClass: null
        },
        {
          ...baseRunItem,
          completedAt: null,
          durationMs: null,
          latestAttemptId: null,
          latestJobId: null,
          lineage: {
            attemptCount: 0,
            attemptIds: [],
            jobCount: 0,
            jobIds: [],
            latestAttemptId: null,
            latestJobId: null
          },
          runId: "PP-319",
          runLifecycleBucket: "pending",
          runState: "queued",
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
        returnedCount: 2,
        totalMatches: 2,
        verdictCounts: {
          fail: 0,
          invalid_result: 0,
          pass: 0
        }
      }
    });

    expect(parsed.items[0].completedAt).toBeNull();
    expect(parsed.items[1].verdictClass).toBeNull();
  });

  it("allows non-terminal attempt and job summaries to omit terminal-only fields in dataset responses", () => {
    const parsed = portalBenchmarkDatasetResponseSchema.parse({
      attempts: [
        {
          attemptId: "attempt-1",
          completedAt: null,
          failure: {
            code: null,
            family: null,
            summary: null
          },
          jobId: "job-1",
          runId: "PP-318",
          startedAt: "2026-03-13T19:58:30.000Z",
          state: "active",
          stopReason: null,
          verdictClass: null,
          verifierResult: null
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
          completedAt: null,
          failure: {
            code: null,
            family: null,
            summary: null
          },
          jobId: "job-1",
          runId: "PP-318",
          startedAt: "2026-03-13T19:58:10.000Z",
          state: "running",
          stopReason: null,
          verdictClass: null
        }
      ],
      runs: [
        {
          ...baseRunItem,
          completedAt: null,
          durationMs: null,
          runLifecycleBucket: "active",
          runState: "running",
          verdictClass: null
        }
      ],
      summary: {
        attemptCount: 1,
        jobCount: 1,
        latestCompletedAt: null,
        runCount: 1,
        verdictCounts: {
          fail: 0,
          invalid_result: 0,
          pass: 0
        }
      }
    });

    expect(parsed.attempts[0].stopReason).toBeNull();
    expect(parsed.jobs[0].verdictClass).toBeNull();
  });
});
