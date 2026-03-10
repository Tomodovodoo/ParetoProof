import type { PortalActionDefinition, PortalActionId } from "../types/portal-actions.js";
import type { PortalRole } from "../types/portal-navigation.js";

type PortalActionBlueprint = {
  collaboratorState: PortalActionDefinition["state"];
  collaboratorVisible: boolean;
  description: string;
  disabledReason?: string;
  helperState: PortalActionDefinition["state"];
  helperVisible: boolean;
  id: PortalActionId;
  routeId: string;
  title: string;
};

const portalActionBlueprints = [
  {
    collaboratorState: "enabled",
    collaboratorVisible: true,
    description: "Open the shared run history and inspect existing benchmark executions.",
    helperState: "enabled",
    helperVisible: true,
    id: "review_runs",
    routeId: "portal.runs",
    title: "Review runs"
  },
  {
    collaboratorState: "enabled",
    collaboratorVisible: true,
    description: "Start a new benchmark run from the authenticated control plane.",
    disabledReason: "Only collaborators and admins can spend benchmark execution budget.",
    helperState: "disabled",
    helperVisible: true,
    id: "launch_benchmark",
    routeId: "portal.launch-run",
    title: "Launch benchmark"
  },
  {
    collaboratorState: "enabled",
    collaboratorVisible: true,
    description: "Inspect worker availability and execution posture once worker surfaces are live.",
    disabledReason: "Worker operations stay outside helper permissions in MVP.",
    helperState: "disabled",
    helperVisible: true,
    id: "inspect_workers",
    routeId: "portal.workers",
    title: "Inspect workers"
  },
  {
    collaboratorState: "disabled",
    collaboratorVisible: false,
    description: "Review and decide contributor access requests.",
    helperState: "disabled",
    helperVisible: false,
    id: "review_access_requests",
    routeId: "portal.admin.access-requests",
    title: "Review access requests"
  },
  {
    collaboratorState: "disabled",
    collaboratorVisible: false,
    description: "Inspect contributor roles and future user-management controls.",
    helperState: "disabled",
    helperVisible: false,
    id: "manage_users",
    routeId: "portal.admin.users",
    title: "Manage users"
  }
] satisfies PortalActionBlueprint[];

function resolveNonAdminAction(
  blueprint: PortalActionBlueprint,
  role: Exclude<PortalRole, "admin">
) {
  const visible = role === "collaborator"
    ? blueprint.collaboratorVisible
    : blueprint.helperVisible;

  if (!visible) {
    return null;
  }

  return {
    description: blueprint.description,
    disabledReason:
      (role === "collaborator" ? blueprint.collaboratorState : blueprint.helperState) ===
      "disabled"
        ? blueprint.disabledReason
        : undefined,
    id: blueprint.id,
    routeId: blueprint.routeId,
    state: role === "collaborator" ? blueprint.collaboratorState : blueprint.helperState,
    title: blueprint.title,
    visibleTo: [role]
  } satisfies PortalActionDefinition;
}

export function getPortalActionsForRoles(roles: PortalRole[]) {
  if (roles.includes("admin")) {
    return portalActionBlueprints.map((blueprint) => ({
      description: blueprint.description,
      id: blueprint.id,
      routeId: blueprint.routeId,
      state: "enabled",
      title: blueprint.title,
      visibleTo: ["admin"]
    } satisfies PortalActionDefinition));
  }

  if (roles.includes("collaborator")) {
    return portalActionBlueprints
      .map((blueprint) => resolveNonAdminAction(blueprint, "collaborator"))
      .filter((action) => action !== null);
  }

  return portalActionBlueprints
    .map((blueprint) => resolveNonAdminAction(blueprint, "helper"))
    .filter((action) => action !== null);
}
