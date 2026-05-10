import { findAppRouteBySurface } from "@paretoproof/shared";
import {
  isLocalDevelopmentLocation,
  paretoProofSurfaceHosts,
  productionWebOrigins,
  resolveAuthStartOrigin,
  resolvePublicOrigin,
  stripSyntheticLocalAuthParams
} from "./local-development";

export type WebSurface = "public" | "auth" | "portal" | "math";
export type AuthenticatedSurface = "portal" | "math";
export type AccessProvider = "github" | "google";

const authenticatedSurfaces = ["portal", "math"] as const;
const productionOriginByAuthenticatedSurface: Record<AuthenticatedSurface, string> = {
  math: productionWebOrigins.math,
  portal: productionWebOrigins.portal
};

type OwnedAppSurface = "public_site" | AuthenticatedSurface;
type ResolvedOwnedTarget<TSurface extends OwnedAppSurface = OwnedAppSurface> = {
  surface: TSurface;
  targetPath: string;
};

function readLocalSurfaceOverride(search = window.location.search) {
  const params = new URLSearchParams(search);
  const surface = params.get("surface");

  return surface === "public" ||
    surface === "auth" ||
    surface === "portal" ||
    surface === "math"
    ? surface
    : null;
}

export function isLocalHostname(hostname: string) {
  return isLocalDevelopmentLocation({
    hostname,
    port: window.location.port,
    protocol: window.location.protocol
  });
}

function isLocalOrigin(hostname = window.location.hostname) {
  return isLocalHostname(hostname);
}

function buildLocalPublicOrigin(locationLike = window.location) {
  return resolvePublicOrigin(locationLike);
}

function isAuthenticatedSurface(surface: string | null): surface is AuthenticatedSurface {
  return surface === "portal" || surface === "math";
}

function mapAuthenticatedSurfaceToOrigin(surface: AuthenticatedSurface) {
  return productionOriginByAuthenticatedSurface[surface];
}

function mapAuthenticatedSurfaceToLabel(surface: AuthenticatedSurface) {
  return surface === "math" ? "math workspace" : "portal";
}

function mapWebSurfaceToAuthenticatedSurface(
  surface: WebSurface
): AuthenticatedSurface | null {
  if (surface === "portal" || surface === "math") {
    return surface;
  }

  return null;
}

function readAuthenticatedSurfaceParam(search = window.location.search) {
  const surface = new URLSearchParams(search).get("app");
  return isAuthenticatedSurface(surface) ? surface : null;
}

function resolvePreferredAuthenticatedSurface(hostname = window.location.hostname) {
  return mapWebSurfaceToAuthenticatedSurface(resolveWebSurface(hostname)) ?? "portal";
}

export function resolveWebSurfaceFromUrl(
  locationLike: Pick<Location, "hostname" | "search"> | URL = window.location
): WebSurface {
  const { hostname, search } = locationLike;

  if (
    hostname === paretoProofSurfaceHosts.auth ||
    hostname === paretoProofSurfaceHosts.githubAuth ||
    hostname === paretoProofSurfaceHosts.googleAuth
  ) {
    return "auth";
  }

  if (hostname === paretoProofSurfaceHosts.portal) {
    return "portal";
  }

  if (hostname === paretoProofSurfaceHosts.math) {
    return "math";
  }

  if (isLocalHostname(hostname)) {
    return readLocalSurfaceOverride(search) ?? "public";
  }

  return "public";
}

export function resolveWebSurface(hostname = window.location.hostname): WebSurface {
  if (hostname === window.location.hostname) {
    return resolveWebSurfaceFromUrl(window.location);
  }

  return resolveWebSurfaceFromUrl({
    hostname,
    search: ""
  });
}

function normalizeTargetPath(targetPath: string) {
  if (!targetPath || targetPath === "/") {
    return "/";
  }

  return targetPath.startsWith("/") ? targetPath : `/${targetPath}`;
}

function tryResolveRelativeTarget(
  targetPath: string,
  allowedSurfaces: OwnedAppSurface[],
  preferredSurface: OwnedAppSurface
): ResolvedOwnedTarget | null {
  try {
    const candidateUrl = new URL(
      normalizeTargetPath(targetPath),
      mapOwnedSurfaceToOrigin(preferredSurface)
    );
    const matchingSurface =
      allowedSurfaces.find(
        (surface) =>
          surface === preferredSurface &&
          findAppRouteBySurface(surface, candidateUrl.pathname)
      ) ??
      allowedSurfaces.find((surface) =>
        findAppRouteBySurface(surface, candidateUrl.pathname)
      );

    if (!matchingSurface) {
      return null;
    }

    return {
      surface: matchingSurface,
      targetPath: `${candidateUrl.pathname}${candidateUrl.search}${candidateUrl.hash}` || "/"
    };
  } catch {
    return null;
  }
}

function mapOwnedSurfaceToOrigin(surface: OwnedAppSurface) {
  if (surface === "public_site") {
    return productionWebOrigins.public;
  }

  return mapAuthenticatedSurfaceToOrigin(surface);
}

function tryResolveAbsoluteTarget(
  targetPath: string,
  allowedSurfaces: OwnedAppSurface[]
): ResolvedOwnedTarget | null {
  let candidateUrl: URL;

  try {
    candidateUrl = new URL(targetPath);
  } catch {
    return null;
  }

  const matchingSurface = allowedSurfaces.find((surface) => {
    if (candidateUrl.origin !== mapOwnedSurfaceToOrigin(surface)) {
      return false;
    }

    return findAppRouteBySurface(surface, candidateUrl.pathname);
  });

  if (!matchingSurface) {
    return null;
  }

  return {
    surface: matchingSurface,
    targetPath: `${candidateUrl.pathname}${candidateUrl.search}${candidateUrl.hash}` || "/"
  };
}

function resolveOwnedTarget(
  targetPath: string,
  options: {
    allowedSurfaces: OwnedAppSurface[];
    preferredSurface: OwnedAppSurface;
  }
): ResolvedOwnedTarget | null {
  if (!targetPath || targetPath === "/") {
    return {
      surface: options.preferredSurface,
      targetPath: "/"
    };
  }

  if (
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(targetPath) ||
    targetPath.startsWith("//")
  ) {
    return tryResolveAbsoluteTarget(targetPath, options.allowedSurfaces);
  }

  return tryResolveRelativeTarget(
    targetPath,
    options.allowedSurfaces,
    options.preferredSurface
  );
}

function resolveAuthenticatedTarget(
  targetPath: string,
  options?: {
    preferredSurface?: AuthenticatedSurface;
    surface?: AuthenticatedSurface | null;
  }
) {
  const preferredSurface =
    options?.surface ?? options?.preferredSurface ?? "portal";
  const allowedSurfaces = options?.surface
    ? [options.surface]
    : [...authenticatedSurfaces];

  return resolveOwnedTarget(targetPath, {
    allowedSurfaces,
    preferredSurface
  }) as ResolvedOwnedTarget<AuthenticatedSurface> | null;
}

function sanitizeSurfaceTargetPath(surface: OwnedAppSurface, targetPath: string) {
  return (
    resolveOwnedTarget(targetPath, {
      allowedSurfaces: [surface],
      preferredSurface: surface
    })?.targetPath ?? "/"
  );
}

function sanitizePortalTargetPath(targetPath: string) {
  return sanitizeSurfaceTargetPath("portal", targetPath);
}

function sanitizePublicTargetPath(targetPath: string) {
  return sanitizeSurfaceTargetPath("public_site", targetPath);
}

function sanitizeMathTargetPath(targetPath: string) {
  return sanitizeSurfaceTargetPath("math", targetPath);
}

export function readAuthenticatedRedirectTarget(search = window.location.search) {
  const params = new URLSearchParams(search);
  const targetSurface = readAuthenticatedSurfaceParam(search);

  return (
    resolveAuthenticatedTarget(params.get("redirect") ?? "/", {
      preferredSurface: targetSurface ?? "portal",
      surface: targetSurface
    })?.targetPath ?? "/"
  );
}

export function readAuthenticatedRedirectSurface(search = window.location.search) {
  const params = new URLSearchParams(search);
  const explicitSurface = readAuthenticatedSurfaceParam(search);

  return (
    resolveAuthenticatedTarget(params.get("redirect") ?? "/", {
      preferredSurface: explicitSurface ?? "portal",
      surface: explicitSurface
    })?.surface ??
    explicitSurface ??
    "portal"
  );
}

export function readPortalRedirectTarget(search = window.location.search) {
  return readAuthenticatedRedirectTarget(search);
}

function buildLocalSurfaceUrl(
  surface: Exclude<WebSurface, "public">,
  targetPath: string,
  authenticatedSurface: AuthenticatedSurface,
  origin = window.location.origin
) {
  if (surface === "portal" || surface === "math") {
    const surfaceUrl = new URL(
      surface === "portal"
        ? sanitizePortalTargetPath(targetPath)
        : sanitizeMathTargetPath(targetPath),
      origin
    );

    surfaceUrl.searchParams.set("surface", surface);
    copyLocalPortalState(surfaceUrl);
    stripSyntheticLocalAuthParams(surfaceUrl.searchParams, {
      preserveRouteDeniedReason: true
    });
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

export function copyLocalPortalState(targetUrl: URL, currentLocation = window.location) {
  if (!isLocalOrigin(currentLocation.hostname)) {
    return;
  }

  const currentParams = new URLSearchParams(currentLocation.search);
  const surface = currentParams.get("surface");

  if (
    !targetUrl.searchParams.has("surface") &&
    (surface === "portal" || surface === "math")
  ) {
    targetUrl.searchParams.set("surface", surface);
  }

  stripSyntheticLocalAuthParams(targetUrl.searchParams, {
    preserveRouteDeniedReason: true
  });
}

export function buildAuthUrl(
  targetPath = "/",
  hostname = window.location.hostname,
  options?: {
    surface?: AuthenticatedSurface;
  }
) {
  const preferredSurface =
    options?.surface ?? resolvePreferredAuthenticatedSurface(hostname);
  const resolvedTarget =
    resolveAuthenticatedTarget(targetPath, {
      preferredSurface,
      surface: options?.surface
    }) ?? {
      surface: preferredSurface,
      targetPath: "/"
    };

  if (isLocalOrigin(hostname)) {
    return buildLocalSurfaceUrl(
      "auth",
      resolvedTarget.targetPath,
      resolvedTarget.surface
    );
  }

  const authUrl = new URL(productionWebOrigins.auth);
  authUrl.searchParams.set("app", resolvedTarget.surface);

  if (resolvedTarget.targetPath !== "/") {
    authUrl.searchParams.set("redirect", resolvedTarget.targetPath);
  }

  return authUrl.toString();
}

export function buildAuthGuidanceUrl(
  targetPath = "/",
  hostname = window.location.hostname,
  options?: {
    surface?: AuthenticatedSurface;
  }
) {
  const authUrl = new URL(buildAuthUrl(targetPath, hostname, options));
  authUrl.searchParams.set("guidance", "1");
  return authUrl.toString();
}

export function buildAccessRequestUrl(hostname = window.location.hostname) {
  return buildAuthUrl("/access-request", hostname, {
    surface: "portal"
  });
}

export function buildPublicUrl(targetPath = "/", hostname = window.location.hostname) {
  const normalizedTargetPath = sanitizePublicTargetPath(targetPath);

  if (isLocalOrigin(hostname)) {
    return new URL(normalizedTargetPath, buildLocalPublicOrigin()).toString();
  }

  return new URL(normalizedTargetPath, productionWebOrigins.public).toString();
}

export function buildPortalUrl(targetPath = "/", hostname = window.location.hostname) {
  const normalizedTargetPath = sanitizePortalTargetPath(targetPath);

  if (isLocalOrigin(hostname)) {
    return buildLocalSurfaceUrl("portal", normalizedTargetPath, "portal");
  }

  return new URL(normalizedTargetPath, productionWebOrigins.portal).toString();
}

export function buildMathUrl(targetPath = "/", hostname = window.location.hostname) {
  const normalizedTargetPath = sanitizeMathTargetPath(targetPath);

  if (isLocalOrigin(hostname)) {
    return buildLocalSurfaceUrl("math", normalizedTargetPath, "math");
  }

  return new URL(normalizedTargetPath, productionWebOrigins.math).toString();
}

export function buildAuthenticatedAppUrl(
  targetPath = "/",
  options?: {
    surface?: AuthenticatedSurface;
  },
  hostname = window.location.hostname
) {
  const preferredSurface =
    options?.surface ?? resolvePreferredAuthenticatedSurface(hostname);
  const resolvedTarget =
    resolveAuthenticatedTarget(targetPath, {
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
  hostname = window.location.hostname
) {
  const preferredSurface =
    options?.surface ?? resolvePreferredAuthenticatedSurface(hostname);
  const resolvedTarget =
    resolveAuthenticatedTarget(targetPath, {
      preferredSurface,
      surface: options?.surface
    }) ?? {
      surface: preferredSurface,
      targetPath: "/"
    };

  const authUrl = new URL(
    `/api/access/start/${provider}`,
    isLocalOrigin(hostname)
      ? resolveAuthStartOrigin({
          hostname,
          port: window.location.port,
          protocol: window.location.protocol
        })
      : productionWebOrigins.auth
  );
  authUrl.searchParams.set("app", resolvedTarget.surface);

  if (resolvedTarget.targetPath !== "/") {
    authUrl.searchParams.set("redirect", resolvedTarget.targetPath);
  }

  if (options?.flow === "link") {
    authUrl.searchParams.set("flow", "link");
  }

  return authUrl.toString();
}

export function buildAccessFinalizeUrl(
  targetPath = "/",
  options?: {
    surface?: AuthenticatedSurface;
  },
  hostname = window.location.hostname
) {
  const preferredSurface =
    options?.surface ?? resolvePreferredAuthenticatedSurface(hostname);
  const resolvedTarget =
    resolveAuthenticatedTarget(targetPath, {
      preferredSurface,
      surface: options?.surface
    }) ?? {
      surface: preferredSurface,
      targetPath: "/"
    };

  const completionUrl = new URL("/api/access/finalize", window.location.origin);
  completionUrl.searchParams.set("app", resolvedTarget.surface);

  if (resolvedTarget.targetPath !== "/") {
    completionUrl.searchParams.set("redirect", resolvedTarget.targetPath);
  }

  return completionUrl.toString();
}

export function resolveAccessProviderHost(
  hostname = window.location.hostname
): AccessProvider | null {
  if (hostname === paretoProofSurfaceHosts.githubAuth) {
    return "github";
  }

  if (hostname === paretoProofSurfaceHosts.googleAuth) {
    return "google";
  }

  return null;
}

export function describeAuthenticatedSurface(surface: AuthenticatedSurface) {
  return mapAuthenticatedSurfaceToLabel(surface);
}

export function getCurrentRelativeUrl(location = window.location) {
  const params = stripSyntheticLocalAuthParams(new URLSearchParams(location.search));
  params.delete("surface");

  const search = params.toString();
  const relativeUrl = `${location.pathname}${search ? `?${search}` : ""}${location.hash}`;

  return relativeUrl || "/";
}
