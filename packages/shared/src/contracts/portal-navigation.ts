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
      "Landing view for recently active runs, approval state, and high-level benchmark health.",
    id: "overview",
    navLabel: "Overview",
    routeId: "portal.home",
    summary: "Default portal dashboard for every approved portal user.",
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
      "Read-only run listings and detail links for approved helpers, collaborators, and admins.",
    id: "runs",
    navLabel: "Runs",
    routeId: "portal.runs",
    summary: "Shared run history and status surface.",
    visibility: "approved_helper_or_higher"
  },
  {
    description:
      "Run launch controls for benchmark execution once the caller is trusted to spend compute budget.",
    id: "launch",
    navLabel: "Launch",
    routeId: "portal.launch-run",
    summary: "Collaborator and admin run launch workflow.",
    visibility: "approved_collaborator_or_higher"
  },
  {
    description:
      "Worker fleet and queue posture for contributors who can operate benchmark execution.",
    id: "workers",
    navLabel: "Workers",
    routeId: "portal.workers",
    summary: "Collaborator and admin worker overview surface.",
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
