import type { FastifyInstance } from "fastify";

export function registerHealthRoute(app: FastifyInstance) {
  app.get("/health", async () => {
    return {
      ok: true,
      service: "api"
    };
  });
}
