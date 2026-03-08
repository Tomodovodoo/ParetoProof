import Fastify from "fastify";
import { registerHealthRoute } from "../routes/health.js";

export function buildServer() {
  const app = Fastify({
    logger: true
  });

  registerHealthRoute(app);

  return app;
}
