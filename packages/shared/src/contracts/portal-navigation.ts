import type {
  PortalRole,
  PortalSectionDefinition,
  PortalSectionVisibility
} from "../types/portal-navigation.js";

const portalRoleRank: Record<PortalRole, number> = {
  admin: 3,
  collaborator: 2,
  helper: 1
};

const minimumRoleByVisibility: Record<PortalSectionVisibility, PortalRole> = {
  admin_only: "admin",
  approved_collaborator_or_higher: "collaborator",
  approved_helper_or_higher: "helper"
};

export const portalSectionDefinitions = [
  {
    description:
      "Portal landing summary for current run activity, service posture, and the next route in the benchmark-operations cluster.",
    id: "overview",
    navLabel: "Overview",
    routeId: "portal.home",
    summary: "Landing summary before deeper benchmark operations.",
    visibility: "approved_helper_or_higher"
  },
  {
    description:
      "Signed-in profile details, linked Access identities, and the supported contributor fields the portal already exposes.",
    id: "profile",
    navLabel: "Profile",
    routeId: "portal.profile",
    summary: "Profile details and linked sign-in methods for approved users.",
    visibility: "approved_helper_or_higher"
  },
  {
    description:
      "Portal-owned benchmark run index and evidence trail for approved users, with run detail under /runs/:runId.",
    id: "runs",
    navLabel: "Runs",
    routeId: "portal.runs",
    summary: "Shared benchmark run index and evidence trail for approved users.",
    visibility: "approved_helper_or_higher"
  },
  {
    description:
      "Launch preflight for collaborators and admins, keeping benchmark selection, run shape, and governance review on the portal.",
    id: "launch",
    navLabel: "Launch",
    routeId: "portal.launch-run",
    summary: "Benchmark selection, run-shape review, and launch preflight.",
    visibility: "approved_collaborator_or_higher"
  },
  {
    description:
      "Worker operations view for queue pressure, lease health, and incident follow-up inside the same portal cluster.",
    id: "workers",
    navLabel: "Workers",
    routeId: "portal.workers",
    summary: "Queue posture, leases, and incident follow-up for benchmark ops.",
    visibility: "approved_collaborator_or_higher"
  },
  {
    description:
      "Manual approval queue for pending contributor requests and related decision notes.",
    id: "access_requests",
    navLabel: "Access Requests",
    routeId: "portal.admin.access-requests",
    summary: "Admin-only contributor approval workspace.",
    visibility: "admin_only"
  },
  {
    description:
      "Role inspection and future contributor management surface for maintaining the portal population.",
    id: "users",
    navLabel: "Users",
    routeId: "portal.admin.users",
    summary: "Admin-only user and role management workspace.",
    visibility: "admin_only"
  }
] satisfies PortalSectionDefinition[];

export function canAccessPortalSection(
  section: PortalSectionDefinition,
  roles: PortalRole[]
) {
  const minimumRole = minimumRoleByVisibility[section.visibility];

  return roles.some((role) => portalRoleRank[role] >= portalRoleRank[minimumRole]);
}

export function getPortalSectionsForRoles(roles: PortalRole[]) {
  return portalSectionDefinitions.filter((section) => canAccessPortalSection(section, roles));
}
