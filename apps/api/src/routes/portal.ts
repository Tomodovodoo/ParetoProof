import {
  portalAccessRequestInputSchema,
  type PortalAccessRequestSummary
} from "@paretoproof/shared";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { accessRequests, roleGrants, userIdentities, users } from "../db/schema.js";
import type { ReturnTypeOfCreateAccessGuard } from "../types/access-guard.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";

class PortalAccessRequestConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortalAccessRequestConflictError";
  }
}

function toAccessRequestSummary(
  requestRow: typeof accessRequests.$inferSelect
): PortalAccessRequestSummary {
  return {
    createdAt: requestRow.createdAt.toISOString(),
    decisionNote: requestRow.decisionNote,
    email: requestRow.email,
    id: requestRow.id,
    rationale: requestRow.rationale,
    requestedRole: requestRow.requestedRole,
    reviewedAt: requestRow.reviewedAt?.toISOString() ?? null,
    status: requestRow.status
  };
}

export function registerPortalRoutes(
  app: FastifyInstance,
  db: ReturnTypeOfCreateDbClient,
  requireAccess: ReturnTypeOfCreateAccessGuard
) {
  app.get(
    "/portal/me",
    {
      preHandler: requireAccess("authenticated_access_identity")
    },
    async (request) => {
      return {
        identity: request.accessIdentity,
        access: request.accessRbacContext
      };
    }
  );

  app.get(
    "/portal/access-requests/me",
    {
      preHandler: requireAccess("authenticated_access_identity")
    },
    async (request, reply) => {
      const identity = request.accessIdentity;

      if (!identity?.email) {
        reply.code(400).send({
          error: "access_email_required"
        });
        return;
      }

      const latestRequest = await db.query.accessRequests.findFirst({
        orderBy: [desc(accessRequests.createdAt)],
        where: eq(accessRequests.email, identity.email)
      });

      return {
        item: latestRequest ? toAccessRequestSummary(latestRequest) : null
      };
    }
  );

  app.post(
    "/portal/access-requests",
    {
      preHandler: requireAccess("authenticated_access_identity")
    },
    async (request, reply) => {
      const parsedBody = portalAccessRequestInputSchema.safeParse(request.body ?? {});

      if (!parsedBody.success) {
        reply.code(400).send({
          error: "invalid_access_request_payload",
          issues: parsedBody.error.issues
        });
        return;
      }

      const identity = request.accessIdentity;

      if (!identity?.email) {
        reply.code(400).send({
          error: "access_email_required"
        });
        return;
      }

      const accessEmail = identity.email;

      let latestRequest;

      try {
        latestRequest = await db.transaction(async (tx) => {
          const [user] = await tx
            .insert(users)
            .values({
              email: accessEmail
            })
            .onConflictDoUpdate({
              set: {
                updatedAt: new Date()
              },
              target: users.email
            })
            .returning({
              id: users.id
            });

          if (!user) {
            throw new Error("Failed to persist the access-request user record.");
          }

          const existingIdentity = await tx.query.userIdentities.findFirst({
            where: eq(userIdentities.providerSubject, identity.subject)
          });

          if (existingIdentity && existingIdentity.userId !== user.id) {
            throw new PortalAccessRequestConflictError("access_identity_already_linked");
          }

          if (existingIdentity) {
            await tx
              .update(userIdentities)
              .set({
                lastSeenAt: new Date(),
                providerEmail: accessEmail
              })
              .where(eq(userIdentities.id, existingIdentity.id));
          } else {
            await tx.insert(userIdentities).values({
              provider: "cloudflare_one_time_pin",
              providerEmail: accessEmail,
              providerSubject: identity.subject,
              userId: user.id
            });
          }

          const activeRoleRows = await tx
            .select({
              role: roleGrants.role
            })
            .from(roleGrants)
            .where(and(eq(roleGrants.userId, user.id), isNull(roleGrants.revokedAt)));

          if (activeRoleRows.length > 0) {
            throw new PortalAccessRequestConflictError("already_approved");
          }

          const existingRequest = await tx.query.accessRequests.findFirst({
            orderBy: [desc(accessRequests.createdAt)],
            where: eq(accessRequests.email, accessEmail)
          });

          if (existingRequest?.status === "pending") {
            const [updatedRequest] = await tx
              .update(accessRequests)
              .set({
                rationale: parsedBody.data.rationale,
                requestedRole: parsedBody.data.requestedRole
              })
              .where(eq(accessRequests.id, existingRequest.id))
              .returning();

            return updatedRequest ?? existingRequest;
          }

          const [createdRequest] = await tx
            .insert(accessRequests)
            .values({
              email: accessEmail,
              rationale: parsedBody.data.rationale,
              requestedByUserId: user.id,
              requestedRole: parsedBody.data.requestedRole
            })
            .returning();

          if (!createdRequest) {
            throw new Error("Failed to create the contributor access request.");
          }

          return createdRequest;
        });
      } catch (error) {
        if (error instanceof PortalAccessRequestConflictError) {
          reply.code(409).send({
            error: error.message
          });
          return;
        }

        throw error;
      }

      if (!latestRequest) {
        return;
      }

      return {
        item: toAccessRequestSummary(latestRequest)
      };
    }
  );
}
