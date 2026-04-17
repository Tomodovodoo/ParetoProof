import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultPortalRunsQuery } from "../lib/portal-benchmark-ops";
import {
  buildRunDetailTargetPath,
  buildRunsIndexTargetPath,
  getPortalBenchmarkOpsUnavailableTitle,
  getCompactRunsSectionOrder,
  isCurrentPortalRequest,
  PortalLaunchSurface,
  PortalRunDetailSurface,
  PortalRunsSurface,
  PortalWorkersSurface
} from "./portal-benchmark-ops-surfaces.tsx";

function createMatchMedia(width) {
  return (query) => {
    const maxWidthMatch = /\(max-width:\s*(\d+)px\)/.exec(query);
    const maxWidth = maxWidthMatch ? Number(maxWidthMatch[1]) : Number.POSITIVE_INFINITY;

    return {
      addEventListener() {},
      matches: width <= maxWidth,
      media: query,
      removeEventListener() {}
    };
  };
}

function setWindow(url, width) {
  const location = new URL(url);

  globalThis.window = {
    addEventListener() {},
    clearInterval: globalThis.clearInterval,
    history: {
      replaceState() {},
      state: null
    },
    location,
    matchMedia: createMatchMedia(width),
    removeEventListener() {},
    setInterval: globalThis.setInterval
  };
}

function createUnavailableLoadState() {
  return {
    data: null,
    error: null,
    isLoading: false,
    lastUpdatedAt: "2026-04-17T04:00:00.000Z"
  };
}

function createLaunchLoadState() {
  return {
    data: {
      benchmarks: [
        {
          benchmarkItemCount: 19,
          benchmarkLabel: "firstproof/problem9 @ v1",
          benchmarkPackageDigest: "sha256:abc123",
          benchmarkPackageId: "firstproof/problem9",
          benchmarkPackageVersion: "v1",
          benchmarkVersionId: "bench-v1",
          laneIds: ["lean4"],
          lastSeenRunId: "run-last-seen"
        }
      ],
      governance: {
        defaultPolicy: {
          budget: {
            budgetExceededTerminalState: "failed",
            maxEstimatedUsdPerRun: 25,
            maxInputTokensPerRun: 200000,
            maxOutputTokensPerRun: 60000,
            maxWallClockMinutesPerRun: 120
          },
          cancellation: {
            cancelRequestGraceSeconds: 60,
            forcedCancelAfterSeconds: 300,
            heartbeatStaleSeconds: 120
          },
          concurrency: {
            maxActiveRunsGlobal: 10,
            maxActiveRunsPerContributor: 2,
            maxConcurrentJobsPerRun: 4,
            maxQueuedRunsPerContributor: 4
          },
          retry: {
            backoffMultiplier: 2,
            initialBackoffSeconds: 10,
            maxAttemptsPerJob: 3,
            maxAttemptsPerRun: 6,
            maxBackoffSeconds: 120,
            retryableReasons: ["provider_transport_error", "internal_transient"]
          }
        },
        runKindConcurrencyOverrides: [
          {
            id: "full_benchmark",
            maxConcurrentJobsPerRun: 8,
            rationale: "Full benchmark fanout"
          },
          {
            id: "benchmark_slice",
            maxConcurrentJobsPerRun: 4,
            rationale: "Slice fanout"
          },
          {
            id: "single_run",
            maxConcurrentJobsPerRun: 1,
            rationale: "Single item"
          },
          {
            id: "repeated_n",
            maxConcurrentJobsPerRun: 2,
            rationale: "Repeat envelope"
          }
        ]
      },
      modelConfigs: [
        {
          authModes: ["machine_api_key"],
          modelConfigId: "gpt-5.4",
          modelConfigLabel: "GPT-5.4",
          modelSnapshotIds: ["gpt-5.4-2026-04-01"],
          providerFamily: "openai",
          runModes: ["hosted"],
          toolProfiles: ["default"]
        }
      ],
      redirectPattern: "/runs/:runId",
      runKinds: [
        {
          description:
            "Launch the full published benchmark version against one model configuration.",
          id: "full_benchmark",
          requiredFields: ["benchmarkVersionId", "modelConfigId"]
        },
        {
          description:
            "Launch a bounded subset of one benchmark version, typically for smoke checks or focused regression work.",
          id: "benchmark_slice",
          requiredFields: ["benchmarkVersionId", "modelConfigId", "sliceDefinition"]
        },
        {
          description:
            "Execute one benchmark item or one curated prompt/problem pair end-to-end.",
          id: "single_run",
          requiredFields: ["benchmarkItemId", "modelConfigId"]
        },
        {
          description:
            "Repeat the same benchmark item or slice multiple times to measure variance or flaky behavior.",
          id: "repeated_n",
          requiredFields: ["benchmarkTargetId", "modelConfigId", "repeatCount"]
        }
      ],
      submissionMode: "preflight_only"
    },
    error: null,
    isLoading: false,
    lastUpdatedAt: "2026-04-17T04:00:00.000Z"
  };
}

describe("portal benchmark ops route targets", () => {
  it("keeps the current runs query when routing into run detail", () => {
    expect(
      buildRunDetailTargetPath(
        "PP-320",
        "?surface=portal&access=approved&roles=helper&providerFamily=google"
      )
    ).toBe(
      "/runs/PP-320?surface=portal&access=approved&roles=helper&providerFamily=google"
    );
  });

  it("normalizes query strings without a leading question mark", () => {
    expect(
      buildRunDetailTargetPath(
        "PP 320",
        "surface=portal&access=approved&roles=helper&providerFamily=google"
      )
    ).toBe(
      "/runs/PP%20320?surface=portal&access=approved&roles=helper&providerFamily=google"
    );
  });

  it("preserves the originating runs slice for the back-to-runs action", () => {
    expect(
      buildRunsIndexTargetPath(
        "?surface=portal&access=approved&roles=helper&providerFamily=google"
      )
    ).toBe(
      "/runs?surface=portal&access=approved&roles=helper&providerFamily=google"
    );
  });

  it("keeps the compact runs slice ahead of the deeper support panel", () => {
    expect(getCompactRunsSectionOrder()).toEqual([
      "resultsPanel",
      "quickFilters",
      "supportPanel",
      "runsSlice"
    ]);
  });

  it("uses the same current-request guard for list and detail async responses", () => {
    expect(isCurrentPortalRequest(2, 2)).toBe(true);
    expect(isCurrentPortalRequest(1, 2)).toBe(false);
  });

  it("keeps route-specific unavailable copy once implicit localhost fixtures are removed", () => {
    expect(getPortalBenchmarkOpsUnavailableTitle("runs", null)).toBe("Run index is unavailable.");
    expect(getPortalBenchmarkOpsUnavailableTitle("runs", "PP-318")).toBe("Run evidence is unavailable.");
    expect(getPortalBenchmarkOpsUnavailableTitle("launch", null)).toBe("Launch options are not ready yet.");
    expect(getPortalBenchmarkOpsUnavailableTitle("workers", null)).toBe("Worker operations are unavailable.");
  });

  it("renders route-level unavailable states once implicit localhost fixtures are gone", () => {
    setWindow("http://127.0.0.1/runs?surface=portal&access=approved", 1280);
    const onRefresh = async () => {};

    const runsHtml = renderToStaticMarkup(
      createElement(PortalRunsSurface, {
        activeRouteId: "portal.runs",
        loadState: createUnavailableLoadState(),
        onRefresh,
        onReplaceLocation() {},
        pathname: "/runs",
        query: defaultPortalRunsQuery,
        search: "?surface=portal&access=approved"
      })
    );
    expect(runsHtml).toContain("Run index is unavailable.");

    const detailHtml = renderToStaticMarkup(
      createElement(PortalRunDetailSurface, {
        activeRouteId: "portal.run_detail",
        loadState: createUnavailableLoadState(),
        onRefresh,
        search: "?surface=portal&access=approved"
      })
    );
    expect(detailHtml).toContain("Run evidence is unavailable.");

    const launchHtml = renderToStaticMarkup(
      createElement(PortalLaunchSurface, {
        activeRouteId: "portal.launch",
        loadState: createUnavailableLoadState(),
        onRefresh,
        selection: {
          benchmarkVersionId: "",
          modelConfigId: "",
          runKind: "single_run"
        },
        setSelection() {}
      })
    );
    expect(launchHtml).toContain("Launch options are not ready yet.");

    const workersHtml = renderToStaticMarkup(
      createElement(PortalWorkersSurface, {
        activeRouteId: "portal.workers",
        loadState: createUnavailableLoadState(),
        onRefresh
      })
    );
    expect(workersHtml).toContain("Worker operations are unavailable.");
  });

  it("keeps launch preflight truthful when only full benchmark is currently parameterizable", () => {
    setWindow("http://127.0.0.1/launch?surface=portal&access=approved", 1280);

    const html = renderToStaticMarkup(
      createElement(PortalLaunchSurface, {
        activeRouteId: "portal.launch",
        loadState: createLaunchLoadState(),
        onRefresh: async () => {},
        selection: {
          benchmarkVersionId: "bench-v1",
          modelConfigId: "gpt-5.4",
          runKind: "single_run"
        },
        setSelection() {}
      })
    );

    expect(html).toContain("Max per run: 8");
    expect(html).toContain("Observed in 19 prior runs across lean4.");
    expect(html).toContain(
      "benchmark slice, single run, repeated n still need slice definition, benchmark item, benchmark target, repeat count."
    );
    expect(html).toContain("Required preflight fields: benchmark version, model config");
    expect(html).not.toContain(">single run</option>");
    expect(html).not.toContain(">benchmark slice</option>");
    expect(html).not.toContain(">repeated n</option>");
  });

  it("falls back to an unavailable state when no returned run kind is actually parameterizable", () => {
    setWindow("http://127.0.0.1/launch?surface=portal&access=approved", 1280);
    const loadState = createLaunchLoadState();
    loadState.data.runKinds = loadState.data.runKinds.filter((item) => item.id !== "full_benchmark");

    const html = renderToStaticMarkup(
      createElement(PortalLaunchSurface, {
        activeRouteId: "portal.launch",
        loadState,
        onRefresh: async () => {},
        selection: {
          benchmarkVersionId: "bench-v1",
          modelConfigId: "gpt-5.4",
          runKind: "single_run"
        },
        setSelection() {}
      })
    );

    expect(html).toContain("Launch options are not ready yet.");
    expect(html).not.toContain("Run kind");
  });
});
