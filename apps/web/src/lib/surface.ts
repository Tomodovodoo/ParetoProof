export type WebSurface = "public" | "auth" | "portal";

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
  if (hostname === "auth.paretoproof.com") {
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

function buildLocalSurfaceUrl(
  surface: Exclude<WebSurface, "public">,
  targetPath: string,
  origin = window.location.origin
) {
  const surfaceUrl = new URL(origin);
  const normalizedTargetPath = normalizeTargetPath(targetPath);

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
  if (isLocalOrigin(hostname)) {
    return buildLocalSurfaceUrl("auth", targetPath);
  }

  const authUrl = new URL("https://auth.paretoproof.com");
  const normalizedTargetPath = normalizeTargetPath(targetPath);

  if (normalizedTargetPath !== "/") {
    authUrl.searchParams.set("redirect", normalizedTargetPath);
  }

  return authUrl.toString();
}

export function buildPortalUrl(targetPath = "/", hostname = window.location.hostname) {
  if (isLocalOrigin(hostname)) {
    return buildLocalSurfaceUrl("portal", targetPath);
  }

  return new URL(targetPath, "https://portal.paretoproof.com").toString();
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
