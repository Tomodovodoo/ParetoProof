import {
  appRouteAccessMatrix,
  type AppRouteMatrixEntry,
  type RouteRedirectTarget
} from "@paretoproof/shared";
import { buildPublicUrl, isLocalHostname } from "./surface";

type PortalAccessStatus = "approved" | "denied" | "pending" | "unauthenticated";

type PortalRouteAccessContext = {
  pathname: string;
  reason?:
    | "access_request_required"
    | "identity_recovery_required"
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
    const value = currentParams.get(key);

    if (value) {
      redirectUrl.searchParams.set(key, value);
    }
  }

  return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
}

function resolveRedirectTarget(redirectTarget: RouteRedirectTarget) {
  if (redirectTarget === "portal_home") {
    return preserveLocalPortalState("/");
  }

  if (redirectTarget === "portal_pending") {
    return preserveLocalPortalState("/pending");
  }

  if (redirectTarget === "portal_denied") {
    return preserveLocalPortalState("/denied");
  }

  return buildPublicUrl("/");
}

function getLoopSafeFallbackTarget(context: PortalRouteAccessContext) {
  if (context.status === "pending") {
    return preserveLocalPortalState("/pending");
  }

  if (context.status === "approved") {
    return preserveLocalPortalState("/");
  }

  if (context.status === "denied") {
    return preserveLocalPortalState("/denied");
  }

  return buildPublicUrl("/");
}

export function findMatchedPortalRoute(pathname: string) {
  return findPortalRoute(pathname) ?? null;
}

export function resolvePortalRouteRedirect(context: PortalRouteAccessContext) {
  const matchedRoute = findPortalRoute(context.pathname);

  if (!matchedRoute || canAccessRoute(matchedRoute, context)) {
    return null;
  }

  const redirectTarget = resolveRedirectTarget(matchedRoute.redirectIfDenied);
  const redirectPathname = new URL(redirectTarget, window.location.origin).pathname;

  if (redirectPathname === context.pathname) {
    return getLoopSafeFallbackTarget(context);
  }

  return redirectTarget;
}
