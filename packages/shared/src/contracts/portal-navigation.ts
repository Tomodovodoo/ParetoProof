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
      "Canonical private run index for approved users, with run detail living under /runs/:runId.",
    id: "runs",
    navLabel: "Runs",
    routeId: "portal.runs",
    summary: "Primary benchmark-operations workspace for all approved users.",
    visibility: "approved_helper_or_higher"
  },
  {
    description:
      "Create-new-run workspace for collaborators and admins once benchmark execution is allowed.",
    id: "launch",
    navLabel: "Launch",
    routeId: "portal.launch-run",
    summary: "Benchmark execution intent and launch preflight.",
    visibility: "approved_collaborator_or_higher"
  },
  {
    description:
      "Execution operations view for worker, queue, and lease posture after runs have been launched.",
    id: "workers",
    navLabel: "Workers",
    routeId: "portal.workers",
    summary: "Execution capacity and worker-health workspace.",
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
