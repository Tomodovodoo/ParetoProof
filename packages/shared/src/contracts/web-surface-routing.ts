import { findAppRouteBySurface } from "./route-access.js";
import type { AppSurface } from "../types/route-access.js";
import {
  brandedFinalizeRelayHosts,
  paretoProofBrandedHosts,
  productionAuthOrigin,
  productionMathOrigin,
  productionPortalOrigin,
  productionPublicOrigin
} from "./web-surface-hosts.js";
import type { AccessProvider } from "./web-surface-hosts.js";
export {
  brandedFinalizeRelayHosts,
  paretoProofBrandedHosts,
  productionAuthOrigin,
  productionMathOrigin,
  productionPortalOrigin,
  productionProviderAuthOrigins,
  productionPublicOrigin
} from "./web-surface-hosts.js";
export type { AccessProvider } from "./web-surface-hosts.js";

export type WebSurface = "public" | "auth" | "portal" | "math";
export type AuthenticatedSurface = "portal" | "math";
export type OwnedAppSurface = AppSurface;

export type WebLocationLike = {
  hash?: string;
  hostname: string;
  origin?: string;
  pathname?: string;
  port?: string;
  protocol?: string;
  search?: string;
};

export type ResolvedOwnedRouteTarget<
  TSurface extends OwnedAppSurface = OwnedAppSurface
> = {
  surface: TSurface;
  targetPath: string;
};

const authenticatedSurfaces = ["portal", "math"] as const;
const productionOriginByAuthenticatedSurface: Record<AuthenticatedSurface, string> = {
  math: productionMathOrigin,
  portal: productionPortalOrigin
};

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase();
}

export function isLoopbackHostname(hostname: string) {
  const normalizedHostname = normalizeHostname(hostname);

  return (
    normalizedHostname === "localhost" ||
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname === "::1" ||
    normalizedHostname.endsWith(".localhost")
  );
}

export function isParetoProofBrandedHost(hostname: string) {
  return paretoProofBrandedHosts.includes(
    normalizeHostname(hostname) as (typeof paretoProofBrandedHosts)[number]
  );
}

export function isBrandedFinalizeRelayHost(hostname: string) {
  return brandedFinalizeRelayHosts.includes(
    normalizeHostname(hostname) as (typeof brandedFinalizeRelayHosts)[number]
  );
}

export function isLocalDevelopmentLocation({
  hostname,
  port = "",
  protocol = ""
}: WebLocationLike) {
  const normalizedHostname = normalizeHostname(hostname);

  if (isLoopbackHostname(normalizedHostname)) {
    return true;
  }

  return (
    protocol === "http:" &&
    port !== "" &&
    isParetoProofBrandedHost(normalizedHostname)
  );
}

export function isTrustedFinalizeRelayLocation({
  hostname,
  port = "",
  protocol = ""
}: WebLocationLike) {
  const normalizedHostname = normalizeHostname(hostname);

  if (protocol === "https:" && isBrandedFinalizeRelayHost(normalizedHostname)) {
    return true;
  }

  if (protocol !== "http:") {
    return false;
  }

  if (isLoopbackHostname(normalizedHostname)) {
    return true;
  }

  return port !== "" && isBrandedFinalizeRelayHost(normalizedHostname);
}

function readLocalSurfaceOverride(search = ""): WebSurface | null {
  const params = new URLSearchParams(search);
  const surface = params.get("surface");

  return surface === "public" ||
    surface === "auth" ||
    surface === "portal" ||
    surface === "math"
    ? surface
    : null;
}

export function isAuthenticatedSurface(
  surface: string | null
): surface is AuthenticatedSurface {
  return surface === "portal" || surface === "math";
}

export function readAuthenticatedSurface(surface: string | null): AuthenticatedSurface {
  return surface === "math" ? "math" : "portal";
}

export function resolveWebSurfaceFromLocation(locationLike: WebLocationLike): WebSurface {
  const hostname = normalizeHostname(locationLike.hostname);

  if (
    hostname === "auth.paretoproof.com" ||
    hostname === "github.auth.paretoproof.com" ||
    hostname === "google.auth.paretoproof.com"
  ) {
    return "auth";
  }

  if (hostname === "portal.paretoproof.com") {
    return "portal";
  }

  if (hostname === "math.paretoproof.com") {
    return "math";
  }

  if (isLocalDevelopmentLocation(locationLike)) {
    return readLocalSurfaceOverride(locationLike.search) ?? "public";
  }

  return "public";
}

export function resolveAccessProviderFromHost(hostname: string): AccessProvider | null {
  const normalizedHostname = normalizeHostname(hostname);

  if (normalizedHostname === "github.auth.paretoproof.com") {
    return "github";
  }

  if (normalizedHostname === "google.auth.paretoproof.com") {
    return "google";
  }

  return null;
}

export function mapAuthenticatedSurfaceToOrigin(surface: AuthenticatedSurface) {
  return productionOriginByAuthenticatedSurface[surface];
}

export function mapOwnedSurfaceToOrigin(surface: OwnedAppSurface) {
  if (surface === "public_site") {
    return productionPublicOrigin;
  }

  return mapAuthenticatedSurfaceToOrigin(surface);
}

function normalizeTargetPath(targetPath: string) {
  if (!targetPath || targetPath === "/") {
    return "/";
  }

  return targetPath.startsWith("/") ? targetPath : `/${targetPath}`;
}

function hasUrlScheme(targetPath: string) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(targetPath);
}

function tryResolveAbsoluteTarget<TSurface extends OwnedAppSurface>(
  targetPath: string,
  allowedSurfaces: readonly TSurface[]
): ResolvedOwnedRouteTarget<TSurface> | null {
  if (targetPath.startsWith("//")) {
    return null;
  }

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

function tryResolveRelativeTarget<TSurface extends OwnedAppSurface>(
  targetPath: string,
  allowedSurfaces: readonly TSurface[],
  preferredSurface: TSurface
): ResolvedOwnedRouteTarget<TSurface> | null {
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

export function resolveOwnedRouteTarget<TSurface extends OwnedAppSurface>(
  targetPath: string | null | undefined,
  options: {
    allowAbsolute?: boolean;
    allowedSurfaces: readonly TSurface[];
    preferredSurface: TSurface;
  }
): ResolvedOwnedRouteTarget<TSurface> | null {
  if (!targetPath || targetPath === "/") {
    return {
      surface: options.preferredSurface,
      targetPath: "/"
    };
  }

  if (hasUrlScheme(targetPath) || targetPath.startsWith("//")) {
    if (options.allowAbsolute === false) {
      return null;
    }

    return tryResolveAbsoluteTarget(targetPath, options.allowedSurfaces);
  }

  return tryResolveRelativeTarget(
    targetPath,
    options.allowedSurfaces,
    options.preferredSurface
  );
}

export function resolveAuthenticatedRouteTarget(
  targetPath: string | null | undefined,
  options?: {
    allowAbsolute?: boolean;
    preferredSurface?: AuthenticatedSurface;
    surface?: AuthenticatedSurface | null;
  }
) {
  const preferredSurface =
    options?.surface ?? options?.preferredSurface ?? "portal";
  const allowedSurfaces = options?.surface
    ? [options.surface]
    : [...authenticatedSurfaces];

  return resolveOwnedRouteTarget(targetPath, {
    allowAbsolute: options?.allowAbsolute,
    allowedSurfaces,
    preferredSurface
  });
}

export function sanitizeSurfaceTargetPath(
  surface: OwnedAppSurface,
  targetPath: string | null | undefined,
  options?: {
    allowAbsolute?: boolean;
  }
) {
  return (
    resolveOwnedRouteTarget(targetPath, {
      allowAbsolute: options?.allowAbsolute,
      allowedSurfaces: [surface],
      preferredSurface: surface
    })?.targetPath ?? "/"
  );
}

export function sanitizePublicTargetPath(targetPath: string | null | undefined) {
  return sanitizeSurfaceTargetPath("public_site", targetPath);
}

export function sanitizePortalTargetPath(targetPath: string | null | undefined) {
  return sanitizeSurfaceTargetPath("portal", targetPath);
}

export function sanitizeMathTargetPath(targetPath: string | null | undefined) {
  return sanitizeSurfaceTargetPath("math", targetPath);
}

export function sanitizeAuthenticatedRedirectTarget(
  targetPath: string | null | undefined,
  options?: {
    allowAbsolute?: boolean;
    preferredSurface?: AuthenticatedSurface;
    surface?: AuthenticatedSurface | null;
  }
) {
  return (
    resolveAuthenticatedRouteTarget(targetPath, {
      allowAbsolute: options?.allowAbsolute,
      preferredSurface: options?.preferredSurface,
      surface: options?.surface
    })?.targetPath ?? "/"
  );
}

export function buildAuthenticatedRedirectUrl(
  targetSurface: AuthenticatedSurface,
  redirectPath: string
) {
  return new URL(redirectPath, mapAuthenticatedSurfaceToOrigin(targetSurface)).toString();
}

export function resolveFinalizedAuthenticatedRedirectTarget(
  rawRedirectTarget: unknown,
  options: {
    fallbackRedirectPath: string;
    fallbackSurface: AuthenticatedSurface;
  }
) {
  if (typeof rawRedirectTarget !== "string" || rawRedirectTarget.length === 0) {
    const fallbackRedirectPath = sanitizeAuthenticatedRedirectTarget(
      options.fallbackRedirectPath,
      {
        allowAbsolute: false,
        surface: options.fallbackSurface
      }
    );

    return buildAuthenticatedRedirectUrl(
      options.fallbackSurface,
      fallbackRedirectPath
    );
  }

  let targetUrl: URL;

  try {
    targetUrl = new URL(rawRedirectTarget);
  } catch {
    return null;
  }

  const targetSurface =
    targetUrl.origin === productionPortalOrigin
      ? "portal"
      : targetUrl.origin === productionMathOrigin
        ? "math"
        : null;

  if (!targetSurface || !findAppRouteBySurface(targetSurface, targetUrl.pathname)) {
    return null;
  }

  return targetUrl.toString();
}
