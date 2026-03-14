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

function isAllowedLocalOrigin(origin: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/u.test(origin);
}

function shouldAllowLocalhostCors() {
  return process.env.CORS_ALLOW_LOCALHOST === "true";
}

function isStateChangingMethod(method: string) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

function parseHeaderOrigin(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    return normalizeOrigin(new URL(value).origin);
  } catch {
    return null;
  }
}

function isAllowedRequestOrigin(origin: string, allowedOrigins: string[]) {
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  return shouldAllowLocalhostCors() && isAllowedLocalOrigin(origin);
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

  app.addHook("onRequest", async (request, reply) => {
    if (!isStateChangingMethod(request.method)) {
      return;
    }

    const originHeader = request.headers.origin;
    const refererHeader = request.headers.referer;
    const requestOrigin =
      parseHeaderOrigin(originHeader) ?? parseHeaderOrigin(refererHeader);

    if (!requestOrigin) {
      return;
    }

    if (!isAllowedRequestOrigin(requestOrigin, allowedOrigins)) {
      await reply.code(403).send({
        error: "forbidden_origin"
      });
    }
  });

  registerHealthRoute(app);
  registerPortalRoutes(app, db, requireAccess);
  registerAdminRoutes(app, db, requireAccess);

  return app;
}
