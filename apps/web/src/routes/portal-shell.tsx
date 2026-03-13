import {
  appRouteAccessMatrix,
  getPortalActionsForRoles,
  getPortalLiveViewFreshness,
  getPortalSectionsForRoles,
  type EvaluationVerdictClass,
  type RunLifecycleState,
  type PortalActionDefinition,
  type PortalRole,
  type PortalSectionDefinition
} from "@paretoproof/shared";
import { useEffect, useMemo, useState } from "react";
import { AppIcon, type AppIconName } from "../components/app-icon";
import { PortalFreshnessCard } from "../components/portal-freshness-card";
import { findMatchedPortalRoute } from "../lib/portal-route-access";
import {
  buildPortalResultsQueryString,
  evaluationVerdictLabels,
  examplePortalResultsQueryState,
  portalResultsExportHeaders,
  portalResultsLifecycleBuckets,
  portalResultsSortOptions,
  runLifecycleStateLabels
} from "../lib/results-state";
import { buildPortalUrl } from "../lib/surface";
import { PortalAccessRequestPanel } from "./portal-access-request-panel";
import { PortalProfilePanel } from "./portal-profile-panel";

type PortalShellProps = {
  email: string | null;
  roles: string[];
};

type PortalNavGroup = {
  id: "account" | "benchmark_ops" | "admin";
  label: string;
  sections: PortalSectionDefinition[];
};

const portalRoutePathById = new Map(
  appRouteAccessMatrix.map((entry) => [entry.id, entry.path])
);

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

const overviewMetrics = [
  {
    label: "Approval state",
    note: "role-linked and current",
    value: "approved"
  },
  {
    label: "API health",
    note: "Railway to Neon responding",
    value: "green"
  },
  {
    label: "Recent runs",
    note: "2 active, 1 terminal failure",
    value: "08"
  },
  {
    label: "Identity links",
    note: "GitHub and Google attached",
    value: "02"
  }
];

const overviewRuns = [
  {
    branch: "main",
    id: "PP-318",
    model: "gpt-oss",
    runState: "succeeded" as RunLifecycleState,
    target: "mathlib4 / simplification",
    verdict: "pass" as EvaluationVerdictClass
  },
  {
    branch: "auth-fix",
    id: "PP-319",
    model: "claude",
    runState: "running" as RunLifecycleState,
    target: "proof search / induction",
    verdict: null
  },
  {
    branch: "railway-host",
    id: "PP-320",
    model: "gemini",
    runState: "failed" as RunLifecycleState,
    target: "worker smoke / queue handoff",
    verdict: "invalid_result" as EvaluationVerdictClass
  }
];

const overviewTimeline = [
  {
    detail:
      "A contributor linked GitHub and entered the portal without the Access handoff breaking.",
    meta: "11:24 UTC",
    title: "Access request approved"
  },
  {
    detail: "A stale Google-only identity needs relink confirmation before approval is restored.",
    meta: "09:10 UTC",
    title: "Recovery check required"
  },
  {
    detail: "Railway health and Neon connectivity both reported green after the last deploy.",
    meta: "07:42 UTC",
    title: "API host validation"
  }
];

const portalSectionBodyCopy: Record<PortalSectionDefinition["id"], string> = {
  access_requests:
    "Review contributor requests, resolve stale identities, and leave decision notes that other admins can trust.",
  launch:
    "Create benchmark execution intent here, then move into run detail once the run exists.",
  overview:
    "Use the landing summary to enter the benchmark-operations cluster without turning overview into a second run index.",
  profile:
    "Confirm your linked sign-in methods, update the supported profile fields, and recover access when something drifts.",
  runs:
    "Treat Runs as the canonical private index, then move into /runs/:runId for one run's evidence.",
  users:
    "Manage contributor accounts and roles from the same authenticated workspace.",
  workers:
    "Inspect worker and queue posture here, then jump back into run detail for concrete evidence."
};

function coercePortalRoles(rawRoles: string[]): PortalRole[] {
  return portalRoleOrder.filter((role) => rawRoles.includes(role));
}

function getSectionHref(section: PortalSectionDefinition) {
  return buildPortalUrl(portalRoutePathById.get(section.routeId) ?? "/");
}

function buildRunDetailHref(runId: string) {
  return buildPortalUrl(`/runs/${encodeURIComponent(runId)}`);
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
  matchedRouteId: string | null,
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

function formatRunLifecycleState(state: RunLifecycleState) {
  return runLifecycleStateLabels[state];
}

function formatVerdictClass(verdict: EvaluationVerdictClass | null) {
  return verdict ? evaluationVerdictLabels[verdict] : "Pending";
}

export function PortalShell({ email, roles }: PortalShellProps) {
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
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
  const pathname = window.location.pathname;
  const matchedPortalRoute = findMatchedPortalRoute(pathname);
  const activeRunId = pathname.startsWith("/runs/")
    ? decodeURIComponent(pathname.slice("/runs/".length))
    : null;
  const activeSection = useMemo(
    () => resolveActiveSection(pathname, matchedPortalRoute?.id ?? null, sections),
    [matchedPortalRoute, pathname, sections]
  );
  const activeSectionHref = activeSection ? getSectionHref(activeSection) : "/";
  const activeRouteId = matchedPortalRoute?.id ?? activeSection?.routeId ?? "portal.home";
  const activeFreshnessPolicy = useMemo(
    () => getPortalLiveViewFreshness(activeRouteId),
    [activeRouteId]
  );

  useEffect(() => {
    if (matchedPortalRoute || pathname === activeSectionHref || pathname.startsWith("/runs/")) {
      return;
    }

    window.history.replaceState({}, "", activeSectionHref);
  }, [activeSectionHref, matchedPortalRoute, pathname]);

  return (
    <main className="portal-shell">
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
          <div>
            <p className="eyebrow">
              <span className="inline-icon" aria-hidden="true">
                <AppIcon name="grid" />
              </span>
              Authenticated portal
            </p>
            <h1>{activeSection?.navLabel ?? "Portal"}</h1>
            <p className="portal-topbar-copy">
              {activeSection?.description ?? "Contributor and benchmark control surface."}
            </p>
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

        <section className="portal-status-strip">
          <p className="portal-status-copy">
            {activeSection ? portalSectionBodyCopy[activeSection.id] : ""}
          </p>
          <span className="role-chip role-chip-tonal">
            {approvedRoles.join(" / ") || "authenticated"}
          </span>
        </section>

        {activeSection?.id === "overview" ? (
          <>
            <section className="portal-metric-strip" aria-label="Portal metrics">
              {overviewMetrics.map((metric) => (
                <article className="portal-metric-cell" key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <small>{metric.note}</small>
                </article>
              ))}
            </section>

            <section className="portal-overview-grid">
              <article className="portal-panel portal-overview-lead">
                <p className="section-tag">Portal overview</p>
                <h2>Start from the current state of the portal.</h2>
                <p>
                  Overview is the landing summary for approved contributors. Use it to scan
                  service posture, spot active benchmark work, and move into Runs, Launch,
                  or Workers without treating this page like a second queue.
                </p>
                {activeFreshnessPolicy ? (
                  <PortalFreshnessCard lastUpdatedAt={null} routeId={activeRouteId} />
                ) : null}
                <div className="portal-section-notes">
                  <ul className="portal-note-list">
                    <li>Keep recent runs, approval posture, and service health visible in one pass.</li>
                    <li>Use Runs as the canonical private index and /runs/:runId as the evidence destination.</li>
                    <li>Keep Launch for new execution intent and Workers for execution posture only.</li>
                  </ul>
                </div>
              </article>

              <aside className="portal-surface-rail">
                <p className="section-tag">Role-aware controls</p>
                <h2>Next actions</h2>
                <div className="portal-action-list">
                  {visibleOverviewActions.map((action) => (
                    <PortalActionRow action={action} key={action.id} />
                  ))}
                </div>
              </aside>
            </section>

            <section className="portal-overview-grid portal-overview-grid-secondary">
              <article className="portal-panel-table-flat">
                <div className="portal-panel-header">
                  <div>
                    <p className="section-tag">Benchmark operations</p>
                    <h2>Recent runs route back into the canonical cluster.</h2>
                  </div>
                  <a className="button button-secondary" href={buildPortalUrl("/runs")}>
                    View all runs
                  </a>
                </div>

                <div className="portal-table-shell" role="table" aria-label="Recent runs">
                  <div className="portal-table-head" role="row">
                    <span>Run</span>
                    <span>Model</span>
                    <span>Target</span>
                    <span>Branch</span>
                    <span>Lifecycle</span>
                    <span>Verdict</span>
                  </div>
                  {overviewRuns.map((row) => (
                    <div className="portal-table-row" key={row.id} role="row">
                      <span>
                        <a className="portal-inline-link" href={buildRunDetailHref(row.id)}>
                          {row.id}
                        </a>
                      </span>
                      <span>{row.model}</span>
                      <span>{row.target}</span>
                      <span>{row.branch}</span>
                      <span className={`portal-state-badge portal-state-${row.runState}`}>
                        {formatRunLifecycleState(row.runState)}
                      </span>
                      <span
                        className={`portal-verdict-badge${
                          row.verdict ? ` portal-verdict-${row.verdict}` : ""
                        }`}
                      >
                        {formatVerdictClass(row.verdict)}
                      </span>
                    </div>
                  ))}
                </div>
              </article>

              <aside className="portal-overview-timeline">
                <p className="section-tag">Approvals</p>
                <h2>Identity and review timeline</h2>
                <div className="portal-timeline">
                  {overviewTimeline.map((item) => (
                    <article className="portal-timeline-item" key={item.title}>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                      <small>{item.meta}</small>
                    </article>
                  ))}
                </div>
              </aside>
            </section>
          </>
        ) : (
          <section className="portal-content">
            {activeSection?.id === "access_requests" ? (
              <PortalAccessRequestPanel email={email} />
            ) : activeSection?.id === "profile" ? (
              <PortalProfilePanel email={email} />
            ) : activeSection?.id === "runs" && activeRunId ? (
              <section className="portal-workspace-grid">
                <article className="portal-panel portal-surface-main">
                  <p className="section-tag">Canonical run detail</p>
                  <h2>{activeRunId} is routed through `/runs/:runId`.</h2>
                  <p>
                    This shell exists so one run has a stable evidence destination. Keep
                    cross-run filtering and history on `/runs`, and use this route for
                    timeline, attempt posture, failure details, artifacts, and rerun context.
                  </p>
                  {activeFreshnessPolicy ? (
                    <PortalFreshnessCard lastUpdatedAt={null} routeId={activeRouteId} />
                  ) : null}
                  <div className="portal-section-notes">
                    <ul className="portal-note-list">
                      <li>Use `/runs` for discovery and `/runs/:runId` for concrete evidence.</li>
                      <li>Run-specific control actions belong here once backend support arrives.</li>
                      <li>Launch and Workers should link into this detail route rather than duplicating it.</li>
                    </ul>
                  </div>
                </article>
                <aside className="portal-surface-rail">
                  <p className="section-tag">Route ownership</p>
                  <h2>Where to go next</h2>
                  <div className="portal-action-list">
                    <PortalActionRow
                      action={{
                        description: "Return to the canonical private run index and broader filtered slice.",
                        id: "review_runs",
                        routeId: "portal.runs",
                        state: "enabled",
                        title: "Back to Runs",
                        visibleTo: approvedRoles
                      }}
                    />
                  </div>
                </aside>
              </section>
            ) : activeSection?.id === "runs" ? (
              <section className="portal-grid portal-grid-stack">
                <article className="portal-panel portal-results-panel">
                  <div className="portal-panel-header">
                    <div>
                      <p className="section-tag">Canonical private index</p>
                      <h2>Runs is the shared benchmark-operations home for approved users.</h2>
                    </div>
                    <span className="role-chip role-chip-tonal">CSV only</span>
                  </div>
                  <p className="portal-panel-muted">
                    This route is the private index for benchmark runs. Keep filtering,
                    export state, and run discovery here, then move into `/runs/:runId`
                    for one run&apos;s evidence and control context.
                  </p>
                  <div className="portal-filter-grid">
                    {portalResultsLifecycleBuckets.map((bucket) => (
                      <article className="portal-filter-card" key={bucket.id}>
                        <strong>{bucket.label}</strong>
                        <p>{bucket.description}</p>
                        <div className="portal-filter-chip-row">
                          {bucket.runStates.map((state) => (
                            <span className="role-chip role-chip-muted" key={state}>
                              {state}
                            </span>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="portal-results-contract-grid">
                    <article className="portal-results-contract-card">
                      <p className="section-tag">Example query</p>
                      <h3>Shareable URL state</h3>
                      <code className="portal-code-block">
                        {`/runs?${buildPortalResultsQueryString(examplePortalResultsQueryState)}`}
                      </code>
                    </article>
                    <article className="portal-results-contract-card">
                      <p className="section-tag">Sort ids</p>
                      <h3>Deterministic ordering</h3>
                      <div className="portal-filter-chip-row">
                        {portalResultsSortOptions.map((option) => (
                          <span className="role-chip role-chip-muted" key={option.id}>
                            {option.id}
                          </span>
                        ))}
                      </div>
                    </article>
                    <article className="portal-results-contract-card">
                      <p className="section-tag">CSV headers</p>
                      <h3>Export field split</h3>
                      <code className="portal-code-block">
                        {portalResultsExportHeaders.join(",")}
                      </code>
                    </article>
                  </div>
                </article>

                <article className="portal-panel-table-flat">
                  <div className="portal-panel-header">
                    <div>
                      <p className="section-tag">Run slice</p>
                      <h2>Example rows route into canonical detail pages</h2>
                    </div>
                    <a className="button button-secondary" href={buildPortalUrl("/")}>
                      Back to overview
                    </a>
                  </div>
                  <div
                    className="portal-table-shell portal-results-table"
                    role="table"
                    aria-label="Canonical run-state examples"
                  >
                    <div className="portal-table-head" role="row">
                      <span>Run</span>
                      <span>Model</span>
                      <span>Target</span>
                      <span>Branch</span>
                      <span>Lifecycle</span>
                      <span>Verdict</span>
                    </div>
                    {overviewRuns.map((row) => (
                      <div className="portal-table-row" key={`${row.id}-runs`} role="row">
                        <span>
                          <a className="portal-inline-link" href={buildRunDetailHref(row.id)}>
                            {row.id}
                          </a>
                        </span>
                        <span>{row.model}</span>
                        <span>{row.target}</span>
                        <span>{row.branch}</span>
                        <span className={`portal-state-badge portal-state-${row.runState}`}>
                          {formatRunLifecycleState(row.runState)}
                        </span>
                        <span
                          className={`portal-verdict-badge${
                            row.verdict ? ` portal-verdict-${row.verdict}` : ""
                          }`}
                        >
                          {formatVerdictClass(row.verdict)}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              </section>
            ) : activeSection?.id === "launch" ? (
              <section className="portal-workspace-grid">
                <article className="portal-panel portal-surface-main">
                  <p className="section-tag">Create run intent</p>
                  <h2>Launch is the only top-level route for new benchmark execution.</h2>
                  <p>
                    Use this workspace to choose an approved benchmark version, pick a run
                    shape, review budget-sensitive settings, and create the queued run.
                    It should not become a second run history view or a benchmark-authoring page.
                  </p>
                  {activeFreshnessPolicy ? (
                    <PortalFreshnessCard lastUpdatedAt={null} routeId={activeRouteId} />
                  ) : null}
                  <div className="portal-section-notes">
                    <ul className="portal-note-list">
                      <li>Benchmark selection belongs inside launch, not on a separate math-input route.</li>
                      <li>Successful submit flows should route back into `/runs/:runId`.</li>
                      <li>Historical investigation stays in Runs, not here.</li>
                    </ul>
                  </div>
                </article>
                <aside className="portal-surface-rail">
                  <p className="section-tag">Cluster map</p>
                  <h2>Benchmark operations</h2>
                  <div className="portal-action-list">
                    {visibleOverviewActions.map((action) => (
                      <PortalActionRow action={action} key={action.id} />
                    ))}
                  </div>
                </aside>
              </section>
            ) : activeSection?.id === "workers" ? (
              <section className="portal-workspace-grid">
                <article className="portal-panel portal-surface-main">
                  <p className="section-tag">Execution posture</p>
                  <h2>Workers owns queue and worker health, not benchmark history.</h2>
                  <p>
                    Use this route to inspect worker availability, queue pressure, lease posture,
                    and execution incidents. When one run needs evidence, route back into
                    `/runs/:runId` instead of turning Workers into a second detail console.
                  </p>
                  {activeFreshnessPolicy ? (
                    <PortalFreshnessCard lastUpdatedAt={null} routeId={activeRouteId} />
                  ) : null}
                  <div className="portal-section-notes">
                    <ul className="portal-note-list">
                      <li>Worker posture is collaborator-plus operational context, not the canonical run table.</li>
                      <li>Use run detail for artifacts, failure evidence, and per-run control context.</li>
                      <li>Keep benchmark authoring and public reporting out of this route family.</li>
                    </ul>
                  </div>
                </article>
                <aside className="portal-surface-rail">
                  <p className="section-tag">Cluster map</p>
                  <h2>Benchmark operations</h2>
                  <div className="portal-action-list">
                    {visibleOverviewActions.map((action) => (
                      <PortalActionRow action={action} key={action.id} />
                    ))}
                  </div>
                </aside>
              </section>
            ) : (
              <section className="portal-workspace-grid">
                <article className="portal-panel portal-surface-main">
                  <p className="section-tag">Current section</p>
                  <h2>{activeSection?.navLabel ?? "Portal section"}</h2>
                  <p>{activeSection?.summary}</p>
                  {activeFreshnessPolicy ? (
                    <PortalFreshnessCard lastUpdatedAt={null} routeId={activeRouteId} />
                  ) : null}
                  <div className="portal-section-notes">
                    <p className="portal-panel-muted">
                      This section is ready for live data and task-specific workflows as
                      backend features come online.
                    </p>
                    <ul className="portal-note-list">
                      <li>Navigation and route access already follow the approved role model.</li>
                      <li>Live data can replace the placeholder content without a shell rewrite.</li>
                      <li>The rail stays fixed while each deeper workflow grows in place.</li>
                    </ul>
                  </div>
                </article>
                <aside className="portal-surface-rail">
                  <p className="section-tag">Available actions</p>
                  <h2>Role-aware controls</h2>
                  <div className="portal-action-list">
                    {visibleOverviewActions.map((action) => (
                      <PortalActionRow action={action} key={action.id} />
                    ))}
                  </div>
                </aside>
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
