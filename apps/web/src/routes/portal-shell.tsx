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
const portalSectionCode: Record<PortalSectionDefinition["id"], string> = {
  access_requests: "AQ",
  launch: "LN",
  overview: "OV",
  profile: "PF",
  runs: "RN",
  users: "US",
  workers: "WK"
};

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
            <p className="eyebrow">Portal</p>
            {!navigationCollapsed ? (
              <>
                <h1>ParetoProof</h1>
                <p className="portal-brand-copy">
                  Formal benchmark operations and contributor tooling.
                </p>
              </>
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
            {navigationCollapsed ? ">>" : "<<"}
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
                <span className="portal-nav-link-initial">{portalSectionCode[section.id]}</span>
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
            <p className="eyebrow">Authenticated portal</p>
            <h1>{activeSection?.navLabel ?? "Portal"}</h1>
            <p className="portal-topbar-copy">
              {activeSection?.description ??
                "Contributor and benchmark control surface."}
            </p>
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

        <section className="portal-status-strip">
          <p className="portal-status-copy">
            {activeSection ? portalSectionBodyCopy[activeSection.id] : ""}
          </p>
          <span className="role-chip role-chip-muted">
            {approvedRoles.join(" · ") || "authenticated"}
          </span>
        </section>

        <section className="portal-content">
          {activeSection?.id === "access_requests" ? (
            <PortalAccessRequestPanel email={email} />
          ) : activeSection?.id === "profile" ? (
            <PortalProfilePanel email={email} />
          ) : (
            <section className="portal-workspace-grid">
              <article className="portal-panel portal-surface-main">
                <p className="eyebrow">Current section</p>
                <h2>{activeSection?.navLabel ?? "Portal section"}</h2>
                <p>{activeSection?.summary}</p>
                <div className="portal-section-notes">
                  <p className="portal-panel-muted">
                    This surface is structurally ready and can be filled in as backend
                    features land.
                  </p>
                  <ul className="portal-note-list">
                    <li>
                      Navigation and route access already reflect the approved role model.
                    </li>
                    <li>
                      Live data can replace these placeholders without redesigning the shell.
                    </li>
                    <li>
                      The left workspace rail stays stable while each section grows
                      independently.
                    </li>
                  </ul>
                </div>
              </article>
              <aside className="portal-panel portal-surface-rail">
                <p className="eyebrow">Available actions</p>
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
