import {
  type AuthenticatedSurface,
  isLocalDevelopmentLocation,
  isParetoProofBrandedHost,
  isTrustedFinalizeRelayLocation,
  productionAuthOrigin,
  readAuthenticatedSurface,
  resolveFinalizedAuthenticatedRedirectTarget,
  sanitizeAuthenticatedRedirectTarget
} from "@paretoproof/shared";

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

function readTrustedFinalizeRelayOrigin(request: Request) {
  const originHeader = request.headers.get("origin");

  if (!originHeader) {
    const refererHeader = request.headers.get("referer");

    if (!refererHeader) {
      return null;
    }

    try {
      const refererUrl = new URL(refererHeader);

      if (isTrustedFinalizeRelayLocation(refererUrl)) {
        return refererUrl.origin;
      }
    } catch {
      return null;
    }

    return null;
  }

  try {
    const originUrl = new URL(originHeader);

    if (isTrustedFinalizeRelayLocation(originUrl)) {
      return originUrl.origin;
    }
  } catch {
    return null;
  }

  return null;
}

function buildAuthRetryUrl(
  redirectPath: string,
  targetSurface: AuthenticatedSurface
) {
  const authUrl = new URL(productionAuthOrigin);
  authUrl.searchParams.set("app", targetSurface);

  if (redirectPath !== "/") {
    authUrl.searchParams.set("redirect", redirectPath);
  }

  authUrl.searchParams.set("handoff", "retry");

  return authUrl.toString();
}

function resolveApiBaseUrl(requestUrl: URL) {
  if (
    isLocalDevelopmentLocation(requestUrl) &&
    isParetoProofBrandedHost(requestUrl.hostname)
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

  if (isLocalDevelopmentLocation(requestUrl)) {
    return trimTrailingSlash(localApiUrl.origin);
  }

  return "https://api.paretoproof.com";
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
      redirectPath: sanitizeAuthenticatedRedirectTarget(fallbackRedirectPath, {
        allowAbsolute: false,
        surface: fallbackSurface
      }),
      targetSurface: fallbackSurface
    };
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (
    !contentType.includes("application/x-www-form-urlencoded") &&
    !contentType.includes("multipart/form-data")
  ) {
    return {
      redirectPath: sanitizeAuthenticatedRedirectTarget(fallbackRedirectPath, {
        allowAbsolute: false,
        surface: fallbackSurface
      }),
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
    redirectPath: sanitizeAuthenticatedRedirectTarget(
      typeof redirectValue === "string" ? redirectValue : fallbackRedirectPath,
      {
        allowAbsolute: false,
        surface: targetSurface
      }
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

  const redirectTarget = resolveFinalizedAuthenticatedRedirectTarget(
    (responseBody as { redirectTo?: unknown }).redirectTo,
    {
      fallbackRedirectPath: redirectPath,
      fallbackSurface: targetSurface
    }
  );

  if (!redirectTarget) {
    return buildRedirectResponse(retryUrl, finalizeResponse.headers);
  }

  return buildRedirectResponse(redirectTarget, finalizeResponse.headers);
}
