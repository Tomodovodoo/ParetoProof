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

type OverviewSurfaceRow = {
  entryHref: string;
  entryLabel: string;
  freshnessLabel: string;
  id: PortalSectionDefinition["id"];
  scopeLabel: string;
  sourceLabel: string;
  summary: string;
};

type PortalOverviewState =
  | { status: "loading" }
  | { data: PortalOverviewResponse; status: "ready" }
  | { message: string; status: "error" };

const portalRoutePathById = new Map<PortalRouteId, string>(
  appRouteAccessMatrix
    .filter((entry) => entry.surface === "portal")
    .map((entry) => [entry.id, entry.path] as [PortalRouteId, string])
);

export function mergeLocalPortalSearchParams(_currentSearch: string, nextSearch: string) {
  const nextParams = new URLSearchParams(nextSearch);
  const mergedSearch = nextParams.toString();
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

const defaultOverviewMetrics = [
  {
    label: "Live benchmark data",
    note: "Runs remains the API-backed source for benchmark evidence and exports.",
    value: "/runs"
  },
  {
    label: "Launch review",
    note: "Launch keeps run-shape and governance preflight inside the portal.",
    value: "/launch"
  },
  {
    label: "Worker operations",
    note: "Workers is the API-backed view for queue, lease, and incident posture.",
    value: "/workers"
  },
  {
    label: "Access and profile",
    note: "Admin and profile routes stay separate from benchmark operational views.",
    value: "portal"
  }
];

const localPreviewMetrics = [
  {
    label: "Runs route",
    note: "Local preview fixtures keep the run index and evidence layout visible on localhost.",
    value: "/runs"
  },
  {
    label: "Launch route",
    note: "Local preview fixtures keep benchmark and governance preflight screens reviewable.",
    value: "/launch"
  },
  {
    label: "Workers route",
    note: "Local preview fixtures keep queue, lease, and incident layouts visible without the API.",
    value: "/workers"
  },
  {
    label: "Access and profile",
    note: "Admin and profile routes are using browser-local demo state, not live records.",
    value: "preview"
  }
];

const defaultOverviewNotes = [
  {
    detail:
      "This overview intentionally avoids inventing live runs, incidents, or user posture. Use the deeper portal routes for API-backed state.",
    meta: "Portal",
    title: "Overview is route guidance"
  },
  {
    detail:
      "Runs, Launch, and Workers remain the benchmark-ops surfaces; access requests, users, and profile stay on their own routes.",
    meta: "Surface boundaries",
    title: "Operational state lives deeper"
  },
  {
    detail:
      "The header shows the signed-in identity and approved roles, while the route cards below point to the appropriate next step.",
    meta: "Account context",
    title: "Use the route cards"
  }
];

const localPreviewOverviewNotes = [
  {
    detail:
      "This localhost portal is rendering demo fixture content kept in browser storage. Treat all identities, runs, and incidents as examples rather than live operational facts.",
    meta: "Local preview",
    title: "Demo data only"
  },
  {
    detail:
      "The local admin and benchmark-ops panels keep schema-faithful example states so layout and transitions can be reviewed without the API.",
    meta: "Fixture posture",
    title: "Schema-faithful examples"
  },
  {
    detail:
      "When the backend is available, use the same routes to review API-backed runs, users, and worker state instead of these browser-local fixtures.",
    meta: "Route parity",
    title: "API-backed paths stay the same"
  }
];

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

function getOverviewSourceLabel(sectionId: PortalSectionDefinition["id"]) {
  if (sectionId === "profile" || sectionId === "overview") {
    return "Account";
  }

  if (sectionId === "access_requests" || sectionId === "users") {
    return "Admin";
  }

  return "Benchmark ops";
}

function getOverviewFreshnessLabel(routeId: PortalRouteId) {
  return getPortalLiveViewFreshness(routeId) ? "API-backed" : "Navigation";
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

export function getCompactOverviewSectionOrder() {
  return ["recentRuns", "metrics", "overviewLead", "actions"] as const;
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
  const overviewSurfaceRows = useMemo<OverviewSurfaceRow[]>(
    () =>
      sections
        .filter((section) => section.id !== "overview")
        .map((section) => {
          const entryHref = getSectionHref(section);

          return {
            entryHref,
            entryLabel: new URL(entryHref).pathname,
            freshnessLabel: getOverviewFreshnessLabel(section.routeId),
            id: section.id,
            scopeLabel: section.description,
            sourceLabel: getOverviewSourceLabel(section.id),
            summary: portalSectionBodyCopy[section.id]
          };
        }),
    [sections]
  );
  const overviewData = overviewState.status === "ready" ? overviewState.data : null;
  const overviewMetricsCopy = useMemo(
    () => [
      {
        label: "Benchmark packages",
        note: overviewData
          ? `${overviewData.benchmarkHighlights.length} highlighted package(s) on the landing view.`
          : "Loading benchmark coverage.",
        value: overviewData ? String(overviewData.summary.benchmarkPackageCount) : "-"
      },
      {
        label: "Active runs",
        note: overviewData
          ? `${overviewData.summary.failedRuns} failed run(s) in the current aggregate.`
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
    ],
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

    let cancelled = false;
    const intervalMs =
      activeFreshnessPolicy?.mode === "polling" ? activeFreshnessPolicy.pollIntervalMs : null;

    const loadOverview = async (backgroundRefresh: boolean) => {
      if (backgroundRefresh) {
        setOverviewRefreshing(true);
      } else {
        setOverviewState({ status: "loading" });
      }

      try {
        const nextOverview = await fetchPortalOverview();

        if (cancelled) {
          return;
        }

        setOverviewState({
          data: nextOverview,
          status: "ready"
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (!backgroundRefresh) {
          setOverviewState({
            message: formatPortalOverviewError(error),
            status: "error"
          });
        }
      } finally {
        if (!cancelled) {
          setOverviewRefreshing(false);
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
        <p>
          {overviewState.status === "error"
            ? overviewState.message
            : overviewState.status === "ready"
              ? "This landing view is backed by the same Railway/Neon read models as Runs, Workers, and Launch. Use it for current queue posture, recent run evidence, and incident follow-up."
              : "Loading the live portal overview from the same backend read models that power Runs, Workers, and Launch."}
        </p>
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
          )) : overviewState.status === "error" ? (
            <div className="portal-table-row" role="row">
              <span>Overview unavailable.</span>
              <span>{overviewState.message}</span>
              <span>-</span>
              <span>-</span>
              <span>-</span>
              <span>-</span>
            </div>
          ) : (
            <div className="portal-table-row" role="row">
              <span>Loading overview.</span>
              <span>Waiting for recent run evidence.</span>
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
                    recentRuns: overviewRecentRunsSection
                  };

                  return <Fragment key={sectionId}>{sections[sectionId]}</Fragment>;
                })
              : (
                  <>
                    {overviewMetricStrip}
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
