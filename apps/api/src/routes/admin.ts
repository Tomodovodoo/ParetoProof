import { desc } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { accessRequests } from "../db/schema.js";
import type { ReturnTypeOfCreateAccessGuard } from "../types/access-guard.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";

export function registerAdminRoutes(
  app: FastifyInstance,
  db: ReturnTypeOfCreateDbClient,
  requireAccess: ReturnTypeOfCreateAccessGuard
) {
  app.get(
    "/portal/admin/access-requests",
    {
      preHandler: requireAccess("admin_only")
    },
    async () => {
      const requests = await db
        .select({
          createdAt: accessRequests.createdAt,
          email: accessRequests.email,
          id: accessRequests.id,
          requestedRole: accessRequests.requestedRole,
          reviewedAt: accessRequests.reviewedAt,
          status: accessRequests.status
        })
        .from(accessRequests)
        .orderBy(desc(accessRequests.createdAt))
        .limit(50);

      return {
        items: requests
      };
    }
  );
}
