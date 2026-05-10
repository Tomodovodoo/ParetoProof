export const paretoProofBrandedHosts = [
  "paretoproof.com",
  "auth.paretoproof.com",
  "github.auth.paretoproof.com",
  "google.auth.paretoproof.com",
  "math.paretoproof.com",
  "portal.paretoproof.com"
] as const;

export const paretoProofSurfaceHosts = {
  auth: "auth.paretoproof.com",
  githubAuth: "github.auth.paretoproof.com",
  googleAuth: "google.auth.paretoproof.com",
  math: "math.paretoproof.com",
  portal: "portal.paretoproof.com",
  public: "paretoproof.com"
} as const;

export const productionWebOrigins = {
  auth: `https://${paretoProofSurfaceHosts.auth}`,
  githubAuth: `https://${paretoProofSurfaceHosts.githubAuth}`,
  googleAuth: `https://${paretoProofSurfaceHosts.googleAuth}`,
  math: `https://${paretoProofSurfaceHosts.math}`,
  portal: `https://${paretoProofSurfaceHosts.portal}`,
  public: `https://${paretoProofSurfaceHosts.public}`
} as const;

type LocationLike = {
  hostname: string;
  port?: string;
  protocol?: string;
};

export type AccessProvider = "github" | "google";
export type AuthenticatedSurface = "portal" | "math";

export const syntheticLocalAuthParamKeys = [
  "access",
  "email",
  "reason",
  "role",
  "roles"
] as const;

export function isLoopbackHostname(hostname: string) {
  const normalizedHostname = hostname.toLowerCase();

  return (
    normalizedHostname === "localhost" ||
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname === "::1" ||
    normalizedHostname === "[::1]" ||
    normalizedHostname.endsWith(".localhost")
  );
}

export function isParetoProofBrandedHost(hostname: string) {
  return paretoProofBrandedHosts.includes(
    hostname.toLowerCase() as (typeof paretoProofBrandedHosts)[number]
  );
}

export function isLoopbackBrandedLocation({
  hostname,
  port = "",
  protocol = ""
}: LocationLike) {
  return protocol === "http:" && port !== "" && isParetoProofBrandedHost(hostname);
}

export function isLocalDevelopmentLocation({
  hostname,
  port = "",
  protocol = ""
}: LocationLike) {
  if (isLoopbackHostname(hostname)) {
    return true;
  }

  return isLoopbackBrandedLocation({ hostname, port, protocol });
}

export function buildLoopbackBrandedOrigin(
  hostname: string,
  locationLike: Pick<LocationLike, "port" | "protocol">
) {
  const protocol = locationLike.protocol || "http:";
  const port = locationLike.port ? `:${locationLike.port}` : "";

  return `${protocol}//${hostname}${port}`;
}

export function resolveAuthStartOrigin(locationLike: LocationLike) {
  if (isLocalDevelopmentLocation(locationLike)) {
    return buildLoopbackBrandedOrigin(paretoProofSurfaceHosts.auth, locationLike);
  }

  return productionWebOrigins.auth;
}

export function resolveProviderAuthOrigin(
  provider: AccessProvider,
  locationLike: LocationLike
) {
  const host =
    provider === "github"
      ? paretoProofSurfaceHosts.githubAuth
      : paretoProofSurfaceHosts.googleAuth;

  if (isLocalDevelopmentLocation(locationLike)) {
    return buildLoopbackBrandedOrigin(host, locationLike);
  }

  return provider === "github"
    ? productionWebOrigins.githubAuth
    : productionWebOrigins.googleAuth;
}

export function resolveAuthenticatedSurfaceOrigin(
  surface: AuthenticatedSurface,
  locationLike: LocationLike
) {
  const host =
    surface === "math" ? paretoProofSurfaceHosts.math : paretoProofSurfaceHosts.portal;

  if (isLocalDevelopmentLocation(locationLike)) {
    return buildLoopbackBrandedOrigin(host, locationLike);
  }

  return surface === "math" ? productionWebOrigins.math : productionWebOrigins.portal;
}

export function resolvePublicOrigin(locationLike: LocationLike & { origin?: string }) {
  if (!isLocalDevelopmentLocation(locationLike)) {
    return locationLike.origin ?? productionWebOrigins.public;
  }

  if (isParetoProofBrandedHost(locationLike.hostname)) {
    return buildLoopbackBrandedOrigin(paretoProofSurfaceHosts.public, locationLike);
  }

  return locationLike.origin ?? buildLoopbackBrandedOrigin(locationLike.hostname, locationLike);
}

export function resolveAuthRelayCookieOptions(locationLike: LocationLike) {
  return {
    cookieDomain: isParetoProofBrandedHost(locationLike.hostname)
      ? ".paretoproof.com"
      : null,
    secure: locationLike.protocol === "https:"
  };
}

export function stripSyntheticLocalAuthParams(
  params: URLSearchParams,
  options?: {
    preserveRouteDeniedReason?: boolean;
  }
) {
  const routeDeniedReason =
    options?.preserveRouteDeniedReason && params.get("reason") === "insufficient_role"
      ? "insufficient_role"
      : null;

  for (const key of syntheticLocalAuthParamKeys) {
    params.delete(key);
  }

  if (routeDeniedReason) {
    params.set("reason", routeDeniedReason);
  }

  return params;
}

export function buildSearchWithoutSyntheticLocalAuthParams(search = "") {
  const params = stripSyntheticLocalAuthParams(new URLSearchParams(search));
  const nextSearch = params.toString();

  return nextSearch ? `?${nextSearch}` : "";
}
