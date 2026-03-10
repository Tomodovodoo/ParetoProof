import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import Fastify from "fastify";
import { createAccessGuard } from "../auth/require-access.js";
import { createDbClient } from "../db/client.js";
import { registerAdminRoutes } from "../routes/admin.js";
import { registerHealthRoute } from "../routes/health.js";
import { registerPortalRoutes } from "../routes/portal.js";

function normalizeOrigin(value: string) {
  return value.replace(/\/+$/, "");
}

function readAllowedCorsOrigins() {
  const configuredOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins?.length) {
    return configuredOrigins.map(normalizeOrigin);
  }

  return ["https://portal.paretoproof.com"];
}

function isAllowedLocalOrigin(origin: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/u.test(origin);
}

function shouldAllowLocalhostCors() {
  return process.env.CORS_ALLOW_LOCALHOST === "true";
}

export async function buildServer() {
  const app = Fastify({
    logger: true
  });
  const db = createDbClient();
  const requireAccess = createAccessGuard(db);
  const allowedOrigins = readAllowedCorsOrigins();

  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);
      const allowLocalhostCors = shouldAllowLocalhostCors();

      if (
        allowedOrigins.includes(normalizedOrigin) ||
        (allowLocalhostCors && isAllowedLocalOrigin(normalizedOrigin))
      ) {
        callback(null, true);
        return;
      }

      callback(new Error("origin_not_allowed"), false);
    }
  });
  await app.register(formbody);

  registerHealthRoute(app);
  registerPortalRoutes(app, db, requireAccess);
  registerAdminRoutes(app, db, requireAccess);

  return app;
}
