import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import Fastify from "fastify";
import { createAccessGuard } from "../auth/require-access.js";
import { createDbClient } from "../db/client.js";
import { registerAdminRoutes } from "../routes/admin.js";
import { registerHealthRoute } from "../routes/health.js";
import { registerPortalRoutes } from "../routes/portal.js";
import {
  createTrustedMutationOriginHook,
  isAllowedLocalOrigin,
  normalizeOrigin
} from "./trusted-mutation-origin.js";

function readAllowedCorsOrigins() {
  const baselineOrigins = [
    "https://auth.paretoproof.com",
    "https://github.auth.paretoproof.com",
    "https://google.auth.paretoproof.com",
    "https://portal.paretoproof.com"
  ];
  const configuredOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return [...new Set([...baselineOrigins, ...(configuredOrigins ?? [])].map(normalizeOrigin))];
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
  const allowLocalhostCors = shouldAllowLocalhostCors();

  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);

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
  app.addHook(
    "onRequest",
    createTrustedMutationOriginHook({
      allowLocalhostOrigins: allowLocalhostCors,
      allowedOrigins
    })
  );

  registerHealthRoute(app);
  registerPortalRoutes(app, db, requireAccess);
  registerAdminRoutes(app, db, requireAccess);

  return app;
}
