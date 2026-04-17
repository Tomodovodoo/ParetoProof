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
  portalBenchmarkOpsLocalTestUtils,
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

  it("neutralizes direct and whitespace-prefixed spreadsheet formulas", () => {
    const csv = buildRunsCsv([
      {
        authMode: "oidc",
        benchmarkItemId: "item-1",
        benchmarkLabel: "problem9 core",
        benchmarkPackageDigest: "sha256:abc",
        benchmarkPackageId: "problem9",
        benchmarkPackageVersion: "2026.03",
        benchmarkVersionId: "@problem9@2026.03",
        completedAt: '  =SUM("a","b")',
        durationMs: 120000,
        failure: { code: "+code", family: "\t=family", summary: null },
        laneId: "lane-1",
        latestAttemptId: "-attempt-1",
        latestJobId: "  +job-1",
        lineage: {
          attemptCount: 1,
          attemptIds: ["attempt-1"],
          jobCount: 1,
          jobIds: ["job-1"],
          latestAttemptId: "attempt-1",
          latestJobId: "job-1"
        },
        modelConfigId: "=gpt-oss",
        modelConfigLabel: "  =GPT OSS",
        modelSnapshotId: "gpt-oss-2026-03-13",
        providerFamily: "openai",
        runId: "\t=PP-318",
        runKind: "single_run",
        runLifecycleBucket: "terminal_success",
        runMode: "eval",
        runState: "succeeded",
        startedAt: "2026-03-13T19:58:00.000Z",
        toolProfile: "lean4-proof",
        verdictClass: "pass"
      }
    ]);

    expect(csv).toContain("'\t=PP-318,'  +job-1,'-attempt-1,'@problem9@2026.03,'=gpt-oss,'  =GPT OSS");
    expect(csv).toContain("'\t=family,'+code");
    expect(csv).toContain("\"'  =SUM(\"\"a\"\",\"\"b\"\")\"");
  });

  it("leaves terminal-only run fields blank for non-terminal rows", () => {
    const csv = buildRunsCsv([
      {
        authMode: "oidc",
        benchmarkItemId: "item-2",
        benchmarkLabel: "problem9 active",
        benchmarkPackageDigest: "sha256:def",
        benchmarkPackageId: "problem9",
        benchmarkPackageVersion: "2026.03",
        benchmarkVersionId: "problem9@2026.03",
        completedAt: null,
        durationMs: null,
        failure: { code: null, family: null, summary: null },
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
        modelConfigId: "gpt-oss",
        modelConfigLabel: "GPT OSS",
        modelSnapshotId: "gpt-oss-2026-03-13",
        providerFamily: "openai",
        runId: "PP-319",
        runKind: "single_run",
        runLifecycleBucket: "active",
        runMode: "eval",
        runState: "running",
        startedAt: "2026-03-13T19:58:00.000Z",
        toolProfile: "lean4-proof",
        verdictClass: null
      }
    ]);

    expect(csv).toContain("PP-319,job-2,attempt-2,problem9@2026.03,gpt-oss,GPT OSS,running,Running,active,Active,,,,,2026-03-13T19:58:00.000Z,,");
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

  it("keeps non-terminal dataset fields blank until a run or attempt finishes", () => {
    const csv = buildPortalBenchmarkDatasetCsv({
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
      benchmark: {
        benchmarkLabel: "problem9 @ 2026.03",
        benchmarkPackageId: "problem9",
        laneIds: ["problem9-default"],
        latestRunId: null,
        modelConfigIds: ["gpt-oss"],
        providerFamilies: ["openai"],
        versions: ["2026.03"]
      },
      jobs: [],
      runs: [
        {
          authMode: "oidc",
          benchmarkItemId: "item-2",
          benchmarkLabel: "problem9 active",
          benchmarkPackageDigest: "sha256:def",
          benchmarkPackageId: "problem9",
          benchmarkPackageVersion: "2026.03",
          benchmarkVersionId: "problem9@2026.03",
          completedAt: null,
          durationMs: null,
          failure: { code: null, family: null, summary: null },
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
          modelConfigId: "gpt-oss",
          modelConfigLabel: "GPT OSS",
          modelSnapshotId: "gpt-oss-2026-03-13",
          providerFamily: "openai",
          runId: "PP-319",
          runKind: "single_run",
          runLifecycleBucket: "active",
          runMode: "eval",
          runState: "running",
          startedAt: "2026-03-13T19:58:00.000Z",
          toolProfile: "lean4-proof",
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

    expect(csv).toContain("PP-319,running,,openai,gpt-oss,2026-03-13T19:58:00.000Z,,,job-2,attempt-2,active,,,");
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

describe("local benchmark ops sorting", () => {
  it("keeps finished runs ahead of active runs for finished-at sorting", () => {
    const sorted = portalBenchmarkOpsLocalTestUtils.sortPortalRuns(
      [
        {
          authMode: "oidc",
          benchmarkItemId: "item-running-older",
          benchmarkLabel: "problem9 active older",
          benchmarkPackageDigest: "sha256:def",
          benchmarkPackageId: "problem9",
          benchmarkPackageVersion: "2026.03",
          benchmarkVersionId: "problem9@2026.03",
          completedAt: null,
          durationMs: null,
          failure: { code: null, family: null, summary: null },
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
          modelConfigId: "gpt-oss",
          modelConfigLabel: "GPT OSS",
          modelSnapshotId: "gpt-oss-2026-03-13",
          providerFamily: "openai",
          runId: "PP-319",
          runKind: "single_run",
          runLifecycleBucket: "active",
          runMode: "eval",
          runState: "running",
          startedAt: "2026-03-13T19:58:00.000Z",
          toolProfile: "lean4-proof",
          verdictClass: null
        },
        {
          authMode: "oidc",
          benchmarkItemId: "item-finished",
          benchmarkLabel: "problem9 finished",
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
          startedAt: "2026-03-13T19:57:00.000Z",
          toolProfile: "lean4-proof",
          verdictClass: "pass"
        },
        {
          authMode: "oidc",
          benchmarkItemId: "item-running-newer",
          benchmarkLabel: "problem9 active newer",
          benchmarkPackageDigest: "sha256:def",
          benchmarkPackageId: "problem9",
          benchmarkPackageVersion: "2026.03",
          benchmarkVersionId: "problem9@2026.03",
          completedAt: null,
          durationMs: null,
          failure: { code: null, family: null, summary: null },
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
          modelConfigId: "gpt-oss",
          modelConfigLabel: "GPT OSS",
          modelSnapshotId: "gpt-oss-2026-03-13",
          providerFamily: "openai",
          runId: "PP-321",
          runKind: "single_run",
          runLifecycleBucket: "active",
          runMode: "eval",
          runState: "running",
          startedAt: "2026-03-13T20:02:00.000Z",
          toolProfile: "lean4-proof",
          verdictClass: null
        }
      ],
      "finished_at_desc"
    );

    expect(sorted.map((item) => item.runId)).toEqual(["PP-318", "PP-321", "PP-319"]);
  });

  it("orders mixed null and non-null benchmark timestamps with nulls last", () => {
    const items = [
      { benchmarkPackageId: "active-only", latestCompletedAt: null },
      { benchmarkPackageId: "completed", latestCompletedAt: "2026-03-13T20:00:00.000Z" }
    ];

    items.sort((left, right) =>
      portalBenchmarkOpsLocalTestUtils.compareBenchmarkLatestCompletedAtDesc(left, right)
    );

    expect(items.map((item) => item.benchmarkPackageId)).toEqual([
      "completed",
      "active-only"
    ]);
  });

  it("ties equal benchmark timestamps by benchmark package id", () => {
    const items = [
      { benchmarkPackageId: "problem9-zeta", latestCompletedAt: null },
      { benchmarkPackageId: "problem9-alpha", latestCompletedAt: null }
    ];

    items.sort((left, right) =>
      portalBenchmarkOpsLocalTestUtils.compareBenchmarkLatestCompletedAtDesc(left, right)
    );

    expect(items.map((item) => item.benchmarkPackageId)).toEqual([
      "problem9-alpha",
      "problem9-zeta"
    ]);
  });

  it("ties equal latest completed times by newest started-at first", () => {
    const newer = {
      benchmarkPackageId: "problem9-core",
      completedAt: "2026-03-13T20:00:00.000Z",
      startedAt: "2026-03-13T20:02:00.000Z"
    };
    const older = {
      benchmarkPackageId: "problem9-core",
      completedAt: "2026-03-13T20:00:00.000Z",
      startedAt: "2026-03-13T19:58:00.000Z"
    };

    expect(
      portalBenchmarkOpsLocalTestUtils.compareBenchmarkLatestRunDesc(newer, older)
    ).toBeLessThan(0);
  });

  it("prefers the newest active run for active-only benchmark packages", () => {
    const newer = {
      benchmarkPackageId: "problem9-core",
      completedAt: null,
      startedAt: "2026-03-13T20:02:00.000Z"
    };
    const older = {
      benchmarkPackageId: "problem9-core",
      completedAt: null,
      startedAt: "2026-03-13T19:58:00.000Z"
    };

    expect(
      portalBenchmarkOpsLocalTestUtils.compareBenchmarkLatestRunDesc(newer, older)
    ).toBeLessThan(0);
  });

  it("ties equal duration values by newest started-at first", () => {
    const sorted = portalBenchmarkOpsLocalTestUtils.sortPortalRuns(
      [
        {
          authMode: "oidc",
          benchmarkItemId: "item-running-older",
          benchmarkLabel: "problem9 active older",
          benchmarkPackageDigest: "sha256:def",
          benchmarkPackageId: "problem9",
          benchmarkPackageVersion: "2026.03",
          benchmarkVersionId: "problem9@2026.03",
          completedAt: null,
          durationMs: null,
          failure: { code: null, family: null, summary: null },
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
          modelConfigId: "gpt-oss",
          modelConfigLabel: "GPT OSS",
          modelSnapshotId: "gpt-oss-2026-03-13",
          providerFamily: "openai",
          runId: "PP-319",
          runKind: "single_run",
          runLifecycleBucket: "active",
          runMode: "eval",
          runState: "running",
          startedAt: "2026-03-13T19:58:00.000Z",
          toolProfile: "lean4-proof",
          verdictClass: null
        },
        {
          authMode: "oidc",
          benchmarkItemId: "item-running-newer",
          benchmarkLabel: "problem9 active newer",
          benchmarkPackageDigest: "sha256:def",
          benchmarkPackageId: "problem9",
          benchmarkPackageVersion: "2026.03",
          benchmarkVersionId: "problem9@2026.03",
          completedAt: null,
          durationMs: null,
          failure: { code: null, family: null, summary: null },
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
          modelConfigId: "gpt-oss",
          modelConfigLabel: "GPT OSS",
          modelSnapshotId: "gpt-oss-2026-03-13",
          providerFamily: "openai",
          runId: "PP-321",
          runKind: "single_run",
          runLifecycleBucket: "active",
          runMode: "eval",
          runState: "running",
          startedAt: "2026-03-13T20:02:00.000Z",
          toolProfile: "lean4-proof",
          verdictClass: null
        }
      ],
      "duration_desc"
    );

    expect(sorted.map((item) => item.runId)).toEqual(["PP-321", "PP-319"]);
  });

  it("keeps completed benchmark dataset runs ahead of active runs locally", () => {
    const dataset = portalBenchmarkOpsLocalTestUtils.buildLocalBenchmarkDataset("problem9-core");

    expect(dataset.runs.map((run) => run.runId)).toEqual(["PP-318", "PP-321", "PP-319"]);
  });

  it("marks local runs and worker incidents as preview fixtures instead of live operational facts", () => {
    const runs = portalBenchmarkOpsLocalTestUtils.buildLocalRunsListResponse(defaultPortalRunsQuery);
    const workers = portalBenchmarkOpsLocalTestUtils.buildLocalWorkersViewResponse();

    expect(runs.items.map((item) => item.benchmarkLabel)).toEqual(
      expect.arrayContaining([
        "Local preview / axiom slice example",
        "Local preview / induction example",
        "Local preview / simplification example",
        "Local preview / worker handoff example"
      ])
    );
    expect(workers.incidents.map((incident) => incident.summary)).toEqual([
      "Local preview fixture: a stale lease expired on the local-preview pool while PP-320 was retrying.",
      "Local preview fixture: queued slice work is waiting on modal-preview capacity."
    ]);
    expect(workers.workerPools.map((pool) => pool.workerPool)).toEqual([
      "modal-preview",
      "local-preview"
    ]);
  });
});
