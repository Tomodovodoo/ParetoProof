import {
  type AccessProvider as Provider,
  type AuthenticatedSurface,
  productionAuthOrigin,
  productionProviderAuthOrigins,
  readAuthenticatedSurface,
  sanitizeAuthenticatedRedirectTarget
} from "@paretoproof/shared";

type PersistedProvider = "cloudflare_github" | "cloudflare_google";

type AccessStartEnv = {
  ACCESS_PROVIDER_STATE_SECRET?: string;
};

const persistedProviders: Record<Provider, PersistedProvider> = {
  github: "cloudflare_github",
  google: "cloudflare_google"
};

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

function buildAuthFailureUrl(
  redirectPath: string,
  targetSurface: AuthenticatedSurface
) {
  const authUrl = new URL(productionAuthOrigin);
  authUrl.searchParams.set("app", targetSurface);

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
  const targetSurface = readAuthenticatedSurface(requestUrl.searchParams.get("app"));
  const redirectPath = sanitizeAuthenticatedRedirectTarget(
    requestUrl.searchParams.get("redirect"),
    {
      allowAbsolute: false,
      surface: targetSurface
    }
  );

  try {
    const flow = requestUrl.searchParams.get("flow") === "link" ? "link" : "sign_in";
    const providerUrl = new URL("/", productionProviderAuthOrigins[provider]);
    const providerHintCookie = await buildProviderHintCookie(env, provider);

    providerUrl.searchParams.set("app", targetSurface);

    if (redirectPath !== "/") {
      providerUrl.searchParams.set("redirect", redirectPath);
    }

    if (flow === "link") {
      providerUrl.searchParams.set("flow", "link");
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
        location: buildAuthFailureUrl(redirectPath, targetSurface)
      },
      status: 302
    });
  }
}
