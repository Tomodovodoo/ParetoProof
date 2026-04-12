import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  accessRequests,
  auditEvents,
  roleGrants,
  userIdentities,
  users
} from "../src/db/schema.ts";
import { registerPortalRoutes } from "../src/routes/portal.ts";

const pgDialect = new PgDialect();

function createAuthenticatedAccessGuard(
  identityOverrides: Partial<{
    email: string;
    issuer: string;
    provider: "cloudflare_google" | null;
    subject: string;
  }> = {},
  accessRbacContext: Record<string, unknown> | null = null
) {
  return () => (
    request: {
      accessRbacContext?: Record<string, unknown>;
      accessIdentity?: {
        email: string;
        issuer: string;
        provider: "cloudflare_google" | null;
        subject: string;
      };
    },
    _reply: unknown,
    done: () => void
  ) => {
    request.accessIdentity = {
      email: "person@example.com",
      issuer: "https://paretoproof.cloudflareaccess.com",
      provider: "cloudflare_google",
      subject: "shared-subject",
      ...identityOverrides
    };

    if (accessRbacContext) {
      request.accessRbacContext = accessRbacContext;
    }

    done();
  };
}

test("POST /portal/access-requests ignores subject collisions from a different provider", async (t) => {
  const createdRequest: typeof accessRequests.$inferSelect = {
    createdAt: new Date("2026-04-10T15:00:00.000Z"),
    decisionNote: null,
    email: "person@example.com",
    id: "11111111-1111-4111-8111-111111111111",
    rationale: "Need helper access",
    requestKind: "access_request",
    requestedByUserId: "22222222-2222-4222-8222-222222222222",
    requestedIdentityProvider: null,
    requestedIdentitySubject: null,
    requestedRole: "helper",
    reviewedAt: null,
    reviewedByUserId: null,
    status: "pending"
  };
  const insertedIdentityRows: Array<typeof userIdentities.$inferInsert> = [];
  const app = Fastify();
  const db = {
    transaction: async (
      callback: (tx: {
        insert: (table: unknown) => {
          values: (value: unknown) => {
            returning?: () => Promise<unknown[]>;
          };
        };
        query: {
          accessRequests: { findFirst: () => Promise<null> };
          userIdentities: { findFirst: () => Promise<typeof userIdentities.$inferSelect> };
          users: { findFirst: () => Promise<null> };
        };
        select: () => {
          from: (_table: unknown) => {
            where: (_where: unknown) => Promise<Array<{ role: typeof roleGrants.$inferSelect.role }>>;
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        insert(table: unknown) {
          return {
            values(value: unknown) {
              if (table === users) {
                return {
                  returning: async () => [
                    {
                      email: "person@example.com",
                      id: "22222222-2222-4222-8222-222222222222"
                    }
                  ]
                };
              }

              if (table === userIdentities) {
                insertedIdentityRows.push(value as typeof userIdentities.$inferInsert);
                return Promise.resolve(value);
              }

              if (table === accessRequests) {
                return {
                  returning: async () => [createdRequest]
                };
              }

              if (table === auditEvents) {
                return Promise.resolve(value);
              }

              throw new Error("unexpected insert");
            }
          };
        },
        query: {
          accessRequests: {
            findFirst: async () => null
          },
          userIdentities: {
            findFirst: async () => ({
              createdAt: new Date("2026-04-10T14:30:00.000Z"),
              id: "33333333-3333-4333-8333-333333333333",
              lastSeenAt: new Date("2026-04-10T14:31:00.000Z"),
              provider: "cloudflare_github",
              providerEmail: "other@example.com",
              providerSubject: "shared-subject",
              userId: "44444444-4444-4444-8444-444444444444"
            })
          },
          users: {
            findFirst: async () => null
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
        }
      } as never)
  };

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(app, db as never, createAuthenticatedAccessGuard(), {
    resolvePortalAccess: async () => null
  });

  const response = await app.inject({
    method: "POST",
    payload: {
      rationale: "Need helper access",
      requestedRole: "helper"
    },
    url: "/portal/access-requests"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().item.requestKind, "access_request");
  assert.equal(insertedIdentityRows[0]?.provider, "cloudflare_google");
  assert.equal(insertedIdentityRows[0]?.providerSubject, "shared-subject");
});

test("POST /portal/access-recovery ignores subject collisions from a different provider", async (t) => {
  const matchingUser = {
    email: "person@example.com",
    id: "22222222-2222-4222-8222-222222222222"
  };
  const createdRequest: typeof accessRequests.$inferSelect = {
    createdAt: new Date("2026-04-10T15:05:00.000Z"),
    decisionNote: null,
    email: "person@example.com",
    id: "55555555-5555-4555-8555-555555555555",
    rationale: "Need to recover my Google login",
    requestKind: "identity_recovery",
    requestedByUserId: matchingUser.id,
    requestedIdentityProvider: "cloudflare_google",
    requestedIdentitySubject: "shared-subject",
    requestedRole: "helper",
    reviewedAt: null,
    reviewedByUserId: null,
    status: "pending"
  };
  const app = Fastify();
  const db = {
    transaction: async (
      callback: (tx: {
        insert: (table: unknown) => {
          values: (value: unknown) => {
            returning?: () => Promise<unknown[]>;
          };
        };
        query: {
          accessRequests: { findFirst: () => Promise<null> };
          userIdentities: { findFirst: () => Promise<typeof userIdentities.$inferSelect> };
          users: { findFirst: () => Promise<typeof matchingUser> };
        };
        select: () => {
          from: (_table: unknown) => {
            where: (_where: unknown) => Promise<Array<{ role: typeof roleGrants.$inferSelect.role }>>;
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        insert(table: unknown) {
          return {
            values(value: unknown) {
              if (table === accessRequests) {
                return {
                  returning: async () => [createdRequest]
                };
              }

              if (table === auditEvents) {
                return Promise.resolve(value);
              }

              throw new Error("unexpected insert");
            }
          };
        },
        query: {
          accessRequests: {
            findFirst: async () => null
          },
          userIdentities: {
            findFirst: async () => ({
              createdAt: new Date("2026-04-10T14:30:00.000Z"),
              id: "66666666-6666-4666-8666-666666666666",
              lastSeenAt: new Date("2026-04-10T14:31:00.000Z"),
              provider: "cloudflare_github",
              providerEmail: "other@example.com",
              providerSubject: "shared-subject",
              userId: "77777777-7777-4777-8777-777777777777"
            })
          },
          users: {
            findFirst: async () => matchingUser
          }
        },
        select() {
          return {
            from() {
              return {
                where: async () => [{ role: "helper" }]
              };
            }
          };
        }
      } as never)
  };

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(app, db as never, createAuthenticatedAccessGuard(), {
    resolvePortalAccess: async () => null
  });

  const response = await app.inject({
    method: "POST",
    payload: {
      rationale: "Need to recover my Google login"
    },
    url: "/portal/access-recovery"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().item.requestKind, "identity_recovery");
});

test("POST /portal/access-requests rejects requests whose verified provider is still unknown", async (t) => {
  let transactionCalled = false;
  const app = Fastify();
  const db = {
    transaction: async () => {
      transactionCalled = true;
      throw new Error("providerless access requests must fail before the transaction starts");
    }
  };

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    db as never,
    createAuthenticatedAccessGuard({
      provider: null
    }),
    {
      resolvePortalAccess: async () => null
    }
  );

  const response = await app.inject({
    method: "POST",
    payload: {
      rationale: "Need helper access",
      requestedRole: "helper"
    },
    url: "/portal/access-requests"
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "identity_provider_required"
  });
  assert.equal(transactionCalled, false);
});

test("POST /portal/access-recovery rejects requests whose verified provider is still unknown", async (t) => {
  let transactionCalled = false;
  const app = Fastify();
  const db = {
    transaction: async () => {
      transactionCalled = true;
      throw new Error("providerless recovery requests must fail before the transaction starts");
    }
  };

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    db as never,
    createAuthenticatedAccessGuard({
      provider: null
    }),
    {
      resolvePortalAccess: async () => null
    }
  );

  const response = await app.inject({
    method: "POST",
    payload: {
      rationale: "Need to recover my Google login"
    },
    url: "/portal/access-recovery"
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "identity_provider_required"
  });
  assert.equal(transactionCalled, false);
});

test("POST /portal/access-requests does not rewrite a pending recovery row for the same email", async (t) => {
  const existingRecoveryRequest: typeof accessRequests.$inferSelect = {
    createdAt: new Date("2026-04-10T15:05:00.000Z"),
    decisionNote: null,
    email: "person@example.com",
    id: "88888888-8888-4888-8888-888888888888",
    rationale: "Need to recover my Google login",
    requestKind: "identity_recovery",
    requestedByUserId: "22222222-2222-4222-8222-222222222222",
    requestedIdentityProvider: "cloudflare_google",
    requestedIdentitySubject: "shared-subject",
    requestedRole: "helper",
    reviewedAt: null,
    reviewedByUserId: null,
    status: "pending"
  };
  const createdRequest: typeof accessRequests.$inferSelect = {
    createdAt: new Date("2026-04-10T15:10:00.000Z"),
    decisionNote: null,
    email: "person@example.com",
    id: "99999999-9999-4999-8999-999999999999",
    rationale: "Need helper access",
    requestKind: "access_request",
    requestedByUserId: "22222222-2222-4222-8222-222222222222",
    requestedIdentityProvider: null,
    requestedIdentitySubject: null,
    requestedRole: "helper",
    reviewedAt: null,
    reviewedByUserId: null,
    status: "pending"
  };
  const insertedRequestRows: Array<typeof accessRequests.$inferInsert> = [];
  const app = Fastify();
  const db = {
    transaction: async (
      callback: (tx: {
        insert: (table: unknown) => {
          values: (value: unknown) => {
            returning?: () => Promise<unknown[]>;
          };
        };
        query: {
          accessRequests: { findFirst: (options: { where: unknown }) => Promise<typeof accessRequests.$inferSelect | null> };
          userIdentities: { findFirst: () => Promise<null> };
          users: { findFirst: () => Promise<{ email: string; id: string; identities: unknown[] }> };
        };
        select: () => {
          from: (_table: unknown) => {
            where: (_where: unknown) => Promise<Array<{ role: typeof roleGrants.$inferSelect.role }>>;
          };
        };
        update: (table: unknown) => unknown;
      }) => Promise<unknown>
    ) =>
      callback({
        insert(table: unknown) {
          return {
            values(value: unknown) {
              if (table === userIdentities || table === auditEvents) {
                return Promise.resolve(value);
              }

              if (table === accessRequests) {
                insertedRequestRows.push(value as typeof accessRequests.$inferInsert);
                return {
                  returning: async () => [createdRequest]
                };
              }

              throw new Error("unexpected insert");
            }
          };
        },
        query: {
          accessRequests: {
            findFirst: async (options: { where: unknown }) => {
              const renderedWhere = pgDialect.sqlToQuery(options.where as never);

              return renderedWhere.params.includes("access_request")
                ? null
                : existingRecoveryRequest;
            }
          },
          userIdentities: {
            findFirst: async () => null
          },
          users: {
            findFirst: async () => ({
              email: "person@example.com",
              id: "22222222-2222-4222-8222-222222222222",
              identities: []
            })
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
        update() {
          throw new Error("access requests should not rewrite pending recovery rows");
        }
      } as never)
  };

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(app, db as never, createAuthenticatedAccessGuard(), {
    resolvePortalAccess: async () => null
  });

  const response = await app.inject({
    method: "POST",
    payload: {
      rationale: "Need helper access",
      requestedRole: "helper"
    },
    url: "/portal/access-requests"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().item.id, createdRequest.id);
  assert.equal(response.json().item.requestKind, "access_request");
  assert.equal(insertedRequestRows.length, 1);
  assert.equal(insertedRequestRows[0]?.requestKind, "access_request");
});

test("POST /portal/access-recovery does not rewrite a pending standard access request for the same email", async (t) => {
  const existingAccessRequest: typeof accessRequests.$inferSelect = {
    createdAt: new Date("2026-04-10T15:05:00.000Z"),
    decisionNote: null,
    email: "person@example.com",
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    rationale: "Need helper access",
    requestKind: "access_request",
    requestedByUserId: "22222222-2222-4222-8222-222222222222",
    requestedIdentityProvider: null,
    requestedIdentitySubject: null,
    requestedRole: "helper",
    reviewedAt: null,
    reviewedByUserId: null,
    status: "pending"
  };
  const createdRequest: typeof accessRequests.$inferSelect = {
    createdAt: new Date("2026-04-10T15:10:00.000Z"),
    decisionNote: null,
    email: "person@example.com",
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    rationale: "Need to recover my Google login",
    requestKind: "identity_recovery",
    requestedByUserId: "22222222-2222-4222-8222-222222222222",
    requestedIdentityProvider: "cloudflare_google",
    requestedIdentitySubject: "shared-subject",
    requestedRole: "helper",
    reviewedAt: null,
    reviewedByUserId: null,
    status: "pending"
  };
  const insertedRequestRows: Array<typeof accessRequests.$inferInsert> = [];
  const app = Fastify();
  const db = {
    transaction: async (
      callback: (tx: {
        insert: (table: unknown) => {
          values: (value: unknown) => {
            returning?: () => Promise<unknown[]>;
          };
        };
        query: {
          accessRequests: { findFirst: (options: { where: unknown }) => Promise<typeof accessRequests.$inferSelect | null> };
          userIdentities: { findFirst: () => Promise<null> };
          users: { findFirst: () => Promise<{ email: string; id: string }> };
        };
        select: () => {
          from: (_table: unknown) => {
            where: (_where: unknown) => Promise<Array<{ role: typeof roleGrants.$inferSelect.role }>>;
          };
        };
        update: (table: unknown) => unknown;
      }) => Promise<unknown>
    ) =>
      callback({
        insert(table: unknown) {
          return {
            values(value: unknown) {
              if (table === auditEvents) {
                return Promise.resolve(value);
              }

              if (table === accessRequests) {
                insertedRequestRows.push(value as typeof accessRequests.$inferInsert);
                return {
                  returning: async () => [createdRequest]
                };
              }

              throw new Error("unexpected insert");
            }
          };
        },
        query: {
          accessRequests: {
            findFirst: async (options: { where: unknown }) => {
              const renderedWhere = pgDialect.sqlToQuery(options.where as never);

              return renderedWhere.params.includes("identity_recovery")
                ? null
                : existingAccessRequest;
            }
          },
          userIdentities: {
            findFirst: async () => null
          },
          users: {
            findFirst: async () => ({
              email: "person@example.com",
              id: "22222222-2222-4222-8222-222222222222"
            })
          }
        },
        select() {
          return {
            from() {
              return {
                where: async () => [{ role: "helper" }]
              };
            }
          };
        },
        update() {
          throw new Error("access recovery should not rewrite pending access-request rows");
        }
      } as never)
  };

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(app, db as never, createAuthenticatedAccessGuard(), {
    resolvePortalAccess: async () => null
  });

  const response = await app.inject({
    method: "POST",
    payload: {
      rationale: "Need to recover my Google login"
    },
    url: "/portal/access-recovery"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().item.id, createdRequest.id);
  assert.equal(response.json().item.requestKind, "identity_recovery");
  assert.equal(insertedRequestRows.length, 1);
  assert.equal(insertedRequestRows[0]?.requestKind, "identity_recovery");
});

test("GET /portal/access-requests/me returns the pending request referenced by access context", async (t) => {
  const pendingAccessRequest: typeof accessRequests.$inferSelect = {
    createdAt: new Date("2026-04-10T15:00:00.000Z"),
    decisionNote: null,
    email: "person@example.com",
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    rationale: "Need helper access",
    requestKind: "access_request",
    requestedByUserId: "22222222-2222-4222-8222-222222222222",
    requestedIdentityProvider: null,
    requestedIdentitySubject: null,
    requestedRole: "helper",
    reviewedAt: null,
    reviewedByUserId: null,
    status: "pending"
  };
  const newerRecoveryRequest: typeof accessRequests.$inferSelect = {
    createdAt: new Date("2026-04-10T15:10:00.000Z"),
    decisionNote: null,
    email: "person@example.com",
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    rationale: "Need to recover my Google login",
    requestKind: "identity_recovery",
    requestedByUserId: "22222222-2222-4222-8222-222222222222",
    requestedIdentityProvider: "cloudflare_google",
    requestedIdentitySubject: "shared-subject",
    requestedRole: "helper",
    reviewedAt: null,
    reviewedByUserId: null,
    status: "pending"
  };
  const app = Fastify();
  const db = {
    query: {
      accessRequests: {
        findFirst: async (options: { where: unknown }) => {
          const renderedWhere = pgDialect.sqlToQuery(options.where as never);

          if (renderedWhere.params.includes(pendingAccessRequest.id)) {
            return pendingAccessRequest;
          }

          return newerRecoveryRequest;
        }
      },
      userIdentities: {
        findFirst: async () => null
      }
    }
  };

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    db as never,
    createAuthenticatedAccessGuard(
      {},
      {
        email: "person@example.com",
        requestId: pendingAccessRequest.id,
        status: "pending",
        subject: "shared-subject",
        userId: "22222222-2222-4222-8222-222222222222"
      }
    ),
    {
      resolvePortalAccess: async () => null
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/access-requests/me"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().item.id, pendingAccessRequest.id);
  assert.equal(response.json().item.requestKind, "access_request");
});

test("GET /portal/access-requests/me ignores pending recovery rows referenced by access context", async (t) => {
  const latestStandardAccessRequest: typeof accessRequests.$inferSelect = {
    createdAt: new Date("2026-04-10T15:00:00.000Z"),
    decisionNote: null,
    email: "person@example.com",
    id: "abababab-abab-4bab-8bab-abababababab",
    rationale: "Need helper access",
    requestKind: "access_request",
    requestedByUserId: "22222222-2222-4222-8222-222222222222",
    requestedIdentityProvider: null,
    requestedIdentitySubject: null,
    requestedRole: "helper",
    reviewedAt: null,
    reviewedByUserId: null,
    status: "pending"
  };
  const pendingRecoveryRequest: typeof accessRequests.$inferSelect = {
    createdAt: new Date("2026-04-10T15:10:00.000Z"),
    decisionNote: null,
    email: "person@example.com",
    id: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
    rationale: "Need to recover my Google login",
    requestKind: "identity_recovery",
    requestedByUserId: "22222222-2222-4222-8222-222222222222",
    requestedIdentityProvider: "cloudflare_google",
    requestedIdentitySubject: "shared-subject",
    requestedRole: "helper",
    reviewedAt: null,
    reviewedByUserId: null,
    status: "pending"
  };
  const app = Fastify();
  const db = {
    query: {
      accessRequests: {
        findFirst: async (options: { where: unknown }) => {
          const renderedWhere = pgDialect.sqlToQuery(options.where as never);

          if (renderedWhere.params.includes(pendingRecoveryRequest.id)) {
            return pendingRecoveryRequest;
          }

          return renderedWhere.params.includes("access_request")
            ? latestStandardAccessRequest
            : pendingRecoveryRequest;
        }
      },
      userIdentities: {
        findFirst: async () => null
      }
    }
  };

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    db as never,
    createAuthenticatedAccessGuard(
      {},
      {
        email: "person@example.com",
        requestId: pendingRecoveryRequest.id,
        status: "pending",
        subject: "shared-subject",
        userId: "22222222-2222-4222-8222-222222222222"
      }
    ),
    {
      resolvePortalAccess: async () => null
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/access-requests/me"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().item.id, latestStandardAccessRequest.id);
  assert.equal(response.json().item.requestKind, "access_request");
});

test("GET /portal/access-requests/me ignores recovery rows when resolving standard access-request history by email", async (t) => {
  const latestStandardAccessRequest: typeof accessRequests.$inferSelect = {
    createdAt: new Date("2026-04-10T15:00:00.000Z"),
    decisionNote: null,
    email: "person@example.com",
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    rationale: "Need helper access",
    requestKind: "access_request",
    requestedByUserId: "22222222-2222-4222-8222-222222222222",
    requestedIdentityProvider: null,
    requestedIdentitySubject: null,
    requestedRole: "helper",
    reviewedAt: null,
    reviewedByUserId: null,
    status: "pending"
  };
  const newerRecoveryRequest: typeof accessRequests.$inferSelect = {
    createdAt: new Date("2026-04-10T15:10:00.000Z"),
    decisionNote: null,
    email: "person@example.com",
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    rationale: "Need to recover my Google login",
    requestKind: "identity_recovery",
    requestedByUserId: "22222222-2222-4222-8222-222222222222",
    requestedIdentityProvider: "cloudflare_google",
    requestedIdentitySubject: "shared-subject",
    requestedRole: "helper",
    reviewedAt: null,
    reviewedByUserId: null,
    status: "pending"
  };
  const app = Fastify();
  const db = {
    query: {
      accessRequests: {
        findFirst: async (options: { where: unknown }) => {
          const renderedWhere = pgDialect.sqlToQuery(options.where as never);

          return renderedWhere.params.includes("access_request")
            ? latestStandardAccessRequest
            : newerRecoveryRequest;
        }
      },
      userIdentities: {
        findFirst: async () => null
      }
    }
  };

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(app, db as never, createAuthenticatedAccessGuard(), {
    resolvePortalAccess: async () => null
  });

  const response = await app.inject({
    method: "GET",
    url: "/portal/access-requests/me"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().item.id, latestStandardAccessRequest.id);
  assert.equal(response.json().item.requestKind, "access_request");
});
