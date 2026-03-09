export type PortalRole = "admin" | "collaborator" | "helper";

export type PortalSectionId =
  | "overview"
  | "runs"
  | "launch"
  | "workers"
  | "access_requests"
  | "users";

export type PortalSectionVisibility =
  | "approved_helper_or_higher"
  | "approved_collaborator_or_higher"
  | "admin_only";

export type PortalSectionDefinition = {
  description: string;
  id: PortalSectionId;
  navLabel: string;
  routeId: string;
  summary: string;
  visibility: PortalSectionVisibility;
};
