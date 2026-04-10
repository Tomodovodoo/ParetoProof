import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import {
  accessRequests,
  auditEvents,
  roleGrants,
  userIdentities,
  users
} from "../src/db/schema.ts";
import { registerPortalRoutes } from "../src/routes/portal.ts";

function createAuthenticatedAccessGuard(
  identityOverrides: Partial<{
    email: string;
    issuer: string;
    provider: "cloudflare_google" | null;
    subject: string;
  }> = {}
) {
  return () => (
    request: {
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
