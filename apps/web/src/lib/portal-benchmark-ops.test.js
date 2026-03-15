import { describe, expect, it } from "bun:test";
import {
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
