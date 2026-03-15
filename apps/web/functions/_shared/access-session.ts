const portalOrigin = "https://portal.paretoproof.com";

const brandedHosts = new Set([
  "paretoproof.com",
  "auth.paretoproof.com",
  "github.auth.paretoproof.com",
  "google.auth.paretoproof.com",
  "portal.paretoproof.com"
]);

function trimTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
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

const inactiveResponse = () =>
  new Response(JSON.stringify({ active: false }), {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json"
    },
    status: 200
  });

export async function handleAccessSession(request: Request) {
  const accessAssertion = request.headers.get("cf-access-jwt-assertion");
  const cookieHeader = request.headers.get("cookie");
  const accessSessionCookie = readCookieValue(cookieHeader, "CF_Authorization");

  if (!accessAssertion && !accessSessionCookie) {
    return inactiveResponse();
  }

  const requestUrl = new URL(request.url);
  const apiUrl = new URL("/portal/session/status", resolveApiBaseUrl(requestUrl));
  const forwardedHeaders = new Headers({
    accept: "application/json"
  });

  if (accessAssertion) {
    forwardedHeaders.set("cf-access-jwt-assertion", accessAssertion);
  }

  if (cookieHeader) {
    forwardedHeaders.set("cookie", cookieHeader);
  }

  let response: Response;

  try {
    response = await fetch(apiUrl.toString(), {
      headers: forwardedHeaders,
      method: "GET",
      redirect: "manual"
    });
  } catch {
    return inactiveResponse();
  }

  if (!response.ok) {
    return inactiveResponse();
  }

  return new Response(await response.text(), {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json"
    },
    status: 200
  });
}
