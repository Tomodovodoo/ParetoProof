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

export function shouldEnforceTrustedMutationOrigin(method: string, routePath: string) {
  return (
    method !== "GET" &&
    method !== "HEAD" &&
    method !== "OPTIONS" &&
    routePath.startsWith("/portal/")
  );
}

export function createTrustedMutationOriginHook(options: {
  allowLocalhostOrigins: boolean;
  allowedOrigins: string[];
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

    const originAllowed =
      options.allowedOrigins.includes(requestOrigin) ||
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
