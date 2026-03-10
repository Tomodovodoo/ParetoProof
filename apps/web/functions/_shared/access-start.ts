const portalOrigin = "https://portal.paretoproof.com";
const apiOrigin = "https://api.paretoproof.com";

type Provider = "github" | "google";

const providerHosts: Record<Provider, string> = {
  github: "github.com",
  google: "accounts.google.com"
};

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

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#([0-9]+);/g, (_, decimal) =>
      String.fromCodePoint(Number.parseInt(decimal, 10))
    )
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function buildSharedCookie(setCookieHeader: string | null) {
  if (!setCookieHeader) {
    throw new Error("Cloudflare Access did not return an application session cookie.");
  }

  const firstCookie = setCookieHeader.split(/,(?=[^;]+=)/)[0]?.trim();

  if (!firstCookie?.startsWith("CF_AppSession=")) {
    throw new Error("Cloudflare Access returned an unexpected session cookie.");
  }

  const attributes = firstCookie
    .split(";")
    .slice(1)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^path=/i.test(part))
    .filter((part) => !/^domain=/i.test(part))
    .filter((part) => !/^samesite=/i.test(part));

  return [
    firstCookie.split(";")[0],
    "Domain=.paretoproof.com",
    "Path=/",
    "SameSite=None",
    ...attributes
  ].join("; ");
}

async function resolveAccessLoginState(redirectPath: string) {
  const sessionCompleteUrl = new URL("/portal/session/complete", apiOrigin);
  sessionCompleteUrl.searchParams.set("redirect", redirectPath);

  const response = await fetch(sessionCompleteUrl, {
    method: "GET",
    redirect: "manual"
  });

  if (response.status !== 302) {
    throw new Error(`Expected an Access redirect, received ${response.status}.`);
  }

  const loginLocation = response.headers.get("location");

  if (!loginLocation) {
    throw new Error("Cloudflare Access did not return a login redirect.");
  }

  return {
    cookie: buildSharedCookie(response.headers.get("set-cookie")),
    loginUrl: new URL(loginLocation)
  };
}

async function resolveProviderUrl(loginUrl: URL, provider: Provider) {
  const response = await fetch(loginUrl.toString(), {
    method: "GET",
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`Cloudflare Access login page returned ${response.status}.`);
  }

  const html = await response.text();
  const hrefMatches = html.matchAll(/href="([^"]+)"/g);

  for (const match of hrefMatches) {
    const href = decodeHtmlEntities(match[1] ?? "");

    try {
      const candidate = new URL(href);

      if (candidate.hostname === providerHosts[provider]) {
        return candidate.toString();
      }
    } catch {
      continue;
    }
  }

  throw new Error(`No ${provider} login URL was found on the Access login page.`);
}

export async function handleAccessStart(request: Request, provider: Provider) {
  const requestUrl = new URL(request.url);
  const redirectPath = sanitizeRedirectPath(requestUrl.searchParams.get("redirect"));

  try {
    const { cookie, loginUrl } = await resolveAccessLoginState(redirectPath);
    const providerUrl = await resolveProviderUrl(loginUrl, provider);

    return new Response(null, {
      headers: {
        location: providerUrl,
        "set-cookie": cookie
      },
      status: 302
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown Access start failure."
      }),
      {
        headers: {
          "content-type": "application/json; charset=utf-8"
        },
        status: 502
      }
    );
  }
}
