import { afterEach, describe, expect, it, jest } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const originalWindow = globalThis.window;

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

async function loadPortalShellModule() {
  return import(`./portal-shell.tsx?test=${Date.now()}`);
}

async function renderPortalShell({ email, roles, url, width }) {
  setWindow(url, width);
  const { PortalShell } = await loadPortalShellModule();
  return renderToStaticMarkup(createElement(PortalShell, { email, roles }));
}

afterEach(() => {
  jest.useRealTimers();

  if (originalWindow) {
    globalThis.window = originalWindow;
    return;
  }

  delete globalThis.window;
});

describe("PortalShell overview ordering", () => {
  it("blocks overlapping overview polls until the active request settles", async () => {
    jest.useFakeTimers();
    setWindow("http://127.0.0.1/?surface=portal&access=approved", 1280);

    const { startPortalOverviewPolling } = await loadPortalShellModule();
    const loadingStates = [];
    const readyPayloads = [];
    const refreshStates = [];
    let resolveFirstRequest;
    const fetchOverview = jest.fn(() =>
      new Promise((resolve) => {
        resolveFirstRequest = () =>
          resolve({
            benchmarkHighlights: [],
            generatedAt: "2026-04-17T04:00:00.000Z",
            recentIncidents: [],
            recentRuns: [],
            summary: {
              activeLeases: 0,
              activeRuns: 0,
              failedRuns: 0,
              observedBenchmarkPackageCount: 0,
              queuedJobs: 0,
              queuedRuns: 0,
              runningJobs: 0,
              staleLeaseCount: 0,
              totalRuns: 0
            }
          });
      })
    );

    const stopPolling = startPortalOverviewPolling({
      fetchOverview,
      intervalMs: 1_000,
      onForegroundError() {},
      onLoadingStateChange(nextState) {
        loadingStates.push(nextState);
      },
      onReady(data) {
        readyPayloads.push(data);
      },
      onRefreshingChange(isRefreshing) {
        refreshStates.push(isRefreshing);
      }
    });

    await Promise.resolve();
    expect(fetchOverview).toHaveBeenCalledTimes(1);
    expect(loadingStates).toEqual([{ status: "loading" }]);

    jest.advanceTimersByTime(1_000);
    await Promise.resolve();
    expect(fetchOverview).toHaveBeenCalledTimes(1);

    resolveFirstRequest();
    await Promise.resolve();
    await Promise.resolve();
    expect(readyPayloads).toHaveLength(1);

    jest.advanceTimersByTime(1_000);
    await Promise.resolve();
    expect(fetchOverview).toHaveBeenCalledTimes(2);
    expect(refreshStates).toContain(true);

    stopPolling();
  });

  it("keeps only the latest overview request active and blocks overlapping background polls", async () => {
    const { createPortalOverviewPollController } = await loadPortalShellModule();
    const controller = createPortalOverviewPollController();

    const initialForeground = controller.begin(false);
    expect(initialForeground).toBe(1);
    expect(controller.begin(true)).toBeNull();

    const replacementForeground = controller.begin(false);
    expect(replacementForeground).toBe(2);
    expect(controller.clear(initialForeground)).toBe(false);
    expect(controller.begin(true)).toBeNull();
    expect(controller.clear(replacementForeground)).toBe(true);

    const resumedBackground = controller.begin(true);
    expect(resumedBackground).toBe(3);
  });

  it("preserves local portal routing params during in-app portal navigation", async () => {
    const { mergeLocalPortalSearchParams } = await loadPortalShellModule();
    const mergedSearch = mergeLocalPortalSearchParams(
      "?surface=portal&access=approved&role=collaborator&email=ada@paretoproof.local",
      "?tab=history"
    );
    const mergedUrl = new URL(`http://127.0.0.1/${mergedSearch}`);

    expect(mergedUrl.searchParams.get("role")).toBe("collaborator");
    expect(mergedUrl.searchParams.get("tab")).toBe("history");
    expect(mergedUrl.searchParams.get("surface")).toBe("portal");
    expect(mergedUrl.searchParams.get("access")).toBe("approved");
  });

  it("puts compact admin recent-run evidence before the action rail", async () => {
    const html = await renderPortalShell({
      email: "ada@paretoproof.local",
      roles: ["admin"],
      url: "http://127.0.0.1/?surface=portal&access=approved&roles=admin&email=ada%40paretoproof.local",
      width: 320
    });

    expect(html).toContain("Review access requests");
    expect(html).toContain("Total runs");
    expect(html).toContain("Loading overview.");
    expect(html).not.toContain("Local preview");
    expect(html).not.toContain("demo fixture data stored in this browser");
    expect(html.indexOf("Recent runs")).toBeLessThan(
      html.indexOf("Total runs")
    );
    expect(html.indexOf("Recent runs")).toBeLessThan(
      html.indexOf("Review runs")
    );
  });

  it("keeps overview visuals in the compact overview order", async () => {
    const { getCompactOverviewSectionOrder } = await loadPortalShellModule();

    expect(getCompactOverviewSectionOrder()).toEqual([
      "recentRuns",
      "metrics",
      "visuals",
      "overviewLead",
      "actions"
    ]);
  });

  it("keeps the wide admin overview metric strip before the action rail", async () => {
    const html = await renderPortalShell({
      email: "ada@paretoproof.local",
      roles: ["admin"],
      url: "http://127.0.0.1/?surface=portal&access=approved&roles=admin&email=ada%40paretoproof.local",
      width: 1280
    });

    expect(html).toContain("Review access requests");
    expect(html).toContain("Total runs");
    expect(html).toContain("Loading the live portal overview");
    expect(html).not.toContain("demo fixture data stored in this browser");
    expect(html.indexOf("Total runs")).toBeLessThan(html.indexOf("Review runs"));
  });
});

describe("PortalShell live overview helpers", () => {
  it("derives truthful zero-run metrics from the live overview payload", async () => {
    const { buildOverviewMetricsCopy } = await loadPortalShellModule();

    expect(
      buildOverviewMetricsCopy({
        benchmarkHighlights: [],
        generatedAt: "2026-04-17T08:00:00.000Z",
        recentIncidents: [],
        recentRuns: [],
        summary: {
          activeLeases: 0,
          activeRuns: 0,
          failedRuns: 0,
          observedBenchmarkPackageCount: 0,
          queuedJobs: 0,
          queuedRuns: 0,
          runningJobs: 0,
          staleLeaseCount: 0,
          totalRuns: 0
        }
      })
    ).toEqual([
      {
        label: "Total runs",
        note: "No benchmark runs have been recorded yet.",
        value: "0"
      },
      {
        label: "Active runs",
        note: "0 failed run(s) recorded in the current aggregate.",
        value: "0"
      },
      {
        label: "Queued jobs",
        note: "0 queued run(s), 0 running job(s).",
        value: "0"
      },
      {
        label: "Active leases",
        note: "0 stale lease(s), 0 recent incident(s).",
        value: "0"
      }
    ]);
  });

  it("describes overview lead copy for loading, error, and ready states", async () => {
    const { describePortalOverviewLead } = await loadPortalShellModule();

    expect(describePortalOverviewLead({ status: "loading" })).toContain("Loading the live portal overview");
    expect(
      describePortalOverviewLead({
        message: "Overview request failed.",
        status: "error"
      })
    ).toBe("Overview request failed.");
    expect(
      describePortalOverviewLead({
        data: {
          benchmarkHighlights: [],
          generatedAt: "2026-04-17T08:00:00.000Z",
          recentIncidents: [],
          recentRuns: [],
          summary: {
            activeLeases: 0,
            activeRuns: 0,
            failedRuns: 0,
            observedBenchmarkPackageCount: 0,
            queuedJobs: 0,
            queuedRuns: 0,
            runningJobs: 0,
            staleLeaseCount: 0,
            totalRuns: 0
          }
        },
        status: "ready"
      })
    ).toContain("portal API read models");
  });

  it("describes the recent-runs fallback row for loading, error, and zero-run states", async () => {
    const { describePortalOverviewRecentRunsFallback } = await loadPortalShellModule();

    expect(describePortalOverviewRecentRunsFallback({ status: "loading" })).toEqual({
      detail: "Loading recent run history from the backend.",
      headline: "Loading overview."
    });
    expect(
      describePortalOverviewRecentRunsFallback({
        message: "Overview request failed.",
        status: "error"
      })
    ).toEqual({
      detail: "Overview request failed.",
      headline: "Overview unavailable."
    });
    expect(
      describePortalOverviewRecentRunsFallback({
        data: {
          benchmarkHighlights: [],
          generatedAt: "2026-04-17T08:00:00.000Z",
          recentIncidents: [],
          recentRuns: [],
          summary: {
            activeLeases: 0,
            activeRuns: 0,
            failedRuns: 0,
            observedBenchmarkPackageCount: 0,
            queuedJobs: 0,
            queuedRuns: 0,
            runningJobs: 0,
            staleLeaseCount: 0,
            totalRuns: 0
          }
        },
        status: "ready"
      })
    ).toEqual({
      detail: "The synced backend has not produced any benchmark runs.",
      headline: "No runs recorded yet."
    });
  });

  it("builds run-posture segments from the overview summary without inventing extra states", async () => {
    const { buildOverviewRunPostureSegments } = await loadPortalShellModule();

    expect(
      buildOverviewRunPostureSegments({
        benchmarkHighlights: [],
        generatedAt: "2026-04-17T08:00:00.000Z",
        recentIncidents: [],
        recentRuns: [],
        summary: {
          activeLeases: 2,
          activeRuns: 3,
          failedRuns: 4,
          observedBenchmarkPackageCount: 2,
          queuedJobs: 5,
          queuedRuns: 2,
          runningJobs: 4,
          staleLeaseCount: 1,
          totalRuns: 14
        }
      })
    ).toEqual([
      {
        accent: "indigo",
        count: 3,
        label: "Active runs",
        note: "Currently running or mid-flight."
      },
      {
        accent: "amber",
        count: 2,
        label: "Queued runs",
        note: "Accepted by the control plane but not started."
      },
      {
        accent: "rose",
        count: 4,
        label: "Failed runs",
        note: "Terminal runs that ended in failure."
      }
    ]);
  });

  it("builds benchmark-activity segments with a truthful non-terminal remainder", async () => {
    const { buildOverviewBenchmarkVisualSegments } = await loadPortalShellModule();

    expect(
      buildOverviewBenchmarkVisualSegments({
        attemptCount: 9,
        benchmarkLabel: "Problem 9",
        benchmarkPackageId: "problem9",
        latestCompletedAt: "2026-04-17T08:00:00.000Z",
        latestRunId: "PP-401",
        modelConfigIds: ["gpt-5.4-pro"],
        providerFamilies: ["openai"],
        runCount: 8,
        versions: ["2026.04"],
        verdictCounts: {
          fail: 2,
          invalid_result: 1,
          pass: 3
        }
      })
    ).toEqual([
      {
        accent: "mint",
        count: 3,
        label: "Pass verdicts"
      },
      {
        accent: "rose",
        count: 2,
        label: "Fail verdicts"
      },
      {
        accent: "amber",
        count: 1,
        label: "Invalid-result verdicts"
      },
      {
        accent: "indigo",
        count: 2,
        label: "Runs outside verdict counts"
      }
    ]);
  });
});

describe("PortalShell benchmark ops routes", () => {
  it("renders the runs route as the shared portal index with an explicit loading state", async () => {
    const html = await renderPortalShell({
      email: "helper@paretoproof.local",
      roles: ["helper"],
      url: "http://127.0.0.1/runs?surface=portal&access=approved&roles=helper&email=helper%40paretoproof.local",
      width: 1280
    });

    expect(html).toContain(
      "Portal-owned benchmark run index and evidence trail for approved users, with run detail under /runs/:runId."
    );
    expect(html).toContain("Runs keeps search, export, and evidence drill-down on the portal.");
    expect(html).toContain("Loading run index.");
  });

  it("puts compact run context and one control surface ahead of the run slice", async () => {
    const html = await renderPortalShell({
      email: "helper@paretoproof.local",
      roles: ["helper"],
      url: "http://127.0.0.1/runs?surface=portal&access=approved&roles=helper&email=helper%40paretoproof.local",
      width: 320
    });

    expect(html).toContain("Runs keeps search, export, and evidence drill-down on the portal.");
    expect(html).toContain("Open one run&#x27;s evidence from the current slice.");
    expect(html).toContain("Slice controls");
    expect(html).toContain("Freshness");
    expect(html.indexOf("Runs keeps search, export, and evidence drill-down on the portal.")).toBeLessThan(
      html.indexOf("Open one run&#x27;s evidence from the current slice.")
    );
    expect(html.match(/>Search<\/span>/g)?.length ?? 0).toBe(1);
    expect(html).not.toContain("Current controls");
  });

  it("renders run detail as portal-owned evidence with next-route actions", async () => {
    const html = await renderPortalShell({
      email: "helper@paretoproof.local",
      roles: ["helper"],
      url: "http://127.0.0.1/runs/PP-318?surface=portal&access=approved&roles=helper&email=helper%40paretoproof.local",
      width: 1280
    });

    expect(html).toContain("Run evidence");
    expect(html).toContain("Loading run evidence.");
    expect(html).toContain("Stay inside the benchmark-ops cluster.");
  });

  it("renders launch as portal preflight instead of a deferred surface placeholder", async () => {
    const html = await renderPortalShell({
      email: "collab@paretoproof.local",
      roles: ["collaborator"],
      url: "http://127.0.0.1/launch?surface=portal&access=approved&roles=collaborator&email=collab%40paretoproof.local",
      width: 1280
    });

    expect(html).toContain(
      "Launch preflight for collaborators and admins, keeping benchmark selection, run shape, and governance review on the portal."
    );
    expect(html).toContain(
      "Launch keeps benchmark selection, run shape, and guardrails on the portal."
    );
    expect(html).toContain("Loading launch preflight.");
  });

  it("renders workers with a dedicated first-load state and lease-oriented follow-up copy", async () => {
    const html = await renderPortalShell({
      email: "collab@paretoproof.local",
      roles: ["collaborator"],
      url: "http://127.0.0.1/workers?surface=portal&access=approved&roles=collaborator&email=collab%40paretoproof.local",
      width: 1280
    });

    expect(html).toContain(
      "Worker operations view for queue pressure, lease health, and incident follow-up inside the same portal cluster."
    );
    expect(html).toContain("Workers tracks queue pressure, lease health, and incident anchors.");
    expect(html).toContain("Loading worker operations.");
  });
});
