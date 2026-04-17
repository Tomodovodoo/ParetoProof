import {
  appRouteAccessMatrix,
  evaluationVerdictLabels,
  getPortalActionsForRoles,
  getPortalLiveViewFreshness,
  getPortalSectionsForRoles,
  getRunLifecycleStateLabel,
  type PortalActionDefinition,
  type PortalOverviewResponse,
  type PortalRole,
  type PortalRouteId,
  type PortalSectionDefinition
} from "@paretoproof/shared";
import { Fragment, useEffect, useMemo, useState } from "react";
import { AppIcon, type AppIconName } from "../components/app-icon";
import { PortalFreshnessCard } from "../components/portal-freshness-card";
import { fetchPortalOverview } from "../lib/portal-overview";
import { findMatchedPortalRoute } from "../lib/portal-route-access";
import { buildPortalUrl } from "../lib/surface";
import { PortalAccessRequestPanel } from "./portal-access-request-panel";
import { PortalAdminUsersPanel } from "./portal-admin-users-panel";
import { PortalBenchmarkOpsSurface } from "./portal-benchmark-ops-surfaces";
import { PortalProfilePanel } from "./portal-profile-panel";
import { useCompactLayout } from "../lib/use-compact-layout";

type PortalShellProps = {
  email: string | null;
  roles: string[];
};

type PortalNavGroup = {
  id: "account" | "benchmark_ops" | "admin";
  label: string;
  sections: PortalSectionDefinition[];
};

type PortalOverviewState =
  | { status: "loading" }
  | { data: PortalOverviewResponse; status: "ready" }
  | { message: string; status: "error" };

type PortalOverviewMetricCopy = {
  label: string;
  note: string;
  value: string;
};

type PortalOverviewRunPostureSegment = {
  accent: "amber" | "indigo" | "mint" | "rose";
  count: number;
  label: string;
  note: string;
};

type PortalOverviewBenchmarkVisualSegment = {
  accent: "amber" | "indigo" | "mint" | "rose";
  count: number;
  label: string;
};

const portalRoutePathById = new Map<PortalRouteId, string>(
  appRouteAccessMatrix
    .filter((entry) => entry.surface === "portal")
    .map((entry) => [entry.id, entry.path] as [PortalRouteId, string])
);

const localPortalStateParamKeys = ["surface", "access", "email", "role", "roles", "reason"] as const;

export function mergeLocalPortalSearchParams(currentSearch: string, nextSearch: string) {
  const preservedParams = new URLSearchParams();
  const currentParams = new URLSearchParams(currentSearch);
  const nextParams = new URLSearchParams(nextSearch);

  for (const key of localPortalStateParamKeys) {
    const value = currentParams.get(key);

    if (value && !nextParams.has(key)) {
      preservedParams.set(key, value);
    }
  }

  for (const [key, value] of nextParams.entries()) {
    preservedParams.set(key, value);
  }

  const mergedSearch = preservedParams.toString();
  return mergedSearch ? `?${mergedSearch}` : "";
}

const portalRoleOrder: PortalRole[] = ["admin", "collaborator", "helper"];
const portalSectionIconById: Record<PortalSectionDefinition["id"], AppIconName> = {
  access_requests: "key",
  launch: "play",
  overview: "grid",
  profile: "user",
  runs: "flask",
  users: "users",
  workers: "server"
};


const portalSectionBodyCopy: Record<PortalSectionDefinition["id"], string> = {
  access_requests:
    "Review and respond to contributor access requests.",
  launch:
    "Create a new benchmark run.",
  overview:
    "Your portal dashboard — check status, recent runs, and quick actions.",
  profile:
    "Manage your linked sign-in methods and profile details.",
  runs:
    "Browse all benchmark runs and their results.",
  users:
    "Manage contributor accounts and roles.",
  workers:
    "Monitor worker status and execution queues."
};

function coercePortalRoles(rawRoles: string[]): PortalRole[] {
  return portalRoleOrder.filter((role) => rawRoles.includes(role));
}

function getSectionHref(section: PortalSectionDefinition) {
  return buildPortalUrl(portalRoutePathById.get(section.routeId) ?? "/");
}

function readActiveRunId(pathname: string) {
  if (!pathname.startsWith("/runs/")) {
    return null;
  }

  try {
    return decodeURIComponent(pathname.slice("/runs/".length));
  } catch {
    return pathname.slice("/runs/".length);
  }
}

function getPortalNavGroups(sections: PortalSectionDefinition[]): PortalNavGroup[] {
  const accountSections = sections.filter(
    (section) => section.id === "overview" || section.id === "profile"
  );
  const benchmarkOpsSections = sections.filter(
    (section) =>
      section.id === "runs" || section.id === "launch" || section.id === "workers"
  );
  const adminSections = sections.filter(
    (section) => section.id === "access_requests" || section.id === "users"
  );

  return [
    {
      id: "account" as const,
      label: "Portal",
      sections: accountSections
    },
    {
      id: "benchmark_ops" as const,
      label: "Benchmark Ops",
      sections: benchmarkOpsSections
    },
    {
      id: "admin" as const,
      label: "Admin",
      sections: adminSections
    }
  ].filter((group) => group.sections.length > 0);
}

function resolveActiveSection(
  pathname: string,
  matchedRouteId: PortalRouteId | null,
  sections: PortalSectionDefinition[]
) {
  if (pathname.startsWith("/runs/")) {
    return sections.find((section) => section.id === "runs") ?? sections[0];
  }

  if (matchedRouteId) {
    return sections.find((section) => section.routeId === matchedRouteId) ?? sections[0];
  }

  return sections[0];
}

function formatPortalOverviewError(error: unknown) {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "The portal overview could not be loaded.";
}

function formatPortalOverviewTimestamp(value: string | null) {
  if (!value) {
    return "In progress";
  }

  return value.replace("T", " ").replace(".000Z", "Z");
}

export function buildOverviewMetricsCopy(
  overviewData: PortalOverviewResponse | null
): PortalOverviewMetricCopy[] {
  return [
    {
      label: "Total runs",
      note: overviewData
        ? overviewData.summary.totalRuns === 0
          ? "No benchmark runs have been recorded yet."
          : `${overviewData.summary.observedBenchmarkPackageCount} benchmark package(s) have recorded run history.`
        : "Loading run history.",
      value: overviewData ? String(overviewData.summary.totalRuns) : "-"
    },
    {
      label: "Active runs",
      note: overviewData
        ? `${overviewData.summary.failedRuns} failed run(s) recorded in the current aggregate.`
        : "Loading run posture.",
      value: overviewData ? String(overviewData.summary.activeRuns) : "-"
    },
    {
      label: "Queued jobs",
      note: overviewData
        ? `${overviewData.summary.queuedRuns} queued run(s), ${overviewData.summary.runningJobs} running job(s).`
        : "Loading queue posture.",
      value: overviewData ? String(overviewData.summary.queuedJobs) : "-"
    },
    {
      label: "Active leases",
      note: overviewData
        ? `${overviewData.summary.staleLeaseCount} stale lease(s), ${overviewData.recentIncidents.length} recent incident(s).`
        : "Loading worker lease posture.",
      value: overviewData ? String(overviewData.summary.activeLeases) : "-"
    }
  ];
}

export function describePortalOverviewLead(state: PortalOverviewState) {
  if (state.status === "error") {
    return state.message;
  }

  if (state.status === "ready") {
    return "This landing view is backed by the same portal API read models as Runs, Workers, and Launch. Use it for current queue posture, recent run evidence, and incident follow-up.";
  }

  return "Loading the live portal overview from the same portal API-backed read models that power Runs, Workers, and Launch.";
}

export function describePortalOverviewRecentRunsFallback(
  state: PortalOverviewState
): { detail: string; headline: string } {
  if (state.status === "error") {
    return {
      detail: state.message,
      headline: "Overview unavailable."
    };
  }

  if (state.status === "ready") {
    return {
      detail: "The synced backend has not produced any benchmark runs.",
      headline: "No runs recorded yet."
    };
  }

  return {
    detail: "Loading recent run history from the backend.",
    headline: "Loading overview."
  };
}

export function getCompactOverviewSectionOrder() {
  return ["recentRuns", "metrics", "visuals", "overviewLead", "actions"] as const;
}

export function createPortalOverviewPollController() {
  let requestInFlight = false;
  let requestVersion = 0;

  return {
    begin(backgroundRefresh: boolean) {
      if (backgroundRefresh && requestInFlight) {
        return null;
      }

      requestInFlight = true;
      requestVersion += 1;
      return requestVersion;
    },
    clear(requestToken: number) {
      if (requestToken !== requestVersion) {
        return false;
      }

      requestInFlight = false;
      return true;
    },
    isCurrent(requestToken: number) {
      return requestToken === requestVersion;
    }
  };
}

type PortalOverviewPollingHandlers = {
  fetchOverview: typeof fetchPortalOverview;
  intervalMs: number | null;
  onForegroundError(message: string): void;
  onLoadingStateChange(nextState: PortalOverviewState): void;
  onRefreshingChange(isRefreshing: boolean): void;
  onReady(data: PortalOverviewResponse): void;
};

export function startPortalOverviewPolling({
  fetchOverview,
  intervalMs,
  onForegroundError,
  onLoadingStateChange,
  onReady,
  onRefreshingChange
}: PortalOverviewPollingHandlers) {
  let cancelled = false;
  const controller = createPortalOverviewPollController();

  const loadOverview = async (backgroundRefresh: boolean) => {
    const requestToken = controller.begin(backgroundRefresh);

    if (requestToken === null) {
      return;
    }

    if (backgroundRefresh) {
      onRefreshingChange(true);
    } else {
      onLoadingStateChange({ status: "loading" });
    }

    try {
      const nextOverview = await fetchOverview();

      if (cancelled || !controller.isCurrent(requestToken)) {
        return;
      }

      onReady(nextOverview);
    } catch (error) {
      if (cancelled || !controller.isCurrent(requestToken)) {
        return;
      }

      if (!backgroundRefresh) {
        onForegroundError(formatPortalOverviewError(error));
      }
    } finally {
      if (!cancelled && controller.clear(requestToken)) {
        onRefreshingChange(false);
      }
    }
  };

  void loadOverview(false);

  if (!intervalMs) {
    return () => {
      cancelled = true;
    };
  }

  const intervalId = window.setInterval(() => {
    void loadOverview(true);
  }, intervalMs);

  return () => {
    cancelled = true;
    window.clearInterval(intervalId);
  };
}

export function buildOverviewRunPostureSegments(
  overviewData: PortalOverviewResponse | null
): PortalOverviewRunPostureSegment[] {
  if (!overviewData) {
    return [];
  }

  const otherTerminalRuns = Math.max(
    overviewData.summary.totalRuns -
      overviewData.summary.activeRuns -
      overviewData.summary.queuedRuns -
      overviewData.summary.failedRuns,
    0
  );

  return [
    {
      accent: "indigo",
      count: overviewData.summary.activeRuns,
      label: "Active runs",
      note: "Currently running or mid-flight."
    },
    {
      accent: "amber",
      count: overviewData.summary.queuedRuns,
      label: "Queued runs",
      note: "Accepted by the control plane but not started."
    },
    {
      accent: "rose",
      count: overviewData.summary.failedRuns,
      label: "Failed runs",
      note: "Terminal runs that ended in failure."
    },
    {
      accent: "mint",
      count: otherTerminalRuns,
      label: "Other recorded runs",
      note: "Runs not included in the active, queued, or failed summary slices."
    }
  ];
}

export function buildOverviewBenchmarkVisualSegments(
  benchmark: PortalOverviewResponse["benchmarkHighlights"][number]
): PortalOverviewBenchmarkVisualSegment[] {
  const terminalVerdictCount =
    benchmark.verdictCounts.pass +
    benchmark.verdictCounts.fail +
    benchmark.verdictCounts.invalid_result;
  const inFlightCount = Math.max(benchmark.runCount - terminalVerdictCount, 0);

  return [
    {
      accent: "mint",
      count: benchmark.verdictCounts.pass,
      label: "Pass verdicts"
    },
    {
      accent: "rose",
      count: benchmark.verdictCounts.fail,
      label: "Fail verdicts"
    },
    {
      accent: "amber",
      count: benchmark.verdictCounts.invalid_result,
      label: "Invalid-result verdicts"
    },
    {
      accent: "indigo",
      count: inFlightCount,
      label: "Runs outside verdict counts"
    }
  ];
}

export function PortalShell({ email, roles }: PortalShellProps) {
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const [overviewRefreshing, setOverviewRefreshing] = useState(false);
  const [overviewState, setOverviewState] = useState<PortalOverviewState>({
    status: "loading"
  });
  const compactLayout = useCompactLayout();
  const approvedRoles = useMemo(() => coercePortalRoles(roles), [roles]);
  const sections = useMemo(
    () => getPortalSectionsForRoles(approvedRoles),
    [approvedRoles]
  );
  const navGroups = useMemo(() => getPortalNavGroups(sections), [sections]);
  const helperOnlyView =
    approvedRoles.length === 1 && approvedRoles[0] === "helper";
  const overviewActions = useMemo(
    () => getPortalActionsForRoles(approvedRoles),
    [approvedRoles]
  );
  const visibleOverviewActions = useMemo(
    () => (helperOnlyView ? overviewActions.filter((action) => action.state === "enabled") : overviewActions),
    [helperOnlyView, overviewActions]
  );
  const [locationState, setLocationState] = useState(() => ({
    pathname: window.location.pathname,
    search: window.location.search
  }));
  const pathname = locationState.pathname;
  const search = locationState.search;
  const matchedPortalRoute = findMatchedPortalRoute(pathname);
  const activeRunId = readActiveRunId(pathname);
  const activeSection = useMemo(
    () => resolveActiveSection(pathname, matchedPortalRoute?.id ?? null, sections),
    [matchedPortalRoute, pathname, sections]
  );
  const benchmarkOpsRouteActive =
    activeSection?.id === "runs" ||
    activeSection?.id === "launch" ||
    activeSection?.id === "workers";
  const overviewRouteActive = activeSection?.id === "overview";
  const activeSectionHref = activeSection ? getSectionHref(activeSection) : "/";
  const activeRouteId: PortalRouteId =
    matchedPortalRoute?.id ?? activeSection?.routeId ?? "portal.home";
  const activeFreshnessPolicy = useMemo(
    () => getPortalLiveViewFreshness(activeRouteId),
    [activeRouteId]
  );
  const overviewData = overviewState.status === "ready" ? overviewState.data : null;
  const overviewTotalRuns = overviewData?.summary.totalRuns ?? 0;
  const overviewMetricsCopy = useMemo(() => buildOverviewMetricsCopy(overviewData), [overviewData]);
  const overviewRunPostureSegments = useMemo(
    () => buildOverviewRunPostureSegments(overviewData),
    [overviewData]
  );
  const overviewBenchmarkVisuals = useMemo(
    () =>
      overviewData?.benchmarkHighlights.slice(0, 3).map((benchmark) => ({
        benchmark,
        segments: buildOverviewBenchmarkVisualSegments(benchmark)
      })) ?? [],
    [overviewData]
  );

  useEffect(() => {
    if (matchedPortalRoute || pathname === activeSectionHref || pathname.startsWith("/runs/")) {
      return;
    }

    window.history.replaceState({}, "", activeSectionHref);
    setLocationState({
      pathname: new URL(activeSectionHref).pathname,
      search: new URL(activeSectionHref).search
    });
  }, [activeSectionHref, matchedPortalRoute, pathname]);

  useEffect(() => {
    const handlePopState = () => {
      setLocationState({
        pathname: window.location.pathname,
        search: window.location.search
      });
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    if (!overviewRouteActive) {
      return;
    }

    const intervalMs =
      activeFreshnessPolicy?.mode === "polling" ? activeFreshnessPolicy.pollIntervalMs : null;
    return startPortalOverviewPolling({
      fetchOverview: fetchPortalOverview,
      intervalMs,
      onForegroundError(message) {
        setOverviewState({
          message,
          status: "error"
        });
      },
      onLoadingStateChange(nextState) {
        setOverviewState(nextState);
      },
      onReady(data) {
        setOverviewState({
          data,
          status: "ready"
        });
      },
      onRefreshingChange(isRefreshing) {
        setOverviewRefreshing(isRefreshing);
      }
    });
  }, [
    activeFreshnessPolicy?.mode,
    activeFreshnessPolicy?.pollIntervalMs,
    overviewRouteActive
  ]);

  function replacePortalLocation(nextPathname: string, nextSearch: string) {
    const mergedSearch = mergeLocalPortalSearchParams(
      window.location.search,
      nextSearch
    );

    window.history.replaceState(
      {},
      "",
      `${nextPathname}${mergedSearch}`
    );
    setLocationState({
      pathname: nextPathname,
      search: mergedSearch
    });
  }

  const overviewActionRail = (
    <aside
      className={`portal-surface-rail${
        compactLayout ? " portal-overview-actions-compact" : ""
      }`}
    >
      <h2>Quick actions</h2>
      <div className="portal-action-list portal-action-list-compact">
        {visibleOverviewActions.map((action) => (
          <PortalActionRow action={action} key={action.id} />
        ))}
      </div>
    </aside>
  );
  const overviewMetricStrip = (
    <section className="portal-metric-strip" aria-label="Portal metrics">
      {overviewMetricsCopy.map((metric) => (
        <article className="portal-metric-cell" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          <small>{metric.note}</small>
        </article>
      ))}
    </section>
  );
  const overviewLeadSection = (
    <section className="portal-overview-grid">
      <article className="portal-panel portal-overview-lead">
        <p>{describePortalOverviewLead(overviewState)}</p>
        {activeFreshnessPolicy ? (
          <PortalFreshnessCard
            isRefreshing={overviewRefreshing}
            lastUpdatedAt={overviewData?.generatedAt ?? null}
            routeId={activeRouteId}
          />
        ) : null}
      </article>

      {!compactLayout ? overviewActionRail : null}
    </section>
  );
  const overviewVisualSection = (
    <section className="portal-overview-grid portal-overview-visual-grid">
      <article className="portal-panel portal-overview-visual-panel">
        <div className="portal-panel-header">
          <h2>Run posture</h2>
          <span className="role-chip role-chip-tonal">
            {overviewData ? `${overviewTotalRuns} total` : "Waiting for backend"}
          </span>
        </div>
        <p className="portal-panel-muted">
          Visual summary of the current overview payload. The slices below use only the landing
          summary counts already returned by <code>/portal/overview</code>.
        </p>
        {overviewState.status === "error" ? (
          <p className="portal-panel-muted">{overviewState.message}</p>
        ) : overviewState.status === "loading" ? (
          <p className="portal-panel-muted">Loading run posture from the backend.</p>
        ) : overviewTotalRuns === 0 ? (
          <p className="portal-panel-muted">
            No runs are recorded yet, so there is no run-state distribution to visualize.
          </p>
        ) : (
          <div className="portal-overview-visual-stack">
            <div className="portal-overview-track" aria-hidden="true">
              {overviewRunPostureSegments.map((segment) => (
                <span
                  className={`portal-overview-track-segment portal-overview-track-${segment.accent}`}
                  key={segment.label}
                  style={{
                    width: `${(segment.count / Math.max(overviewTotalRuns, 1)) * 100}%`
                  }}
                />
              ))}
            </div>
            <div className="portal-overview-visual-list" role="list" aria-label="Run posture">
              {overviewRunPostureSegments.map((segment) => (
                <article className="portal-overview-visual-row" key={segment.label} role="listitem">
                  <div className="portal-overview-visual-label">
                    <span
                      aria-hidden="true"
                      className={`portal-overview-swatch portal-overview-swatch-${segment.accent}`}
                    />
                    <div>
                      <strong>{segment.label}</strong>
                      <p>{segment.note}</p>
                    </div>
                  </div>
                  <strong className="portal-overview-visual-value">{segment.count}</strong>
                </article>
              ))}
            </div>
          </div>
        )}
      </article>

      <article className="portal-panel portal-overview-visual-panel">
        <div className="portal-panel-header">
          <h2>Benchmark activity</h2>
          <a className="button button-secondary" href={buildPortalUrl("/runs")}>
            Open runs
          </a>
        </div>
        <p className="portal-panel-muted">
          Top benchmark packages from the overview payload, with run counts and verdict posture.
        </p>
        {overviewState.status === "error" ? (
          <p className="portal-panel-muted">{overviewState.message}</p>
        ) : overviewState.status === "loading" ? (
          <p className="portal-panel-muted">Loading benchmark activity from the backend.</p>
        ) : overviewBenchmarkVisuals.length === 0 ? (
          <p className="portal-panel-muted">
            The backend has not observed benchmark activity yet, so there is nothing to compare.
          </p>
        ) : (
          <div className="portal-overview-benchmark-visuals" role="list" aria-label="Benchmark activity">
            {overviewBenchmarkVisuals.map(({ benchmark, segments }) => (
              <article
                className="portal-overview-benchmark-card"
                key={`${benchmark.benchmarkPackageId}:${benchmark.latestRunId ?? "none"}`}
                role="listitem"
              >
                <div className="portal-overview-benchmark-header">
                  <div>
                    <strong>{benchmark.benchmarkLabel}</strong>
                    <p>{benchmark.benchmarkPackageId}</p>
                  </div>
                  <span className="role-chip role-chip-tonal">{benchmark.runCount} run(s)</span>
                </div>
                <div className="portal-overview-track" aria-hidden="true">
                  {segments.map((segment) => (
                    <span
                      className={`portal-overview-track-segment portal-overview-track-${segment.accent}`}
                      key={segment.label}
                      style={{
                        width: `${(segment.count / Math.max(benchmark.runCount, 1)) * 100}%`
                      }}
                    />
                  ))}
                </div>
                <div className="portal-overview-benchmark-metadata">
                  <span>Latest completion {formatPortalOverviewTimestamp(benchmark.latestCompletedAt)}</span>
                  <span>{benchmark.versions.join(", ")}</span>
                </div>
                <div className="portal-overview-benchmark-segment-list">
                  {segments.map((segment) => (
                    <span className="portal-overview-benchmark-segment" key={segment.label}>
                      <span
                        aria-hidden="true"
                        className={`portal-overview-swatch portal-overview-swatch-${segment.accent}`}
                      />
                      {segment.label}: {segment.count}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </article>
    </section>
  );
  const overviewRecentRunsFallback = describePortalOverviewRecentRunsFallback(overviewState);
  const overviewRecentRunsSection = (
    <section className="portal-overview-grid portal-overview-grid-secondary">
      <article className="portal-panel-table-flat">
        <div className="portal-panel-header">
          <h2>Recent runs</h2>
          <a className="button button-secondary" href={buildPortalUrl("/runs")}>
            Open runs
          </a>
        </div>

        <div className="portal-table-shell" role="table" aria-label="Recent runs">
          <div className="portal-table-head" role="row">
            <span>Run</span>
            <span>Benchmark</span>
            <span>Model</span>
            <span>State</span>
            <span>Finished</span>
            <span>Verdict</span>
          </div>
          {overviewData?.recentRuns.length ? overviewData.recentRuns.map((run) => (
            <div className="portal-table-row" key={run.runId} role="row">
              <span>
                <a
                  className="portal-inline-link"
                  href={buildPortalUrl(`/runs/${encodeURIComponent(run.runId)}`)}
                >
                  {run.runId}
                </a>
              </span>
              <span>{run.benchmarkLabel}</span>
              <span>{run.modelConfigLabel}</span>
              <span>{getRunLifecycleStateLabel(run.runState)}</span>
              <span>{formatPortalOverviewTimestamp(run.completedAt)}</span>
              <span>
                {run.verdictClass ? evaluationVerdictLabels[run.verdictClass] : "In progress"}
              </span>
            </div>
          )) : (
            <div className="portal-table-row" role="row">
              <span>{overviewRecentRunsFallback.headline}</span>
              <span>{overviewRecentRunsFallback.detail}</span>
              <span>-</span>
              <span>-</span>
              <span>-</span>
              <span>-</span>
            </div>
          )}
        </div>
      </article>

      <aside className="portal-overview-timeline">
        <h2>Operational signals</h2>
        <div className="portal-timeline">
          {overviewData?.recentIncidents.length ? (
            overviewData.recentIncidents.map((incident) => (
              <article
                className="portal-timeline-item"
                key={`${incident.kind}:${incident.observedAt}:${incident.summary}`}
              >
                <strong>{incident.summary}</strong>
                <p>
                  {incident.workerPool
                    ? `Worker pool ${incident.workerPool}.`
                    : "Derived from the current worker and queue posture."}
                </p>
                <small>{incident.severity}</small>
              </article>
            ))
          ) : overviewData ? (
            <article className="portal-timeline-item">
              <strong>No current worker incidents</strong>
              <p>The current overview has no backlog, stale-lease, or clustered-failure incidents.</p>
              <small>Live backend state</small>
            </article>
          ) : overviewState.status === "error" ? (
            <article className="portal-timeline-item">
              <strong>Overview unavailable.</strong>
              <p>{overviewState.message}</p>
              <small>Portal home</small>
            </article>
          ) : (
            <article className="portal-timeline-item">
              <strong>Loading overview.</strong>
              <p>Fetching current worker incidents and benchmark highlights.</p>
              <small>Portal home</small>
            </article>
          )}
          {overviewData?.benchmarkHighlights.slice(0, 3).map((benchmark) => (
            <article
              className="portal-timeline-item"
              key={`${benchmark.benchmarkPackageId}:${benchmark.latestRunId ?? "none"}`}
            >
              <strong>{benchmark.benchmarkLabel}</strong>
              <p>
                {benchmark.runCount} run(s), latest completion{" "}
                {formatPortalOverviewTimestamp(benchmark.latestCompletedAt)}.
              </p>
              <small>{benchmark.benchmarkPackageId}</small>
            </article>
          ))}
        </div>
      </aside>
    </section>
  );

  return (
    <main
      className={`portal-shell${
        navigationCollapsed ? " portal-shell-collapsed" : ""
      }${
        overviewRouteActive ? " portal-shell-overview-active" : ""
      }${
        activeSection?.id === "profile" ? " portal-shell-profile-active" : ""
      }${
        benchmarkOpsRouteActive ? " portal-shell-benchmark-ops-active" : ""
      }`}
    >
      <aside
        aria-label="Portal navigation"
        className={`portal-sidebar${navigationCollapsed ? " portal-sidebar-collapsed" : ""}`}
      >
        <div className="portal-sidebar-header">
          <div className="portal-brand-block">
            <span className="portal-brand-mark" aria-hidden="true">
              <AppIcon name="spark" />
            </span>
            {!navigationCollapsed ? (
              <div>
                <p className="eyebrow">Portal</p>
                <h1>ParetoProof</h1>
                <p className="portal-brand-copy">
                  Formal benchmark operations and contributor tooling.
                </p>
              </div>
            ) : null}
          </div>
          <button
            aria-expanded={!navigationCollapsed}
            className="sidebar-toggle"
            onClick={() => {
              setNavigationCollapsed((collapsed) => !collapsed);
            }}
            type="button"
          >
            <span className="sidebar-toggle-icon" aria-hidden="true">
              <AppIcon name={navigationCollapsed ? "panel-right" : "panel-left"} />
            </span>
            <span className="sr-only">
              {navigationCollapsed ? "Expand navigation" : "Collapse navigation"}
            </span>
          </button>
        </div>

        <nav className="portal-nav">
          {navGroups.map((group) => (
            <div className="portal-nav-group" key={group.id}>
              {!navigationCollapsed ? (
                <p className="portal-nav-group-label">{group.label}</p>
              ) : null}
              {group.sections.map((section) => {
                const href = getSectionHref(section);
                const isActive = activeSection?.id === section.id;

                return (
                  <a
                    aria-current={isActive ? "page" : undefined}
                    className={`portal-nav-link${isActive ? " portal-nav-link-active" : ""}`}
                    href={href}
                    key={section.id}
                    title={section.navLabel}
                  >
                    <span className="portal-nav-link-icon" aria-hidden="true">
                      <AppIcon name={portalSectionIconById[section.id]} />
                    </span>
                    {!navigationCollapsed ? (
                      <span className="portal-nav-copy">
                        <span className="portal-nav-label">{section.navLabel}</span>
                        <span className="portal-nav-summary">{section.summary}</span>
                      </span>
                    ) : null}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        {!navigationCollapsed ? (
          <div className="portal-sidebar-footer">
            <p className="portal-sidebar-footer-label">Signed in</p>
            <p className="portal-sidebar-footer-value">
              {email ?? "Authenticated session"}
            </p>
          </div>
        ) : null}
      </aside>

      <section className="portal-main">
        <header className="portal-topbar">
          <div className="portal-topbar-left">
            <h1>{activeSection?.navLabel ?? "Portal"}</h1>
            <span className="portal-topbar-breadcrumb">
              {activeSection?.description ?? "Contributor and benchmark control surface."}
            </span>
          </div>
          <div className="portal-identity">
            <span className="role-chip">{email ?? "Signed in"}</span>
            {approvedRoles.map((role) => (
              <span className="role-chip role-chip-muted" key={role}>
                {role}
              </span>
            ))}
          </div>
        </header>

        {activeSection?.id === "overview" ? (
          <>
            {compactLayout
              ? getCompactOverviewSectionOrder().map((sectionId) => {
                  const sections = {
                    actions: overviewActionRail,
                    metrics: overviewMetricStrip,
                    overviewLead: overviewLeadSection,
                    recentRuns: overviewRecentRunsSection,
                    visuals: overviewVisualSection
                  };

                  return <Fragment key={sectionId}>{sections[sectionId]}</Fragment>;
                })
              : (
                  <>
                    {overviewMetricStrip}
                    {overviewVisualSection}
                    {overviewLeadSection}
                    {overviewRecentRunsSection}
                  </>
                )}
          </>
        ) : (
          <section className="portal-content">
            {activeSection?.id === "access_requests" ? (
              <PortalAccessRequestPanel email={email} />
            ) : activeSection?.id === "users" ? (
              <PortalAdminUsersPanel email={email} />
            ) : activeSection?.id === "profile" ? (
              <PortalProfilePanel email={email} />
            ) : activeSection?.id === "runs" ||
              activeSection?.id === "launch" ||
              activeSection?.id === "workers" ? (
              <PortalBenchmarkOpsSurface
                activeRouteId={activeRouteId}
                activeRunId={activeRunId}
                activeSectionId={activeSection.id}
                onReplaceLocation={replacePortalLocation}
                pathname={pathname}
                search={search}
              />
            ) : (
              <section className="portal-panel">
                <p>{activeSection?.summary}</p>
                <p className="portal-panel-muted">
                  Content will appear here once there is data to display.
                </p>
                {activeFreshnessPolicy ? (
                  <PortalFreshnessCard lastUpdatedAt={null} routeId={activeRouteId} />
                ) : null}
              </section>
            )}
          </section>
        )}
      </section>
    </main>
  );
}

type PortalActionRowProps = {
  action: PortalActionDefinition;
};

function PortalActionRow({ action }: PortalActionRowProps) {
  const href = buildPortalUrl(portalRoutePathById.get(action.routeId) ?? "/");

  return (
    <article className={`portal-action-card portal-action-${action.state}`}>
      <div>
        <p className="portal-action-title">{action.title}</p>
        <p className="portal-action-copy">{action.description}</p>
        {action.disabledReason ? (
          <p className="portal-action-hint">{action.disabledReason}</p>
        ) : null}
      </div>
      {action.state === "enabled" ? (
        <a className="button button-secondary" href={href}>
          Open
        </a>
      ) : (
        <span className="portal-action-badge">Unavailable</span>
      )}
    </article>
  );
}
