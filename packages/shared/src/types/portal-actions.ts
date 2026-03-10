import type { PortalRole } from "./portal-navigation.js";

export type PortalActionId =
  | "review_runs"
  | "launch_benchmark"
  | "inspect_workers"
  | "review_access_requests"
  | "manage_users";

export type PortalActionState = "enabled" | "disabled";

export type PortalActionDefinition = {
  description: string;
  disabledReason?: string;
  id: PortalActionId;
  routeId: string;
  state: PortalActionState;
  title: string;
  visibleTo: PortalRole[];
};
