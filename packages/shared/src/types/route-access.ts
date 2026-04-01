export type AppSurface = "public_site" | "portal";

export type PublicRouteId = `public.${string}`;
export type PortalRouteId = `portal.${string}`;
export type AppRouteId = PublicRouteId | PortalRouteId;

export type AppRouteIdForSurface<TSurface extends AppSurface> =
  TSurface extends "portal" ? PortalRouteId : PublicRouteId;

export type RouteAccessLevel =
  | "public"
  | "portal_authenticated"
  | "access_request_required_only"
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

export type AppRouteMatrixEntry<TSurface extends AppSurface = AppSurface> = {
  access: RouteAccessLevel;
  host: string;
  id: AppRouteIdForSurface<TSurface>;
  path: string;
  redirectIfDenied: RouteRedirectTarget;
  surface: TSurface;
  summary: string;
};
