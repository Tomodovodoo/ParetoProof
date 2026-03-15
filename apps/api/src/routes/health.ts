import type { FastifyInstance } from "fastify";
import type { createRateLimitPreHandlers } from "../middleware/rate-limit.js";

export function registerHealthRoute(
  app: FastifyInstance,
  options?: {
    rateLimitPreHandlers?: ReturnType<typeof createRateLimitPreHandlers>;
  }
) {
  app.get("/health", {
    preHandler: options?.rateLimitPreHandlers?.public
  }, async () => {
    return {
      ok: true,
      service: "api"
    };
  });
}
