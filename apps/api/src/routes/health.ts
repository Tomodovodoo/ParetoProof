import type { FastifyInstance } from "fastify";
import type { createRateLimitPreHandlers } from "../middleware/rate-limit.js";

export function registerHealthRoute(
  app: FastifyInstance,
  options?: {
    checkReadiness?: () => Promise<void>;
    rateLimitPreHandlers?: ReturnType<typeof createRateLimitPreHandlers>;
  }
) {
  app.get("/health", {
    preHandler: options?.rateLimitPreHandlers?.public
  }, async (request, reply) => {
    try {
      await options?.checkReadiness?.();

      return {
        ok: true,
        service: "api"
      };
    } catch (error) {
      request.log.error({ err: error }, "Health readiness check failed.");
      reply.code(503);

      return {
        error: "service_unavailable",
        ok: false,
        service: "api"
      };
    }
  });
}
