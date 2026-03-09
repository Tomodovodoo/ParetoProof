import type { FastifyInstance } from "fastify";
import type { ReturnTypeOfCreateAccessGuard } from "../types/access-guard.js";

export function registerPortalRoutes(
  app: FastifyInstance,
  requireAccess: ReturnTypeOfCreateAccessGuard
) {
  app.get(
    "/portal/me",
    {
      preHandler: requireAccess("pending_or_approved")
    },
    async (request) => {
      return {
        identity: request.accessIdentity,
        access: request.accessRbacContext
      };
    }
  );
}
