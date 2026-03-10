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

export async function handleAccessStart(
  request: Request,
  env: AccessStartEnv,
  provider: Provider
) {
  try {
    const requestUrl = new URL(request.url);
    const redirectPath = sanitizeRedirectPath(requestUrl.searchParams.get("redirect"));
    const providerUrl = new URL("/", providerOrigins[provider]);
    const providerHintCookie = await buildProviderHintCookie(env, provider);

    if (redirectPath !== "/") {
      providerUrl.searchParams.set("redirect", redirectPath);
    }

    return new Response(null, {
      headers: {
        location: providerUrl.toString(),
        "set-cookie": providerHintCookie
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
