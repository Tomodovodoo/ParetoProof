import type {
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from "fastify";
import {
  readAuthenticatedSurfaceRouteFamily,
  type AuthenticatedSurface,
} from "../lib/authenticated-surface.js";

export function normalizeOrigin(value: string) {
  return value.replace(/\/+$/, "");
}

export function isAllowedLocalOrigin(origin: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/u.test(origin);
}

function readConfiguredBrandedAuthHosts(brandedAuthOrigins: string[]) {
  return new Set(
    brandedAuthOrigins.map((allowedOrigin) => new URL(allowedOrigin).hostname),
  );
}

export function isAllowedLocalBrandedAuthOrigin(
  origin: string,
  brandedAuthOrigins: string[],
) {
  try {
    const parsedOrigin = new URL(origin);

    return (
      parsedOrigin.protocol === "http:" &&
      parsedOrigin.port.length > 0 &&
      readConfiguredBrandedAuthHosts(brandedAuthOrigins).has(
        parsedOrigin.hostname,
      )
    );
  } catch {
    return false;
  }
}

export function isAllowedBrandedAuthOrigin(options: {
  allowLocalhostOrigins: boolean;
  brandedAuthOrigins: string[];
  origin: string;
}) {
  const normalizedOrigin = normalizeOrigin(options.origin);

  if (options.brandedAuthOrigins.includes(normalizedOrigin)) {
    return true;
  }

  return (
    options.allowLocalhostOrigins &&
    isAllowedLocalBrandedAuthOrigin(
      normalizedOrigin,
      options.brandedAuthOrigins,
    )
  );
}

export function shouldEnforceTrustedMutationOrigin(
  method: string,
  routePath: string,
) {
  return readTrustedMutationSurface(method, routePath) !== null;
}

function allowsBrandedFinalizeSubmitOrigin(method: string, routePath: string) {
  return method === "POST" && routePath === "/portal/session/finalize/submit";
}

function readTrustedMutationSurface(
  method: string,
  routePath: string,
): AuthenticatedSurface | null {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null;
  }

  return readAuthenticatedSurfaceRouteFamily(routePath);
}

export type TrustedMutationOriginsBySurface = Record<
  AuthenticatedSurface,
  string[]
>;

export function createTrustedMutationOriginHook(options: {
  allowLocalhostOrigins: boolean;
  allowedOriginsBySurface: TrustedMutationOriginsBySurface;
  brandedAuthOrigins?: string[];
}) {
  return (
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ) => {
    const routePath = request.routeOptions.url ?? request.raw.url ?? "";
    const trustedSurface = readTrustedMutationSurface(request.method, routePath);

    if (!trustedSurface) {
      done();
      return;
    }

    const requestOrigin =
      typeof request.headers.origin === "string" &&
      request.headers.origin.length > 0
        ? normalizeOrigin(request.headers.origin)
        : null;

    if (!requestOrigin) {
      reply.code(403).send({
        error: "trusted_origin_required",
      });
      return;
    }

    const brandedAuthOrigins = options.brandedAuthOrigins ?? [];
    const brandedAuthOrigin = isAllowedBrandedAuthOrigin({
      allowLocalhostOrigins: false,
      brandedAuthOrigins,
      origin: requestOrigin,
    });
    const originAllowed =
      (
        options.allowedOriginsBySurface[trustedSurface].includes(requestOrigin) &&
        !brandedAuthOrigin
      ) ||
      (brandedAuthOrigin &&
        allowsBrandedFinalizeSubmitOrigin(request.method, routePath)) ||
      (isAllowedBrandedAuthOrigin({
        allowLocalhostOrigins: options.allowLocalhostOrigins,
        brandedAuthOrigins,
        origin: requestOrigin,
      }) &&
        allowsBrandedFinalizeSubmitOrigin(request.method, routePath)) ||
      (options.allowLocalhostOrigins && isAllowedLocalOrigin(requestOrigin));

    if (!originAllowed) {
      reply.code(403).send({
        error: "trusted_origin_not_allowed",
      });
      return;
    }

    done();
  };
}
