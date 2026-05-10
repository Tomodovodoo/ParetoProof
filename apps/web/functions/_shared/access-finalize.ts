import { findAppRouteBySurface } from "@paretoproof/shared";
import {
  type AuthenticatedSurface,
  isLocalDevelopmentLocation,
  isLoopbackBrandedLocation,
  paretoProofSurfaceHosts,
  resolveAuthenticatedSurfaceOrigin,
  resolveAuthStartOrigin
} from "../../src/lib/local-development";

const brandedFinalizeRelayHosts = new Set<string>([
  paretoProofSurfaceHosts.auth,
  paretoProofSurfaceHosts.githubAuth,
  paretoProofSurfaceHosts.googleAuth
]);

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

function isTrustedFinalizeRelayUrl(url: URL) {
  if (!brandedFinalizeRelayHosts.has(url.hostname)) {
    return false;
  }

  if (url.protocol === "https:") {
    return true;
  }

  return isLoopbackBrandedLocation(url);
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

      if (isTrustedFinalizeRelayUrl(refererUrl)) {
        return refererUrl.origin;
      }
    } catch {
      return null;
    }

    return null;
  }

  try {
    const originUrl = new URL(originHeader);

    if (isTrustedFinalizeRelayUrl(originUrl)) {
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

function readSurfaceOrigin(surface: AuthenticatedSurface, requestUrl: URL) {
  return resolveAuthenticatedSurfaceOrigin(surface, requestUrl);
}

function sanitizeRedirectPath(
  rawRedirectPath: string | null,
  targetSurface: AuthenticatedSurface,
  requestUrl: URL
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
      readSurfaceOrigin(targetSurface, requestUrl)
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
  targetSurface: AuthenticatedSurface,
  requestUrl: URL
) {
  const authUrl = new URL(resolveAuthStartOrigin(requestUrl));
  authUrl.searchParams.set("app", targetSurface);

  if (redirectPath !== "/") {
    authUrl.searchParams.set("redirect", redirectPath);
  }

  authUrl.searchParams.set("handoff", "retry");

  return authUrl.toString();
}

function resolveApiBaseUrl(requestUrl: URL) {
  if (isLocalDevelopmentLocation(requestUrl)) {
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

  return "https://api.paretoproof.com";
}

function buildAuthenticatedRedirectUrl(
  targetSurface: AuthenticatedSurface,
  redirectPath: string,
  requestUrl: URL
) {
  return new URL(redirectPath, readSurfaceOrigin(targetSurface, requestUrl)).toString();
}

function resolveAuthenticatedRedirectTarget(
  rawRedirectTarget: unknown,
  fallbackRedirectPath: string,
  fallbackSurface: AuthenticatedSurface,
  requestUrl: URL
) {
  if (typeof rawRedirectTarget !== "string" || rawRedirectTarget.length === 0) {
    return buildAuthenticatedRedirectUrl(fallbackSurface, fallbackRedirectPath, requestUrl);
  }

  let targetUrl: URL;

  try {
    targetUrl = new URL(rawRedirectTarget);
  } catch {
    return null;
  }

  const portalOrigin = resolveAuthenticatedSurfaceOrigin("portal", requestUrl);
  const mathOrigin = resolveAuthenticatedSurfaceOrigin("math", requestUrl);
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
      redirectPath: sanitizeRedirectPath(fallbackRedirectPath, fallbackSurface, requestUrl),
      targetSurface: fallbackSurface
    };
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (
    !contentType.includes("application/x-www-form-urlencoded") &&
    !contentType.includes("multipart/form-data")
  ) {
    return {
      redirectPath: sanitizeRedirectPath(fallbackRedirectPath, fallbackSurface, requestUrl),
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
      targetSurface,
      requestUrl
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
  const requestUrl = new URL(request.url);
  const retryUrl = buildAuthRetryUrl(redirectPath, targetSurface, requestUrl);
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

  const redirectTarget = resolveAuthenticatedRedirectTarget(
    (responseBody as { redirectTo?: unknown }).redirectTo,
    redirectPath,
    targetSurface,
    requestUrl
  );

  if (!redirectTarget) {
    return buildRedirectResponse(retryUrl, finalizeResponse.headers);
  }

  return buildRedirectResponse(redirectTarget, finalizeResponse.headers);
}
