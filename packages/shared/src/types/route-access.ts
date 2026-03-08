export type AppSurface = "public_site" | "portal";

export type RouteAccessLevel =
  | "public"
  | "portal_authenticated"
  | "pending_only"
  | "denied_only"
  | "approved_helper_or_higher"
  | "approved_collaborator_or_higher"
  | "admin_only";

export type RouteRedirectTarget =
  | "public_home"
  | "portal_home"
  | "portal_pending"
  | "portal_denied";

export type AppRouteMatrixEntry = {
  access: RouteAccessLevel;
  host: string;
  id: string;
  path: string;
  redirectIfDenied: RouteRedirectTarget;
  surface: AppSurface;
  summary: string;
};
