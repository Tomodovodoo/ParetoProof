const authOrigin = "https://auth.paretoproof.com";
const portalOrigin = "https://portal.paretoproof.com";

type Provider = "github" | "google";
type PersistedProvider = "cloudflare_github" | "cloudflare_google";

type AccessStartEnv = {
  ACCESS_PROVIDER_STATE_SECRET?: string;
};

const providerOrigins: Record<Provider, string> = {
  github: "https://github.auth.paretoproof.com",
  google: "https://google.auth.paretoproof.com"
};

const persistedProviders: Record<Provider, PersistedProvider> = {
  github: "cloudflare_github",
  google: "cloudflare_google"
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

function toBase64Url(bytes: ArrayBuffer) {
  const encoded = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return encoded.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function signProviderHint(provider: PersistedProvider, secret: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60;
  const payload = `${provider}.${expiresAt}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));

  return `${payload}.${toBase64Url(signature)}`;
}

async function buildProviderHintCookie(env: AccessStartEnv, provider: Provider) {
  const secret = env.ACCESS_PROVIDER_STATE_SECRET;

  if (!secret) {
    throw new Error("ACCESS_PROVIDER_STATE_SECRET is not configured.");
  }

  const value = await signProviderHint(persistedProviders[provider], secret);

  return [
    `PortalAccessProvider=${value}`,
    "Domain=.paretoproof.com",
    "Path=/",
    "SameSite=Strict",
    "Max-Age=600",
    "Secure",
    "HttpOnly"
  ].join("; ");
}

function clearSignedAccessCookie(name: "PortalAccessProvider" | "PortalLinkIntent") {
  return [
    `${name}=`,
    "Domain=.paretoproof.com",
    "Path=/",
    "SameSite=Strict",
    "Max-Age=0",
    "Secure",
    "HttpOnly"
  ].join("; ");
}

function buildAuthFailureUrl(redirectPath: string) {
  const authUrl = new URL(authOrigin);

  if (redirectPath !== "/") {
    authUrl.searchParams.set("redirect", redirectPath);
  }

  authUrl.searchParams.set("handoff", "failed");

  return authUrl.toString();
}

export async function handleAccessStart(
  request: Request,
  env: AccessStartEnv,
  provider: Provider
) {
  const requestUrl = new URL(request.url);
  const redirectPath = sanitizeRedirectPath(requestUrl.searchParams.get("redirect"));

  try {
    const flow = requestUrl.searchParams.get("flow") === "link" ? "link" : "sign_in";
    const providerUrl = new URL("/", providerOrigins[provider]);
    const providerHintCookie = await buildProviderHintCookie(env, provider);

    if (redirectPath !== "/") {
      providerUrl.searchParams.set("redirect", redirectPath);
    }

    const headers = new Headers({
      location: providerUrl.toString()
    });

    // Regular sign-in should not inherit an abandoned profile-link cookie.
    if (flow !== "link") {
      headers.append("set-cookie", clearSignedAccessCookie("PortalLinkIntent"));
    }

    headers.append("set-cookie", providerHintCookie);

    return new Response(null, {
      headers,
      status: 302
    });
  } catch (error) {
    void error;

    return new Response(null, {
      headers: {
        location: buildAuthFailureUrl(redirectPath)
      },
      status: 302
    });
  }
}
