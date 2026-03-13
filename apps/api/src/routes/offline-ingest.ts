import type { FastifyInstance, FastifyRequest } from "fastify";
import { createProblem9OfflineIngestService } from "../lib/problem9-offline-ingest.js";
import type { ReturnTypeOfCreateAccessGuard } from "../types/access-guard.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";

function getAdminActorUserId(request: FastifyRequest) {
  const context = request.accessRbacContext;

  if (context?.status !== "approved" || !context.roles.includes("admin")) {
    throw new Error("Admin access context was not attached to the request.");
  }

  return context.userId;
}

export function registerOfflineIngestRoutes(
  app: FastifyInstance,
  db: ReturnTypeOfCreateDbClient,
  requireAccess: ReturnTypeOfCreateAccessGuard,
  options?: {
    ingestProblem9OfflineBundle?: ReturnType<typeof createProblem9OfflineIngestService>;
  }
) {
  const ingestProblem9OfflineBundle =
    options?.ingestProblem9OfflineBundle ?? createProblem9OfflineIngestService(db);

  app.post(
    "/portal/admin/offline-ingest/problem9-run-bundles",
    {
      preHandler: requireAccess("admin_only")
    },
    async (request, reply) => {
      try {
        const response = await ingestProblem9OfflineBundle(
          request.body,
          getAdminActorUserId(request)
        );

        reply.code(201).send(response);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          typeof error.code === "string" &&
          "statusCode" in error &&
          typeof error.statusCode === "number"
        ) {
          reply.code(error.statusCode).send({
            error: error.code,
            issues:
              "issues" in error && Array.isArray(error.issues)
                ? error.issues
                : undefined
          });
          return;
        }

        throw error;
      }
    }
  );
}
