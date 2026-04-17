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
      "runsSlice",
      "quickFilters",
      "resultsPanel",
      "supportPanel"
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
});
