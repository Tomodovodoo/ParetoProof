import {
  appRouteAccessMatrix,
  getPortalSectionsForRoles,
  type PortalRole,
  type PortalSectionDefinition
} from "@paretoproof/shared";
import { useEffect, useMemo, useState } from "react";

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
  const activeSection = useMemo(
    () => resolveActiveSection(window.location.pathname, sections),
    [sections]
  );
  const activeSectionHref = activeSection ? getSectionHref(activeSection) : "/";

  useEffect(() => {
    const pathname = window.location.pathname;

    if (pathname === activeSectionHref || pathname.startsWith("/runs/")) {
      return;
    }

    window.history.replaceState({}, "", activeSectionHref);
  }, [activeSectionHref]);

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
          <article className="portal-panel">
            <p className="eyebrow">Current section</p>
            <h2>{activeSection?.navLabel ?? "Portal section"}</h2>
            <p>{activeSection?.summary}</p>
          </article>
          <article className="portal-panel">
            <p className="eyebrow">Why it exists</p>
            <h2>MVP placeholder</h2>
            <p>
              The layout, role gating, and path structure are now in place so
              the next issues can fill each surface without redefining the shell.
            </p>
          </article>
        </section>
      </section>
    </main>
  );
}
