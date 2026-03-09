import {
  appRouteAccessMatrix,
  getPortalActionsForRoles,
  getPortalSectionsForRoles,
  type PortalActionDefinition,
  type PortalRole,
  type PortalSectionDefinition
} from "@paretoproof/shared";
import { useEffect, useMemo, useState } from "react";
import { findMatchedPortalRoute } from "../lib/portal-route-access";
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

const portalSectionBodyCopy: Record<PortalSectionDefinition["id"], string> = {
  access_requests:
    "This queue will hold contributor requests, approval notes, and the next decision actions for admins.",
  launch:
    "This launch view will become the benchmark entrypoint for collaborators and admins once the backend run flow is wired through.",
  overview:
    "This overview will surface benchmark health, recent activity, and the most important contributor actions first.",
  profile:
    "This profile view holds the signed-in contributor details the MVP already supports and the currently linked Access identities.",
  runs:
    "This section will list benchmark runs, queue status, and the route into deeper run detail pages.",
  users:
    "This surface will become the role and contributor directory once the admin management workflows are implemented.",
  workers:
    "This worker view will show queue posture, fleet health, and the execution surfaces that sit behind the control plane."
};

function coercePortalRoles(rawRoles: string[]): PortalRole[] {
  return portalRoleOrder.filter((role) => rawRoles.includes(role));
}

function getSectionHref(section: PortalSectionDefinition) {
  return portalRoutePathById.get(section.routeId) ?? "/";
}

function resolveActiveSection(
  pathname: string,
  sections: PortalSectionDefinition[]
) {
  if (pathname.startsWith("/runs/")) {
    return sections.find((section) => section.id === "runs") ?? sections[0];
  }

  return (
    sections.find((section) => getSectionHref(section) === pathname) ?? sections[0]
  );
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
  const activeSection = useMemo(
    () => resolveActiveSection(window.location.pathname, sections),
    [sections]
  );
  const activeSectionHref = activeSection ? getSectionHref(activeSection) : "/";
  const matchedPortalRoute = findMatchedPortalRoute(window.location.pathname);

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
          <div>
            <p className="eyebrow">Portal</p>
            {!navigationCollapsed ? <h1>ParetoProof</h1> : null}
          </div>
          <button
            aria-expanded={!navigationCollapsed}
            className="sidebar-toggle"
            onClick={() => {
              setNavigationCollapsed((collapsed) => !collapsed);
            }}
            type="button"
          >
            {navigationCollapsed ? "Expand" : "Collapse"}
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
                <span className="portal-nav-link-initial">
                  {section.navLabel.slice(0, 1)}
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
      </aside>

      <section className="portal-main">
        <header className="portal-topbar">
          <div>
            <p className="eyebrow">Authenticated portal</p>
            <h1>{activeSection?.navLabel ?? "Portal"}</h1>
          </div>
          <div className="portal-identity">
            <span className="role-chip">{email ?? "Signed in"}</span>
            {approvedRoles.map((role) => (
              <span className="role-chip" key={role}>
                {role}
              </span>
            ))}
          </div>
        </header>

        <section className="portal-panel portal-panel-hero">
          <p>{activeSection?.description}</p>
          <p className="portal-panel-muted">
            {activeSection ? portalSectionBodyCopy[activeSection.id] : ""}
          </p>
        </section>

        <section className="portal-grid">
          {activeSection?.id === "access_requests" ? (
            <PortalAccessRequestPanel email={email} />
          ) : activeSection?.id === "profile" ? (
            <PortalProfilePanel email={email} />
          ) : (
            <>
              <article className="portal-panel">
                <p className="eyebrow">Current section</p>
                <h2>{activeSection?.navLabel ?? "Portal section"}</h2>
                <p>{activeSection?.summary}</p>
              </article>
              <article className="portal-panel">
                <p className="eyebrow">Action gating</p>
                <h2>Role-aware controls</h2>
                <div className="portal-action-list">
                  {overviewActions.map((action) => (
                    <PortalActionCard action={action} key={action.id} />
                  ))}
                </div>
              </article>
            </>
          )}
        </section>
      </section>
    </main>
  );
}

type PortalActionCardProps = {
  action: PortalActionDefinition;
};

function PortalActionCard({ action }: PortalActionCardProps) {
  const href = portalRoutePathById.get(action.routeId) ?? "/";

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
