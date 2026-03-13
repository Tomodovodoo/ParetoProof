import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import Fastify from "fastify";
import type { ApiRuntimeEnv } from "../config/runtime.js";
import { createAccessGuard } from "../auth/require-access.js";
import { createDbClient } from "../db/client.js";
import { registerAdminRoutes } from "../routes/admin.js";
import { registerHealthRoute } from "../routes/health.js";
import { registerInternalWorkerRoutes } from "../routes/internal-worker.js";
import { registerOfflineIngestRoutes } from "../routes/offline-ingest.js";
import { registerPortalRoutes } from "../routes/portal.js";
import {
  createTrustedMutationOriginHook,
  isAllowedLocalOrigin,
  normalizeOrigin
} from "./trusted-mutation-origin.js";

function readAllowedCorsOrigins(runtimeEnv: ApiRuntimeEnv) {
  const baselineOrigins = [
    "https://auth.paretoproof.com",
    "https://github.auth.paretoproof.com",
    "https://google.auth.paretoproof.com",
    "https://portal.paretoproof.com"
  ];

  return [
    ...new Set(
      [...baselineOrigins, ...runtimeEnv.corsAllowedOrigins].map(normalizeOrigin)
    )
  ];
}

export async function buildServer(runtimeEnv: ApiRuntimeEnv) {
  const app = Fastify({
    logger: true
  });
  const db = createDbClient(runtimeEnv.databaseUrl);
  const requireAccess = createAccessGuard(db);
  const allowedOrigins = readAllowedCorsOrigins(runtimeEnv);
  const allowLocalhostCors = runtimeEnv.corsAllowLocalhost;

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
  registerOfflineIngestRoutes(app, db, requireAccess);
  registerInternalWorkerRoutes(app, db, runtimeEnv);

  return app;
}
