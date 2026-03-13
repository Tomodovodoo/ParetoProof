const authOrigin = "https://auth.paretoproof.com";
const apiOrigin = "https://api.paretoproof.com";
const portalOrigin = "https://portal.paretoproof.com";

type SessionFinalizeEnv = {
  API_BASE_URL?: string;
};

function trimTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
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
  const retryUrl = new URL(authOrigin);

  if (redirectPath !== "/") {
    retryUrl.searchParams.set("redirect", redirectPath);
  }

  retryUrl.searchParams.set("handoff", "retry");

  return retryUrl.toString();
}

function copySetCookieHeaders(source: Headers, target: Headers) {
  const getSetCookie = (source as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies = typeof getSetCookie === "function" ? getSetCookie.call(source) : [];

  if (setCookies.length > 0) {
    for (const value of setCookies) {
      target.append("set-cookie", value);
    }

    return;
  }

  const combinedValue = source.get("set-cookie");

  if (combinedValue) {
    target.append("set-cookie", combinedValue);
  }
}

function buildForwardHeaders(request: Request, requestOrigin: string) {
  const headers = new Headers({
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    origin: request.headers.get("origin") ?? requestOrigin
  });
  const assertion = request.headers.get("cf-access-jwt-assertion");
  const contentType = request.headers.get("content-type");
  const cookie = request.headers.get("cookie");

  if (assertion) {
    headers.set("cf-access-jwt-assertion", assertion);
  }

  if (contentType) {
    headers.set("content-type", contentType);
  }

  if (cookie) {
    headers.set("cookie", cookie);
  }

  return headers;
}

export async function handleSessionFinalize(
  request: Request,
  env: SessionFinalizeEnv
) {
  const requestUrl = new URL(request.url);
  const redirectPath = sanitizeRedirectPath(requestUrl.searchParams.get("redirect"));
  const retryUrl = buildAuthRetryUrl(redirectPath);

  if (request.method !== "POST") {
    return Response.redirect(retryUrl, 302);
  }

  try {
    const upstreamUrl = new URL(
      "/portal/session/finalize/submit",
      trimTrailingSlash(env.API_BASE_URL ?? apiOrigin)
    );

    if (redirectPath !== "/") {
      upstreamUrl.searchParams.set("redirect", redirectPath);
    }

    const requestBody = request.headers.get("content-type") ? await request.text() : undefined;
    const upstreamResponse = await fetch(upstreamUrl, {
      body: requestBody,
      headers: buildForwardHeaders(request, requestUrl.origin),
      method: "POST",
      redirect: "manual"
    });
    const location = upstreamResponse.headers.get("location");

    if (location && upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
      const headers = new Headers({
        location
      });

      copySetCookieHeaders(upstreamResponse.headers, headers);

      return new Response(null, {
        headers,
        status: upstreamResponse.status
      });
    }
  } catch {
    // Fall through to the branded retry surface.
  }

  return Response.redirect(retryUrl, 302);
}
