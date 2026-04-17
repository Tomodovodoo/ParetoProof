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
