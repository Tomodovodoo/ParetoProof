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

function createDeniedAccessGuard() {
  return () => (_request: unknown, reply: { code: (statusCode: number) => { send: (body: unknown) => void } }) => {
    reply.code(403).send({
      access: {
        email: "helper@paretoproof.com",
        identityId: "99999999-9999-4999-8999-999999999999",
        roles: ["helper"],
        status: "approved",
        subject: "helper-subject",
        userId: "99999999-9999-4999-8999-999999999999"
      },
      error: "insufficient_role"
    });
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
  const now = Date.now();

  return {
    createdAt: new Date(now - 60 * 60 * 1000),
    expiresAt: new Date(now + 60 * 60 * 1000),
    id: "55555555-5555-4555-8555-555555555555",
    identityId: "22222222-2222-4222-8222-222222222222",
    ipAddress: null,
    lastSeenAt: new Date(now - 30 * 60 * 1000),
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

test("GET /portal/admin/access-requests keeps orphaned recovery requests unlinked", async (t) => {
  const orphanedRecoveryRequest = {
    ...buildAccessRequest({
      createdAt: new Date("2026-03-13T18:00:00.000Z"),
      email: "recover@paretoproof.com",
      id: "12121212-1212-4212-8212-121212121212",
      requestKind: "identity_recovery",
      requestedByUserId: null,
      requestedIdentityProvider: "cloudflare_google",
      requestedIdentitySubject: "missing-subject",
      status: "pending"
    }),
    reviewedByUser: null
  };
  const db = {
    query: {
      accessRequests: {
        findMany: async () => [orphanedRecoveryRequest]
      },
      userIdentities: {
        findFirst: async () => null
      },
      users: {
        findFirst: async () => null
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
  assert.equal(payload.items[0]?.matchedUser, null);
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

test("GET /portal/admin/access-requests/:id preserves email-only history when a matched user exists", async (t) => {
  const reviewer = buildUser({
    displayName: "Admin Reviewer",
    email: "admin@paretoproof.com",
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  });
  const currentRequest = {
    ...buildAccessRequest({
      email: "legacy@paretoproof.com",
      id: "13131313-1313-4313-8313-131313131313",
      requestedByUserId: null,
      status: "pending"
    }),
    reviewedByUser: null
  };
  const priorEmailOnlyRequest = {
    ...buildAccessRequest({
      createdAt: new Date("2026-03-10T18:00:00.000Z"),
      email: "legacy@paretoproof.com",
      id: "14141414-1414-4414-8414-141414141414",
      requestedByUserId: null,
      reviewedAt: new Date("2026-03-10T18:10:00.000Z"),
      reviewedByUserId: reviewer.id,
      status: "approved"
    }),
    reviewedByUser: reviewer
  };
  const matchedUser = {
    ...buildUser({
      email: "legacy@paretoproof.com",
      id: "15151515-1515-4515-8515-151515151515"
    }),
    accessRequests: [],
    auditEventsAsTarget: [],
    identities: [buildIdentity()],
    roleGrants: [
      {
        ...buildRoleGrant({
          userId: "15151515-1515-4515-8515-151515151515"
        }),
        grantedByUser: reviewer,
        revokedByUser: null
      }
    ],
    sessions: []
  };
  const db = {
    query: {
      accessRequests: {
        findFirst: async () => currentRequest,
        findMany: async () => [currentRequest, priorEmailOnlyRequest]
      },
      userIdentities: {
        findFirst: async () => null
      },
      users: {
        findFirst: async () => matchedUser
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
    url: `/portal/admin/access-requests/${currentRequest.id}`
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.item.relatedRequests.length, 2);
  assert.deepEqual(
    payload.item.relatedRequests.map((entry: { id: string }) => entry.id),
    [currentRequest.id, priorEmailOnlyRequest.id]
  );
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

test("POST /portal/admin/access-requests/:id/approve grants a role and audits standard approvals", async (t) => {
  const requestRow = buildAccessRequest();
  const targetUser = buildUser();
  const insertedAuditEvents: Array<typeof auditEvents.$inferInsert> = [];
  const insertedRoleGrants: Array<typeof roleGrants.$inferInsert> = [];
  const db = {
    transaction: async (
      callback: (tx: {
        insert: (table: unknown) => { values: (value: unknown) => Promise<unknown> };
        query: {
          accessRequests: { findFirst: () => Promise<typeof requestRow> };
          userIdentities: { findFirst: () => Promise<typeof userIdentities.$inferSelect> };
          users: { findFirst: () => Promise<typeof targetUser> };
        };
        select: () => { from: () => { where: () => Promise<[]> } };
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

              if (table === roleGrants) {
                insertedRoleGrants.push(value as typeof roleGrants.$inferInsert);
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
            findFirst: async () => buildIdentity()
          },
          users: {
            findFirst: async () => targetUser
          }
        },
        select() {
          return {
            from() {
              return {
                where: async () => []
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
                          decisionNote: "Looks good",
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
      approvedRole: "collaborator",
      decisionNote: "Looks good"
    } satisfies PortalAdminAccessRequestApproveInput,
    url: `/portal/admin/access-requests/${requestRow.id}/approve`
  });

  assert.equal(response.statusCode, 200);
  assert.equal(insertedRoleGrants[0]?.role, "collaborator");
  assert.equal(insertedRoleGrants[0]?.userId, targetUser.id);
  assert.deepEqual(
    insertedAuditEvents.map((entry) => entry.eventId),
    ["access_request.approved", "role_grant.granted"]
  );
  assert.deepEqual(insertedAuditEvents[0]?.payload, {
    accessRequestId: requestRow.id,
    actorUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    approvedRole: "collaborator",
    requestKind: "access_request",
    targetUserId: targetUser.id
  });
  assert.deepEqual(insertedAuditEvents[1]?.payload, {
    actorUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    grantedRole: "collaborator",
    targetUserId: targetUser.id
  });
});

test("POST /portal/admin/access-requests/:id/approve rejects first approval when no linked identity exists", async (t) => {
  const requestRow = buildAccessRequest();
  const targetUser = buildUser();
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          accessRequests: { findFirst: () => Promise<typeof requestRow> };
          userIdentities: { findFirst: () => Promise<null> };
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
            findFirst: async () => null
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
      approvedRole: "collaborator",
      decisionNote: "Needs linked identity first"
    } satisfies PortalAdminAccessRequestApproveInput,
    url: `/portal/admin/access-requests/${requestRow.id}/approve`
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "access_identity_link_required");
});

test("POST /portal/admin/access-requests/:id/approve rejects stale standard approvals for already-approved users", async (t) => {
  const requestRow = buildAccessRequest();
  const targetUser = buildUser();
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          accessRequests: { findFirst: () => Promise<typeof requestRow> };
          userIdentities: { findFirst: () => Promise<typeof userIdentities.$inferSelect> };
          users: { findFirst: () => Promise<typeof targetUser> };
        };
        select: () => {
          from: () => {
            where: () => Promise<Array<{ id: string; role: string }>>;
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          accessRequests: {
            findFirst: async () => requestRow
          },
          userIdentities: {
            findFirst: async () => buildIdentity()
          },
          users: {
            findFirst: async () => targetUser
          }
        },
        select() {
          return {
            from() {
              return {
                where: async () => [{ id: "existing-role-grant", role: "collaborator" }]
              };
            }
          };
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
      approvedRole: "collaborator",
      decisionNote: "Duplicate approval"
    } satisfies PortalAdminAccessRequestApproveInput,
    url: `/portal/admin/access-requests/${requestRow.id}/approve`
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "access_request_stale_for_approved_user");
});

test("POST /portal/admin/access-requests/:id/approve returns a stale-request conflict for already-reviewed requests", async (t) => {
  const requestRow = buildAccessRequest({
    decisionNote: "Already handled",
    reviewedAt: new Date("2026-03-13T19:22:00.000Z"),
    reviewedByUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    status: "approved"
  });
  let touchedWritePath = false;
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          accessRequests: { findFirst: () => Promise<typeof requestRow> };
        };
        insert: () => { values: () => Promise<never> };
        select: () => { from: () => { where: () => Promise<never> } };
        update: () => { set: () => { where: () => Promise<never> } };
      }) => Promise<unknown>
    ) =>
      callback({
        insert() {
          touchedWritePath = true;
          throw new Error("should not insert");
        },
        query: {
          accessRequests: {
            findFirst: async () => requestRow
          }
        },
        select() {
          touchedWritePath = true;
          throw new Error("should not select roles");
        },
        update() {
          touchedWritePath = true;
          throw new Error("should not update");
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
      approvedRole: "collaborator",
      decisionNote: "Should fail as stale"
    } satisfies PortalAdminAccessRequestApproveInput,
    url: `/portal/admin/access-requests/${requestRow.id}/approve`
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "access_request_not_pending");
  assert.equal(response.json().item.status, "approved");
  assert.equal(touchedWritePath, false);
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

test("POST /portal/admin/access-requests/:id/approve does not duplicate a recovery identity that is already linked", async (t) => {
  const requestRow = buildAccessRequest({
    email: "recover@paretoproof.com",
    requestKind: "identity_recovery",
    requestedIdentityProvider: "cloudflare_google",
    requestedIdentitySubject: "recovery-subject",
    requestedRole: "helper"
  });
  const targetUser = buildUser();
  const linkedIdentity = buildIdentity({
    providerEmail: "old@paretoproof.com",
    providerSubject: "recovery-subject",
    userId: targetUser.id
  });
  const insertedAuditEvents: Array<typeof auditEvents.$inferInsert> = [];
  const updatedIdentityRows: Array<Partial<typeof userIdentities.$inferSelect>> = [];
  const db = {
    transaction: async (
      callback: (tx: {
        insert: (table: unknown) => { values: (value: unknown) => Promise<unknown> };
        query: {
          accessRequests: { findFirst: () => Promise<typeof requestRow> };
          userIdentities: { findFirst: () => Promise<typeof linkedIdentity> };
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
      let userIdentityLookupCount = 0;
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
            findFirst: async () => {
              userIdentityLookupCount += 1;
              return linkedIdentity;
            }
          },
          users: {
            findFirst: async () => targetUser
          }
        },
        select() {
          return {
            from() {
              return {
                where: async () => []
              };
            }
          };
        },
        update(table: unknown) {
          return {
            set(value: unknown) {
              return {
                where() {
                  if (table === userIdentities) {
                    updatedIdentityRows.push(value as Partial<typeof userIdentities.$inferSelect>);
                    return {};
                  }

                  if (table === accessRequests) {
                    return {
                      returning: async () => [
                        {
                          ...requestRow,
                          decisionNote: "Recovery confirmed",
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

      const result = await callback(tx);
      assert.equal(userIdentityLookupCount, 2);
      return result;
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
      decisionNote: "Recovery confirmed"
    } satisfies PortalAdminAccessRequestApproveInput,
    url: `/portal/admin/access-requests/${requestRow.id}/approve`
  });

  assert.equal(response.statusCode, 200);
  assert.equal(updatedIdentityRows.length, 1);
  assert.equal(updatedIdentityRows[0]?.providerEmail, requestRow.email);
  assert.deepEqual(
    insertedAuditEvents.map((entry) => entry.eventId),
    ["access_request.approved"]
  );
});

test("POST /portal/admin/access-requests/:id/reject records the decision note and rejection audit", async (t) => {
  const requestRow = buildAccessRequest();
  const insertedAuditEvents: Array<typeof auditEvents.$inferInsert> = [];
  const db = {
    transaction: async (
      callback: (tx: {
        insert: (table: unknown) => { values: (value: unknown) => Promise<unknown> };
        query: {
          accessRequests: { findFirst: () => Promise<typeof requestRow> };
        };
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
                insertedAuditEvents.push(value as typeof auditEvents.$inferInsert);
              }

              return value;
            }
          };
        },
        query: {
          accessRequests: {
            findFirst: async () => requestRow
          }
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
                          decisionNote: "Insufficient project history",
                          reviewedAt: new Date("2026-03-13T19:25:00.000Z"),
                          reviewedByUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                          status: "rejected"
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
      decisionNote: "Insufficient project history"
    },
    url: `/portal/admin/access-requests/${requestRow.id}/reject`
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().item.status, "rejected");
  assert.equal(response.json().item.decisionNote, "Insufficient project history");
  assert.equal(insertedAuditEvents[0]?.eventId, "access_request.rejected");
  assert.equal(
    (insertedAuditEvents[0]?.payload as { decisionNote: string }).decisionNote,
    "Insufficient project history"
  );
});

test("POST /portal/admin/access-requests/:id/reject returns a stale-request conflict for already-reviewed requests", async (t) => {
  const requestRow = buildAccessRequest({
    decisionNote: "Already rejected",
    reviewedAt: new Date("2026-03-13T19:25:00.000Z"),
    reviewedByUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    status: "rejected"
  });
  let touchedWritePath = false;
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          accessRequests: { findFirst: () => Promise<typeof requestRow> };
        };
        insert: () => { values: () => Promise<never> };
        update: () => { set: () => { where: () => Promise<never> } };
      }) => Promise<unknown>
    ) =>
      callback({
        insert() {
          touchedWritePath = true;
          throw new Error("should not insert");
        },
        query: {
          accessRequests: {
            findFirst: async () => requestRow
          }
        },
        update() {
          touchedWritePath = true;
          throw new Error("should not update");
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
      decisionNote: "Should fail as stale"
    },
    url: `/portal/admin/access-requests/${requestRow.id}/reject`
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "access_request_not_pending");
  assert.equal(response.json().item.status, "rejected");
  assert.equal(touchedWritePath, false);
});

test("POST /portal/admin/users/:id/revoke-role revokes the role, invalidates active sessions, and audits the reason", async (t) => {
  const reviewer = buildUser({
    displayName: "Admin Reviewer",
    email: "admin@paretoproof.com",
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  });
  const targetUser = buildUser({
    displayName: "Researcher One"
  });
  const activeRoleGrant = buildRoleGrant();
  const activeSession = buildSession();
  const expiredSession = buildSession({
    expiresAt: new Date("2026-03-12T18:00:00.000Z"),
    id: "56565656-5656-4565-8565-565656565656"
  });
  const insertedAuditEvents: Array<typeof auditEvents.$inferInsert> = [];
  const userDetail = {
    ...targetUser,
    accessRequests: [],
    auditEventsAsTarget: [],
    identities: [buildIdentity()],
    roleGrants: [
      {
        ...activeRoleGrant,
        grantedByUser: reviewer,
        revokedByUser: null
      }
    ],
    sessions: [activeSession, expiredSession]
  };
  const db = {
    query: {
      users: {
        findFirst: async () => userDetail
      }
    },
    transaction: async (
      callback: (tx: {
        insert: (table: unknown) => { values: (value: unknown) => Promise<unknown> };
        query: {
          roleGrants: { findFirst: () => Promise<typeof activeRoleGrant> };
          sessions: { findMany: () => Promise<typeof userDetail.sessions> };
          users: { findFirst: () => Promise<typeof targetUser> };
        };
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
                insertedAuditEvents.push(value as typeof auditEvents.$inferInsert);
                userDetail.auditEventsAsTarget.unshift({
                  ...buildAuditEvent({
                    eventId: "role_grant.revoked",
                    payload: value as Record<string, unknown>,
                    subjectKind: "role_grant"
                  }),
                  actorUser: reviewer
                });
              }

              return value;
            }
          };
        },
        query: {
          roleGrants: {
            findFirst: async () => activeRoleGrant
          },
          sessions: {
            findMany: async () => userDetail.sessions
          },
          users: {
            findFirst: async () => targetUser
          }
        },
        update(table: unknown) {
          return {
            set(value: unknown) {
              return {
                where() {
                  if (table === roleGrants) {
                    const patch = value as Partial<typeof roleGrants.$inferSelect>;
                    userDetail.roleGrants[0] = {
                      ...userDetail.roleGrants[0],
                      revokedAt: patch.revokedAt ?? null,
                      revokedByUser: reviewer,
                      revokedByUserId: reviewer.id
                    };

                    return {
                      returning: async () => [
                        {
                          ...activeRoleGrant,
                          revokedAt: patch.revokedAt ?? new Date("2026-03-13T20:00:00.000Z"),
                          revokedByUserId: reviewer.id
                        }
                      ]
                    };
                  }

                  if (table === sessions) {
                    const patch = value as Partial<typeof sessions.$inferSelect>;
                    userDetail.sessions = userDetail.sessions.map((sessionRow) =>
                      sessionRow.revokedAt === null &&
                      patch.revokedAt &&
                      sessionRow.expiresAt.getTime() > patch.revokedAt.getTime()
                        ? {
                            ...sessionRow,
                            revokedAt: patch.revokedAt ?? null
                          }
                        : sessionRow
                    );
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
      reason: "Contributor left the project"
    },
    url: `/portal/admin/users/${targetUser.id}/revoke-role`
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().item.activeRole, null);
  assert.equal(response.json().item.sessionPosture.activeSessionCount, 0);
  assert.notEqual(userDetail.sessions[0]?.revokedAt, null);
  assert.equal(userDetail.sessions[1]?.revokedAt, null);
  assert.equal(insertedAuditEvents[0]?.eventId, "role_grant.revoked");
  assert.equal(
    (insertedAuditEvents[0]?.payload as { revokedSessionCount: number }).revokedSessionCount,
    1
  );
  assert.equal(
    (insertedAuditEvents[0]?.payload as { revocationReason: string }).revocationReason,
    "Contributor left the project"
  );
});

test("POST /portal/admin/users/:id/revoke-role returns a conflict when no active role exists", async (t) => {
  const targetUser = buildUser();
  const db = {
    query: {
      users: {
        findFirst: async () => null
      }
    },
    transaction: async (
      callback: (tx: {
        query: {
          roleGrants: { findFirst: () => Promise<null> };
          users: { findFirst: () => Promise<typeof targetUser> };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          roleGrants: {
            findFirst: async () => null
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
      reason: "Already revoked"
    },
    url: `/portal/admin/users/${targetUser.id}/revoke-role`
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "admin_user_no_active_role");
});

test("POST /portal/admin/users/:id/revoke-role rejects active admin grants", async (t) => {
  const targetUser = buildUser();
  const adminRoleGrant = buildRoleGrant({
    role: "admin"
  });
  const db = {
    query: {
      users: {
        findFirst: async () => null
      }
    },
    transaction: async (
      callback: (tx: {
        query: {
          roleGrants: { findFirst: () => Promise<typeof adminRoleGrant> };
          users: { findFirst: () => Promise<typeof targetUser> };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          roleGrants: {
            findFirst: async () => adminRoleGrant
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
      reason: "Should not revoke admin access here"
    },
    url: `/portal/admin/users/${targetUser.id}/revoke-role`
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "admin_user_role_not_revocable");
});

test("POST /portal/admin/users/:id/revoke-role returns a conflict when concurrent revocation wins first", async (t) => {
  const targetUser = buildUser();
  const activeRoleGrant = buildRoleGrant();
  const db = {
    query: {
      users: {
        findFirst: async () => null
      }
    },
    transaction: async (
      callback: (tx: {
        query: {
          roleGrants: { findFirst: () => Promise<typeof activeRoleGrant> };
          users: { findFirst: () => Promise<typeof targetUser> };
        };
        update: () => {
          set: () => {
            where: () => {
              returning: () => Promise<[]>;
            };
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          roleGrants: {
            findFirst: async () => activeRoleGrant
          },
          users: {
            findFirst: async () => targetUser
          }
        },
        update() {
          return {
            set() {
              return {
                where() {
                  return {
                    returning: async () => []
                  };
                }
              };
            }
          };
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
      reason: "Concurrent revoke"
    },
    url: `/portal/admin/users/${targetUser.id}/revoke-role`
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "admin_user_role_revocation_conflict");
});

test("admin-only mutation routes reject non-admin callers before touching the database", async (t) => {
  let touchedDatabase = false;
  const db = {
    transaction: async () => {
      touchedDatabase = true;
      throw new Error("should not run");
    }
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerAdminRoutes(app, db as never, createDeniedAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      reason: "No access"
    },
    url: "/portal/admin/users/11111111-1111-4111-8111-111111111111/revoke-role"
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error, "insufficient_role");
  assert.equal(touchedDatabase, false);
});
