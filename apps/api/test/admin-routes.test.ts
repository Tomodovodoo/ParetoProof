import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import {
  portalAdminReadModelsContract,
  type PortalAdminAccessRequestApproveInput
} from "@paretoproof/shared";
import {
  accessRequests,
  auditEvents,
  roleGrants,
  sessions,
  userIdentities,
  users
} from "../src/db/schema.ts";
import { registerAdminRoutes } from "../src/routes/admin.ts";

function createAdminAccessGuard() {
  return () => (request: {
    accessRbacContext?: unknown;
  }, _reply: unknown, done: () => void) => {
    request.accessRbacContext = {
      email: "admin@paretoproof.com",
      identityId: "11111111-1111-4111-8111-111111111111",
      roles: ["admin"],
      status: "approved",
      subject: "admin-subject",
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    };
    done();
  };
}

function buildUser(overrides: Partial<typeof users.$inferSelect> = {}): typeof users.$inferSelect {
  return {
    createdAt: new Date("2026-03-13T18:00:00.000Z"),
    displayName: null,
    email: "person@paretoproof.com",
    id: "11111111-1111-4111-8111-111111111111",
    updatedAt: new Date("2026-03-13T18:00:00.000Z"),
    ...overrides
  };
}

function buildIdentity(
  overrides: Partial<typeof userIdentities.$inferSelect> = {}
): typeof userIdentities.$inferSelect {
  return {
    createdAt: new Date("2026-03-13T18:05:00.000Z"),
    id: "22222222-2222-4222-8222-222222222222",
    lastSeenAt: new Date("2026-03-13T18:10:00.000Z"),
    provider: "cloudflare_google",
    providerEmail: "person@paretoproof.com",
    providerSubject: "google-subject",
    userId: "11111111-1111-4111-8111-111111111111",
    ...overrides
  };
}

function buildAccessRequest(
  overrides: Partial<typeof accessRequests.$inferSelect> = {}
): typeof accessRequests.$inferSelect {
  return {
    createdAt: new Date("2026-03-13T18:20:00.000Z"),
    decisionNote: null,
    email: "person@paretoproof.com",
    id: "33333333-3333-4333-8333-333333333333",
    rationale: "Need collaborator access",
    requestKind: "access_request",
    requestedByUserId: "11111111-1111-4111-8111-111111111111",
    requestedIdentityProvider: null,
    requestedIdentitySubject: null,
    requestedRole: "collaborator",
    reviewedAt: null,
    reviewedByUserId: null,
    status: "pending",
    ...overrides
  };
}

function buildRoleGrant(
  overrides: Partial<typeof roleGrants.$inferSelect> = {}
): typeof roleGrants.$inferSelect {
  return {
    grantedAt: new Date("2026-03-13T18:15:00.000Z"),
    grantedByUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    id: "44444444-4444-4444-8444-444444444444",
    revokedAt: null,
    revokedByUserId: null,
    role: "collaborator",
    userId: "11111111-1111-4111-8111-111111111111",
    ...overrides
  };
}

function buildSession(
  overrides: Partial<typeof sessions.$inferSelect> = {}
): typeof sessions.$inferSelect {
  return {
    createdAt: new Date("2026-03-13T18:00:00.000Z"),
    expiresAt: new Date("2026-03-14T18:00:00.000Z"),
    id: "55555555-5555-4555-8555-555555555555",
    identityId: "22222222-2222-4222-8222-222222222222",
    ipAddress: null,
    lastSeenAt: new Date("2026-03-13T18:30:00.000Z"),
    revokedAt: null,
    tokenHash: "token-hash",
    userAgent: "test-agent",
    userId: "11111111-1111-4111-8111-111111111111",
    ...overrides
  };
}

function buildAuditEvent(
  overrides: Partial<typeof auditEvents.$inferSelect> = {}
): typeof auditEvents.$inferSelect {
  return {
    actorKind: "portal_user",
    actorUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    createdAt: new Date("2026-03-13T18:40:00.000Z"),
    eventId: "access_request.approved",
    id: "66666666-6666-4666-8666-666666666666",
    payload: {
      accessRequestId: "33333333-3333-4333-8333-333333333333",
      targetUserId: "11111111-1111-4111-8111-111111111111"
    },
    severity: "critical",
    subjectKind: "access_request",
    targetUserId: "11111111-1111-4111-8111-111111111111",
    ...overrides
  };
}

test("GET /portal/admin/access-requests returns the richer admin read model", async (t) => {
  const reviewer = buildUser({
    displayName: "Admin Reviewer",
    email: "admin@paretoproof.com",
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  });
  const matchedUser = buildUser({
    displayName: "Researcher One"
  });
  const conflictingUser = buildUser({
    displayName: "Different Owner",
    email: "different@paretoproof.com",
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  });
  const recoveryRequest = {
    ...buildAccessRequest({
      createdAt: new Date("2026-03-13T18:00:00.000Z"),
      email: "recover@paretoproof.com",
      id: "77777777-7777-4777-8777-777777777777",
      rationale: "Lost my Google login",
      requestKind: "identity_recovery",
      requestedIdentityProvider: "cloudflare_google",
      requestedIdentitySubject: "recovery-subject",
      status: "pending"
    }),
    reviewedByUser: null
  };
  const db = {
    query: {
      accessRequests: {
        findMany: async () => [recoveryRequest]
      },
      userIdentities: {
        findFirst: async () => ({
          ...buildIdentity({
            providerSubject: "recovery-subject",
            userId: conflictingUser.id
          }),
          user: conflictingUser
        })
      },
      users: {
        findFirst: async () => ({
          ...matchedUser,
          accessRequests: [recoveryRequest],
          auditEventsAsTarget: [],
          identities: [buildIdentity()],
          roleGrants: [
            {
              ...buildRoleGrant(),
              grantedByUser: reviewer,
              revokedByUser: null
            }
          ],
          sessions: [buildSession()]
        })
      }
    }
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerAdminRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "GET",
    url: "/portal/admin/access-requests"
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(
    portalAdminReadModelsContract.accessRequestListResponse.safeParse(payload).success,
    true
  );
  assert.equal(payload.items[0]?.matchedUser?.email, "person@paretoproof.com");
  assert.equal(payload.items[0]?.matchedUserPosture?.activeRole?.role, "collaborator");
  assert.equal(
    payload.items[0]?.recovery?.conflictingUser?.userId,
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  );
  assert.equal(payload.items[0]?.recovery?.requestedIdentityAlreadyLinked, false);
});

test("GET /portal/admin/users and detail expose user posture, history, and audit echoes", async (t) => {
  const reviewer = buildUser({
    displayName: "Admin Reviewer",
    email: "admin@paretoproof.com",
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  });
  const matchedUser = {
    ...buildUser({
      displayName: "Researcher One"
    }),
    accessRequests: [
      {
        ...buildAccessRequest({
          id: "88888888-8888-4888-8888-888888888888",
          reviewedAt: new Date("2026-03-13T18:55:00.000Z"),
          reviewedByUserId: reviewer.id,
          status: "approved"
        }),
        reviewedByUser: reviewer
      },
      {
        ...buildAccessRequest({
          createdAt: new Date("2026-03-13T19:10:00.000Z"),
          id: "99999999-9999-4999-8999-999999999999",
          status: "pending"
        }),
        reviewedByUser: null
      }
    ],
    auditEventsAsTarget: [
      {
        ...buildAuditEvent(),
        actorUser: reviewer
      },
      {
        ...buildAuditEvent({
          eventId: "user_identity.linked",
          id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          payload: {
            identityProvider: "cloudflare_google",
            identitySubject: "google-subject",
            targetUserId: "11111111-1111-4111-8111-111111111111"
          },
          subjectKind: "user_identity"
        }),
        actorUser: reviewer
      }
    ],
    identities: [buildIdentity()],
    roleGrants: [
      {
        ...buildRoleGrant(),
        grantedByUser: reviewer,
        revokedByUser: null
      }
    ],
    sessions: [buildSession()]
  };
  const db = {
    query: {
      users: {
        findMany: async () => [matchedUser],
        findFirst: async () => matchedUser
      },
      accessRequests: {
        findMany: async () => matchedUser.accessRequests
      },
      userIdentities: {
        findFirst: async () => null
      }
    }
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerAdminRoutes(app, db as never, createAdminAccessGuard() as never);

  const listResponse = await app.inject({
    method: "GET",
    url: "/portal/admin/users"
  });

  assert.equal(listResponse.statusCode, 200);
  const listPayload = listResponse.json();
  assert.equal(
    portalAdminReadModelsContract.userListResponse.safeParse(listPayload).success,
    true
  );
  assert.equal(listPayload.items[0]?.accessPosture, "approved");
  assert.equal(listPayload.items[0]?.pendingRequest?.id, "99999999-9999-4999-8999-999999999999");

  const detailResponse = await app.inject({
    method: "GET",
    url: `/portal/admin/users/${matchedUser.id}`
  });

  assert.equal(detailResponse.statusCode, 200);
  const detailPayload = detailResponse.json();
  assert.equal(
    portalAdminReadModelsContract.userDetailResponse.safeParse(detailPayload).success,
    true
  );
  assert.equal(detailPayload.item.linkedIdentities.length, 1);
  assert.equal(detailPayload.item.requestHistory.length, 2);
  assert.deepEqual(
    detailPayload.item.auditHistory.map((entry: { eventId: string }) => entry.eventId),
    ["access_request.approved", "user_identity.linked"]
  );
  assert.equal(detailPayload.item.sessionPosture.activeSessionCount, 1);
});

test("POST /portal/admin/access-requests/:id/approve emits user_identity.linked for recovery approval", async (t) => {
  const requestRow = buildAccessRequest({
    email: "recover@paretoproof.com",
    requestKind: "identity_recovery",
    requestedIdentityProvider: "cloudflare_google",
    requestedIdentitySubject: "recovery-subject",
    requestedRole: "helper"
  });
  const targetUser = buildUser();
  const insertedAuditEvents: Array<typeof auditEvents.$inferInsert> = [];
  const db = {
    transaction: async (
      callback: (tx: {
        insert: (table: unknown) => { values: (value: unknown) => Promise<unknown> };
        query: {
          accessRequests: { findFirst: () => Promise<typeof requestRow> };
          userIdentities: { findFirst: () => Promise<null> };
          users: { findFirst: () => Promise<typeof targetUser> };
        };
        select: () => { from: () => { where: () => Promise<Array<{ id: string; role: string }>> } };
        update: (table: unknown) => {
          set: (value: unknown) => {
            where: () => {
              returning?: () => Promise<unknown[]>;
            };
          };
        };
      }) => Promise<unknown>
    ) => {
      const tx = {
        insert(table: unknown) {
          return {
            values: async (value: unknown) => {
              if (table === auditEvents) {
                insertedAuditEvents.push(...(value as Array<typeof auditEvents.$inferInsert>));
              }

              return value;
            }
          };
        },
        query: {
          accessRequests: {
            findFirst: async () => requestRow
          },
          userIdentities: {
            findFirst: async () => null
          },
          users: {
            findFirst: async () => targetUser
          }
        },
        select() {
          return {
            from() {
              return {
                where: async () => [{ id: "role-grant", role: "helper" }]
              };
            }
          };
        },
        update(table: unknown) {
          return {
            set(_value: unknown) {
              return {
                where() {
                  if (table === accessRequests) {
                    return {
                      returning: async () => [
                        {
                          ...requestRow,
                          reviewedAt: new Date("2026-03-13T19:20:00.000Z"),
                          reviewedByUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                          status: "approved"
                        }
                      ]
                    };
                  }

                  return {};
                }
              };
            }
          };
        }
      };

      return callback(tx);
    }
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerAdminRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      approvedRole: "helper",
      decisionNote: "Recovered Google identity"
    } satisfies PortalAdminAccessRequestApproveInput,
    url: `/portal/admin/access-requests/${requestRow.id}/approve`
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    insertedAuditEvents.map((entry) => entry.eventId),
    ["access_request.approved", "user_identity.linked"]
  );
});

test("POST /portal/admin/access-requests/:id/approve returns a recovery-specific conflict payload", async (t) => {
  const requestRow = buildAccessRequest({
    email: "recover@paretoproof.com",
    requestKind: "identity_recovery",
    requestedIdentityProvider: "cloudflare_google",
    requestedIdentitySubject: "recovery-conflict",
    requestedRole: "helper"
  });
  const targetUser = buildUser();
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          accessRequests: { findFirst: () => Promise<typeof requestRow> };
          userIdentities: {
            findFirst: () => Promise<{ userId: string }>;
          };
          users: { findFirst: () => Promise<typeof targetUser> };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          accessRequests: {
            findFirst: async () => requestRow
          },
          userIdentities: {
            findFirst: async () => ({
              userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
            })
          },
          users: {
            findFirst: async () => targetUser
          }
        }
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerAdminRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      approvedRole: "helper",
      decisionNote: "Recovered Google identity"
    } satisfies PortalAdminAccessRequestApproveInput,
    url: `/portal/admin/access-requests/${requestRow.id}/approve`
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    conflictUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    error: "identity_recovery_identity_conflict",
    item: {
      createdAt: requestRow.createdAt.toISOString(),
      decisionNote: requestRow.decisionNote,
      email: requestRow.email,
      id: requestRow.id,
      requestKind: requestRow.requestKind,
      rationale: requestRow.rationale,
      requestedRole: requestRow.requestedRole,
      reviewedAt: null,
      status: requestRow.status
    }
  });
});
