import type {
  PortalAdminAccessPosture,
  PortalAdminAccessRequestDetail,
  PortalAdminAccessRequestListItem,
  PortalAdminActorSummary,
  PortalAdminAuditEcho,
  PortalAdminIdentitySummary,
  PortalAdminMatchedUserSummary,
  PortalAdminRoleGrantSummary,
  PortalAdminSessionPosture,
  PortalAdminUserDetail,
  PortalAdminUserListItem,
  PortalAdminUserPendingRequestSummary,
  PortalAdminUserPostureSummary
} from "@paretoproof/shared";
import {
  portalAdminReadModelsContract,
  portalAdminAccessRequestApproveInputSchema,
  portalAdminAccessRequestRejectInputSchema
} from "@paretoproof/shared";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  accessRequests,
  auditEvents,
  roleGrants,
  sessions,
  userIdentities,
  users
} from "../db/schema.js";
import { toAccessRequestSummary } from "../lib/access-request-summary.js";
import type { ReturnTypeOfCreateAccessGuard } from "../types/access-guard.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";

type DbUserRow = typeof users.$inferSelect;
type DbAccessRequestRow = typeof accessRequests.$inferSelect;
type DbUserIdentityRow = typeof userIdentities.$inferSelect;
type DbSessionRow = typeof sessions.$inferSelect;
type DbAuditEventRow = typeof auditEvents.$inferSelect;
type DbRoleGrantRow = typeof roleGrants.$inferSelect;

type AccessRequestWithReviewer = DbAccessRequestRow & {
  reviewedByUser: DbUserRow | null;
};

type RoleGrantWithActors = DbRoleGrantRow & {
  grantedByUser: DbUserRow | null;
  revokedByUser: DbUserRow | null;
};

type AuditEventWithActor = DbAuditEventRow & {
  actorUser: DbUserRow | null;
};

type AdminUserRelations = DbUserRow & {
  accessRequests: AccessRequestWithReviewer[];
  auditEventsAsTarget: AuditEventWithActor[];
  identities: DbUserIdentityRow[];
  roleGrants: RoleGrantWithActors[];
  sessions: DbSessionRow[];
};

const adminAuditEchoEventIds = new Set([
  "access_request.approved",
  "access_request.rejected",
  "access_request.submitted",
  "role_grant.granted",
  "role_grant.revoked",
  "user_identity.linked"
]);

function getAdminActorUserId(request: FastifyRequest) {
  const context = request.accessRbacContext;

  if (context?.status !== "approved" || !context.roles.includes("admin")) {
    throw new Error("Admin access context was not attached to the request.");
  }

  return context.userId;
}

function toAdminActorSummary(userRow: DbUserRow | null | undefined): PortalAdminActorSummary | null {
  if (!userRow) {
    return null;
  }

  return {
    displayName: userRow.displayName,
    email: userRow.email,
    label: userRow.displayName ?? userRow.email ?? userRow.id,
    userId: userRow.id
  };
}

function toAdminMatchedUserSummary(
  userRow: DbUserRow | null | undefined
): PortalAdminMatchedUserSummary | null {
  if (!userRow) {
    return null;
  }

  return {
    displayName: userRow.displayName,
    email: userRow.email,
    userId: userRow.id
  };
}

function toAdminIdentitySummary(identityRow: DbUserIdentityRow): PortalAdminIdentitySummary {
  return {
    createdAt: identityRow.createdAt.toISOString(),
    id: identityRow.id,
    lastSeenAt: identityRow.lastSeenAt.toISOString(),
    provider: identityRow.provider,
    providerEmail: identityRow.providerEmail,
    providerSubject: identityRow.providerSubject
  };
}

function findActiveRoleGrant(roleGrantRows: RoleGrantWithActors[]) {
  return roleGrantRows.find((roleGrantRow) => roleGrantRow.revokedAt === null) ?? null;
}

function toAdminRoleGrantSummary(
  roleGrantRow: RoleGrantWithActors | null | undefined
): PortalAdminRoleGrantSummary | null {
  if (!roleGrantRow) {
    return null;
  }

  return {
    grantedAt: roleGrantRow.grantedAt.toISOString(),
    grantedBy: toAdminActorSummary(roleGrantRow.grantedByUser),
    revokedAt: roleGrantRow.revokedAt?.toISOString() ?? null,
    revokedBy: toAdminActorSummary(roleGrantRow.revokedByUser),
    role: roleGrantRow.role
  };
}

function toAdminPendingRequestSummary(
  requestRow: AccessRequestWithReviewer | null | undefined
): PortalAdminUserPendingRequestSummary | null {
  if (!requestRow) {
    return null;
  }

  return {
    createdAt: requestRow.createdAt.toISOString(),
    id: requestRow.id,
    requestKind: requestRow.requestKind
  };
}

function sortAccessRequestRows(rows: AccessRequestWithReviewer[]) {
  return [...rows].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

function buildSessionPosture(sessionRows: DbSessionRow[]): PortalAdminSessionPosture {
  const now = new Date();
  const activeSessionRows = sessionRows
    .filter((sessionRow) => isActiveSession(sessionRow, now))
    .sort((left, right) => right.expiresAt.getTime() - left.expiresAt.getTime());

  return {
    activeSessionCount: activeSessionRows.length,
    latestSessionExpiresAt: activeSessionRows[0]?.expiresAt.toISOString() ?? null
  };
}

function isActiveSession(sessionRow: DbSessionRow, now: Date) {
  return sessionRow.revokedAt === null && sessionRow.expiresAt.getTime() > now.getTime();
}

function deriveAccessPosture(
  activeRole: PortalAdminRoleGrantSummary | null,
  pendingRequest: AccessRequestWithReviewer | null,
  reviewedRequest: AccessRequestWithReviewer | null
): PortalAdminAccessPosture {
  if (activeRole) {
    return "approved";
  }

  if (pendingRequest) {
    return "pending_request";
  }

  if (reviewedRequest) {
    return "review_history_only";
  }

  return "no_active_role";
}

function buildUserPostureSummary(userRow: AdminUserRelations): PortalAdminUserPostureSummary {
  const sortedRequests = sortAccessRequestRows(userRow.accessRequests);
  const activeRole = toAdminRoleGrantSummary(findActiveRoleGrant(userRow.roleGrants));
  const pendingRequest =
    sortedRequests.find((requestRow) => requestRow.status === "pending") ?? null;
  const reviewedRequest =
    sortedRequests.find((requestRow) => requestRow.status !== "pending") ?? null;

  return {
    accessPosture: deriveAccessPosture(activeRole, pendingRequest, reviewedRequest),
    activeRole,
    lastReviewedRequestStatus: reviewedRequest?.status ?? null,
    linkedIdentityCount: userRow.identities.length,
    pendingRequestId: pendingRequest?.id ?? null
  };
}

function toAdminAuditEcho(auditEventRow: AuditEventWithActor): PortalAdminAuditEcho {
  return {
    actor: toAdminActorSummary(auditEventRow.actorUser),
    createdAt: auditEventRow.createdAt.toISOString(),
    eventId: auditEventRow.eventId,
    id: auditEventRow.id,
    payload: auditEventRow.payload,
    severity: auditEventRow.severity,
    subjectKind: auditEventRow.subjectKind,
    targetUserId: auditEventRow.targetUserId
  };
}

async function loadAdminUserById(
  db: ReturnTypeOfCreateDbClient,
  userId: string | null | undefined
) {
  if (!userId) {
    return null;
  }

  return db.query.users.findFirst({
    where: eq(users.id, userId),
    with: {
      accessRequests: {
        orderBy: [desc(accessRequests.createdAt)],
        with: {
          reviewedByUser: true
        }
      },
      auditEventsAsTarget: {
        orderBy: [desc(auditEvents.createdAt)],
        with: {
          actorUser: true
        }
      },
      identities: {
        orderBy: [asc(userIdentities.createdAt)]
      },
      roleGrants: {
        orderBy: [desc(roleGrants.grantedAt)],
        with: {
          grantedByUser: true,
          revokedByUser: true
        }
      },
      sessions: {
        orderBy: [desc(sessions.expiresAt)]
      }
    }
  }) as Promise<AdminUserRelations | null>;
}

async function loadAdminUserByEmail(
  db: ReturnTypeOfCreateDbClient,
  email: string
) {
  return db.query.users.findFirst({
    where: eq(users.email, email),
    with: {
      accessRequests: {
        orderBy: [desc(accessRequests.createdAt)],
        with: {
          reviewedByUser: true
        }
      },
      auditEventsAsTarget: {
        orderBy: [desc(auditEvents.createdAt)],
        with: {
          actorUser: true
        }
      },
      identities: {
        orderBy: [asc(userIdentities.createdAt)]
      },
      roleGrants: {
        orderBy: [desc(roleGrants.grantedAt)],
        with: {
          grantedByUser: true,
          revokedByUser: true
        }
      },
      sessions: {
        orderBy: [desc(sessions.expiresAt)]
      }
    }
  }) as Promise<AdminUserRelations | null>;
}

async function loadMatchedUserForRequest(
  db: ReturnTypeOfCreateDbClient,
  requestRow: DbAccessRequestRow
) {
  return requestRow.requestedByUserId
    ? loadAdminUserById(db, requestRow.requestedByUserId)
    : loadAdminUserByEmail(db, requestRow.email);
}

async function buildRecoveryContext(
  db: ReturnTypeOfCreateDbClient,
  requestRow: DbAccessRequestRow,
  matchedUser: AdminUserRelations | null
) {
  if (requestRow.requestKind !== "identity_recovery") {
    return null;
  }

  const existingIdentity = requestRow.requestedIdentitySubject
    ? await db.query.userIdentities.findFirst({
        where: eq(userIdentities.providerSubject, requestRow.requestedIdentitySubject),
        with: {
          user: true
        }
      })
    : null;
  const activeRole = matchedUser
    ? toAdminRoleGrantSummary(findActiveRoleGrant(matchedUser.roleGrants))
    : null;

  return {
    conflictingUser:
      existingIdentity && existingIdentity.userId !== matchedUser?.id
        ? toAdminMatchedUserSummary(existingIdentity.user)
        : null,
    preserveExistingRole: activeRole?.role ?? requestRow.requestedRole,
    requestedIdentityAlreadyLinked: Boolean(
      existingIdentity && matchedUser && existingIdentity.userId === matchedUser.id
    ),
    requestedIdentityProvider: requestRow.requestedIdentityProvider,
    requestedIdentitySubject: requestRow.requestedIdentitySubject
  };
}

async function toAdminAccessRequestListItem(
  db: ReturnTypeOfCreateDbClient,
  requestRow: AccessRequestWithReviewer,
  matchedUserOverride?: AdminUserRelations | null
): Promise<PortalAdminAccessRequestListItem> {
  const matchedUser =
    matchedUserOverride === undefined
      ? await loadMatchedUserForRequest(db, requestRow)
      : matchedUserOverride;

  return {
    createdAt: requestRow.createdAt.toISOString(),
    decisionNote: requestRow.decisionNote,
    email: requestRow.email,
    id: requestRow.id,
    matchedUser: toAdminMatchedUserSummary(matchedUser),
    matchedUserPosture: matchedUser ? buildUserPostureSummary(matchedUser) : null,
    rationale: requestRow.rationale,
    recovery: await buildRecoveryContext(db, requestRow, matchedUser),
    requestKind: requestRow.requestKind,
    requestedRole: requestRow.requestedRole,
    reviewedAt: requestRow.reviewedAt?.toISOString() ?? null,
    reviewer: toAdminActorSummary(requestRow.reviewedByUser),
    status: requestRow.status
  };
}

function sortAdminAccessRequestItems(
  items: PortalAdminAccessRequestListItem[]
) {
  return [...items].sort((left, right) => {
    if (left.status === "pending" && right.status !== "pending") {
      return -1;
    }

    if (left.status !== "pending" && right.status === "pending") {
      return 1;
    }

    if (left.status === "pending" && right.status === "pending") {
      return (
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      );
    }

    return (
      new Date(right.reviewedAt ?? right.createdAt).getTime() -
      new Date(left.reviewedAt ?? left.createdAt).getTime()
    );
  });
}

function dedupeAccessRequestRows(rows: AccessRequestWithReviewer[]) {
  const rowsById = new Map<string, AccessRequestWithReviewer>();

  for (const row of rows) {
    rowsById.set(row.id, row);
  }

  return sortAccessRequestRows([...rowsById.values()]);
}

async function loadAdminAccessRequestList(
  db: ReturnTypeOfCreateDbClient
) {
  const requestRows = (await db.query.accessRequests.findMany({
    orderBy: [desc(accessRequests.createdAt)],
    with: {
      reviewedByUser: true
    }
  })) as AccessRequestWithReviewer[];

  const items = await Promise.all(
    requestRows.map((requestRow) => toAdminAccessRequestListItem(db, requestRow))
  );

  return sortAdminAccessRequestItems(items);
}

async function loadAdminAccessRequestDetail(
  db: ReturnTypeOfCreateDbClient,
  accessRequestId: string
) {
  const requestRow = (await db.query.accessRequests.findFirst({
    where: eq(accessRequests.id, accessRequestId),
    with: {
      reviewedByUser: true
    }
  })) as AccessRequestWithReviewer | null;

  if (!requestRow) {
    return null;
  }

  const matchedUser = await loadMatchedUserForRequest(db, requestRow);
  const emailRelatedRequestRows = (await db.query.accessRequests.findMany({
    orderBy: [desc(accessRequests.createdAt)],
    where: eq(accessRequests.email, requestRow.email),
    with: {
      reviewedByUser: true
    }
  })) as AccessRequestWithReviewer[];
  const relatedRequestRows = dedupeAccessRequestRows([
    ...(matchedUser?.accessRequests ?? []),
    ...emailRelatedRequestRows
  ]);
  const listItem = await toAdminAccessRequestListItem(db, requestRow, matchedUser);

  return {
    ...listItem,
    activeRole: matchedUser
      ? toAdminRoleGrantSummary(findActiveRoleGrant(matchedUser.roleGrants))
      : null,
    auditEchoes: (matchedUser?.auditEventsAsTarget ?? [])
      .filter((auditEventRow) => adminAuditEchoEventIds.has(auditEventRow.eventId))
      .slice(0, 10)
      .map((auditEventRow) => toAdminAuditEcho(auditEventRow)),
    linkedIdentities: (matchedUser?.identities ?? []).map((identityRow) =>
      toAdminIdentitySummary(identityRow)
    ),
    relatedRequests: await Promise.all(
      relatedRequestRows.map((relatedRequestRow) =>
        toAdminAccessRequestListItem(db, relatedRequestRow, matchedUser)
      )
    ),
    sessionPosture: buildSessionPosture(matchedUser?.sessions ?? [])
  } satisfies PortalAdminAccessRequestDetail;
}

function toAdminUserListItem(userRow: AdminUserRelations): PortalAdminUserListItem {
  const posture = buildUserPostureSummary(userRow);
  const pendingRequest =
    userRow.accessRequests.find((requestRow) => requestRow.status === "pending") ?? null;

  return {
    accessPosture: posture.accessPosture,
    activeRole: posture.activeRole,
    displayName: userRow.displayName,
    email: userRow.email,
    lastReviewedRequestStatus: posture.lastReviewedRequestStatus,
    linkedIdentityProviders: [...new Set(userRow.identities.map((identity) => identity.provider))],
    pendingRequest: toAdminPendingRequestSummary(pendingRequest),
    userId: userRow.id
  };
}

function sortAdminUsers(items: PortalAdminUserListItem[]) {
  return [...items].sort((left, right) => left.email.localeCompare(right.email));
}

async function loadAdminUserList(
  db: ReturnTypeOfCreateDbClient
) {
  const userRows = (await db.query.users.findMany({
    orderBy: [asc(users.email)],
    with: {
      accessRequests: {
        orderBy: [desc(accessRequests.createdAt)],
        with: {
          reviewedByUser: true
        }
      },
      identities: {
        orderBy: [asc(userIdentities.createdAt)]
      },
      roleGrants: {
        orderBy: [desc(roleGrants.grantedAt)],
        with: {
          grantedByUser: true,
          revokedByUser: true
        }
      }
    }
  })) as AdminUserRelations[];

  return sortAdminUsers(userRows.map((userRow) => toAdminUserListItem(userRow)));
}

async function loadAdminUserDetail(
  db: ReturnTypeOfCreateDbClient,
  userId: string
) {
  const userRow = await loadAdminUserById(db, userId);

  if (!userRow) {
    return null;
  }

  return {
    ...toAdminUserListItem(userRow),
    auditHistory: userRow.auditEventsAsTarget
      .filter((auditEventRow) => adminAuditEchoEventIds.has(auditEventRow.eventId))
      .slice(0, 12)
      .map((auditEventRow) => toAdminAuditEcho(auditEventRow)),
    linkedIdentities: userRow.identities.map((identityRow) =>
      toAdminIdentitySummary(identityRow)
    ),
    requestHistory: await Promise.all(
      userRow.accessRequests.map((requestRow) =>
        toAdminAccessRequestListItem(db, requestRow, userRow)
      )
    ),
    roleGrantHistory: userRow.roleGrants.map((roleGrantRow) =>
      toAdminRoleGrantSummary(roleGrantRow)
    ).filter((roleGrantRow): roleGrantRow is PortalAdminRoleGrantSummary => roleGrantRow !== null),
    sessionPosture: buildSessionPosture(userRow.sessions)
  } satisfies PortalAdminUserDetail;
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
      return {
        items: await loadAdminAccessRequestList(db)
      };
    }
  );

  app.get(
    "/portal/admin/access-requests/:accessRequestId",
    {
      preHandler: requireAccess("admin_only")
    },
    async (request, reply) => {
      const accessRequestId = (request.params as { accessRequestId?: string }).accessRequestId;
      const item = accessRequestId
        ? await loadAdminAccessRequestDetail(db, accessRequestId)
        : null;

      if (!item) {
        reply.code(404).send({
          error: "access_request_not_found"
        });
        return;
      }

      return { item };
    }
  );

  app.get(
    "/portal/admin/users",
    {
      preHandler: requireAccess("admin_only")
    },
    async () => {
      return {
        items: await loadAdminUserList(db)
      };
    }
  );

  app.get(
    "/portal/admin/users/:userId",
    {
      preHandler: requireAccess("admin_only")
    },
    async (request, reply) => {
      const userId = (request.params as { userId?: string }).userId;
      const item = userId ? await loadAdminUserDetail(db, userId) : null;

      if (!item) {
        reply.code(404).send({
          error: "admin_user_not_found"
        });
        return;
      }

      return { item };
    }
  );

  app.post(
    "/portal/admin/users/:userId/revoke-role",
    {
      preHandler: requireAccess("admin_only")
    },
    async (request, reply) => {
      const parsedBody = portalAdminReadModelsContract.userRevokeInput.safeParse(
        request.body ?? {}
      );

      if (!parsedBody.success) {
        reply.code(400).send({
          error: "invalid_admin_user_revoke_payload",
          issues: parsedBody.error.issues
        });
        return;
      }

      const actorUserId = getAdminActorUserId(request);
      const userId = (request.params as { userId?: string }).userId;

      const result = await db.transaction(async (tx) => {
        const targetUser = await tx.query.users.findFirst({
          where: eq(users.id, userId ?? "")
        });

        if (!targetUser) {
          return {
            kind: "not_found" as const
          };
        }

        const activeRoleGrant = await tx.query.roleGrants.findFirst({
          orderBy: [desc(roleGrants.grantedAt)],
          where: and(eq(roleGrants.userId, targetUser.id), isNull(roleGrants.revokedAt))
        });

        if (!activeRoleGrant) {
          return {
            kind: "no_active_role" as const
          };
        }

        if (activeRoleGrant.role === "admin") {
          return {
            kind: "admin_role_not_revocable" as const
          };
        }

        const now = new Date();
        const [revokedRoleGrant] = await tx
          .update(roleGrants)
          .set({
            revokedAt: now,
            revokedByUserId: actorUserId
          })
          .where(and(eq(roleGrants.id, activeRoleGrant.id), isNull(roleGrants.revokedAt)))
          .returning();

        if (!revokedRoleGrant) {
          return {
            kind: "conflict" as const
          };
        }

        const activeSessionRows = await tx.query.sessions.findMany({
          where: and(eq(sessions.userId, targetUser.id), isNull(sessions.revokedAt))
        });
        const activeSessionsToRevoke = activeSessionRows.filter((sessionRow) =>
          isActiveSession(sessionRow, now)
        );

        if (activeSessionsToRevoke.length > 0) {
          await tx
            .update(sessions)
            .set({
              revokedAt: now
            })
            .where(and(eq(sessions.userId, targetUser.id), isNull(sessions.revokedAt)));
        }

        await tx.insert(auditEvents).values({
          actorKind: "portal_user",
          actorUserId,
          eventId: "role_grant.revoked",
          payload: {
            actorUserId,
            revokedRole: activeRoleGrant.role,
            revokedSessionCount: activeSessionsToRevoke.length,
            revocationReason: parsedBody.data.reason,
            roleGrantId: activeRoleGrant.id,
            targetUserId: targetUser.id
          },
          severity: "critical",
          subjectKind: "role_grant",
          targetUserId: targetUser.id
        });

        return {
          kind: "revoked" as const,
          userId: targetUser.id
        };
      });

      if (result.kind === "not_found") {
        reply.code(404).send({
          error: "admin_user_not_found"
        });
        return;
      }

      if (result.kind === "no_active_role") {
        reply.code(409).send({
          error: "admin_user_no_active_role"
        });
        return;
      }

      if (result.kind === "admin_role_not_revocable") {
        reply.code(409).send({
          error: "admin_user_role_not_revocable"
        });
        return;
      }

      if (result.kind === "conflict") {
        reply.code(409).send({
          error: "admin_user_role_revocation_conflict"
        });
        return;
      }

      const item = await loadAdminUserDetail(db, result.userId);

      return {
        item
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
            kind: "target_user_missing" as const,
            requestRow
          };
        }

        const now = new Date();
        let linkedIdentityAuditEvent: typeof auditEvents.$inferInsert | null = null;

        if (requestRow.requestKind === "identity_recovery") {
          const requestedIdentitySubject = requestRow.requestedIdentitySubject;
          const requestedIdentityProvider = requestRow.requestedIdentityProvider;

          if (!requestedIdentitySubject || !requestedIdentityProvider) {
            return {
              kind: "recovery_identity_missing" as const,
              requestRow
            };
          }

          const existingSubjectOwner = await tx.query.userIdentities.findFirst({
            where: eq(userIdentities.providerSubject, requestedIdentitySubject)
          });

          if (existingSubjectOwner && existingSubjectOwner.userId !== targetUser.id) {
            return {
              conflictUserId: existingSubjectOwner.userId,
              kind: "recovery_identity_conflict" as const,
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
            linkedIdentityAuditEvent = {
              actorKind: "portal_user" as const,
              actorUserId,
              eventId: "user_identity.linked",
              payload: {
                actorUserId,
                identityProvider: requestRow.requestedIdentityProvider!,
                identitySubject: requestRow.requestedIdentitySubject!,
                targetUserId: targetUser.id
              },
              severity: "critical" as const,
              subjectKind: "user_identity" as const,
              targetUserId: targetUser.id
            };
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

        const auditEventRows: Array<typeof auditEvents.$inferInsert> = [
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
            ? linkedIdentityAuditEvent
              ? [linkedIdentityAuditEvent]
              : []
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
        ];

        await tx.insert(auditEvents).values(auditEventRows);

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

      if (result.kind === "target_user_missing") {
        reply.code(409).send({
          error: "access_request_target_user_missing",
          item: result.requestRow ? toAccessRequestSummary(result.requestRow) : null
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

      if (result.kind === "recovery_identity_missing") {
        reply.code(409).send({
          error: "identity_recovery_identity_missing",
          item: result.requestRow ? toAccessRequestSummary(result.requestRow) : null
        });
        return;
      }

      if (result.kind === "recovery_identity_conflict") {
        reply.code(409).send({
          conflictUserId: result.conflictUserId,
          error: "identity_recovery_identity_conflict",
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
