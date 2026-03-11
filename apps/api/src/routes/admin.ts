import {
  portalAdminAccessRequestApproveInputSchema,
  portalAdminAccessRequestRejectInputSchema
} from "@paretoproof/shared";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  accessRequests,
  auditEvents,
  roleGrants,
  userIdentities,
  users
} from "../db/schema.js";
import { toAccessRequestSummary } from "../lib/access-request-summary.js";
import type { ReturnTypeOfCreateAccessGuard } from "../types/access-guard.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";

function getAdminActorUserId(request: FastifyRequest) {
  const context = request.accessRbacContext;

  if (context?.status !== "approved" || !context.roles.includes("admin")) {
    throw new Error("Admin access context was not attached to the request.");
  }

  return context.userId;
}

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
      const requests = await db.query.accessRequests.findMany({
        orderBy: [asc(accessRequests.createdAt)],
        where: eq(accessRequests.status, "pending")
      });

      return {
        items: requests.map((requestRow) => toAccessRequestSummary(requestRow))
      };
    }
  );

  app.post(
    "/portal/admin/access-requests/:accessRequestId/approve",
    {
      preHandler: requireAccess("admin_only")
    },
    async (request, reply) => {
      const parsedBody = portalAdminAccessRequestApproveInputSchema.safeParse(
        request.body ?? {}
      );

      if (!parsedBody.success) {
        reply.code(400).send({
          error: "invalid_access_request_approval_payload",
          issues: parsedBody.error.issues
        });
        return;
      }

      const actorUserId = getAdminActorUserId(request);
      const accessRequestId = (request.params as { accessRequestId?: string }).accessRequestId;

      const result = await db.transaction(async (tx) => {
        const requestRow = await tx.query.accessRequests.findFirst({
          where: eq(accessRequests.id, accessRequestId ?? "")
        });

        if (!requestRow) {
          return {
            kind: "not_found" as const
          };
        }

        if (requestRow.status !== "pending") {
          return {
            kind: "conflict" as const,
            requestRow
          };
        }

        const targetUser =
          requestRow.requestedByUserId
            ? await tx.query.users.findFirst({
                where: eq(users.id, requestRow.requestedByUserId)
              })
            : await tx.query.users.findFirst({
                where: eq(users.email, requestRow.email)
              });

        if (!targetUser) {
          return {
            kind: "not_found" as const
          };
        }

        const now = new Date();
        if (requestRow.requestKind === "identity_recovery") {
          const requestedIdentitySubject = requestRow.requestedIdentitySubject;
          const requestedIdentityProvider = requestRow.requestedIdentityProvider;

          if (!requestedIdentitySubject || !requestedIdentityProvider) {
            return {
              kind: "conflict" as const,
              requestRow
            };
          }

          const existingSubjectOwner = await tx.query.userIdentities.findFirst({
            where: eq(userIdentities.providerSubject, requestedIdentitySubject)
          });

          if (existingSubjectOwner && existingSubjectOwner.userId !== targetUser.id) {
            return {
              kind: "conflict" as const,
              requestRow
            };
          }
        } else {
          const linkedIdentity = await tx.query.userIdentities.findFirst({
            where: eq(userIdentities.userId, targetUser.id)
          });

          if (!linkedIdentity) {
            return {
              kind: "identity_link_required" as const,
              requestRow
            };
          }
        }

        const activeRoleRows = await tx
          .select({
            id: roleGrants.id,
            role: roleGrants.role
          })
          .from(roleGrants)
          .where(and(eq(roleGrants.userId, targetUser.id), isNull(roleGrants.revokedAt)));

        if (requestRow.requestKind === "identity_recovery") {
          const existingSubjectOwner = await tx.query.userIdentities.findFirst({
            where: eq(userIdentities.providerSubject, requestRow.requestedIdentitySubject!)
          });

          if (!existingSubjectOwner) {
            await tx.insert(userIdentities).values({
              provider: requestRow.requestedIdentityProvider!,
              providerEmail: requestRow.email,
              providerSubject: requestRow.requestedIdentitySubject!,
              userId: targetUser.id
            });
          } else {
            await tx
              .update(userIdentities)
              .set({
                lastSeenAt: now,
                providerEmail: requestRow.email
              })
              .where(eq(userIdentities.id, existingSubjectOwner.id));
          }
        } else {
          if (activeRoleRows.length > 0) {
            return {
              kind: "already_approved" as const,
              requestRow
            };
          }

          await tx.insert(roleGrants).values({
            grantedByUserId: actorUserId,
            role: parsedBody.data.approvedRole,
            userId: targetUser.id
          });
        }

        const [reviewedRequest] = await tx
          .update(accessRequests)
          .set({
            decisionNote: parsedBody.data.decisionNote,
            reviewedAt: now,
            reviewedByUserId: actorUserId,
            status: "approved"
          })
          .where(
            and(
              eq(accessRequests.id, requestRow.id),
              eq(accessRequests.status, "pending")
            )
          )
          .returning();

        if (!reviewedRequest) {
          return {
            kind: "conflict" as const,
            requestRow: await tx.query.accessRequests.findFirst({
              where: eq(accessRequests.id, requestRow.id)
            })
          };
        }

        await tx.insert(auditEvents).values([
          {
            actorKind: "portal_user" as const,
            actorUserId,
            eventId: "access_request.approved",
            payload: {
              accessRequestId: reviewedRequest.id,
              actorUserId,
              approvedRole:
                requestRow.requestKind === "identity_recovery"
                  ? requestRow.requestedRole
                  : parsedBody.data.approvedRole,
              requestKind: requestRow.requestKind,
              targetUserId: targetUser.id
            },
            severity: "critical" as const,
            subjectKind: "access_request" as const,
            targetUserId: targetUser.id
          },
          ...(requestRow.requestKind === "identity_recovery"
            ? []
            : [
                {
                  actorKind: "portal_user" as const,
                  actorUserId,
                  eventId: "role_grant.granted",
                  payload: {
                    actorUserId,
                    grantedRole: parsedBody.data.approvedRole,
                    targetUserId: targetUser.id
                  },
                  severity: "critical" as const,
                  subjectKind: "role_grant" as const,
                  targetUserId: targetUser.id
                }
              ])
        ]);

        return {
          item: reviewedRequest,
          kind: "approved" as const
        };
      });

      if (result.kind === "not_found") {
        reply.code(404).send({
          error: "access_request_not_found"
        });
        return;
      }

      if (result.kind === "conflict") {
        reply.code(409).send({
          error: "access_request_not_pending",
          item: result.requestRow ? toAccessRequestSummary(result.requestRow) : null
        });
        return;
      }

      if (result.kind === "identity_link_required") {
        reply.code(409).send({
          error: "access_identity_link_required",
          item: result.requestRow ? toAccessRequestSummary(result.requestRow) : null
        });
        return;
      }

      if (result.kind === "already_approved") {
        reply.code(409).send({
          error: "access_request_stale_for_approved_user",
          item: result.requestRow ? toAccessRequestSummary(result.requestRow) : null
        });
        return;
      }

      return {
        item: toAccessRequestSummary(result.item)
      };
    }
  );

  app.post(
    "/portal/admin/access-requests/:accessRequestId/reject",
    {
      preHandler: requireAccess("admin_only")
    },
    async (request, reply) => {
      const parsedBody = portalAdminAccessRequestRejectInputSchema.safeParse(
        request.body ?? {}
      );

      if (!parsedBody.success) {
        reply.code(400).send({
          error: "invalid_access_request_rejection_payload",
          issues: parsedBody.error.issues
        });
        return;
      }

      const actorUserId = getAdminActorUserId(request);
      const accessRequestId = (request.params as { accessRequestId?: string }).accessRequestId;

      const result = await db.transaction(async (tx) => {
        const requestRow = await tx.query.accessRequests.findFirst({
          where: eq(accessRequests.id, accessRequestId ?? "")
        });

        if (!requestRow) {
          return {
            kind: "not_found" as const
          };
        }

        if (requestRow.status !== "pending") {
          return {
            kind: "conflict" as const,
            requestRow
          };
        }

        const now = new Date();
        const [reviewedRequest] = await tx
          .update(accessRequests)
          .set({
            decisionNote: parsedBody.data.decisionNote,
            reviewedAt: now,
            reviewedByUserId: actorUserId,
            status: "rejected"
          })
          .where(
            and(
              eq(accessRequests.id, requestRow.id),
              eq(accessRequests.status, "pending")
            )
          )
          .returning();

        if (!reviewedRequest) {
          return {
            kind: "conflict" as const,
            requestRow: await tx.query.accessRequests.findFirst({
              where: eq(accessRequests.id, requestRow.id)
            })
          };
        }

        await tx.insert(auditEvents).values({
          actorKind: "portal_user" as const,
          actorUserId,
          eventId: "access_request.rejected",
          payload: {
            accessRequestId: reviewedRequest.id,
            actorUserId,
            decisionNote: parsedBody.data.decisionNote,
            requestKind: reviewedRequest.requestKind,
            targetEmail: reviewedRequest.email
          },
          severity: "warning" as const,
          subjectKind: "access_request" as const,
          targetUserId: reviewedRequest.requestedByUserId
        });

        return {
          item: reviewedRequest,
          kind: "rejected" as const
        };
      });

      if (result.kind === "not_found") {
        reply.code(404).send({
          error: "access_request_not_found"
        });
        return;
      }

      if (result.kind === "conflict") {
        reply.code(409).send({
          error: "access_request_not_pending",
          item: result.requestRow ? toAccessRequestSummary(result.requestRow) : null
        });
        return;
      }

      return {
        item: toAccessRequestSummary(result.item)
      };
    }
  );
}
