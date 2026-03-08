import Fastify from "fastify";
import { registerHealthRoute } from "../routes/health";

export function buildServer() {
  const app = Fastify({
    logger: true
  });

  registerHealthRoute(app);

  return app;
}
