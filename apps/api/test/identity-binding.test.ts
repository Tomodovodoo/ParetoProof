import assert from "node:assert/strict";
import test from "node:test";
import {
  createPortalAccessSession
} from "../src/auth/portal-access-session.ts";
import { resolveAccessIdentityProvider } from "../src/auth/require-access.ts";
import {
  resolveAccessRbacContext
} from "../src/auth/resolve-access-rbac-context.ts";

test("resolveAccessIdentityProvider keeps the provider unset when no provider hint is present", () => {
  assert.equal(
    resolveAccessIdentityProvider(
      {
        provider: null,
        subject: "otp-subject"
      },
      undefined
    ),
    null
  );
});

test("resolveAccessRbacContext ignores subject matches from a different provider", async () => {
  const db = {
    query: {
      accessRequests: {
        findFirst: async () => null
      },
      userIdentities: {
        findFirst: async () => ({
          id: "identity-1",
          provider: "cloudflare_github",
          providerEmail: "person@example.com",
          providerSubject: "shared-subject",
          user: {
            email: "person@example.com",
            id: "user-1"
          }
        })
      },
      users: {
        findFirst: async () => ({
          email: "person@example.com",
          id: "user-1"
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
    }
  };

  const context = await resolveAccessRbacContext(db as never, {
    email: "person@example.com",
    issuer: "https://paretoproof.cloudflareaccess.com",
    provider: "cloudflare_google",
    subject: "shared-subject"
  });

  assert.deepEqual(context, {
    email: "person@example.com",
    reason: "identity_recovery_required",
    status: "denied",
    subject: "shared-subject"
  });
});

test("resolveAccessRbacContext keeps providerless assertions unbound when the provider hint is absent", async () => {
  const db = {
    query: {
      accessRequests: {
        findFirst: async () => null
      },
      userIdentities: {
        findFirst: async () => {
          throw new Error("provider-specific lookup should not run without a provider hint");
        }
      },
      users: {
        findFirst: async () => ({
          email: "person@example.com",
          id: "user-1"
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
    }
  };

  const context = await resolveAccessRbacContext(db as never, {
    email: "person@example.com",
    issuer: "https://paretoproof.cloudflareaccess.com",
    provider: null,
    subject: "otp-subject"
  });

  assert.deepEqual(context, {
    email: "person@example.com",
    reason: "identity_recovery_required",
    status: "denied",
    subject: "otp-subject",
  });
});

test("resolveAccessRbacContext denies providerless assertions without probing subject-only identity matches", async () => {
  const db = {
    query: {
      accessRequests: {
        findFirst: async () => null
      },
      userIdentities: {
        findFirst: async () => {
          throw new Error("provider-specific lookup should not run without a provider hint");
        },
        findMany: async () => {
          throw new Error("subject-only identity scans should not run without a provider hint");
        }
      },
      users: {
        findFirst: async () => ({
          email: "person@example.com",
          id: "user-1"
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
    }
  };

  const context = await resolveAccessRbacContext(db as never, {
    email: "person@example.com",
    issuer: "https://paretoproof.cloudflareaccess.com",
    provider: null,
    subject: "shared-subject"
  });

  assert.deepEqual(context, {
    email: "person@example.com",
    reason: "identity_recovery_required",
    status: "denied",
    subject: "shared-subject"
  });
});

test("createPortalAccessSession rejects approved contexts when the stored identity provider mismatches", async () => {
  let insertedSession = false;
  const db = {
    insert() {
      insertedSession = true;

      return {
        values: async () => undefined
      };
    },
    query: {
      userIdentities: {
        findFirst: async () => ({
          id: "identity-1",
          provider: "cloudflare_github",
          providerEmail: "person@example.com",
          providerSubject: "shared-subject",
          userId: "user-1"
        })
      }
    }
  };

  await assert.rejects(
    createPortalAccessSession(
      db as never,
      {
        headers: {},
        ip: "127.0.0.1"
      } as never,
      {
        email: "person@example.com",
        issuer: "https://paretoproof.cloudflareaccess.com",
        provider: "cloudflare_google",
        subject: "shared-subject"
      },
      {
        email: "person@example.com",
        identityId: "identity-1",
        roles: ["helper"],
        status: "approved",
        subject: "shared-subject",
        userId: "user-1"
      }
    ),
    /Approved portal session identity could not be resolved/
  );
  assert.equal(insertedSession, false);
});
