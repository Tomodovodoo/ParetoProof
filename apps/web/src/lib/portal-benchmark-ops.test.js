import { afterEach, describe, expect, it } from "bun:test";
import {
  buildPortalBenchmarkDatasetCsv,
  buildPortalBenchmarkDatasetExportFileName,
  buildRunsCsv,
  buildRunsModelOptions,
  buildRunsProviderOptions,
  defaultPortalRunsQuery,
  extractPortalRunsQueryString,
  fetchPortalBenchmarkDataset,
  fetchPortalBenchmarkDatasetExport,
  fetchPortalBenchmarksList,
  fetchPortalLaunchView,
  fetchPortalRunDetail,
  fetchPortalRunsView,
  fetchPortalWorkersView,
  parsePortalRunsQuery,
  sanitizePortalRunsQueryString
} from "./portal-benchmark-ops.ts";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

afterEach(() => {
  globalThis.fetch = originalFetch;

  if (originalWindow) {
    globalThis.window = originalWindow;
    return;
  }

  delete globalThis.window;
});

function setLocalWindow(url = "http://127.0.0.1:4173/") {
  globalThis.window = {
    location: new URL(url),
    setTimeout(callback) {
      callback();
      return 0;
    }
  };
}

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

describe("portal benchmark ops fetchers", () => {
  it("fetches the runs slice from the local API instead of implicit localhost fixtures", async () => {
    const observedRequests = [];

    setLocalWindow();
    globalThis.fetch = async (input, init) => {
      observedRequests.push({
        init,
        url: String(input)
      });

      return new Response(
        JSON.stringify({
          filters: {
            modelConfigs: [],
            providerFamilies: []
          },
          items: [],
          query: defaultPortalRunsQuery,
          summary: {
            activeRuns: 0,
            failedRuns: 0,
            returnedCount: 0,
            totalMatches: 0,
            verdictCounts: {
              fail: 0,
              invalid_result: 0,
              pass: 0
            }
          }
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        }
      );
    };

    const payload = await fetchPortalRunsView(defaultPortalRunsQuery);

    expect(payload.items).toEqual([]);
    expect(payload.summary.totalMatches).toBe(0);
    expect(observedRequests).toHaveLength(1);
    expect(observedRequests[0]?.url).toBe("http://127.0.0.1:3000/portal/runs");
    expect(observedRequests[0]?.init).toMatchObject({
      credentials: "include"
    });
  });

  it("fetches the workers view from the local API and preserves real empty posture", async () => {
    const observedRequests = [];

    setLocalWindow();
    globalThis.fetch = async (input, init) => {
      observedRequests.push({
        init,
        url: String(input)
      });

      return new Response(
        JSON.stringify({
          activeLeases: [],
          freshness: {
            degradationReason: null,
            freshnessStatus: "live",
            generatedAt: "2026-04-17T03:30:00.000Z",
            observedThrough: null,
            recommendedPollAfterSeconds: 15,
            staleAfterSeconds: 60
          },
          generatedAt: "2026-04-17T03:30:00.000Z",
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
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        }
      );
    };

    const payload = await fetchPortalWorkersView();

    expect(payload.workerPools).toEqual([]);
    expect(payload.queueSummary.queuedJobs).toBe(0);
    expect(observedRequests).toHaveLength(1);
    expect(observedRequests[0]?.url).toBe("http://127.0.0.1:3000/portal/workers");
    expect(observedRequests[0]?.init).toMatchObject({
      credentials: "include"
    });
  });

  it("fetches the benchmarks list from the local API instead of fixture summaries", async () => {
    const observedRequests = [];

    setLocalWindow();
    globalThis.fetch = async (input, init) => {
      observedRequests.push({
        init,
        url: String(input)
      });

      return new Response(
        JSON.stringify({
          items: []
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        }
      );
    };

    const payload = await fetchPortalBenchmarksList();

    expect(payload.items).toEqual([]);
    expect(observedRequests).toHaveLength(1);
    expect(observedRequests[0]?.url).toBe("http://127.0.0.1:3000/portal/benchmarks");
    expect(observedRequests[0]?.init).toMatchObject({
      credentials: "include"
    });
  });

  it("fetches the benchmark dataset from the local API instead of fixture evidence", async () => {
    const observedRequests = [];

    setLocalWindow();
    globalThis.fetch = async (input, init) => {
      observedRequests.push({
        init,
        url: String(input)
      });

      return new Response(
        JSON.stringify({
          attempts: [],
          benchmark: {
            benchmarkLabel: "problem9 @ 2026.03",
            benchmarkPackageId: "problem9",
            laneIds: [],
            latestRunId: null,
            modelConfigIds: [],
            providerFamilies: [],
            versions: []
          },
          jobs: [],
          runs: [],
          summary: {
            attemptCount: 0,
            jobCount: 0,
            latestCompletedAt: null,
            runCount: 0,
            verdictCounts: {
              fail: 0,
              invalid_result: 0,
              pass: 0
            }
          }
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        }
      );
    };

    const payload = await fetchPortalBenchmarkDataset("problem9/core");

    expect(payload.runs).toEqual([]);
    expect(payload.summary.runCount).toBe(0);
    expect(observedRequests).toHaveLength(1);
    expect(observedRequests[0]?.url).toBe(
      "http://127.0.0.1:3000/portal/benchmarks/problem9%2Fcore/dataset"
    );
    expect(observedRequests[0]?.init).toMatchObject({
      credentials: "include"
    });
  });

  it("fetches the launch preflight view from the local API instead of localhost preview options", async () => {
    const observedRequests = [];

    setLocalWindow();
    globalThis.fetch = async (input, init) => {
      observedRequests.push({
        init,
        url: String(input)
      });

      return new Response(
        JSON.stringify({
          benchmarks: [],
          governance: {
            defaultPolicy: {
              budget: {
                budgetExceededTerminalState: "failed",
                maxEstimatedUsdPerRun: 25,
                maxInputTokensPerRun: 5000000,
                maxOutputTokensPerRun: 1000000,
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
          modelConfigs: [],
          redirectPattern: "/runs/:runId",
          runKinds: [],
          submissionMode: "preflight_only"
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        }
      );
    };

    const payload = await fetchPortalLaunchView();

    expect(payload.benchmarks).toEqual([]);
    expect(payload.runKinds).toEqual([]);
    expect(observedRequests).toHaveLength(1);
    expect(observedRequests[0]?.url).toBe("http://127.0.0.1:3000/portal/launch");
    expect(observedRequests[0]?.init).toMatchObject({
      credentials: "include"
    });
  });

  it("propagates run-detail failures on localhost instead of substituting fixture evidence", async () => {
    const observedRequests = [];

    setLocalWindow();
    globalThis.fetch = async (input) => {
      observedRequests.push(String(input));
      return new Response(null, { status: 404 });
    };

    await expect(fetchPortalRunDetail("PP 320")).rejects.toThrow("Request failed with 404.");
    expect(observedRequests).toEqual(["http://127.0.0.1:3000/portal/runs/PP%20320"]);
  });

  it("keeps benchmark dataset exports scoped to the canonical package id in their file names", () => {
    expect(
      buildPortalBenchmarkDatasetExportFileName(
        "problem9/core@2026.04",
        "csv",
        new Date("2026-04-17T09:10:11.000Z")
      )
    ).toBe("paretoproof-problem9-core-2026.04-dataset-2026-04-17T09-10-11.csv");
  });

  it("fetches dataset export bytes from the local API instead of building a fixture blob", async () => {
    const observedRequests = [];

    setLocalWindow();
    globalThis.fetch = async (input, init) => {
      observedRequests.push({
        init,
        url: String(input)
      });

      return new Response("{\"runs\":[]}", {
        headers: {
          "Content-Disposition": "attachment; filename=\"real-export.json\"",
          "Content-Type": "application/json"
        },
        status: 200
      });
    };

    const payload = await fetchPortalBenchmarkDatasetExport("problem9/core", "json");

    expect(payload.fileName).toBe("real-export.json");
    expect(await payload.blob.text()).toBe("{\"runs\":[]}");
    expect(observedRequests).toHaveLength(1);
    expect(observedRequests[0]?.url).toBe(
      "http://127.0.0.1:3000/portal/benchmarks/problem9%2Fcore/export?format=json"
    );
    expect(observedRequests[0]?.init).toMatchObject({
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    });
  });
});
