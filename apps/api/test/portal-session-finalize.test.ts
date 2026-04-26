import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { portalSessionFinalizeResponseSchema } from "@paretoproof/shared";
import { buildSignedAccessCookie } from "../src/auth/cloudflare-access.ts";
import { createAccessGuard } from "../src/auth/require-access.ts";
import { sessions } from "../src/db/schema.ts";
import { registerPortalRoutes } from "../src/routes/portal.ts";

function readPortalSessionToken(setCookieHeader: string) {
  const match = /^PortalAccessSession=([^;]+)/.exec(setCookieHeader);

  assert.ok(match);

  return match[1]!;
}

test("GET /portal/session/finalize/submit redirects back to the auth retry handoff when a link intent is present", async (t) => {
  let mutationAttempted = false;
  const app = Fastify();
  const originalSecret = process.env.ACCESS_PROVIDER_STATE_SECRET;
  process.env.ACCESS_PROVIDER_STATE_SECRET = "test-secret";

  t.after(async () => {
    process.env.ACCESS_PROVIDER_STATE_SECRET = originalSecret;
    await app.close();
  });

  registerPortalRoutes(
    app,
    {
      transaction: async () => {
        mutationAttempted = true;
        throw new Error(
          "portal finalize GET should not reach the mutation path",
        );
      },
    } as never,
    () => (_request, _reply, done) => {
      done();
    },
    {
      resolvePortalAccess: async () => ({
        email: "person@example.com",
        identityId: "identity-1",
        role: "helper",
        status: "approved",
        subject: "subject-1",
        userId: "user-1",
      }),
    },
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/session/finalize/submit?redirect=/profile",
    headers: {
      accept: "text/html",
      cookie: buildSignedAccessCookie("PortalLinkIntent", "intent-1"),
      "cf-access-jwt-assertion": "test-assertion",
    },
  });

  assert.equal(response.statusCode, 302);
  assert.equal(
    response.headers.location,
    "https://auth.paretoproof.com/?app=portal&redirect=%2Fprofile&handoff=retry",
  );
  assert.equal(mutationAttempted, false);
});

test("GET /portal/session/finalize/submit honors a runtime-provided link-intent secret", async (t) => {
  let mutationAttempted = false;
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {
      transaction: async () => {
        mutationAttempted = true;
        throw new Error(
          "portal finalize GET should not reach the mutation path",
        );
      },
    } as never,
    () => (_request, _reply, done) => {
      done();
    },
    {
      accessProviderStateSecret: "runtime-secret",
      authPublicOrigin: "https://auth.preview.paretoproof.com",
      resolvePortalAccess: async () => ({
        email: "person@example.com",
        identityId: "identity-1",
        role: "helper",
        status: "approved",
        subject: "subject-1",
        userId: "user-1",
      }),
    },
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/session/finalize/submit?redirect=/profile",
    headers: {
      accept: "text/html",
      cookie: buildSignedAccessCookie("PortalLinkIntent", "intent-1", {
        secret: "runtime-secret",
      }),
      "cf-access-jwt-assertion": "test-assertion",
    },
  });

  assert.equal(response.statusCode, 302);
  assert.equal(
    response.headers.location,
    "https://auth.preview.paretoproof.com/?app=portal&redirect=%2Fprofile&handoff=retry",
  );
  assert.equal(mutationAttempted, false);
});

test("GET /portal/session/finalize/submit uses configured portal/auth origins and cookie policy", async (t) => {
  let mutationAttempted = false;
  const insertedSessions: Array<typeof sessions.$inferInsert> = [];
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {
      insert() {
        return {
          values: async (value: unknown) => {
            insertedSessions.push(value as typeof sessions.$inferInsert);
            return value;
          },
        };
      },
      query: {
        userIdentities: {
          findFirst: async () => ({
            id: "identity-1",
            provider: "cloudflare_google",
            providerSubject: "subject-1",
            userId: "user-1",
          }),
        },
      },
      transaction: async () => {
        mutationAttempted = true;
        throw new Error(
          "configured finalize GET should not hit the identity-link mutation path",
        );
      },
    } as never,
    () => (_request, _reply, done) => {
      done();
    },
    {
      accessCookieDomain: ".preview.paretoproof.com",
      accessCookieSecure: false,
      authPublicOrigin: "https://auth.preview.paretoproof.com",
      portalPublicOrigin: "https://portal.preview.paretoproof.com",
      resolvePortalAccess: async (request) => {
        request.accessIdentity = {
          email: "person@example.com",
          issuer: "https://paretoproof.cloudflareaccess.com",
          provider: "cloudflare_google",
          subject: "subject-1",
        };
        request.accessRbacContext = {
          email: "person@example.com",
          identityId: "identity-1",
          role: "helper",
          status: "approved",
          subject: "subject-1",
          userId: "user-1",
        };

        return request.accessRbacContext;
      },
    },
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/session/finalize/submit?redirect=/profile",
    headers: {
      accept: "text/html",
      cookie: buildSignedAccessCookie(
        "PortalAccessProvider",
        "cloudflare_google|subject-1",
        {
          cookieDomain: ".preview.paretoproof.com",
          secure: false,
          secret: "test-secret",
        },
      ),
      "cf-access-jwt-assertion": "test-assertion",
    },
  });

  assert.equal(response.statusCode, 302);
  assert.equal(
    response.headers.location,
    "https://portal.preview.paretoproof.com/profile",
  );
  assert.equal(mutationAttempted, false);
  assert.equal(insertedSessions.length, 1);

  const setCookies = response.headers["set-cookie"];
  assert.ok(Array.isArray(setCookies));
  assert.match(setCookies[0], /Domain=.preview.paretoproof.com/);
  assert.doesNotMatch(setCookies[0], /; Secure;/);
  assert.match(setCookies[1], /Domain=.preview.paretoproof.com/);
  assert.doesNotMatch(setCookies[1], /; Secure;/);
  assert.match(setCookies[2], /Domain=.preview.paretoproof.com/);
  assert.doesNotMatch(setCookies[2], /; Secure;/);
});

test("GET /portal/session/finalize/submit creates an opaque DB-backed session for approved users", async (t) => {
  let mutationAttempted = false;
  const insertedSessions: Array<typeof sessions.$inferInsert> = [];
  const app = Fastify();
  const originalSecret = process.env.ACCESS_PROVIDER_STATE_SECRET;
  process.env.ACCESS_PROVIDER_STATE_SECRET = "test-secret";

  t.after(async () => {
    process.env.ACCESS_PROVIDER_STATE_SECRET = originalSecret;
    await app.close();
  });

  registerPortalRoutes(
    app,
    {
      insert() {
        return {
          values: async (value: unknown) => {
            insertedSessions.push(value as typeof sessions.$inferInsert);
            return value;
          },
        };
      },
      query: {
        userIdentities: {
          findFirst: async () => ({
            id: "identity-1",
            provider: "cloudflare_google",
            providerSubject: "subject-1",
            userId: "user-1",
          }),
        },
      },
      transaction: async () => {
        mutationAttempted = true;
        throw new Error(
          "plain sign-in finalize GET should not hit the identity-link mutation path",
        );
      },
    } as never,
    () => (_request, _reply, done) => {
      done();
    },
    {
      resolvePortalAccess: async (request) => {
        request.accessIdentity = {
          email: "person@example.com",
          issuer: "https://paretoproof.cloudflareaccess.com",
          provider: "cloudflare_google",
          subject: "subject-1",
        };
        request.accessRbacContext = {
          email: "person@example.com",
          identityId: "identity-1",
          role: "helper",
          status: "approved",
          subject: "subject-1",
          userId: "user-1",
        };

        return request.accessRbacContext;
      },
    },
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/session/finalize/submit?redirect=/profile",
    headers: {
      accept: "text/html",
      cookie: buildSignedAccessCookie(
        "PortalAccessProvider",
        "cloudflare_google|subject-1",
      ),
      "cf-access-jwt-assertion": "test-assertion",
    },
  });

  assert.equal(response.statusCode, 302);
  assert.equal(
    response.headers.location,
    "https://portal.paretoproof.com/profile",
  );
  assert.equal(mutationAttempted, false);
  assert.equal(insertedSessions.length, 1);
  assert.equal(insertedSessions[0]?.identityId, "identity-1");
  assert.equal(insertedSessions[0]?.userId, "user-1");

  const setCookies = response.headers["set-cookie"];
  assert.ok(Array.isArray(setCookies));
  assert.equal(setCookies.length, 3);
  assert.match(setCookies[0], /^PortalAccessSession=/);
  assert.match(setCookies[0], /; SameSite=Lax;/);
  assert.match(setCookies[1], /^PortalAccessProvider=/);
  assert.match(setCookies[1], /; SameSite=Strict;/);
  assert.match(setCookies[2], /^PortalLinkIntent=;/);
  assert.match(setCookies[2], /; SameSite=Strict;/);

  const token = readPortalSessionToken(setCookies[0]);
  assert.ok(token.length > 30);
  assert.equal(token.includes("."), false);
  assert.notEqual(insertedSessions[0]?.tokenHash, token);
});

test("POST /portal/session/finalize/submit returns the JSON redirect payload for approved users", async (t) => {
  let mutationAttempted = false;
  const insertedSessions: Array<typeof sessions.$inferInsert> = [];
  const app = Fastify();
  const originalSecret = process.env.ACCESS_PROVIDER_STATE_SECRET;
  process.env.ACCESS_PROVIDER_STATE_SECRET = "test-secret";

  t.after(async () => {
    process.env.ACCESS_PROVIDER_STATE_SECRET = originalSecret;
    await app.close();
  });

  registerPortalRoutes(
    app,
    {
      insert() {
        return {
          values: async (value: unknown) => {
            insertedSessions.push(value as typeof sessions.$inferInsert);
            return value;
          },
        };
      },
      query: {
        userIdentities: {
          findFirst: async () => ({
            id: "identity-1",
            provider: "cloudflare_google",
            providerSubject: "subject-1",
            userId: "user-1",
          }),
        },
      },
      transaction: async () => {
        mutationAttempted = true;
        throw new Error(
          "plain sign-in finalize submit should not hit the identity-link mutation path",
        );
      },
    } as never,
    () => (_request, _reply, done) => {
      done();
    },
    {
      resolvePortalAccess: async (request) => {
        request.accessIdentity = {
          email: "person@example.com",
          issuer: "https://paretoproof.cloudflareaccess.com",
          provider: "cloudflare_google",
          subject: "subject-1",
        };
        request.accessRbacContext = {
          email: "person@example.com",
          identityId: "identity-1",
          role: "helper",
          status: "approved",
          subject: "subject-1",
          userId: "user-1",
        };

        return request.accessRbacContext;
      },
    },
  );

  const response = await app.inject({
    method: "POST",
    url: "/portal/session/finalize/submit?redirect=/profile",
    headers: {
      accept: "application/json",
    },
  });

  assert.equal(response.statusCode, 200);
  const responseBody = response.json();
  assert.equal(portalSessionFinalizeResponseSchema.safeParse(responseBody).success, true);
  assert.deepEqual(responseBody, {
    redirectTo: "https://portal.paretoproof.com/profile",
  });
  assert.equal(mutationAttempted, false);
  assert.equal(insertedSessions.length, 1);
});

test("POST /portal/session/finalize/submit returns a math-surface redirect for approved users when app=math", async (t) => {
  let mutationAttempted = false;
  const insertedSessions: Array<typeof sessions.$inferInsert> = [];
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {
      insert() {
        return {
          values: async (value: unknown) => {
            insertedSessions.push(value as typeof sessions.$inferInsert);
            return value;
          },
        };
      },
      query: {
        userIdentities: {
          findFirst: async () => ({
            id: "identity-1",
            provider: "cloudflare_google",
            providerSubject: "subject-1",
            userId: "user-1",
          }),
        },
      },
      transaction: async () => {
        mutationAttempted = true;
        throw new Error(
          "math finalize submit should not hit the identity-link mutation path",
        );
      },
    } as never,
    () => (_request, _reply, done) => {
      done();
    },
    {
      mathPublicOrigin: "https://math.preview.paretoproof.com",
      resolvePortalAccess: async (request) => {
        request.accessIdentity = {
          email: "person@example.com",
          issuer: "https://paretoproof.cloudflareaccess.com",
          provider: "cloudflare_google",
          subject: "subject-1",
        };
        request.accessRbacContext = {
          email: "person@example.com",
          identityId: "identity-1",
          role: "helper",
          status: "approved",
          subject: "subject-1",
          userId: "user-1",
        };

        return request.accessRbacContext;
      },
    },
  );

  const response = await app.inject({
    method: "POST",
    url: "/portal/session/finalize/submit?app=math&redirect=/launch",
    headers: {
      accept: "application/json",
    },
  });

  assert.equal(response.statusCode, 200);
  const responseBody = response.json();
  assert.equal(portalSessionFinalizeResponseSchema.safeParse(responseBody).success, true);
  assert.deepEqual(responseBody, {
    redirectTo: "https://math.preview.paretoproof.com/launch",
  });
  assert.equal(mutationAttempted, false);
  assert.equal(insertedSessions.length, 1);
});

test("POST /portal/session/finalize/submit bounces stale direct browser handoffs back to the branded auth relay", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {} as never,
    () => (_request, _reply, done) => {
      done();
    },
    {
      resolvePortalAccess: async () => null,
    },
  );

  const response = await app.inject({
    method: "POST",
    url: "/portal/session/finalize/submit?redirect=/profile",
    headers: {
      accept: "text/html",
      origin: "https://google.auth.paretoproof.com",
      referer: "https://google.auth.paretoproof.com/",
    },
  });

  assert.equal(response.statusCode, 307);
  assert.equal(
    response.headers.location,
    "https://google.auth.paretoproof.com/api/access/finalize?app=portal&redirect=%2Fprofile",
  );
});

test("POST /portal/session/finalize/submit keeps the shared auth origin relay when auth and portal share one origin", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {} as never,
    () => (_request, _reply, done) => {
      done();
    },
    {
      authPublicOrigin: "https://portal.preview.paretoproof.com",
      brandedAuthOrigins: ["https://portal.preview.paretoproof.com"],
      portalPublicOrigin: "https://portal.preview.paretoproof.com",
      resolvePortalAccess: async () => null,
    },
  );

  const response = await app.inject({
    method: "POST",
    url: "/portal/session/finalize/submit?redirect=/profile",
    headers: {
      accept: "text/html",
      origin: "https://portal.preview.paretoproof.com",
      referer: "https://portal.preview.paretoproof.com/",
    },
  });

  assert.equal(response.statusCode, 307);
  assert.equal(
    response.headers.location,
    "https://portal.preview.paretoproof.com/api/access/finalize?app=portal&redirect=%2Fprofile",
  );
});

test("POST /portal/session/finalize/submit still returns JSON auth errors for non-branded callers without access", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {} as never,
    () => (_request, _reply, done) => {
      done();
    },
    {
      resolvePortalAccess: async () => null,
    },
  );

  const response = await app.inject({
    method: "POST",
    url: "/portal/session/finalize/submit",
    headers: {
      accept: "application/json",
    },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error, "access_assertion_required");
});

test("POST /portal/session/finalize/submit clears PortalAccessSession and canonicalizes pending users to /pending", async (t) => {
  const app = Fastify();
  const originalSecret = process.env.ACCESS_PROVIDER_STATE_SECRET;
  process.env.ACCESS_PROVIDER_STATE_SECRET = "test-secret";

  t.after(async () => {
    process.env.ACCESS_PROVIDER_STATE_SECRET = originalSecret;
    await app.close();
  });

  registerPortalRoutes(
    app,
    {
      transaction: async () => {
        throw new Error(
          "pending sign-in finalize submit should not hit the identity-link mutation path",
        );
      },
    } as never,
    () => (_request, _reply, done) => {
      done();
    },
    {
      resolvePortalAccess: async (request) => {
        assert.equal(request.headers["cf-access-jwt-assertion"], undefined);
        assert.match(
          String(request.headers.cookie),
          /CF_Authorization=session-cookie/,
        );
        request.accessIdentity = {
          email: "pending@example.com",
          issuer: "https://paretoproof.cloudflareaccess.com",
          provider: "cloudflare_google",
          subject: "subject-pending",
        };
        request.accessRbacContext = {
          email: "pending@example.com",
          requestId: "request-pending",
          status: "pending",
          subject: "subject-pending",
          userId: "user-pending",
        };

        return request.accessRbacContext;
      },
    },
  );

  const response = await app.inject({
    method: "POST",
    url: "/portal/session/finalize/submit?redirect=/access-request",
    headers: {
      accept: "text/html",
      cookie: [
        "CF_Authorization=session-cookie",
        buildSignedAccessCookie(
          "PortalAccessProvider",
          "cloudflare_google|subject-pending",
        ),
      ].join("; "),
      origin: "https://google.auth.paretoproof.com",
      referer: "https://google.auth.paretoproof.com/",
    },
  });

  assert.equal(response.statusCode, 302);
  assert.equal(
    response.headers.location,
    "https://portal.paretoproof.com/pending",
  );

  const setCookies = response.headers["set-cookie"];
  assert.ok(Array.isArray(setCookies));
  assert.equal(setCookies.length, 3);
  assert.match(setCookies[0], /^PortalAccessSession=;/);
  assert.match(setCookies[0], /; SameSite=Strict;/);
  assert.match(setCookies[1], /^PortalAccessProvider=/);
  assert.match(setCookies[1], /; SameSite=Strict;/);
  assert.match(setCookies[2], /^PortalLinkIntent=;/);
  assert.match(setCookies[2], /; SameSite=Strict;/);
});

test("POST /portal/session/finalize/submit canonicalizes pending math continuation back to the portal pending route", async (t) => {
  const app = Fastify();
  const originalSecret = process.env.ACCESS_PROVIDER_STATE_SECRET;
  process.env.ACCESS_PROVIDER_STATE_SECRET = "test-secret";

  t.after(async () => {
    process.env.ACCESS_PROVIDER_STATE_SECRET = originalSecret;
    await app.close();
  });

  registerPortalRoutes(
    app,
    {
      transaction: async () => {
        throw new Error(
          "pending math finalize submit should not hit the identity-link mutation path",
        );
      },
    } as never,
    () => (_request, _reply, done) => {
      done();
    },
    {
      mathPublicOrigin: "https://math.preview.paretoproof.com",
      resolvePortalAccess: async (request) => {
        request.accessIdentity = {
          email: "pending@example.com",
          issuer: "https://paretoproof.cloudflareaccess.com",
          provider: "cloudflare_google",
          subject: "subject-pending",
        };
        request.accessRbacContext = {
          email: "pending@example.com",
          requestId: "request-pending",
          status: "pending",
          subject: "subject-pending",
          userId: "user-pending",
        };

        return request.accessRbacContext;
      },
    },
  );

  const response = await app.inject({
    method: "POST",
    url: "/portal/session/finalize/submit?app=math&redirect=/launch",
    headers: {
      accept: "application/json",
      cookie: [
        "CF_Authorization=session-cookie",
        buildSignedAccessCookie(
          "PortalAccessProvider",
          "cloudflare_google|subject-pending",
        ),
      ].join("; "),
      origin: "https://google.auth.paretoproof.com",
      referer: "https://google.auth.paretoproof.com/",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    redirectTo: "https://portal.paretoproof.com/pending",
  });
});

test("POST /portal/session/sign-out revokes the active opaque session and clears portal cookies", async (t) => {
  let revokedSession = false;
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {
      update(table: unknown) {
        assert.equal(table, sessions);
        return {
          set(value: unknown) {
            assert.ok(
              (value as { revokedAt?: Date }).revokedAt instanceof Date,
            );
            return {
              where() {
                return {
                  returning: async () => {
                    revokedSession = true;
                    return [{ id: "session-1" }];
                  },
                };
              },
            };
          },
        };
      },
    } as never,
    () => (_request, _reply, done) => {
      done();
    },
    {
      resolvePortalAccess: async () => null,
    },
  );

  const response = await app.inject({
    method: "POST",
    url: "/portal/session/sign-out",
    headers: {
      cookie: "PortalAccessSession=opaque-session-token",
    },
  });

  assert.equal(response.statusCode, 204);
  assert.equal(revokedSession, true);

  const setCookies = response.headers["set-cookie"];
  assert.ok(Array.isArray(setCookies));
  assert.equal(setCookies.length, 3);
  assert.match(setCookies[0], /^PortalAccessSession=;/);
  assert.match(setCookies[1], /^PortalAccessProvider=;/);
  assert.match(setCookies[2], /^PortalLinkIntent=;/);
});

test("GET /portal/me rejects legacy signed portal session cookies without crashing", async (t) => {
  const app = Fastify();
  const originalEnv = {
    ACCESS_PROVIDER_STATE_SECRET: process.env.ACCESS_PROVIDER_STATE_SECRET,
    CF_ACCESS_BRANDED_AUDS: process.env.CF_ACCESS_BRANDED_AUDS,
    CF_ACCESS_PORTAL_AUD: process.env.CF_ACCESS_PORTAL_AUD,
    CF_ACCESS_TEAM_DOMAIN: process.env.CF_ACCESS_TEAM_DOMAIN,
    DATABASE_URL: process.env.DATABASE_URL,
    WORKER_BOOTSTRAP_TOKEN: process.env.WORKER_BOOTSTRAP_TOKEN,
  };

  process.env.ACCESS_PROVIDER_STATE_SECRET = "test-secret";
  process.env.CF_ACCESS_BRANDED_AUDS = "github-audience,google-audience";
  process.env.CF_ACCESS_PORTAL_AUD = "portal-audience";
  process.env.CF_ACCESS_TEAM_DOMAIN = "paretoproof.cloudflareaccess.com";
  process.env.DATABASE_URL = "postgres://localhost:5432/paretoproof";
  process.env.WORKER_BOOTSTRAP_TOKEN = "worker-bootstrap-token";

  t.after(async () => {
    Object.assign(process.env, originalEnv);
    await app.close();
  });

  registerPortalRoutes(
    app,
    {
      query: {
        sessions: {
          findFirst: async () => null,
        },
      },
    } as never,
    createAccessGuard({
      query: {
        sessions: {
          findFirst: async () => null,
        },
      },
    } as never),
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/me",
    headers: {
      cookie: "PortalAccessSession=legacy.payload.signature",
    },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error, "access_assertion_required");
});
