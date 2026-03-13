import {
  appRouteAccessMatrix,
  getPortalActionsForRoles,
  getPortalLiveViewFreshness,
  getPortalSectionsForRoles,
  type PortalActionDefinition,
  type PortalRole,
  type PortalSectionDefinition
} from "@paretoproof/shared";
import { useEffect, useMemo, useState } from "react";
import { AppIcon, type AppIconName } from "../components/app-icon";
import { PortalFreshnessCard } from "../components/portal-freshness-card";
import {
  buildPortalResultsCsvPreview,
  getRunStateLabel,
  getVerdictLabel,
  portalResultsExportHeaders,
  portalResultsFilterPresets,
  portalRunResults,
  serializePortalResultsQuery,
  type PortalRunResultRow
} from "../lib/portal-results";
import { findMatchedPortalRoute } from "../lib/portal-route-access";
import { buildPortalUrl } from "../lib/surface";
import { PortalAccessRequestPanel } from "./portal-access-request-panel";
import { PortalProfilePanel } from "./portal-profile-panel";

type PortalShellProps = {
  email: string | null;
  roles: string[];
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
    note: "canonical lifecycle and verdict split",
    value: "08"
  },
  {
    label: "Identity links",
    note: "GitHub and Google attached",
    value: "02"
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
    "Launch benchmark runs from one controlled workflow once execution is wired into the backend.",
  overview:
    "See approval state, run activity, and service posture in one scan.",
  profile:
    "Confirm your linked sign-in methods, update the supported profile fields, and recover access when something drifts.",
  runs:
    "Browse recent and historical benchmark runs with enough detail to inspect status quickly.",
  users:
    "Manage contributor accounts and roles from the same authenticated workspace.",
  workers:
    "Track worker availability and execution posture once orchestration is live."
};

function coercePortalRoles(rawRoles: string[]): PortalRole[] {
  return portalRoleOrder.filter((role) => rawRoles.includes(role));
}

function getSectionHref(section: PortalSectionDefinition) {
  return buildPortalUrl(portalRoutePathById.get(section.routeId) ?? "/");
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

export function PortalShell({ email, roles }: PortalShellProps) {
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const approvedRoles = useMemo(() => coercePortalRoles(roles), [roles]);
  const sections = useMemo(
    () => getPortalSectionsForRoles(approvedRoles),
    [approvedRoles]
  );
  const overviewActions = useMemo(
    () => getPortalActionsForRoles(approvedRoles),
    [approvedRoles]
  );
  const matchedPortalRoute = findMatchedPortalRoute(window.location.pathname);
  const activeSection = useMemo(
    () =>
      resolveActiveSection(
        window.location.pathname,
        matchedPortalRoute?.id ?? null,
        sections
      ),
    [matchedPortalRoute, sections]
  );
  const activeSectionHref = activeSection ? getSectionHref(activeSection) : "/";
  const activeRouteId = matchedPortalRoute?.id ?? activeSection?.routeId ?? "portal.home";
  const activeFreshnessPolicy = useMemo(
    () => getPortalLiveViewFreshness(activeRouteId),
    [activeRouteId]
  );

  useEffect(() => {
    const pathname = window.location.pathname;

    if (matchedPortalRoute || pathname === activeSectionHref || pathname.startsWith("/runs/")) {
      return;
    }

    window.history.replaceState({}, "", activeSectionHref);
  }, [activeSectionHref, matchedPortalRoute]);

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
          {sections.map((section) => {
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
                  This landing view is where approved contributors should see service
                  health, recent benchmark activity, and approval posture without decoding
                  the system first.
                </p>
                {activeFreshnessPolicy ? (
                  <PortalFreshnessCard lastUpdatedAt={null} routeId={activeRouteId} />
                ) : null}
                <div className="portal-section-notes">
                  <ul className="portal-note-list">
                    <li>Keep recent runs, approval posture, and API state visible in one pass.</li>
                    <li>Make the next useful actions obvious for the current role.</li>
                    <li>Reserve strong color for state changes, not for every container.</li>
                  </ul>
                </div>
              </article>

              <aside className="portal-surface-rail">
                <p className="section-tag">Role-aware controls</p>
                <h2>Next actions</h2>
                <div className="portal-action-list">
                  {overviewActions.map((action) => (
                    <PortalActionRow action={action} key={action.id} />
                  ))}
                </div>
              </aside>
            </section>

            <section className="portal-overview-grid portal-overview-grid-secondary">
              <article className="portal-panel-table-flat">
                <div className="portal-panel-header">
                  <div>
                    <p className="section-tag">Run queue</p>
                    <h2>Recent benchmark activity</h2>
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
                  </div>
                  {portalRunResults.slice(0, 3).map((row) => (
                    <div className="portal-table-row" key={row.runId} role="row">
                      <span>{row.runId}</span>
                      <span>{row.modelLabel}</span>
                      <span>{row.target}</span>
                      <span>{row.branch}</span>
                      <span className={`portal-state-badge portal-state-${row.runState}`}>
                        {getRunStateLabel(row.runState)}
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
            ) : activeSection?.id === "runs" ? (
              <PortalRunsPanel />
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
                    {overviewActions.map((action) => (
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

const runSummaryMetrics = [
  {
    label: "Active",
    note: "running or cancel requested",
    value: String(
      portalRunResults.filter((row) => row.runLifecycleBucket === "active").length
    )
  },
  {
    label: "Completed",
    note: "succeeded lifecycle state",
    value: String(
      portalRunResults.filter((row) => row.runState === "succeeded").length
    )
  },
  {
    label: "Invalid results",
    note: "verdict kept separate from lifecycle",
    value: String(
      portalRunResults.filter((row) => row.verdictClass === "invalid_result").length
    )
  },
  {
    label: "CSV columns",
    note: "canonical export headers",
    value: String(portalResultsExportHeaders.length)
  }
];

function PortalRunsPanel() {
  const csvPreview = buildPortalResultsCsvPreview();

  return (
    <>
      <section className="portal-metric-strip" aria-label="Run result metrics">
        {runSummaryMetrics.map((metric) => (
          <article className="portal-metric-cell" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.note}</small>
          </article>
        ))}
      </section>

      <section className="portal-overview-grid portal-runs-grid">
        <article className="portal-panel portal-runs-main">
          <div className="portal-panel-header">
            <div>
              <p className="section-tag">Canonical result filters</p>
              <h2>Result state stays split across lifecycle, verdict, and export fields.</h2>
            </div>
            <span className="role-chip role-chip-tonal">
              URL state is the source of truth
            </span>
          </div>

          <p className="portal-panel-muted">
            The portal keeps `runState`, `jobState`, `attemptState`, and `verdictClass`
            distinct so filters, shared links, and CSV exports do not collapse control-plane
            lifecycle into mathematical outcome.
          </p>

          <div className="portal-filter-chip-row" aria-label="Run filter presets">
            {portalResultsFilterPresets.map((preset) => (
              <article className="portal-filter-chip" key={preset.id}>
                <strong>{preset.label}</strong>
                <span>{preset.description}</span>
                <code>{serializePortalResultsQuery(preset.queryState)}</code>
              </article>
            ))}
          </div>

          <div
            className="portal-table-shell portal-results-table"
            role="table"
            aria-label="Run results"
          >
            <div className="portal-results-head" role="row">
              <span>Run</span>
              <span>Model</span>
              <span>Lifecycle</span>
              <span>Verdict</span>
              <span>Rerun</span>
              <span>Failure</span>
            </div>
            {portalRunResults.map((row) => (
              <PortalRunResultRowView key={row.runId} row={row} />
            ))}
          </div>
        </article>

        <aside className="portal-surface-rail portal-runs-rail">
          <p className="section-tag">Export contract</p>
          <h2>Canonical query and CSV examples</h2>
          <div className="portal-code-block">
            <p className="portal-code-label">Preferred grouped-filter query</p>
            <code>{serializePortalResultsQuery(portalResultsFilterPresets[0].queryState)}</code>
          </div>
          <div className="portal-code-block">
            <p className="portal-code-label">CSV headers</p>
            <code>{portalResultsExportHeaders.join(", ")}</code>
          </div>
          <div className="portal-code-block">
            <p className="portal-code-label">CSV preview</p>
            <pre>{csvPreview}</pre>
          </div>
        </aside>
      </section>
    </>
  );
}

function PortalRunResultRowView({ row }: { row: PortalRunResultRow }) {
  return (
    <div className="portal-results-row" role="row">
      <span>{row.runId}</span>
      <span>{row.modelLabel}</span>
      <span className={`portal-state-badge portal-state-${row.runState}`}>
        {getRunStateLabel(row.runState)}
      </span>
      <span
        className={`portal-state-badge portal-verdict-badge${
          row.verdictClass ? ` portal-verdict-${row.verdictClass}` : " portal-verdict-pending"
        }`}
      >
        {getVerdictLabel(row.verdictClass)}
      </span>
      <span>{row.rerunLineage}</span>
      <span>{row.failureCode ?? "none"}</span>
    </div>
  );
}

