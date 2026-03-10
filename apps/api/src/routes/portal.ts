import {
  portalAccessRecoveryInputSchema,
  portalAccessRequestInputSchema,
  portalProfileUpdateInputSchema,
  type PortalProfile,
  type PortalAccessRequestSummary
} from "@paretoproof/shared";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  accessRequests,
  auditEvents,
  roleGrants,
  userIdentities,
  users
} from "../db/schema.js";
import { normalizeOptionalEmail } from "../lib/email.js";
import type { ReturnTypeOfCreateAccessGuard } from "../types/access-guard.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";

class PortalAccessRequestConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortalAccessRequestConflictError";
  }
}

function isPendingAccessRequestConflict(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const databaseCode = "code" in error ? String(error.code) : null;
  const constraintName =
    "constraint_name" in error
      ? String(error.constraint_name)
      : "constraint" in error
        ? String(error.constraint)
        : null;

  return (
    databaseCode === "23505" &&
    constraintName === "access_requests_active_pending_email_unique"
  );
}

function toAccessRequestSummary(
  requestRow: typeof accessRequests.$inferSelect
): PortalAccessRequestSummary {
  return {
    createdAt: requestRow.createdAt.toISOString(),
    decisionNote: requestRow.decisionNote,
    email: requestRow.email,
    id: requestRow.id,
    requestKind: requestRow.requestKind,
    rationale: requestRow.rationale,
    requestedRole: requestRow.requestedRole,
    reviewedAt: requestRow.reviewedAt?.toISOString() ?? null,
    status: requestRow.status
  };
}

function createSubmittedAuditPayload(options: {
  accessRequestId: string;
  actorUserId: string;
  requestKind: "access_request" | "identity_recovery";
  requestedRole: "admin" | "collaborator" | "helper";
  targetEmail: string;
}) {
  return {
    accessRequestId: options.accessRequestId,
    actorUserId: options.actorUserId,
    requestKind: options.requestKind,
    requestedRole: options.requestedRole,
    targetEmail: options.targetEmail
  };
}

function sanitizePortalRedirectPath(rawRedirectPath: string | null) {
  if (!rawRedirectPath || rawRedirectPath === "/") {
    return "/";
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawRedirectPath) || rawRedirectPath.startsWith("//")) {
    return "/";
  }

  try {
    const candidateUrl = new URL(
      rawRedirectPath.startsWith("/") ? rawRedirectPath : `/${rawRedirectPath}`,
      "https://portal.paretoproof.com"
    );

    if (candidateUrl.origin !== "https://portal.paretoproof.com") {
      return "/";
    }

    return `${candidateUrl.pathname}${candidateUrl.search}${candidateUrl.hash}` || "/";
  } catch {
    return "/";
  }
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
    email: options.userRow?.email ?? normalizeOptionalEmail(options.fallbackEmail),
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
    "/portal/session/complete",
    {
      preHandler: requireAccess("authenticated_access_identity")
    },
    async (request, reply) => {
      const redirectPath = sanitizePortalRedirectPath(
        (request.query as { redirect?: string } | undefined)?.redirect ?? null
      );
      const portalUrl = new URL(redirectPath, "https://portal.paretoproof.com");
      portalUrl.searchParams.set("access_session", "1");
      reply.redirect(portalUrl.toString());
    }
  );

  app.get(
    "/portal/access-requests/me",
    {
      preHandler: requireAccess("authenticated_access_identity")
    },
    async (request) => {
      const identity = request.accessIdentity;
      const accessContext = request.accessRbacContext;
      const pendingUserId =
        accessContext?.status === "pending" ? accessContext.userId : null;
      const canUsePendingFallback = accessContext?.status === "pending";
      const accessEmail = normalizeOptionalEmail(identity?.email);

      if (!identity) {
        throw new Error("Authenticated Access identity was not attached to the request.");
      }

      const linkedIdentity = await db.query.userIdentities.findFirst({
        where: eq(userIdentities.providerSubject, identity.subject)
      });

      const latestRequest =
        (linkedIdentity
          ? await db.query.accessRequests.findFirst({
              orderBy: [desc(accessRequests.createdAt)],
              where: eq(accessRequests.requestedByUserId, linkedIdentity.userId)
            })
          : null) ??
        (pendingUserId
          ? await db.query.accessRequests.findFirst({
              orderBy: [desc(accessRequests.createdAt)],
              where: eq(accessRequests.requestedByUserId, pendingUserId)
            })
          : null) ??
        (canUsePendingFallback && accessEmail
          ? await db.query.accessRequests.findFirst({
              orderBy: [desc(accessRequests.createdAt)],
              where: and(
                eq(accessRequests.email, accessEmail),
                eq(accessRequests.status, "pending")
              )
            })
          : null);

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
          fallbackEmail: normalizeOptionalEmail(identity.email),
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
          fallbackEmail: normalizeOptionalEmail(identity.email),
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

      const accessEmail = normalizeOptionalEmail(identity.email);

      if (!accessEmail) {
        reply.code(400).send({
          error: "access_email_required"
        });
        return;
      }

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
            const payloadChanged =
              existingRequest.rationale !== parsedBody.data.rationale ||
              existingRequest.requestedRole !== parsedBody.data.requestedRole ||
              existingRequest.requestKind !== "access_request";

            if (!payloadChanged) {
              return existingRequest;
            }

            const [updatedRequest] = await tx
              .update(accessRequests)
              .set({
                rationale: parsedBody.data.rationale,
                requestedRole: parsedBody.data.requestedRole
              })
              .where(eq(accessRequests.id, existingRequest.id))
              .returning();

            await tx.insert(auditEvents).values({
              actorKind: "portal_user",
              actorUserId: user.id,
              eventId: "access_request.submitted",
              payload: createSubmittedAuditPayload({
                accessRequestId: (updatedRequest ?? existingRequest).id,
                actorUserId: user.id,
                requestKind: "access_request",
                requestedRole: parsedBody.data.requestedRole,
                targetEmail: accessEmail
              }),
              severity: "info",
              subjectKind: "access_request",
              targetUserId: user.id
            });

            return updatedRequest ?? existingRequest;
          }

          const [createdRequest] = await tx
            .insert(accessRequests)
            .values({
              email: accessEmail,
              rationale: parsedBody.data.rationale,
              requestKind: "access_request",
              requestedByUserId: user.id,
              requestedRole: parsedBody.data.requestedRole
            })
            .returning();

          if (!createdRequest) {
            throw new Error("Failed to create the contributor access request.");
          }

          await tx.insert(auditEvents).values({
            actorKind: "portal_user",
            actorUserId: user.id,
            eventId: "access_request.submitted",
            payload: createSubmittedAuditPayload({
              accessRequestId: createdRequest.id,
              actorUserId: user.id,
              requestKind: "access_request",
              requestedRole: parsedBody.data.requestedRole,
              targetEmail: accessEmail
            }),
            severity: "info",
            subjectKind: "access_request",
            targetUserId: user.id
          });

          return createdRequest;
        });
      } catch (error) {
        if (isPendingAccessRequestConflict(error)) {
          latestRequest = await db.query.accessRequests.findFirst({
            orderBy: [desc(accessRequests.createdAt)],
            where: and(
              eq(accessRequests.email, accessEmail),
              eq(accessRequests.status, "pending")
            )
          });

          if (!latestRequest) {
            throw error;
          }
        } else if (error instanceof PortalAccessRequestConflictError) {
          reply.code(409).send({
            error: error.message
          });
          return;
        }

        throw error;
      }

      if (!latestRequest) {
        throw new Error("The access-request flow completed without returning a request.");
      }

      return {
        item: toAccessRequestSummary(latestRequest)
      };
    }
  );

  app.post(
    "/portal/access-recovery",
    {
      preHandler: requireAccess("authenticated_access_identity")
    },
    async (request, reply) => {
      const parsedBody = portalAccessRecoveryInputSchema.safeParse(request.body ?? {});

      if (!parsedBody.success) {
        reply.code(400).send({
          error: "invalid_access_recovery_payload",
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

      const accessEmail = normalizeOptionalEmail(identity.email);

      if (!accessEmail) {
        reply.code(400).send({
          error: "access_email_required"
        });
        return;
      }

      let latestRequest;

      try {
        latestRequest = await db.transaction(async (tx) => {
          const existingIdentity = await tx.query.userIdentities.findFirst({
            where: eq(userIdentities.providerSubject, identity.subject)
          });

          if (existingIdentity) {
            throw new PortalAccessRequestConflictError("identity_already_linked");
          }

          const matchingUser = await tx.query.users.findFirst({
            where: eq(users.email, accessEmail)
          });

          if (!matchingUser) {
            throw new PortalAccessRequestConflictError("identity_recovery_not_available");
          }

          const activeRoleRows = await tx
            .select({
              role: roleGrants.role
            })
            .from(roleGrants)
            .where(and(eq(roleGrants.userId, matchingUser.id), isNull(roleGrants.revokedAt)));

          if (activeRoleRows.length === 0) {
            throw new PortalAccessRequestConflictError("identity_recovery_not_available");
          }

          const recoveryRole = activeRoleRows[0]?.role ?? "helper";
          const existingRequest = await tx.query.accessRequests.findFirst({
            orderBy: [desc(accessRequests.createdAt)],
            where: eq(accessRequests.email, accessEmail)
          });

          if (existingRequest?.status === "pending") {
            const payloadChanged =
              existingRequest.requestKind !== "identity_recovery" ||
              existingRequest.rationale !== parsedBody.data.rationale ||
              existingRequest.requestedIdentityProvider !== "cloudflare_one_time_pin" ||
              existingRequest.requestedIdentitySubject !== identity.subject ||
              existingRequest.requestedRole !== recoveryRole;

            if (!payloadChanged) {
              return existingRequest;
            }

            const [updatedRequest] = await tx
              .update(accessRequests)
              .set({
                rationale: parsedBody.data.rationale,
                requestKind: "identity_recovery",
                requestedIdentityProvider: "cloudflare_one_time_pin",
                requestedIdentitySubject: identity.subject,
                requestedByUserId: matchingUser.id,
                requestedRole: recoveryRole
              })
              .where(eq(accessRequests.id, existingRequest.id))
              .returning();

            await tx.insert(auditEvents).values({
              actorKind: "portal_user",
              actorUserId: matchingUser.id,
              eventId: "access_request.submitted",
              payload: createSubmittedAuditPayload({
                accessRequestId: (updatedRequest ?? existingRequest).id,
                actorUserId: matchingUser.id,
                requestKind: "identity_recovery",
                requestedRole: recoveryRole,
                targetEmail: accessEmail
              }),
              severity: "info",
              subjectKind: "access_request",
              targetUserId: matchingUser.id
            });

            return updatedRequest ?? existingRequest;
          }

          const [createdRequest] = await tx
            .insert(accessRequests)
            .values({
              email: accessEmail,
              rationale: parsedBody.data.rationale,
              requestKind: "identity_recovery",
              requestedIdentityProvider: "cloudflare_one_time_pin",
              requestedIdentitySubject: identity.subject,
              requestedByUserId: matchingUser.id,
              requestedRole: recoveryRole
            })
            .returning();

          if (!createdRequest) {
            throw new Error("Failed to create the identity recovery request.");
          }

          await tx.insert(auditEvents).values({
            actorKind: "portal_user",
            actorUserId: matchingUser.id,
            eventId: "access_request.submitted",
            payload: createSubmittedAuditPayload({
              accessRequestId: createdRequest.id,
              actorUserId: matchingUser.id,
              requestKind: "identity_recovery",
              requestedRole: recoveryRole,
              targetEmail: accessEmail
            }),
            severity: "info",
            subjectKind: "access_request",
            targetUserId: matchingUser.id
          });

          return createdRequest;
        });
      } catch (error) {
        if (isPendingAccessRequestConflict(error)) {
          latestRequest = await db.query.accessRequests.findFirst({
            orderBy: [desc(accessRequests.createdAt)],
            where: and(
              eq(accessRequests.email, accessEmail),
              eq(accessRequests.status, "pending")
            )
          });

          if (!latestRequest) {
            throw error;
          }
        } else if (error instanceof PortalAccessRequestConflictError) {
          reply.code(409).send({
            error: error.message
          });
          return;
        }

        throw error;
      }

      if (!latestRequest) {
        throw new Error("The access-recovery flow completed without returning a request.");
      }

      return {
        item: toAccessRequestSummary(latestRequest)
      };
    }
  );
}
