import { describe, expect, it } from "bun:test";
import {
  buildPortalBenchmarkDatasetCsv,
  buildPortalBenchmarkDatasetExportFileName,
  buildRunsCsv,
  buildRunsModelOptions,
  buildRunsProviderOptions,
  defaultPortalRunsQuery,
  extractPortalRunsQueryString,
  parsePortalRunsQuery,
  sanitizePortalRunsQueryString
} from "./portal-benchmark-ops.ts";

describe("parsePortalRunsQuery", () => {
  it("falls back safely when the runs query contains invalid or outdated param values", () => {
    expect(
      parsePortalRunsQuery(
        "?surface=portal&sort=bogus&lifecycleBucket=not_real&verdict=pass,broken&limit=9999"
      )
    ).toEqual(defaultPortalRunsQuery);
  });
});

describe("buildRunsCsv", () => {
  it("exports canonical run-state and bucket labels instead of stale completed wording", () => {
    const csv = buildRunsCsv([
      {
        authMode: "oidc",
        benchmarkItemId: "item-1",
        benchmarkLabel: "problem9 core",
        benchmarkPackageDigest: "sha256:abc",
        benchmarkPackageId: "problem9",
        benchmarkPackageVersion: "2026.03",
        benchmarkVersionId: "problem9@2026.03",
        completedAt: "2026-03-13T20:00:00.000Z",
        durationMs: 120000,
        failure: { code: null, family: null, summary: null },
        laneId: "lane-1",
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
        modelConfigLabel: "GPT OSS",
        modelSnapshotId: "gpt-oss-2026-03-13",
        providerFamily: "openai",
        runId: "PP-318",
        runKind: "single_run",
        runLifecycleBucket: "terminal_success",
        runMode: "eval",
        runState: "succeeded",
        startedAt: "2026-03-13T19:58:00.000Z",
        toolProfile: "lean4-proof",
        verdictClass: "pass"
      }
    ]);

    expect(csv).toContain("runStateLabel");
    expect(csv).toContain("runLifecycleBucketLabel");
    expect(csv).toContain("succeeded,Succeeded,terminal_success,Terminal success,pass,Pass");
    expect(csv).not.toContain("succeeded,Completed");
  });

  it("neutralizes direct and whitespace-prefixed spreadsheet formulas in run export fields", () => {
    const csv = buildRunsCsv([
      {
        authMode: "oidc",
        benchmarkItemId: "item-1",
        benchmarkLabel: "problem9 core",
        benchmarkPackageDigest: "sha256:abc",
        benchmarkPackageId: "problem9",
        benchmarkPackageVersion: "2026.03",
        benchmarkVersionId: "problem9@2026.03",
        completedAt: "2026-03-13T20:00:00.000Z",
        durationMs: 120000,
        failure: { code: "  =SUM(11)", family: "=family", summary: null },
        laneId: "lane-1",
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
        modelConfigLabel: "GPT OSS",
        modelSnapshotId: "gpt-oss-2026-03-13",
        providerFamily: "openai",
        runId: "PP-318",
        runKind: "single_run",
        runLifecycleBucket: "terminal_success",
        runMode: "eval",
        runState: "succeeded",
        startedAt: "2026-03-13T19:58:00.000Z",
        toolProfile: "lean4-proof",
        verdictClass: "pass"
      },
      {
        authMode: "oidc",
        benchmarkItemId: "item-2",
        benchmarkLabel: "problem9 core",
        benchmarkPackageDigest: "sha256:def",
        benchmarkPackageId: "problem9",
        benchmarkPackageVersion: "2026.03",
        benchmarkVersionId: "problem9@2026.03",
        completedAt: "2026-03-13T20:05:00.000Z",
        durationMs: 90000,
        failure: { code: "\t@cmd", family: "-family", summary: null },
        laneId: "lane-2",
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
        modelConfigId: "claude-sonnet",
        modelConfigLabel: "Claude Sonnet",
        modelSnapshotId: "claude-sonnet-2026-03-13",
        providerFamily: "anthropic",
        runId: "PP-319",
        runKind: "single_run",
        runLifecycleBucket: "terminal_failure",
        runMode: "eval",
        runState: "failed",
        startedAt: "2026-03-13T20:03:30.000Z",
        toolProfile: "lean4-proof",
        verdictClass: "fail"
      },
      {
        authMode: "service_token",
        benchmarkItemId: "item-3",
        benchmarkLabel: "problem9 core",
        benchmarkPackageDigest: "sha256:ghi",
        benchmarkPackageId: "problem9",
        benchmarkPackageVersion: "2026.03",
        benchmarkVersionId: "problem9@2026.03",
        completedAt: "2026-03-13T20:10:00.000Z",
        durationMs: 60000,
        failure: { code: "+code", family: "@family", summary: null },
        laneId: "lane-3",
        latestAttemptId: "attempt-3",
        latestJobId: "job-3",
        lineage: {
          attemptCount: 1,
          attemptIds: ["attempt-3"],
          jobCount: 1,
          jobIds: ["job-3"],
          latestAttemptId: "attempt-3",
          latestJobId: "job-3"
        },
        modelConfigId: "gemini-pro",
        modelConfigLabel: "Gemini Pro",
        modelSnapshotId: "gemini-pro-2026-03-13",
        providerFamily: "google",
        runId: "PP-320",
        runKind: "single_run",
        runLifecycleBucket: "active",
        runMode: "eval",
        runState: "running",
        startedAt: "2026-03-13T20:09:00.000Z",
        toolProfile: "lean4-proof",
        verdictClass: "invalid_result"
      }
    ]);

    expect(csv).toContain(",'=family,'  =SUM(11),");
    expect(csv).toContain(",'-family,'\t@cmd,");
    expect(csv).toContain(",'@family,'+code,");
  });
});

describe("benchmark dataset exports", () => {
  it("builds a stable dataset export filename for the selected package", () => {
    expect(
      buildPortalBenchmarkDatasetExportFileName(
        "problem9/core",
        "json",
        new Date("2026-03-15T08:45:30.000Z")
      )
    ).toBe("paretoproof-problem9-core-dataset-2026-03-15T08-45-30.json");
  });

  it("flattens dataset attempts into csv rows for export", () => {
    const csv = buildPortalBenchmarkDatasetCsv({
      attempts: [
        {
          attemptId: "attempt-1",
          completedAt: "2026-03-13T20:00:00.000Z",
          failure: { code: null, family: null, summary: null },
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
      jobs: [],
      runs: [
        {
          authMode: "oidc",
          benchmarkItemId: "item-1",
          benchmarkLabel: "problem9 core",
          benchmarkPackageDigest: "sha256:abc",
          benchmarkPackageId: "problem9",
          benchmarkPackageVersion: "2026.03",
          benchmarkVersionId: "problem9@2026.03",
          completedAt: "2026-03-13T20:00:00.000Z",
          durationMs: 120000,
          failure: { code: null, family: null, summary: null },
          laneId: "lane-1",
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
          modelConfigLabel: "GPT OSS",
          modelSnapshotId: "gpt-oss-2026-03-13",
          providerFamily: "openai",
          runId: "PP-318",
          runKind: "single_run",
          runLifecycleBucket: "terminal_success",
          runMode: "eval",
          runState: "succeeded",
          startedAt: "2026-03-13T19:58:00.000Z",
          toolProfile: "lean4-proof",
          verdictClass: "pass"
        }
      ],
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
    });

    expect(csv).toContain("benchmarkPackageId,benchmarkVersions,runId");
    expect(csv).toContain("problem9,2026.03,PP-318,succeeded,pass,openai");
    expect(csv).toContain("job-1,attempt-1,succeeded,pass,accepted");
  });
});

describe("extractPortalRunsQueryString", () => {
  it("keeps only recognized runs query params when local portal state is present", () => {
    expect(
      extractPortalRunsQueryString(
        "?surface=portal&access=approved&roles=admin&providerFamily=openai&sort=bogus"
      )
    ).toBe("providerFamily=openai&sort=bogus");
  });
});

describe("sanitizePortalRunsQueryString", () => {
  it("drops malformed runs query params while preserving valid filter state", () => {
    expect(
      sanitizePortalRunsQueryString(
        "?surface=portal&providerFamily=openai&sort=bogus&verdict=pass,broken"
      )
    ).toBe("providerFamily=openai");
  });
});

describe("runs filter option builders", () => {
  it("keeps the selected provider visible even when the current result set is empty", () => {
    expect(
      buildRunsProviderOptions({ modelConfigs: [], providerFamilies: [] }, "openai")
    ).toEqual(["openai"]);
  });

  it("keeps the selected model config visible even when the current result set is empty", () => {
    expect(
      buildRunsModelOptions({ modelConfigs: [], providerFamilies: [] }, "openai-gpt-oss-high")
    ).toEqual([
      {
        count: 0,
        label: "openai-gpt-oss-high",
        modelConfigId: "openai-gpt-oss-high",
        providerFamily: ""
      }
    ]);
  });
});
