import {
  findAppRouteBySurface,
  portalSessionFinalizeResponseSchema
} from "@paretoproof/shared";

const authOrigin = "https://auth.paretoproof.com";
const portalOrigin = "https://portal.paretoproof.com";
const mathOrigin = "https://math.paretoproof.com";

type AuthenticatedSurface = "portal" | "math";

function trimTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function readCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...valueParts] = part.trim().split("=");

    if (rawName === name) {
      return valueParts.join("=") || null;
    }
  }

  return null;
}

const brandedHosts = new Set([
  "paretoproof.com",
  "auth.paretoproof.com",
  "github.auth.paretoproof.com",
  "google.auth.paretoproof.com",
  "math.paretoproof.com",
  "portal.paretoproof.com"
]);
const brandedFinalizeRelayHosts = new Set([
  "auth.paretoproof.com",
  "github.auth.paretoproof.com",
  "google.auth.paretoproof.com"
]);

function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

function readTrustedFinalizeRelayOrigin(request: Request) {
  const originHeader = request.headers.get("origin");

  if (!originHeader) {
    const refererHeader = request.headers.get("referer");

    if (!refererHeader) {
      return null;
    }

    try {
      const refererUrl = new URL(refererHeader);

      if (
        refererUrl.protocol === "https:" &&
        brandedFinalizeRelayHosts.has(refererUrl.hostname)
      ) {
        return refererUrl.origin;
      }

      if (
        refererUrl.protocol === "http:" &&
        (
          brandedFinalizeRelayHosts.has(refererUrl.hostname) ||
          isLocalHostname(refererUrl.hostname)
        )
      ) {
        return refererUrl.origin;
      }
    } catch {
      return null;
    }

    return null;
  }

  try {
    const originUrl = new URL(originHeader);

    if (
      originUrl.protocol === "https:" &&
      brandedFinalizeRelayHosts.has(originUrl.hostname)
    ) {
      return originUrl.origin;
    }

    if (
      originUrl.protocol === "http:" &&
      (
        brandedFinalizeRelayHosts.has(originUrl.hostname) ||
        isLocalHostname(originUrl.hostname)
      )
    ) {
      return originUrl.origin;
    }
  } catch {
    return null;
  }

  return null;
}

function readAuthenticatedSurface(surface: string | null): AuthenticatedSurface {
  return surface === "math" ? "math" : "portal";
}

function readSurfaceOrigin(surface: AuthenticatedSurface) {
  return surface === "math" ? mathOrigin : portalOrigin;
}

function sanitizeRedirectPath(
  rawRedirectPath: string | null,
  targetSurface: AuthenticatedSurface
) {
  if (!rawRedirectPath || rawRedirectPath === "/") {
    return "/";
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawRedirectPath) || rawRedirectPath.startsWith("//")) {
    return "/";
  }

  try {
    const url = new URL(
      rawRedirectPath.startsWith("/") ? rawRedirectPath : `/${rawRedirectPath}`,
      readSurfaceOrigin(targetSurface)
    );

    if (!findAppRouteBySurface(targetSurface, url.pathname)) {
      return "/";
    }

    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return "/";
  }
}

function buildAuthRetryUrl(
  redirectPath: string,
  targetSurface: AuthenticatedSurface
) {
  const authUrl = new URL(authOrigin);
  authUrl.searchParams.set("app", targetSurface);

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

function buildAuthenticatedRedirectUrl(
  targetSurface: AuthenticatedSurface,
  redirectPath: string
) {
  return new URL(redirectPath, readSurfaceOrigin(targetSurface)).toString();
}

function resolveAuthenticatedRedirectTarget(
  rawRedirectTarget: unknown,
  fallbackRedirectPath: string,
  fallbackSurface: AuthenticatedSurface
) {
  if (typeof rawRedirectTarget !== "string" || rawRedirectTarget.length === 0) {
    return buildAuthenticatedRedirectUrl(fallbackSurface, fallbackRedirectPath);
  }

  let targetUrl: URL;

  try {
    targetUrl = new URL(rawRedirectTarget);
  } catch {
    return null;
  }

  const targetSurface =
    targetUrl.origin === portalOrigin
      ? "portal"
      : targetUrl.origin === mathOrigin
        ? "math"
        : null;

  if (!targetSurface || !findAppRouteBySurface(targetSurface, targetUrl.pathname)) {
    return null;
  }

  return targetUrl.toString();
}

function splitCombinedSetCookieHeader(cookieHeader: string) {
  return cookieHeader
    .split(/, (?=[^;,=\s]+=[^;,]*)/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeSetCookieHeaderValues(cookieHeaders: string[]) {
  return cookieHeaders.flatMap((cookieHeader) => splitCombinedSetCookieHeader(cookieHeader));
}

function readSetCookieHeaders(headers: Headers) {
  const cookieHeaders = headers as Headers & {
    getAll?: (name: string) => string[];
    getSetCookie?: () => string[];
  };

  if (typeof cookieHeaders.getSetCookie === "function") {
    return normalizeSetCookieHeaderValues(cookieHeaders.getSetCookie());
  }

  if (typeof cookieHeaders.getAll === "function") {
    return normalizeSetCookieHeaderValues(cookieHeaders.getAll("set-cookie"));
  }

  const singleCookieHeader = headers.get("set-cookie");
  return singleCookieHeader ? splitCombinedSetCookieHeader(singleCookieHeader) : [];
}

async function readRedirectOptions(request: Request) {
  const requestUrl = new URL(request.url);
  const fallbackSurface = readAuthenticatedSurface(requestUrl.searchParams.get("app"));
  const fallbackRedirectPath = requestUrl.searchParams.get("redirect");

  if (request.method !== "POST") {
    return {
      redirectPath: sanitizeRedirectPath(fallbackRedirectPath, fallbackSurface),
      targetSurface: fallbackSurface
    };
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (
    !contentType.includes("application/x-www-form-urlencoded") &&
    !contentType.includes("multipart/form-data")
  ) {
    return {
      redirectPath: sanitizeRedirectPath(fallbackRedirectPath, fallbackSurface),
      targetSurface: fallbackSurface
    };
  }

  const formData = await request.formData();
  const redirectValue = formData.get("redirect");
  const surfaceValue = formData.get("app");
  const targetSurface =
    typeof surfaceValue === "string"
      ? readAuthenticatedSurface(surfaceValue)
      : fallbackSurface;

  return {
    redirectPath: sanitizeRedirectPath(
      typeof redirectValue === "string" ? redirectValue : fallbackRedirectPath,
      targetSurface
    ),
    targetSurface
  };
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
  const { redirectPath, targetSurface } = await readRedirectOptions(request);
  const retryUrl = buildAuthRetryUrl(redirectPath, targetSurface);
  const requestUrl = new URL(request.url);
  const apiUrl = new URL("/portal/session/finalize/submit", resolveApiBaseUrl(requestUrl));
  const trustedOrigin = readTrustedFinalizeRelayOrigin(request);

  if (!trustedOrigin) {
    return buildRedirectResponse(retryUrl);
  }

  const forwardedHeaders = new Headers({
    accept: "application/json",
    "content-type": "application/json",
    origin: trustedOrigin
  });
  const accessAssertion = request.headers.get("cf-access-jwt-assertion");
  const cookieHeader = request.headers.get("cookie");
  const accessSessionCookie = readCookieValue(cookieHeader, "CF_Authorization");

  if (!accessAssertion && !accessSessionCookie) {
    return buildRedirectResponse(retryUrl);
  }

  if (accessAssertion) {
    forwardedHeaders.set("cf-access-jwt-assertion", accessAssertion);
  }

  if (cookieHeader) {
    forwardedHeaders.set("cookie", cookieHeader);
  }

  let finalizeResponse: Response;

  try {
    finalizeResponse = await fetch(apiUrl.toString(), {
      body: JSON.stringify({
        app: targetSurface,
        ...(redirectPath === "/"
          ? {}
          : {
              redirect: redirectPath
            })
      }),
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

  const parsedResponseBody = portalSessionFinalizeResponseSchema.safeParse(responseBody);

  if (!parsedResponseBody.success) {
    return buildRedirectResponse(retryUrl, finalizeResponse.headers);
  }

  const redirectTarget = resolveAuthenticatedRedirectTarget(
    parsedResponseBody.data.redirectTo,
    redirectPath,
    targetSurface
  );

  if (!redirectTarget) {
    return buildRedirectResponse(retryUrl, finalizeResponse.headers);
  }

  return buildRedirectResponse(redirectTarget, finalizeResponse.headers);
}
