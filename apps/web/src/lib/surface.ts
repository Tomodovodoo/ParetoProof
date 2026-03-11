export type WebSurface = "public" | "auth" | "portal";
export type AccessProvider = "github" | "google";

const productionPublicOrigin = "https://paretoproof.com";
const productionAuthOrigin = "https://auth.paretoproof.com";
const productionPortalOrigin = "https://portal.paretoproof.com";
const productionProviderAuthOrigins: Record<AccessProvider, string> = {
  github: "https://github.auth.paretoproof.com",
  google: "https://google.auth.paretoproof.com"
};

function readLocalSurfaceOverride() {
  const params = new URLSearchParams(window.location.search);
  const surface = params.get("surface");

  return surface === "public" || surface === "auth" || surface === "portal"
    ? surface
    : null;
}

export function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

function isLocalOrigin(hostname = window.location.hostname) {
  return isLocalHostname(hostname);
}

export function resolveWebSurface(hostname = window.location.hostname): WebSurface {
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

  if (isLocalHostname(hostname)) {
    return readLocalSurfaceOverride() ?? "public";
  }

  return "public";
}

function normalizeTargetPath(targetPath: string) {
  if (!targetPath || targetPath === "/") {
    return "/";
  }

  return targetPath.startsWith("/") ? targetPath : `/${targetPath}`;
}

function sanitizePortalTargetPath(targetPath: string) {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(targetPath) || targetPath.startsWith("//")) {
    return "/";
  }

  try {
    const candidateUrl = new URL(
      normalizeTargetPath(targetPath),
      productionPortalOrigin
    );

    if (candidateUrl.origin !== productionPortalOrigin) {
      return "/";
    }

    return `${candidateUrl.pathname}${candidateUrl.search}${candidateUrl.hash}` || "/";
  } catch {
    return "/";
  }
}

export function readPortalRedirectTarget(search = window.location.search) {
  const params = new URLSearchParams(search);
  return sanitizePortalTargetPath(params.get("redirect") ?? "/");
}

function buildLocalSurfaceUrl(
  surface: Exclude<WebSurface, "public">,
  targetPath: string,
  origin = window.location.origin
) {
  const surfaceUrl = new URL(origin);
  const normalizedTargetPath = sanitizePortalTargetPath(targetPath);

  if (surface === "portal") {
    const portalUrl = new URL(normalizedTargetPath, origin);
    portalUrl.searchParams.set("surface", surface);
    return portalUrl.toString();
  }

  surfaceUrl.searchParams.set("surface", "auth");

  if (normalizedTargetPath !== "/") {
    surfaceUrl.searchParams.set("redirect", normalizedTargetPath);
  }

  return surfaceUrl.toString();
}

export function buildAuthUrl(targetPath = "/", hostname = window.location.hostname) {
  const normalizedTargetPath = sanitizePortalTargetPath(targetPath);

  if (isLocalOrigin(hostname)) {
    return buildLocalSurfaceUrl("auth", normalizedTargetPath);
  }

  const authUrl = new URL(productionAuthOrigin);

  if (normalizedTargetPath !== "/") {
    authUrl.searchParams.set("redirect", normalizedTargetPath);
  }

  return authUrl.toString();
}

export function buildPublicUrl(targetPath = "/", hostname = window.location.hostname) {
  const normalizedTargetPath = normalizeTargetPath(targetPath);

  if (isLocalOrigin(hostname)) {
    return new URL(normalizedTargetPath, window.location.origin).toString();
  }

  return new URL(normalizedTargetPath, productionPublicOrigin).toString();
}

export function buildPortalUrl(targetPath = "/", hostname = window.location.hostname) {
  const normalizedTargetPath = sanitizePortalTargetPath(targetPath);

  if (isLocalOrigin(hostname)) {
    return buildLocalSurfaceUrl("portal", normalizedTargetPath);
  }

  return new URL(normalizedTargetPath, productionPortalOrigin).toString();
}

export function buildAccessStartUrl(
  provider: AccessProvider,
  targetPath = "/",
  options?: {
    flow?: "sign_in" | "link";
  },
  hostname = window.location.hostname
) {
  const normalizedTargetPath = sanitizePortalTargetPath(targetPath);

  if (isLocalOrigin(hostname)) {
    const localUrl = new URL(buildPortalUrl(normalizedTargetPath, hostname));
    localUrl.searchParams.set("access", "approved");
    localUrl.searchParams.set("email", "local@example.com");
    localUrl.searchParams.set("roles", "admin");
    return localUrl.toString();
  }

  const authUrl = new URL(`/api/access/start/${provider}`, productionAuthOrigin);

  if (normalizedTargetPath !== "/") {
    authUrl.searchParams.set("redirect", normalizedTargetPath);
  }

  if (options?.flow === "link") {
    authUrl.searchParams.set("flow", "link");
  }

  return authUrl.toString();
}

export function buildApiSessionCompleteUrl(targetPath = "/") {
  const normalizedTargetPath = sanitizePortalTargetPath(targetPath);
  const completionUrl = new URL("/portal/session/complete", "https://api.paretoproof.com");

  if (normalizedTargetPath !== "/") {
    completionUrl.searchParams.set("redirect", normalizedTargetPath);
  }

  return completionUrl.toString();
}

export function buildApiSessionFinalizeUrl(targetPath = "/") {
  const normalizedTargetPath = sanitizePortalTargetPath(targetPath);
  const completionUrl = new URL("/portal/session/finalize", "https://api.paretoproof.com");

  if (normalizedTargetPath !== "/") {
    completionUrl.searchParams.set("redirect", normalizedTargetPath);
  }

  return completionUrl.toString();
}

export function resolveAccessProviderHost(hostname = window.location.hostname): AccessProvider | null {
  if (hostname === "github.auth.paretoproof.com") {
    return "github";
  }

  if (hostname === "google.auth.paretoproof.com") {
    return "google";
  }

  return null;
}

export function getCurrentRelativeUrl(location = window.location) {
  const params = new URLSearchParams(location.search);

  params.delete("surface");
  params.delete("access");
  params.delete("email");
  params.delete("roles");

  const search = params.toString();
  const relativeUrl = `${location.pathname}${search ? `?${search}` : ""}${location.hash}`;

  return relativeUrl || "/";
}
