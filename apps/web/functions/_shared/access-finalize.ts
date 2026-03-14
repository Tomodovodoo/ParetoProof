const portalOrigin = "https://portal.paretoproof.com";

function trimTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

const brandedHosts = new Set([
  "paretoproof.com",
  "auth.paretoproof.com",
  "github.auth.paretoproof.com",
  "google.auth.paretoproof.com",
  "portal.paretoproof.com"
]);

function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

function sanitizeRedirectPath(rawRedirectPath: string | null) {
  if (!rawRedirectPath || rawRedirectPath === "/") {
    return "/";
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawRedirectPath) || rawRedirectPath.startsWith("//")) {
    return "/";
  }

  try {
    const url = new URL(
      rawRedirectPath.startsWith("/") ? rawRedirectPath : `/${rawRedirectPath}`,
      portalOrigin
    );

    if (url.origin !== portalOrigin) {
      return "/";
    }

    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return "/";
  }
}

function resolveApiBaseUrl(requestUrl: URL) {
  if (
    requestUrl.protocol === "http:" &&
    requestUrl.port !== "" &&
    brandedHosts.has(requestUrl.hostname)
  ) {
    const localApiUrl = new URL(requestUrl.origin);
    localApiUrl.port = "3000";
    return trimTrailingSlash(localApiUrl.origin);
  }

  if (
    requestUrl.hostname === "paretoproof.com" ||
    requestUrl.hostname.endsWith(".paretoproof.com")
  ) {
    return "https://api.paretoproof.com";
  }

  const localApiUrl = new URL(requestUrl.origin);
  localApiUrl.port = "3000";

  if (isLocalHostname(requestUrl.hostname)) {
    return trimTrailingSlash(localApiUrl.origin);
  }

  return "https://api.paretoproof.com";
}

function buildFinalizeSubmitUrl(requestUrl: URL, redirectPath: string) {
  const apiUrl = new URL("/portal/session/finalize/submit", resolveApiBaseUrl(requestUrl));

  if (redirectPath !== "/") {
    apiUrl.searchParams.set("redirect", redirectPath);
  }

  return apiUrl.toString();
}

async function readRedirectPath(request: Request) {
  const requestUrl = new URL(request.url);
  const fallbackRedirectPath = requestUrl.searchParams.get("redirect");

  if (request.method !== "POST") {
    return sanitizeRedirectPath(fallbackRedirectPath);
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (
    !contentType.includes("application/x-www-form-urlencoded") &&
    !contentType.includes("multipart/form-data")
  ) {
    return sanitizeRedirectPath(fallbackRedirectPath);
  }

  const formData = await request.formData();
  const redirectValue = formData.get("redirect");

  return sanitizeRedirectPath(
    typeof redirectValue === "string" ? redirectValue : fallbackRedirectPath
  );
}

function buildRedirectResponse(targetUrl: string, status = 303) {
  const headers = new Headers({
    "cache-control": "no-store",
    location: targetUrl
  });

  return new Response(null, {
    headers,
    status
  });
}

export async function handleAccessFinalize(request: Request) {
  const redirectPath = await readRedirectPath(request);
  const requestUrl = new URL(request.url);
  const submitUrl = buildFinalizeSubmitUrl(requestUrl, redirectPath);

  // Preserve the browser's form POST so the API audience can establish its own
  // Access session instead of completing the handoff only on the auth Pages runtime.
  return buildRedirectResponse(submitUrl, 307);
}
