import type {
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction
} from "fastify";

export function normalizeOrigin(value: string) {
  return value.replace(/\/+$/, "");
}

export function isAllowedLocalOrigin(origin: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/u.test(origin);
}

const localBrandedAuthHosts = new Set([
  "auth.paretoproof.com",
  "github.auth.paretoproof.com",
  "google.auth.paretoproof.com"
]);

export function isAllowedLocalBrandedAuthOrigin(origin: string) {
  try {
    const parsedOrigin = new URL(origin);

    return (
      parsedOrigin.protocol === "http:" &&
      parsedOrigin.port.length > 0 &&
      localBrandedAuthHosts.has(parsedOrigin.hostname)
    );
  } catch {
    return false;
  }
}

export function shouldEnforceTrustedMutationOrigin(method: string, routePath: string) {
  return (
    method !== "GET" &&
    method !== "HEAD" &&
    method !== "OPTIONS" &&
    routePath.startsWith("/portal/")
  );
}

function allowsBrandedFinalizeSubmitOrigin(method: string, routePath: string) {
  return method === "POST" && routePath === "/portal/session/finalize/submit";
}

export function createTrustedMutationOriginHook(options: {
  allowLocalhostOrigins: boolean;
  allowedOrigins: string[];
  brandedAuthOrigins?: string[];
}) {
  return (
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction
  ) => {
    const routePath = request.routeOptions.url ?? request.raw.url ?? "";

    if (!shouldEnforceTrustedMutationOrigin(request.method, routePath)) {
      done();
      return;
    }

    const requestOrigin =
      typeof request.headers.origin === "string" && request.headers.origin.length > 0
        ? normalizeOrigin(request.headers.origin)
        : null;

    if (!requestOrigin) {
      reply.code(403).send({
        error: "trusted_origin_required"
      });
      return;
    }

    const brandedAuthOrigins = options.brandedAuthOrigins ?? [];
    const brandedAuthOrigin = brandedAuthOrigins.includes(requestOrigin);
    const originAllowed =
      (
        options.allowedOrigins.includes(requestOrigin) &&
        !brandedAuthOrigin
      ) ||
      (
        brandedAuthOrigin &&
        allowsBrandedFinalizeSubmitOrigin(request.method, routePath)
      ) ||
      (
        options.allowLocalhostOrigins &&
        isAllowedLocalBrandedAuthOrigin(requestOrigin) &&
        allowsBrandedFinalizeSubmitOrigin(request.method, routePath)
      ) ||
      (options.allowLocalhostOrigins && isAllowedLocalOrigin(requestOrigin));

    if (!originAllowed) {
      reply.code(403).send({
        error: "trusted_origin_not_allowed"
      });
      return;
    }

    done();
  };
}
