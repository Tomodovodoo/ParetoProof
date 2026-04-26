import {
  type AccessProvider,
  type AuthenticatedSurface,
  type WebLocationLike,
  type WebSurface,
  isAuthenticatedSurface,
  isLocalDevelopmentLocation,
  productionAuthOrigin,
  productionMathOrigin,
  productionPortalOrigin,
  productionPublicOrigin,
  resolveAccessProviderFromHost,
  resolveAuthenticatedRouteTarget,
  resolveWebSurfaceFromLocation,
  sanitizeMathTargetPath,
  sanitizePortalTargetPath,
  sanitizePublicTargetPath
} from "@paretoproof/shared";
import { getApiBaseUrl } from "./api-base-url";

export type { AccessProvider, AuthenticatedSurface, WebSurface };

const localPortalStateParamKeys = ["access", "email"] as const;

function readBrowserLocation() {
  return window.location;
}

function readOptionalBrowserLocation() {
  return typeof window === "undefined" ? null : window.location;
}

function toLocationLike(locationLike: WebLocationLike | Location): WebLocationLike {
  return {
    hash: locationLike.hash ?? "",
    hostname: locationLike.hostname,
    origin: locationLike.origin,
    pathname: locationLike.pathname ?? "/",
    port: locationLike.port ?? "",
    protocol: locationLike.protocol ?? "",
    search: locationLike.search ?? ""
  };
}

export function isLocalHostname(hostname: string) {
  return isLocalDevelopmentLocation({
    hostname
  });
}

function isLocalOrigin(
  hostname = readBrowserLocation().hostname,
  currentLocation = readOptionalBrowserLocation()
) {
  if (currentLocation && hostname === currentLocation.hostname) {
    return isLocalDevelopmentLocation(toLocationLike(currentLocation));
  }

  return isLocalHostname(hostname);
}

function buildLocalPublicOrigin(
  locationLike: WebLocationLike | Location = readBrowserLocation()
) {
  const currentLocation = toLocationLike(locationLike);
  const { hostname, origin, port, protocol } = currentLocation;

  if (!origin || !isLocalDevelopmentLocation(currentLocation)) {
    return origin ?? productionPublicOrigin;
  }

  if (
    hostname === "auth.paretoproof.com" ||
    hostname === "github.auth.paretoproof.com" ||
    hostname === "google.auth.paretoproof.com" ||
    hostname === "portal.paretoproof.com" ||
    hostname === "math.paretoproof.com"
  ) {
    return `${protocol}//paretoproof.com${port ? `:${port}` : ""}`;
  }

  return origin;
}

function mapWebSurfaceToAuthenticatedSurface(
  surface: WebSurface
): AuthenticatedSurface | null {
  if (surface === "portal" || surface === "math") {
    return surface;
  }

  return null;
}

function mapAuthenticatedSurfaceToLabel(surface: AuthenticatedSurface) {
  return surface === "math" ? "math workspace" : "portal";
}

function readAuthenticatedSurfaceParam(search = readBrowserLocation().search) {
  const surface = new URLSearchParams(search).get("app");
  return isAuthenticatedSurface(surface) ? surface : null;
}

function resolvePreferredAuthenticatedSurface(hostname = readBrowserLocation().hostname) {
  return mapWebSurfaceToAuthenticatedSurface(resolveWebSurface(hostname)) ?? "portal";
}

export function resolveWebSurfaceFromUrl(
  locationLike: WebLocationLike | Location = readBrowserLocation()
): WebSurface {
  return resolveWebSurfaceFromLocation(toLocationLike(locationLike));
}

export function resolveWebSurface(hostname = readBrowserLocation().hostname): WebSurface {
  const currentLocation = readOptionalBrowserLocation();

  if (currentLocation && hostname === currentLocation.hostname) {
    return resolveWebSurfaceFromUrl(currentLocation);
  }

  return resolveWebSurfaceFromLocation({
    hostname,
    search: ""
  });
}

export function readAuthenticatedRedirectTarget(search = readBrowserLocation().search) {
  const params = new URLSearchParams(search);
  const targetSurface = readAuthenticatedSurfaceParam(search);

  return (
    resolveAuthenticatedRouteTarget(params.get("redirect") ?? "/", {
      preferredSurface: targetSurface ?? "portal",
      surface: targetSurface
    })?.targetPath ?? "/"
  );
}

export function readAuthenticatedRedirectSurface(search = readBrowserLocation().search) {
  const params = new URLSearchParams(search);
  const explicitSurface = readAuthenticatedSurfaceParam(search);

  return (
    resolveAuthenticatedRouteTarget(params.get("redirect") ?? "/", {
      preferredSurface: explicitSurface ?? "portal",
      surface: explicitSurface
    })?.surface ??
    explicitSurface ??
    "portal"
  );
}

export function readPortalRedirectTarget(search = readBrowserLocation().search) {
  return readAuthenticatedRedirectTarget(search);
}

function buildLocalSurfaceUrl(
  surface: Exclude<WebSurface, "public">,
  targetPath: string,
  authenticatedSurface: AuthenticatedSurface,
  currentLocation: WebLocationLike | Location = readBrowserLocation()
) {
  const currentLocationLike = toLocationLike(currentLocation);
  const origin = currentLocationLike.origin ?? productionPublicOrigin;

  if (surface === "portal" || surface === "math") {
    const surfaceUrl = new URL(
      surface === "portal"
        ? sanitizePortalTargetPath(targetPath)
        : sanitizeMathTargetPath(targetPath),
      origin
    );

    surfaceUrl.searchParams.set("surface", surface);
    copyLocalPortalState(surfaceUrl, currentLocationLike);
    return surfaceUrl.toString();
  }

  const surfaceUrl = new URL(origin);
  const normalizedTargetPath =
    authenticatedSurface === "math"
      ? sanitizeMathTargetPath(targetPath)
      : sanitizePortalTargetPath(targetPath);

  surfaceUrl.searchParams.set("surface", "auth");
  surfaceUrl.searchParams.set("app", authenticatedSurface);

  if (normalizedTargetPath !== "/") {
    surfaceUrl.searchParams.set("redirect", normalizedTargetPath);
  }

  return surfaceUrl.toString();
}

function shouldPreserveLocalPortalReason(
  targetUrl: URL,
  currentParams: URLSearchParams
) {
  if (currentParams.get("access") !== "denied") {
    return false;
  }

  return targetUrl.pathname === "/access-request" || targetUrl.pathname === "/denied";
}

function shouldPreserveLocalPortalRoles(currentParams: URLSearchParams) {
  return currentParams.get("access") === "approved";
}

export function copyLocalPortalState(
  targetUrl: URL,
  currentLocation: WebLocationLike | Location = readBrowserLocation()
) {
  const currentLocationLike = toLocationLike(currentLocation);

  if (!isLocalDevelopmentLocation(currentLocationLike)) {
    return;
  }

  const currentParams = new URLSearchParams(currentLocationLike.search ?? "");

  for (const key of localPortalStateParamKeys) {
    if (targetUrl.searchParams.has(key)) {
      continue;
    }
    const value = currentParams.get(key);

    if (value) {
      targetUrl.searchParams.set(key, value);
    }
  }

  if (
    !targetUrl.searchParams.has("role") &&
    shouldPreserveLocalPortalRoles(currentParams)
  ) {
    const role = currentParams.get("role");

    if (role) {
      targetUrl.searchParams.set("role", role);
    }
  }

  if (
    !targetUrl.searchParams.has("roles") &&
    shouldPreserveLocalPortalRoles(currentParams)
  ) {
    const roles = currentParams.get("roles");

    if (roles) {
      targetUrl.searchParams.set("roles", roles);
    }
  }

  if (
    !targetUrl.searchParams.has("reason") &&
    shouldPreserveLocalPortalReason(targetUrl, currentParams)
  ) {
    const reason = currentParams.get("reason");

    if (reason) {
      targetUrl.searchParams.set("reason", reason);
    }
  }
}

export function buildAuthUrl(
  targetPath = "/",
  hostname = readBrowserLocation().hostname,
  options?: {
    surface?: AuthenticatedSurface;
  }
) {
  const currentLocation = readOptionalBrowserLocation();
  const preferredSurface =
    options?.surface ?? resolvePreferredAuthenticatedSurface(hostname);
  const resolvedTarget =
    resolveAuthenticatedRouteTarget(targetPath, {
      preferredSurface,
      surface: options?.surface
    }) ?? {
      surface: preferredSurface,
      targetPath: "/"
    };

  if (currentLocation && isLocalOrigin(hostname, currentLocation)) {
    return buildLocalSurfaceUrl(
      "auth",
      resolvedTarget.targetPath,
      resolvedTarget.surface,
      currentLocation
    );
  }

  const authUrl = new URL(productionAuthOrigin);
  authUrl.searchParams.set("app", resolvedTarget.surface);

  if (resolvedTarget.targetPath !== "/") {
    authUrl.searchParams.set("redirect", resolvedTarget.targetPath);
  }

  return authUrl.toString();
}

export function buildAuthGuidanceUrl(
  targetPath = "/",
  hostname = readBrowserLocation().hostname,
  options?: {
    surface?: AuthenticatedSurface;
  }
) {
  const authUrl = new URL(buildAuthUrl(targetPath, hostname, options));
  authUrl.searchParams.set("guidance", "1");
  return authUrl.toString();
}

export function buildAccessRequestUrl(hostname = readBrowserLocation().hostname) {
  return buildAuthUrl("/access-request", hostname, {
    surface: "portal"
  });
}

export function buildPublicUrl(targetPath = "/", hostname = readBrowserLocation().hostname) {
  const currentLocation = readOptionalBrowserLocation();
  const normalizedTargetPath = sanitizePublicTargetPath(targetPath);

  if (currentLocation && isLocalOrigin(hostname, currentLocation)) {
    return new URL(
      normalizedTargetPath,
      buildLocalPublicOrigin(currentLocation)
    ).toString();
  }

  return new URL(normalizedTargetPath, productionPublicOrigin).toString();
}

export function buildPortalUrl(targetPath = "/", hostname = readBrowserLocation().hostname) {
  const currentLocation = readOptionalBrowserLocation();
  const normalizedTargetPath = sanitizePortalTargetPath(targetPath);

  if (currentLocation && isLocalOrigin(hostname, currentLocation)) {
    return buildLocalSurfaceUrl("portal", normalizedTargetPath, "portal", currentLocation);
  }

  return new URL(normalizedTargetPath, productionPortalOrigin).toString();
}

export function buildMathUrl(targetPath = "/", hostname = readBrowserLocation().hostname) {
  const currentLocation = readOptionalBrowserLocation();
  const normalizedTargetPath = sanitizeMathTargetPath(targetPath);

  if (currentLocation && isLocalOrigin(hostname, currentLocation)) {
    return buildLocalSurfaceUrl("math", normalizedTargetPath, "math", currentLocation);
  }

  return new URL(normalizedTargetPath, productionMathOrigin).toString();
}

export function buildAuthenticatedAppUrl(
  targetPath = "/",
  options?: {
    surface?: AuthenticatedSurface;
  },
  hostname = readBrowserLocation().hostname
) {
  const preferredSurface =
    options?.surface ?? resolvePreferredAuthenticatedSurface(hostname);
  const resolvedTarget =
    resolveAuthenticatedRouteTarget(targetPath, {
      preferredSurface,
      surface: options?.surface
    }) ?? {
      surface: preferredSurface,
      targetPath: "/"
    };

  return resolvedTarget.surface === "math"
    ? buildMathUrl(resolvedTarget.targetPath, hostname)
    : buildPortalUrl(resolvedTarget.targetPath, hostname);
}

export function buildAccessStartUrl(
  provider: AccessProvider,
  targetPath = "/",
  options?: {
    flow?: "sign_in" | "link";
    surface?: AuthenticatedSurface;
  },
  hostname = readBrowserLocation().hostname
) {
  const preferredSurface =
    options?.surface ?? resolvePreferredAuthenticatedSurface(hostname);
  const resolvedTarget =
    resolveAuthenticatedRouteTarget(targetPath, {
      preferredSurface,
      surface: options?.surface
    }) ?? {
      surface: preferredSurface,
      targetPath: "/"
    };

  const authUrl = new URL(`/api/access/start/${provider}`, productionAuthOrigin);
  authUrl.searchParams.set("app", resolvedTarget.surface);

  if (resolvedTarget.targetPath !== "/") {
    authUrl.searchParams.set("redirect", resolvedTarget.targetPath);
  }

  if (options?.flow === "link") {
    authUrl.searchParams.set("flow", "link");
  }

  return authUrl.toString();
}

export function buildLocalAuthPreviewUrl(
  targetPath = "/",
  options?: {
    surface?: AuthenticatedSurface;
  },
  hostname = readBrowserLocation().hostname
) {
  const currentLocation = readOptionalBrowserLocation();

  if (!currentLocation || !isLocalOrigin(hostname, currentLocation)) {
    return buildAuthenticatedAppUrl(targetPath, options, hostname);
  }

  const preferredSurface =
    options?.surface ?? resolvePreferredAuthenticatedSurface(hostname);
  const resolvedTarget =
    resolveAuthenticatedRouteTarget(targetPath, {
      preferredSurface,
      surface: options?.surface
    }) ?? {
      surface: preferredSurface,
      targetPath: "/"
    };
  const localUrl = new URL(
    buildAuthenticatedAppUrl(
      resolvedTarget.targetPath,
      {
        surface: resolvedTarget.surface
      },
      hostname
    )
  );
  const currentParams = new URLSearchParams(currentLocation.search);
  const approvedRole =
    currentParams.get("role") ??
    (currentParams.get("roles") ?? "")
      .split(",")
      .map((role) => role.trim())
      .find(Boolean) ??
    "helper";

  localUrl.searchParams.set("access", "approved");
  localUrl.searchParams.set("email", currentParams.get("email") ?? "local@example.com");
  localUrl.searchParams.set("role", approvedRole);
  localUrl.searchParams.delete("roles");
  localUrl.searchParams.delete("reason");
  return localUrl.toString();
}

export function buildAccessFinalizeUrl(
  targetPath = "/",
  options?: {
    surface?: AuthenticatedSurface;
  },
  hostname = readBrowserLocation().hostname
) {
  const currentLocation = readOptionalBrowserLocation();
  const preferredSurface =
    options?.surface ?? resolvePreferredAuthenticatedSurface(hostname);
  const resolvedTarget =
    resolveAuthenticatedRouteTarget(targetPath, {
      preferredSurface,
      surface: options?.surface
    }) ?? {
      surface: preferredSurface,
      targetPath: "/"
    };

  if (currentLocation && isLocalOrigin(hostname, currentLocation)) {
    const completionUrl = new URL(
      "/portal/session/finalize/submit",
      getApiBaseUrl({
        locationLike: currentLocation
      })
    );
    completionUrl.searchParams.set("app", resolvedTarget.surface);

    if (resolvedTarget.targetPath !== "/") {
      completionUrl.searchParams.set("redirect", resolvedTarget.targetPath);
    }

    return completionUrl.toString();
  }

  const completionUrl = new URL(
    "/api/access/finalize",
    currentLocation?.origin ?? productionAuthOrigin
  );
  completionUrl.searchParams.set("app", resolvedTarget.surface);

  if (resolvedTarget.targetPath !== "/") {
    completionUrl.searchParams.set("redirect", resolvedTarget.targetPath);
  }

  return completionUrl.toString();
}

export function resolveAccessProviderHost(
  hostname = readBrowserLocation().hostname
): AccessProvider | null {
  return resolveAccessProviderFromHost(hostname);
}

export function describeAuthenticatedSurface(surface: AuthenticatedSurface) {
  return mapAuthenticatedSurfaceToLabel(surface);
}

export function getCurrentRelativeUrl(location = readBrowserLocation()) {
  const params = new URLSearchParams(location.search);

  params.delete("surface");
  params.delete("access");
  params.delete("email");
  params.delete("role");
  params.delete("roles");
  params.delete("reason");

  const search = params.toString();
  const relativeUrl = `${location.pathname}${search ? `?${search}` : ""}${location.hash}`;

  return relativeUrl || "/";
}
