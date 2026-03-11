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
    note: "2 pending review, 1 blocked",
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
    state: "passed",
    target: "mathlib4 / simplification"
  },
  {
    branch: "auth-fix",
    id: "PP-319",
    model: "claude",
    state: "running",
    target: "proof search / induction"
  },
  {
    branch: "railway-host",
    id: "PP-320",
    model: "gemini",
    state: "blocked",
    target: "worker smoke / queue handoff"
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
    "The approval queue, stale identity recovery, and decision notes need to stay calm and readable under real admin load.",
  launch:
    "Launch should become a checklist-driven control surface once benchmark execution is wired through the backend.",
  overview:
    "The default view should show benchmark posture, approval state, and recent operational movement in one scan.",
  profile:
    "Profile is where contributors confirm linked identities, edit the small supported fields, and recover broken auth state.",
  runs:
    "Runs should read like an audit log with dense but legible state instead of decorative tiles.",
  users:
    "This surface will grow into contributor and role management without forcing a shell redesign.",
  workers:
    "Worker posture belongs in the same serious shell even before orchestration is fully live."
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
            {approvedRoles.join(" · ") || "authenticated"}
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
              <article className="portal-panel portal-panel-emphasis">
                <p className="section-tag">Control plane overview</p>
                <h2>One stable canvas for auth, approvals, and benchmark posture.</h2>
                <p>
                  The shell should read like an operational workspace. Navigation stays
                  structural on the left, the content pane carries the dense information,
                  and the visual hierarchy comes from seams and typography rather than
                  oversized rounded cards.
                </p>
                {activeFreshnessPolicy ? (
                  <PortalFreshnessCard lastUpdatedAt={null} routeId={activeRouteId} />
                ) : null}
                <div className="portal-section-notes">
                  <ul className="portal-note-list">
                    <li>Keep recent runs, approval posture, and launch state visible in one pass.</li>
                    <li>Use symbols and labels in the rail instead of two-letter abbreviations.</li>
                    <li>Reserve strong color for state, not for every container.</li>
                  </ul>
                </div>
              </article>

              <aside className="portal-panel portal-surface-rail">
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
              <article className="portal-panel portal-panel-table">
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
                    <span>Status</span>
                  </div>
                  {overviewRuns.map((row) => (
                    <div className="portal-table-row" key={row.id} role="row">
                      <span>{row.id}</span>
                      <span>{row.model}</span>
                      <span>{row.target}</span>
                      <span>{row.branch}</span>
                      <span className={`portal-state-badge portal-state-${row.state}`}>
                        {row.state}
                      </span>
                    </div>
                  ))}
                </div>
              </article>

              <aside className="portal-panel">
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
                      This section already follows the shell, access rules, and freshness
                      model used across the portal.
                    </p>
                    <ul className="portal-note-list">
                      <li>Navigation and route access already reflect the approved role model.</li>
                      <li>Live data can fill this section without another shell rewrite.</li>
                      <li>The rail stays fixed while each deeper workflow grows independently.</li>
                    </ul>
                  </div>
                </article>
                <aside className="portal-panel portal-surface-rail">
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
