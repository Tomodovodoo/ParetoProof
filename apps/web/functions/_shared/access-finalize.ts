const authOrigin = "https://auth.paretoproof.com";
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

function buildAuthRetryUrl(redirectPath: string) {
  const authUrl = new URL(authOrigin);

  if (redirectPath !== "/") {
    authUrl.searchParams.set("redirect", redirectPath);
  }

  authUrl.searchParams.set("handoff", "retry");

  return authUrl.toString();
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

function resolvePortalRedirectTarget(rawRedirectTarget: unknown, fallbackRedirectPath: string) {
  if (typeof rawRedirectTarget !== "string" || rawRedirectTarget.length === 0) {
    return new URL(fallbackRedirectPath, portalOrigin).toString();
  }

  try {
    const targetUrl = new URL(rawRedirectTarget);

    if (targetUrl.origin !== portalOrigin) {
      return null;
    }

    return targetUrl.toString();
  } catch {
    return null;
  }
}

function readSetCookieHeaders(headers: Headers) {
  const cookieHeaders = headers as Headers & {
    getAll?: (name: string) => string[];
    getSetCookie?: () => string[];
  };

  if (typeof cookieHeaders.getSetCookie === "function") {
    return cookieHeaders.getSetCookie();
  }

  if (typeof cookieHeaders.getAll === "function") {
    return cookieHeaders.getAll("set-cookie");
  }

  const singleCookieHeader = headers.get("set-cookie");
  return singleCookieHeader ? [singleCookieHeader] : [];
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

function buildRedirectResponse(targetUrl: string, responseHeaders?: Headers) {
  const headers = new Headers({
    "cache-control": "no-store",
    location: targetUrl
  });

  for (const cookieValue of responseHeaders ? readSetCookieHeaders(responseHeaders) : []) {
    headers.append("set-cookie", cookieValue);
  }

  return new Response(null, {
    headers,
    status: 303
  });
}

export async function handleAccessFinalize(request: Request) {
  const redirectPath = await readRedirectPath(request);
  const retryUrl = buildAuthRetryUrl(redirectPath);
  const requestUrl = new URL(request.url);
  const apiUrl = new URL("/portal/session/finalize", resolveApiBaseUrl(requestUrl));
  const forwardedHeaders = new Headers({
    accept: "application/json",
    "content-type": "application/json"
  });
  const accessAssertion = request.headers.get("cf-access-jwt-assertion");
  const cookieHeader = request.headers.get("cookie");

  if (!accessAssertion) {
    return buildRedirectResponse(retryUrl);
  }

  forwardedHeaders.set("cf-access-jwt-assertion", accessAssertion);

  if (cookieHeader) {
    forwardedHeaders.set("cookie", cookieHeader);
  }

  let finalizeResponse: Response;

  try {
    finalizeResponse = await fetch(apiUrl.toString(), {
      body: JSON.stringify(
        redirectPath === "/"
          ? {}
          : {
              redirect: redirectPath
            }
      ),
      headers: forwardedHeaders,
      method: "POST",
      redirect: "manual"
    });
  } catch {
    return buildRedirectResponse(retryUrl);
  }

  if (!finalizeResponse.ok) {
    return buildRedirectResponse(retryUrl, finalizeResponse.headers);
  }

  let responseBody: unknown;

  try {
    responseBody = await finalizeResponse.json();
  } catch {
    return buildRedirectResponse(retryUrl, finalizeResponse.headers);
  }

  const redirectTarget = resolvePortalRedirectTarget(
    (responseBody as { redirectTo?: unknown }).redirectTo,
    redirectPath
  );

  if (!redirectTarget) {
    return buildRedirectResponse(retryUrl, finalizeResponse.headers);
  }

  return buildRedirectResponse(redirectTarget, finalizeResponse.headers);
}
