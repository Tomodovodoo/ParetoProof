import {
  type AppRouteMatrixEntry,
  findAppRouteBySurface
} from "@paretoproof/shared";
import {
  buildMathUrl,
  buildPortalUrl,
  buildPublicUrl
} from "./surface";

type PortalAccessStatus = "approved" | "denied" | "pending" | "unauthenticated";
type AuthenticatedSurface = "portal" | "math";

type PortalRouteAccessContext = {
  pathname: string;
  search?: string;
  reason?:
    | "access_request_required"
    | "identity_recovery_required"
    | "insufficient_role"
    | "rejected_or_withdrawn"
    | "unknown_identity";
  roles: string[];
  status: PortalAccessStatus;
};

type SurfaceRouteAccessContext = PortalRouteAccessContext & {
  surface: AuthenticatedSurface;
};

function findSurfaceRoute<TSurface extends AuthenticatedSurface>(
  surface: TSurface,
  pathname: string
) {
  return findAppRouteBySurface(surface, pathname);
}

function hasRole(roles: string[], role: "admin" | "collaborator" | "helper") {
  return roles.includes(role);
}

function canAccessRoute(
  route: AppRouteMatrixEntry,
  context: PortalRouteAccessContext
) {
  if (route.access === "portal_authenticated") {
    return context.status !== "unauthenticated";
  }

  if (route.access === "access_request_required_only") {
    return (
      context.status === "denied" && context.reason === "access_request_required"
    );
  }

  if (route.access === "pending_only") {
    return context.status === "pending";
  }

  if (route.access === "denied_only") {
    return context.status === "denied";
  }

  if (route.access === "approved_helper_or_higher") {
    return (
      context.status === "approved" &&
      (hasRole(context.roles, "helper") ||
        hasRole(context.roles, "collaborator") ||
        hasRole(context.roles, "admin"))
    );
  }

  if (route.access === "approved_collaborator_or_higher") {
    return (
      context.status === "approved" &&
      (hasRole(context.roles, "collaborator") || hasRole(context.roles, "admin"))
    );
  }

  if (route.access === "admin_only") {
    return context.status === "approved" && hasRole(context.roles, "admin");
  }

  return true;
}

function stripRouteDeniedReason(search = "") {
  const params = new URLSearchParams(search);
  params.delete("reason");
  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : "";
}

function readRouteDeniedReason(
  search = window.location.search
): PortalRouteAccessContext["reason"] | undefined {
  const reason = new URLSearchParams(search).get("reason");

  if (
    reason === "access_request_required" ||
    reason === "identity_recovery_required" ||
    reason === "insufficient_role" ||
    reason === "rejected_or_withdrawn" ||
    reason === "unknown_identity"
  ) {
    return reason;
  }

  return undefined;
}

function normalizeSearch(search = "") {
  const params = new URLSearchParams(search);
  params.sort();
  const normalizedSearch = params.toString();
  return normalizedSearch ? `?${normalizedSearch}` : "";
}

function isCurrentRedirectTarget(
  targetPath: string,
  context: PortalRouteAccessContext
) {
  const targetUrl = new URL(targetPath, window.location.origin);
  return (
    targetUrl.origin === window.location.origin &&
    targetUrl.pathname === context.pathname &&
    normalizeSearch(targetUrl.search) === normalizeSearch(context.search ?? "")
  );
}

function buildCanonicalPortalStateTarget(context: PortalRouteAccessContext) {
  if (context.status === "pending") {
    return buildPortalUrl("/pending");
  }

  if (context.status === "denied") {
    return context.reason === "access_request_required"
      ? buildPortalUrl("/access-request")
      : buildPortalUrl("/denied");
  }

  return null;
}

function buildSurfaceHomeUrl(surface: AuthenticatedSurface) {
  return surface === "math" ? buildMathUrl("/") : buildPortalUrl("/");
}

function resolvePortalSurfaceRouteRedirect(context: PortalRouteAccessContext) {
  const matchedRoute = findSurfaceRoute("portal", context.pathname);
  const routeDeniedReason = readRouteDeniedReason(context.search);

  if (
    context.status === "approved" &&
    routeDeniedReason &&
    matchedRoute?.id !== "portal.denied"
  ) {
    return buildPortalUrl(`${context.pathname}${stripRouteDeniedReason(context.search)}`);
  }

  if (context.status === "approved" && matchedRoute?.id === "portal.pending") {
    return buildPortalUrl("/");
  }

  if (context.status === "approved" && matchedRoute?.id === "portal.access-request") {
    return buildPortalUrl("/");
  }

  if (context.status === "approved" && matchedRoute?.id === "portal.denied") {
    return routeDeniedReason === "insufficient_role" ? null : buildPortalUrl("/");
  }

  const canonicalStateTarget = buildCanonicalPortalStateTarget(context);

  if (canonicalStateTarget && !isCurrentRedirectTarget(canonicalStateTarget, context)) {
    return canonicalStateTarget;
  }

  if (!matchedRoute || canAccessRoute(matchedRoute, context)) {
    return null;
  }

  if (context.status === "approved") {
    return buildPortalUrl("/denied?reason=insufficient_role");
  }

  if (context.status === "pending") {
    return buildPortalUrl("/pending");
  }

  if (context.status === "denied") {
    return context.reason === "access_request_required"
      ? buildPortalUrl("/access-request")
      : buildPortalUrl("/denied");
  }

  return matchedRoute.redirectIfDenied === "public_home"
    ? buildPublicUrl("/")
    : buildPortalUrl("/");
}

export function findMatchedPortalRoute(pathname: string) {
  return findSurfaceRoute("portal", pathname) ?? null;
}

export function findMatchedSurfaceRoute(
  surface: AuthenticatedSurface,
  pathname: string
) {
  return findSurfaceRoute(surface, pathname) ?? null;
}

export function resolveSurfaceRouteRedirect(context: SurfaceRouteAccessContext) {
  if (context.surface === "portal") {
    return resolvePortalSurfaceRouteRedirect(context);
  }

  const matchedRoute = findSurfaceRoute("math", context.pathname);
  const canonicalPortalTarget = buildCanonicalPortalStateTarget(context);

  if (canonicalPortalTarget && !isCurrentRedirectTarget(canonicalPortalTarget, context)) {
    return canonicalPortalTarget;
  }

  if (!matchedRoute) {
    return context.status === "approved" ? buildSurfaceHomeUrl("math") : null;
  }

  if (canAccessRoute(matchedRoute, context)) {
    return null;
  }

  if (context.status === "approved") {
    return buildSurfaceHomeUrl("math");
  }

  if (context.status === "pending") {
    return buildPortalUrl("/pending");
  }

  if (context.status === "denied") {
    return context.reason === "access_request_required"
      ? buildPortalUrl("/access-request")
      : buildPortalUrl("/denied");
  }

  return matchedRoute.redirectIfDenied === "public_home"
    ? buildPublicUrl("/")
    : buildSurfaceHomeUrl("math");
}

export function resolvePortalRouteRedirect(context: PortalRouteAccessContext) {
  return resolveSurfaceRouteRedirect({
    ...context,
    surface: "portal"
  });
}
