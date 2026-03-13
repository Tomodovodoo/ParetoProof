import type {
  PortalAccessRequestSummary,
  PortalAdminAccessRequestDetail,
  PortalAdminAccessRequestListItem,
  PortalAdminAuditEcho,
  PortalAdminMatchedUserSummary,
  PortalAdminRoleGrantSummary,
  PortalAdminUserDetail,
  PortalAdminUserIdentitySummary,
  PortalAdminUserListItem
} from "@paretoproof/shared";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import {
  accessRequests,
  auditEvents,
  roleGrants,
  sessions,
  users,
  userIdentities
} from "../db/schema.js";
import { toAccessRequestSummary } from "./access-request-summary.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";

type AccessRequestWithRelations = typeof accessRequests.$inferSelect & {
  reviewedByUser?: typeof users.$inferSelect | null;
};

type UserWithAdminRelations = typeof users.$inferSelect & {
  accessRequests?: Array<
    (typeof accessRequests.$inferSelect) & {
      reviewedByUser?: typeof users.$inferSelect | null;
    }
  >;
  identities?: Array<typeof userIdentities.$inferSelect>;
  roleGrants?: Array<
    (typeof roleGrants.$inferSelect) & {
      grantedByUser?: typeof users.$inferSelect | null;
      revokedByUser?: typeof users.$inferSelect | null;
    }
  >;
  sessions?: Array<typeof sessions.$inferSelect>;
};

const ACCESS_REQUEST_AUDIT_EVENT_IDS = [
  "access_request.submitted",
  "access_request.approved",
  "access_request.rejected",
  "role_grant.granted",
  "user_identity.linked"
] as const;

export async function loadPortalAdminAccessRequestList(
  db: ReturnTypeOfCreateDbClient
) {
  const requestRows = (await db.query.accessRequests.findMany({
    orderBy: [desc(accessRequests.createdAt)],
    with: {
      reviewedByUser: true
    }
  })) as AccessRequestWithRelations[];

  const matchedUsers = await loadMatchedUsersForRequests(db, requestRows);

  return requestRows
    .map((requestRow) => toPortalAdminAccessRequestListItem(requestRow, matchedUsers))
    .sort(comparePortalAdminAccessRequestListItems);
}

export async function loadPortalAdminAccessRequestDetail(
  db: ReturnTypeOfCreateDbClient,
  accessRequestId: string
): Promise<PortalAdminAccessRequestDetail | null> {
  const requestRow = (await db.query.accessRequests.findFirst({
    where: eq(accessRequests.id, accessRequestId),
    with: {
      reviewedByUser: true
    }
  })) as AccessRequestWithRelations | null;

  if (!requestRow) {
    return null;
  }

  const matchedUsers = await loadMatchedUsersForRequests(db, [requestRow]);
  const matchedUser = getMatchedUserForRequest(requestRow, matchedUsers);
  const item = toPortalAdminAccessRequestListItem(requestRow, matchedUsers);
  const relatedRequestRows = matchedUser
    ? [...(matchedUser.accessRequests ?? [])]
        .filter((candidate) => candidate.id !== requestRow.id)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    : [];
  const recentAuditEvents = matchedUser
    ? await loadAdminAuditEventsForUser(db, matchedUser.id, {
        eventIds: ACCESS_REQUEST_AUDIT_EVENT_IDS
      })
    : [];
  const activeRoleGrant = matchedUser
    ? getActiveRoleGrantSummary(matchedUser.roleGrants ?? [])
    : null;
  const activeSessionCount = matchedUser ? countActiveSessions(matchedUser.sessions ?? []) : 0;

  return {
    activeRoleGrant,
    item,
    matchedUserIdentities: matchedUser
      ? sortIdentities(matchedUser.identities ?? []).map(toPortalAdminUserIdentitySummary)
      : [],
    recentAuditEvents: recentAuditEvents,
    relatedRequests: relatedRequestRows.map((candidate) => toAccessRequestSummary(candidate)),
    sessionImpact: matchedUser
      ? {
          activeSessionCount,
          requiresSessionRefresh: activeSessionCount > 0
        }
      : null
  };
}

export async function loadPortalAdminUserList(
  db: ReturnTypeOfCreateDbClient
) {
  const userRows = (await db.query.users.findMany({
    orderBy: [asc(users.email)],
    with: {
      accessRequests: {
        with: {
          reviewedByUser: true
        }
      },
      identities: true,
      roleGrants: {
        with: {
          grantedByUser: true,
          revokedByUser: true
        }
      },
      sessions: true
    }
  })) as UserWithAdminRelations[];

  return userRows
    .map((userRow) => toPortalAdminUserListItem(userRow))
    .sort((left, right) => left.email.localeCompare(right.email));
}

export async function loadPortalAdminUserDetail(
  db: ReturnTypeOfCreateDbClient,
  userId: string
): Promise<PortalAdminUserDetail | null> {
  const userRow = (await db.query.users.findFirst({
    where: eq(users.id, userId),
    with: {
      accessRequests: {
        with: {
          reviewedByUser: true
        }
      },
      identities: true,
      roleGrants: {
        with: {
          grantedByUser: true,
          revokedByUser: true
        }
      },
      sessions: true
    }
  })) as UserWithAdminRelations | null;

  if (!userRow) {
    return null;
  }

  return {
    ...toPortalAdminUserListItem(userRow),
    linkedIdentities: sortIdentities(userRow.identities ?? []).map(
      toPortalAdminUserIdentitySummary
    ),
    recentAuditEvents: await loadAdminAuditEventsForUser(db, userId),
    requestHistory: [...(userRow.accessRequests ?? [])]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((requestRow) => toAccessRequestSummary(requestRow)),
    roleGrantHistory: [...(userRow.roleGrants ?? [])]
      .sort((left, right) => right.grantedAt.getTime() - left.grantedAt.getTime())
      .map(toPortalAdminRoleGrantSummary)
  };
}

async function loadMatchedUsersForRequests(
  db: ReturnTypeOfCreateDbClient,
  requestRows: AccessRequestWithRelations[]
) {
  const requestedByUserIds = [
    ...new Set(
      requestRows
        .map((requestRow) => requestRow.requestedByUserId)
        .filter((value): value is string => typeof value === "string")
    )
  ];
  const emails = [
    ...new Set(
      requestRows
        .map((requestRow) => requestRow.email)
        .filter((value): value is string => value.length > 0)
    )
  ];
  const requestedIdentitySubjects = [
    ...new Set(
      requestRows
        .map((requestRow) => requestRow.requestedIdentitySubject)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  ];

  if (
    requestedByUserIds.length === 0 &&
    emails.length === 0 &&
    requestedIdentitySubjects.length === 0
  ) {
    return new Map<string, UserWithAdminRelations>();
  }

  const userRows =
    requestedByUserIds.length > 0 || emails.length > 0
      ? ((await db.query.users.findMany({
          where:
            requestedByUserIds.length > 0 && emails.length > 0
              ? or(inArray(users.id, requestedByUserIds), inArray(users.email, emails))
              : requestedByUserIds.length > 0
                ? inArray(users.id, requestedByUserIds)
                : inArray(users.email, emails),
          with: {
            accessRequests: {
              with: {
                reviewedByUser: true
              }
            },
            identities: true,
            roleGrants: {
              with: {
                grantedByUser: true,
                revokedByUser: true
              }
            },
            sessions: true
          }
        })) as UserWithAdminRelations[])
      : [];
  const recoveryIdentityRows =
    requestedIdentitySubjects.length > 0
      ? await db.query.userIdentities.findMany({
          where: inArray(userIdentities.providerSubject, requestedIdentitySubjects)
        })
      : [];
  const recoveryIdentityOwnerIds = [
    ...new Set(recoveryIdentityRows.map((identityRow) => identityRow.userId))
  ].filter((userId) => !userRows.some((userRow) => userRow.id === userId));
  const recoveryIdentityOwners =
    recoveryIdentityOwnerIds.length > 0
      ? ((await db.query.users.findMany({
          where: inArray(users.id, recoveryIdentityOwnerIds),
          with: {
            accessRequests: {
              with: {
                reviewedByUser: true
              }
            },
            identities: true,
            roleGrants: {
              with: {
                grantedByUser: true,
                revokedByUser: true
              }
            },
            sessions: true
          }
        })) as UserWithAdminRelations[])
      : [];

  const matchedUsers = new Map<string, UserWithAdminRelations>();
  const allUserRows = [...userRows, ...recoveryIdentityOwners];

  for (const userRow of allUserRows) {
    matchedUsers.set(userRow.id, userRow);
    matchedUsers.set(`email:${userRow.email}`, userRow);
  }

  for (const identityRow of recoveryIdentityRows) {
    const identityOwner = allUserRows.find((userRow) => userRow.id === identityRow.userId);

    if (identityOwner) {
      matchedUsers.set(`subject:${identityRow.providerSubject}`, identityOwner);
    }
  }

  return matchedUsers;
}

function getMatchedUserForRequest(
  requestRow: AccessRequestWithRelations,
  matchedUsers: Map<string, UserWithAdminRelations>
) {
  if (requestRow.requestedByUserId) {
    return matchedUsers.get(requestRow.requestedByUserId) ?? null;
  }

  return matchedUsers.get(`email:${requestRow.email}`) ?? null;
}

function toPortalAdminAccessRequestListItem(
  requestRow: AccessRequestWithRelations,
  matchedUsers: Map<string, UserWithAdminRelations>
): PortalAdminAccessRequestListItem {
  const matchedUser = getMatchedUserForRequest(requestRow, matchedUsers);
  const activeRole = matchedUser ? getActiveRole(matchedUser.roleGrants ?? []) : null;
  const requestedIdentitySubject = requestRow.requestedIdentitySubject;
  const recoveryIdentityOwner =
    requestRow.requestKind === "identity_recovery" && requestedIdentitySubject
      ? findIdentityOwner(matchedUsers, requestedIdentitySubject)
      : null;

  return {
    ...toAccessRequestSummary(requestRow),
    approvalIdentityLinkRequired:
      requestRow.requestKind === "access_request" &&
      !!matchedUser &&
      (matchedUser.identities?.length ?? 0) === 0,
    matchedUser: matchedUser ? toPortalAdminMatchedUserSummary(matchedUser) : null,
    recoveryRequestedIdentityAlreadyLinked:
      requestRow.requestKind === "identity_recovery" &&
      !!recoveryIdentityOwner &&
      recoveryIdentityOwner.id === matchedUser?.id,
    recoveryRequestedIdentityConflicts:
      requestRow.requestKind === "identity_recovery" &&
      !!recoveryIdentityOwner &&
      recoveryIdentityOwner.id !== matchedUser?.id,
    recoveryRequestedIdentityProvider: requestRow.requestedIdentityProvider ?? null,
    reviewedByUserEmail: requestRow.reviewedByUser?.email ?? null,
    reviewedByUserId: requestRow.reviewedByUser?.id ?? null,
    staleForApprovedUser:
      requestRow.requestKind === "access_request" && activeRole !== null
  };
}

function comparePortalAdminAccessRequestListItems(
  left: PortalAdminAccessRequestListItem,
  right: PortalAdminAccessRequestListItem
) {
  if (left.status === "pending" && right.status !== "pending") {
    return -1;
  }

  if (left.status !== "pending" && right.status === "pending") {
    return 1;
  }

  if (left.status === "pending" && right.status === "pending") {
    return left.createdAt.localeCompare(right.createdAt);
  }

  return (right.reviewedAt ?? right.createdAt).localeCompare(left.reviewedAt ?? left.createdAt);
}

function toPortalAdminMatchedUserSummary(
  userRow: UserWithAdminRelations
): PortalAdminMatchedUserSummary {
  const latestPendingRequest = getLatestRequestByStatus(userRow.accessRequests ?? [], "pending");
  const latestReviewedRequest = getLatestReviewedRequest(userRow.accessRequests ?? []);

  return {
    activeRole: getActiveRole(userRow.roleGrants ?? []),
    activeSessionCount: countActiveSessions(userRow.sessions ?? []),
    displayName: userRow.displayName,
    email: userRow.email,
    id: userRow.id,
    latestReviewedRequestStatus: latestReviewedRequest?.status ?? null,
    linkedIdentityCount: userRow.identities?.length ?? 0,
    pendingRequestId: latestPendingRequest?.id ?? null
  };
}

function toPortalAdminUserListItem(
  userRow: UserWithAdminRelations
): PortalAdminUserListItem {
  const sortedRoleGrants = [...(userRow.roleGrants ?? [])].sort(
    (left, right) => right.grantedAt.getTime() - left.grantedAt.getTime()
  );
  const activeRoleGrant = sortedRoleGrants.find((roleGrant) => roleGrant.revokedAt === null) ?? null;
  const latestPendingRequest = getLatestRequestByStatus(userRow.accessRequests ?? [], "pending");
  const latestReviewedRequest = getLatestReviewedRequest(userRow.accessRequests ?? []);

  return {
    activeRole: activeRoleGrant?.role ?? null,
    activeRoleGrantedAt: activeRoleGrant?.grantedAt.toISOString() ?? null,
    activeSessionCount: countActiveSessions(userRow.sessions ?? []),
    displayName: userRow.displayName,
    email: userRow.email,
    id: userRow.id,
    latestReviewedAt: latestReviewedRequest?.reviewedAt?.toISOString() ?? null,
    latestReviewedRequestStatus: latestReviewedRequest?.status ?? null,
    linkedIdentityProviders: [
      ...new Set(sortIdentities(userRow.identities ?? []).map((identity) => identity.provider))
    ],
    pendingRequestCreatedAt: latestPendingRequest?.createdAt.toISOString() ?? null,
    pendingRequestId: latestPendingRequest?.id ?? null,
    pendingRequestKind: latestPendingRequest?.requestKind ?? null
  };
}

function toPortalAdminUserIdentitySummary(
  identityRow: typeof userIdentities.$inferSelect
): PortalAdminUserIdentitySummary {
  return {
    createdAt: identityRow.createdAt.toISOString(),
    id: identityRow.id,
    lastSeenAt: identityRow.lastSeenAt.toISOString(),
    provider: identityRow.provider,
    providerEmail: identityRow.providerEmail
  };
}

function toPortalAdminRoleGrantSummary(
  roleGrantRow: (typeof roleGrants.$inferSelect) & {
    grantedByUser?: typeof users.$inferSelect | null;
    revokedByUser?: typeof users.$inferSelect | null;
  }
): PortalAdminRoleGrantSummary {
  return {
    grantedAt: roleGrantRow.grantedAt.toISOString(),
    grantedByUserEmail: roleGrantRow.grantedByUser?.email ?? null,
    grantedByUserId: roleGrantRow.grantedByUser?.id ?? roleGrantRow.grantedByUserId ?? null,
    id: roleGrantRow.id,
    revokedAt: roleGrantRow.revokedAt?.toISOString() ?? null,
    revokedByUserEmail: roleGrantRow.revokedByUser?.email ?? null,
    revokedByUserId: roleGrantRow.revokedByUser?.id ?? roleGrantRow.revokedByUserId ?? null,
    role: roleGrantRow.role
  };
}

async function loadAdminAuditEventsForUser(
  db: ReturnTypeOfCreateDbClient,
  userId: string,
  options?: {
    eventIds?: readonly string[];
  }
) {
  const auditRows = await db.query.auditEvents.findMany({
    limit: 20,
    orderBy: [desc(auditEvents.createdAt)],
    where:
      options?.eventIds && options.eventIds.length > 0
        ? and(
            eq(auditEvents.targetUserId, userId),
            inArray(auditEvents.eventId, [...options.eventIds])
          )
        : eq(auditEvents.targetUserId, userId),
    with: {
      actorUser: true
    }
  });

  return auditRows.map((auditRow) => toPortalAdminAuditEcho(auditRow));
}

function toPortalAdminAuditEcho(
  auditRow: (typeof auditEvents.$inferSelect) & {
    actorUser?: typeof users.$inferSelect | null;
  }
): PortalAdminAuditEcho {
  return {
    actorUserEmail: auditRow.actorUser?.email ?? null,
    actorUserId: auditRow.actorUser?.id ?? auditRow.actorUserId ?? null,
    createdAt: auditRow.createdAt.toISOString(),
    eventId: auditRow.eventId,
    id: auditRow.id,
    payload: auditRow.payload,
    severity: auditRow.severity,
    targetUserId: auditRow.targetUserId
  };
}

function sortIdentities(identityRows: Array<typeof userIdentities.$inferSelect>) {
  return [...identityRows].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
}

function getLatestRequestByStatus(
  requestRows: Array<typeof accessRequests.$inferSelect>,
  status: typeof accessRequests.$inferSelect.status
) {
  return [...requestRows]
    .filter((requestRow) => requestRow.status === status)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
}

function getActiveRole(
  roleGrantRows: Array<typeof roleGrants.$inferSelect>
) {
  return (
    [...roleGrantRows]
      .filter((roleGrantRow) => roleGrantRow.revokedAt === null)
      .sort((left, right) => right.grantedAt.getTime() - left.grantedAt.getTime())[0]?.role ?? null
  );
}

function getActiveRoleGrantSummary(
  roleGrantRows: Array<
    (typeof roleGrants.$inferSelect) & {
      grantedByUser?: typeof users.$inferSelect | null;
      revokedByUser?: typeof users.$inferSelect | null;
    }
  >
) {
  const activeRoleGrant = [...roleGrantRows]
    .filter((roleGrantRow) => roleGrantRow.revokedAt === null)
    .sort((left, right) => right.grantedAt.getTime() - left.grantedAt.getTime())[0];

  return activeRoleGrant ? toPortalAdminRoleGrantSummary(activeRoleGrant) : null;
}

function countActiveSessions(sessionRows: Array<typeof sessions.$inferSelect>) {
  const now = Date.now();

  return sessionRows.filter((sessionRow) => {
    return sessionRow.revokedAt === null && sessionRow.expiresAt.getTime() > now;
  }).length;
}

function findIdentityOwner(
  matchedUsers: Map<string, UserWithAdminRelations>,
  providerSubject: string
) {
  return matchedUsers.get(`subject:${providerSubject}`) ?? null;
}

function getLatestReviewedRequest(requestRows: Array<typeof accessRequests.$inferSelect>) {
  return [...requestRows]
    .filter((requestRow) => requestRow.status !== "pending" && requestRow.reviewedAt !== null)
    .sort((left, right) => right.reviewedAt!.getTime() - left.reviewedAt!.getTime())[0];
}
