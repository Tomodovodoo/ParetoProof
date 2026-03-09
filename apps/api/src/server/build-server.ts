import Fastify from "fastify";
import { createAccessGuard } from "../auth/require-access.js";
import { createDbClient } from "../db/client.js";
import { registerAdminRoutes } from "../routes/admin.js";
import { registerHealthRoute } from "../routes/health.js";
import { registerPortalRoutes } from "../routes/portal.js";

export function buildServer() {
  const app = Fastify({
    logger: true
  });
  const db = createDbClient();
  const requireAccess = createAccessGuard(db);

  registerHealthRoute(app);
  registerPortalRoutes(app, db, requireAccess);
  registerAdminRoutes(app, db, requireAccess);

  return app;
}
