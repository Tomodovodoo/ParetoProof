import { findAppRouteBySurface } from "@paretoproof/shared";
import {
  resolveAuthenticatedSurfaceOrigin,
  resolveAuthRelayCookieOptions,
  resolveAuthStartOrigin,
  resolveProviderAuthOrigin
} from "../../src/lib/local-development";

type Provider = "github" | "google";
type PersistedProvider = "cloudflare_github" | "cloudflare_google";
type AuthenticatedSurface = "portal" | "math";

type AccessStartEnv = {
  ACCESS_PROVIDER_STATE_SECRET?: string;
};

const persistedProviders: Record<Provider, PersistedProvider> = {
  github: "cloudflare_github",
  google: "cloudflare_google"
};

function readAuthenticatedSurface(surface: string | null): AuthenticatedSurface {
  return surface === "math" ? "math" : "portal";
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
      resolveAuthenticatedSurfaceOrigin(targetSurface, requestUrl)
    );

    if (!findAppRouteBySurface(targetSurface, url.pathname)) {
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

async function buildProviderHintCookie(
  env: AccessStartEnv,
  provider: Provider,
  requestUrl: URL
) {
  const secret = env.ACCESS_PROVIDER_STATE_SECRET;

  if (!secret) {
    throw new Error("ACCESS_PROVIDER_STATE_SECRET is not configured.");
  }

  const value = await signProviderHint(persistedProviders[provider], secret);
  const { cookieDomain, secure } = resolveAuthRelayCookieOptions(requestUrl);

  return [
    `PortalAccessProvider=${value}`,
    ...(cookieDomain ? [`Domain=${cookieDomain}`] : []),
    "Path=/",
    "SameSite=Strict",
    "Max-Age=600",
    ...(secure ? ["Secure"] : []),
    "HttpOnly"
  ].join("; ");
}

function clearSignedAccessCookie(
  name: "PortalAccessProvider" | "PortalLinkIntent",
  requestUrl: URL
) {
  const { cookieDomain, secure } = resolveAuthRelayCookieOptions(requestUrl);

  return [
    `${name}=`,
    ...(cookieDomain ? [`Domain=${cookieDomain}`] : []),
    "Path=/",
    "SameSite=Strict",
    "Max-Age=0",
    ...(secure ? ["Secure"] : []),
    "HttpOnly"
  ].join("; ");
}

function buildAuthFailureUrl(
  redirectPath: string,
  targetSurface: AuthenticatedSurface,
  requestUrl: URL
) {
  const authUrl = new URL(resolveAuthStartOrigin(requestUrl));
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
  const redirectPath = sanitizeRedirectPath(
    requestUrl.searchParams.get("redirect"),
    targetSurface,
    requestUrl
  );

  try {
    const flow = requestUrl.searchParams.get("flow") === "link" ? "link" : "sign_in";
    const providerUrl = new URL("/", resolveProviderAuthOrigin(provider, requestUrl));
    const providerHintCookie = await buildProviderHintCookie(env, provider, requestUrl);

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
      headers.append("set-cookie", clearSignedAccessCookie("PortalLinkIntent", requestUrl));
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
        location: buildAuthFailureUrl(redirectPath, targetSurface, requestUrl)
      },
      status: 302
    });
  }
}
