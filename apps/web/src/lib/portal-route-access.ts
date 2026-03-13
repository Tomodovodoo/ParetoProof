import {
  appRouteAccessMatrix,
  type AppRouteMatrixEntry,
  type RouteRedirectTarget
} from "@paretoproof/shared";
import { buildPublicUrl, isLocalHostname } from "./surface";

type PortalAccessStatus = "approved" | "denied" | "pending" | "unauthenticated";

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

function matchesRoutePath(routePath: string, pathname: string) {
  if (routePath === pathname) {
    return true;
  }

  const routeSegments = routePath.split("/").filter(Boolean);
  const pathSegments = pathname.split("/").filter(Boolean);

  if (routeSegments.length !== pathSegments.length) {
    return false;
  }

  return routeSegments.every((segment, index) => {
    if (segment.startsWith(":")) {
      return pathSegments[index].length > 0;
    }

    return segment === pathSegments[index];
  });
}

function findPortalRoute(pathname: string) {
  return appRouteAccessMatrix.find(
    (entry) => entry.surface === "portal" && matchesRoutePath(entry.path, pathname)
  );
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

function preserveLocalPortalState(targetPath: string, location = window.location) {
  if (!isLocalHostname(location.hostname)) {
    return targetPath;
  }

  const redirectUrl = new URL(targetPath, location.origin);
  const currentParams = new URLSearchParams(location.search);

  for (const key of ["surface", "access", "email", "reason", "roles"]) {
    if (redirectUrl.searchParams.has(key)) {
      continue;
    }
    const value = currentParams.get(key);

    if (value) {
      redirectUrl.searchParams.set(key, value);
    }
  }

  return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
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

function isCurrentRedirectTarget(
  targetPath: string,
  context: PortalRouteAccessContext
) {
  const targetUrl = new URL(targetPath, window.location.origin);
  return (
    targetUrl.pathname === context.pathname &&
    targetUrl.search === (context.search ?? "")
  );
}

function resolveCanonicalStateTarget(context: PortalRouteAccessContext) {
  if (context.status === "pending") {
    return preserveLocalPortalState("/pending");
  }

  if (context.status === "denied") {
    return context.reason === "access_request_required"
      ? preserveLocalPortalState("/access-request")
      : preserveLocalPortalState("/denied");
  }

  return null;
}

export function findMatchedPortalRoute(pathname: string) {
  return findPortalRoute(pathname) ?? null;
}

export function resolvePortalRouteRedirect(context: PortalRouteAccessContext) {
  const matchedRoute = findPortalRoute(context.pathname);
  const routeDeniedReason = readRouteDeniedReason(context.search);

  if (context.status === "approved" && matchedRoute?.id === "portal.pending") {
    return preserveLocalPortalState("/");
  }

  if (context.status === "approved" && matchedRoute?.id === "portal.access-request") {
    return preserveLocalPortalState("/");
  }

  if (context.status === "approved" && matchedRoute?.id === "portal.denied") {
    return routeDeniedReason === "insufficient_role"
      ? null
      : preserveLocalPortalState("/");
  }

  const canonicalStateTarget = resolveCanonicalStateTarget(context);

  if (canonicalStateTarget && !isCurrentRedirectTarget(canonicalStateTarget, context)) {
    return canonicalStateTarget;
  }

  if (!matchedRoute || canAccessRoute(matchedRoute, context)) {
    return null;
  }

  if (context.status === "approved") {
    return preserveLocalPortalState("/denied?reason=insufficient_role");
  }

  if (context.status === "pending") {
    return preserveLocalPortalState("/pending");
  }

  if (context.status === "denied") {
    return context.reason === "access_request_required"
      ? preserveLocalPortalState("/access-request")
      : preserveLocalPortalState("/denied");
  }

  return matchedRoute.redirectIfDenied === "public_home"
    ? buildPublicUrl("/")
    : preserveLocalPortalState("/");
}
