import {
  portalAccessRequestInputSchema,
  portalProfileUpdateInputSchema,
  type PortalProfile,
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

function toPortalProfile(options: {
  currentSubject: string;
  fallbackEmail: string | null;
  linkedIdentityRows: (typeof userIdentities.$inferSelect)[];
  userRow: typeof users.$inferSelect | null;
}): PortalProfile {
  return {
    createdAt: options.userRow?.createdAt.toISOString() ?? null,
    displayName: options.userRow?.displayName ?? null,
    email: options.userRow?.email ?? options.fallbackEmail,
    identities: [...options.linkedIdentityRows]
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .map((identityRow) => ({
        createdAt: identityRow.createdAt.toISOString(),
        current: identityRow.providerSubject === options.currentSubject,
        id: identityRow.id,
        lastSeenAt: identityRow.lastSeenAt.toISOString(),
        provider: identityRow.provider,
        providerEmail: identityRow.providerEmail
      })),
    linkedUserId: options.userRow?.id ?? null,
    updatedAt: options.userRow?.updatedAt.toISOString() ?? null
  };
}

async function loadPortalProfile(db: ReturnTypeOfCreateDbClient, options: {
  fallbackEmail: string | null;
  identitySubject: string;
}) {
  const linkedIdentity = await db.query.userIdentities.findFirst({
    where: eq(userIdentities.providerSubject, options.identitySubject),
    with: {
      user: {
        with: {
          identities: true
        }
      }
    }
  });

  return toPortalProfile({
    currentSubject: options.identitySubject,
    fallbackEmail: options.fallbackEmail,
    linkedIdentityRows: linkedIdentity?.user.identities ?? [],
    userRow: linkedIdentity?.user ?? null
  });
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

  app.get(
    "/portal/profile",
    {
      preHandler: requireAccess("approved_helper_or_higher")
    },
    async (request) => {
      const identity = request.accessIdentity;

      if (!identity) {
        throw new Error("Authenticated Access identity was not attached to the request.");
      }

      return {
        profile: await loadPortalProfile(db, {
          fallbackEmail: identity.email,
          identitySubject: identity.subject
        })
      };
    }
  );

  app.patch(
    "/portal/profile",
    {
      preHandler: requireAccess("approved_helper_or_higher")
    },
    async (request, reply) => {
      const parsedBody = portalProfileUpdateInputSchema.safeParse(request.body ?? {});

      if (!parsedBody.success) {
        reply.code(400).send({
          error: "invalid_profile_payload",
          issues: parsedBody.error.issues
        });
        return;
      }

      const identity = request.accessIdentity;

      if (!identity) {
        throw new Error("Authenticated Access identity was not attached to the request.");
      }

      const linkedIdentity = await db.query.userIdentities.findFirst({
        where: eq(userIdentities.providerSubject, identity.subject),
        with: {
          user: true
        }
      });

      if (!linkedIdentity) {
        reply.code(409).send({
          error: "profile_not_initialized"
        });
        return;
      }

      await db
        .update(users)
        .set({
          displayName: parsedBody.data.displayName,
          updatedAt: new Date()
        })
        .where(eq(users.id, linkedIdentity.user.id));

      return {
        profile: await loadPortalProfile(db, {
          fallbackEmail: identity.email,
          identitySubject: identity.subject
        })
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
          const existingIdentity = await tx.query.userIdentities.findFirst({
            where: eq(userIdentities.providerSubject, identity.subject)
          });

          const matchingUser = await tx.query.users.findFirst({
            where: eq(users.email, accessEmail),
            with: {
              identities: true
            }
          });

          if (
            existingIdentity &&
            matchingUser &&
            existingIdentity.userId !== matchingUser.id
          ) {
            throw new PortalAccessRequestConflictError("access_identity_already_linked");
          }

          if (
            !existingIdentity &&
            matchingUser &&
            matchingUser.identities.length > 0
          ) {
            throw new PortalAccessRequestConflictError("identity_link_required");
          }

          const user =
            matchingUser ??
            (
              await tx
                .insert(users)
                .values({
                  email: accessEmail
                })
                .returning({
                  id: users.id
                })
            )[0];

          if (!user) {
            throw new Error("Failed to persist the access-request user record.");
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
            // A new Access subject may only link itself to a user record that has never
            // been linked before. Multi-provider recovery and explicit linking live elsewhere.
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

          if (
            existingRequest &&
            (existingRequest.status === "rejected" ||
              existingRequest.status === "withdrawn")
          ) {
            throw new PortalAccessRequestConflictError("access_request_reentry_not_allowed");
          }

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
