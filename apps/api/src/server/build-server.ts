import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import Fastify from "fastify";
import type { ApiRuntimeEnv } from "../config/runtime.js";
import { createAccessGuard } from "../auth/require-access.js";
import { createDbClient } from "../db/client.js";
import { registerAdminRoutes } from "../routes/admin.js";
import { registerBenchmarkWorkflowRoutes } from "../routes/benchmark-workflow.js";
import { registerHealthRoute } from "../routes/health.js";
import { registerInternalWorkerRoutes } from "../routes/internal-worker.js";
import { registerOfflineIngestRoutes } from "../routes/offline-ingest.js";
import { registerPortalRoutes } from "../routes/portal.js";
import {
  createInMemoryRateLimiter,
  createRateLimitPreHandlers
} from "../middleware/rate-limit.js";
import {
  createTrustedMutationOriginHook,
  isAllowedLocalBrandedAuthOrigin,
  isAllowedLocalOrigin,
  normalizeOrigin
} from "./trusted-mutation-origin.js";

export function readAllowedCorsOrigins(runtimeEnv: ApiRuntimeEnv) {
  const brandedAuthOrigins = new Set(readBrandedAuthOrigins());
  const baselineOrigins = [
    "https://portal.paretoproof.com"
  ];

  return [
    ...new Set(
      [...baselineOrigins, ...runtimeEnv.corsAllowedOrigins]
        .map(normalizeOrigin)
        .filter((origin) => !brandedAuthOrigins.has(origin))
    )
  ];
}

function readBrandedAuthOrigins() {
  return [
    "https://auth.paretoproof.com",
    "https://github.auth.paretoproof.com",
    "https://google.auth.paretoproof.com"
  ];
}

function usesBrandedFinalizeSubmitCorsBoundary(method: string, routePath: string) {
  return (
    routePath === "/portal/session/finalize/submit" &&
    (method === "POST" || method === "OPTIONS")
  );
}

export function readCorsRoutePath(routePath: string | undefined, rawUrl: string | undefined) {
  if (routePath && routePath !== "*") {
    return routePath;
  }

  if (!rawUrl || rawUrl === "*") {
    return routePath ?? "";
  }

  try {
    return new URL(rawUrl, "http://localhost").pathname;
  } catch {
    return rawUrl.split("?")[0] ?? rawUrl;
  }
}

export function isAllowedCorsOrigin(options: {
  allowLocalhostCors: boolean;
  allowedOrigins: string[];
  brandedAuthOrigins: string[];
  method: string;
  origin: string;
  routePath: string;
}) {
  const normalizedOrigin = normalizeOrigin(options.origin);

  if (options.allowedOrigins.includes(normalizedOrigin)) {
    return true;
  }

  if (options.allowLocalhostCors && isAllowedLocalOrigin(normalizedOrigin)) {
    return true;
  }

  if (
    !usesBrandedFinalizeSubmitCorsBoundary(options.method, options.routePath)
  ) {
    return false;
  }

  if (options.brandedAuthOrigins.includes(normalizedOrigin)) {
    return true;
  }

  return (
    options.allowLocalhostCors &&
    isAllowedLocalBrandedAuthOrigin(normalizedOrigin)
  );
}

export async function buildServer(runtimeEnv: ApiRuntimeEnv) {
  const app = Fastify({
    logger: true
  });
  const db = createDbClient(runtimeEnv.databaseUrl);
  const requireAccess = createAccessGuard(db);
  const rateLimitPreHandlers = createRateLimitPreHandlers(createInMemoryRateLimiter());
  const allowedOrigins = readAllowedCorsOrigins(runtimeEnv);
  const brandedAuthOrigins = readBrandedAuthOrigins();
  const allowLocalhostCors = runtimeEnv.corsAllowLocalhost;

  await app.register(cors, {
    delegator(request, callback) {
      const routePath = readCorsRoutePath(
        request.routeOptions.url,
        request.raw.url
      );

      callback(null, {
        credentials: true,
        origin(origin, originCallback) {
          if (!origin) {
            originCallback(null, true);
            return;
          }

          if (
            isAllowedCorsOrigin({
              allowLocalhostCors,
              allowedOrigins,
              brandedAuthOrigins,
              method: request.method,
              origin,
              routePath
            })
          ) {
            originCallback(null, true);
            return;
          }

          originCallback(new Error("origin_not_allowed"), false);
        }
      });
    }
  });
  await app.register(formbody);
  app.addHook(
    "onRequest",
    createTrustedMutationOriginHook({
      allowLocalhostOrigins: allowLocalhostCors,
      allowedOrigins,
      brandedAuthOrigins
    })
  );

  registerHealthRoute(app, {
    rateLimitPreHandlers
  });
  registerPortalRoutes(app, db, requireAccess, {
    rateLimitPreHandlers
  });
  registerAdminRoutes(app, db, requireAccess, {
    rateLimitPreHandlers
  });
  registerBenchmarkWorkflowRoutes(app, db, requireAccess, {
    rateLimitPreHandlers
  });
  registerOfflineIngestRoutes(app, db, requireAccess);
  registerInternalWorkerRoutes(app, db, runtimeEnv);

  return app;
}
