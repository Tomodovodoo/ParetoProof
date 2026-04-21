import { findAppRouteBySurface } from "@paretoproof/shared";
import type { ApiRuntimeEnv } from "../config/runtime.js";

export type AuthenticatedSurface = "portal" | "math";

export type AuthenticatedSurfaceRuntimeConfig = Pick<
  ApiRuntimeEnv,
  "mathPublicOrigin" | "portalPublicOrigin"
>;

type AuthenticatedContinuationInput = {
  app?: string | null;
  redirect?: string | null;
};

export function readAuthenticatedSurface(
  surface: string | null | undefined,
): AuthenticatedSurface {
  return surface === "math" ? "math" : "portal";
}

export function readAuthenticatedSurfaceRouteFamily(routePath: string) {
  if (routePath === "/portal" || routePath.startsWith("/portal/")) {
    return "portal";
  }

  if (routePath === "/math" || routePath.startsWith("/math/")) {
    return "math";
  }

  return null;
}

export function usesAuthenticatedSurfaceSession(routePath: string) {
  return readAuthenticatedSurfaceRouteFamily(routePath) !== null;
}

export function readAuthenticatedSurfaceOrigin(
  runtimeConfig: AuthenticatedSurfaceRuntimeConfig,
  targetSurface: AuthenticatedSurface,
) {
  return targetSurface === "math"
    ? runtimeConfig.mathPublicOrigin
    : runtimeConfig.portalPublicOrigin;
}

export function sanitizeAuthenticatedRedirectPath(
  rawRedirectPath: string | null | undefined,
  targetSurface: AuthenticatedSurface,
  runtimeConfig: AuthenticatedSurfaceRuntimeConfig,
) {
  if (!rawRedirectPath || rawRedirectPath === "/") {
    return "/";
  }

  if (
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawRedirectPath) ||
    rawRedirectPath.startsWith("//")
  ) {
    return "/";
  }

  try {
    const targetOrigin = readAuthenticatedSurfaceOrigin(
      runtimeConfig,
      targetSurface,
    );
    const candidateUrl = new URL(
      rawRedirectPath.startsWith("/") ? rawRedirectPath : `/${rawRedirectPath}`,
      targetOrigin,
    );

    if (
      candidateUrl.origin !== targetOrigin ||
      !findAppRouteBySurface(targetSurface, candidateUrl.pathname)
    ) {
      return "/";
    }

    return (
      `${candidateUrl.pathname}${candidateUrl.search}${candidateUrl.hash}` ||
      "/"
    );
  } catch {
    return "/";
  }
}

export function readAuthenticatedContinuation(
  input: {
    body?: AuthenticatedContinuationInput | null;
    query?: AuthenticatedContinuationInput | null;
  },
  runtimeConfig: AuthenticatedSurfaceRuntimeConfig,
) {
  const targetSurface = readAuthenticatedSurface(
    input.body?.app ?? input.query?.app ?? null,
  );
  const redirectPath = sanitizeAuthenticatedRedirectPath(
    input.body?.redirect ?? input.query?.redirect ?? null,
    targetSurface,
    runtimeConfig,
  );

  return {
    redirectPath,
    targetSurface,
  };
}

export function buildAuthenticatedContinuationUrl(
  redirectPath: string,
  targetSurface: AuthenticatedSurface,
  runtimeConfig: AuthenticatedSurfaceRuntimeConfig,
) {
  return new URL(
    redirectPath,
    readAuthenticatedSurfaceOrigin(runtimeConfig, targetSurface),
  );
}
