import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import {
  buildSignedAccessCookie,
  buildSignedPortalAccessSessionCookie
} from "../src/auth/cloudflare-access.ts";
import { createAccessGuard } from "../src/auth/require-access.ts";
import { registerPortalRoutes } from "../src/routes/portal.ts";

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
        throw new Error("portal finalize GET should not reach the mutation path");
      }
    } as never,
    () => (_request, _reply, done) => {
      done();
    },
    {
      resolvePortalAccess: async () => ({
        email: "person@example.com",
        identityId: "identity-1",
        roles: ["helper"],
        status: "approved",
        subject: "subject-1",
        userId: "user-1"
      })
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/session/finalize/submit?redirect=/profile",
    headers: {
      accept: "text/html",
      cookie: buildSignedAccessCookie("PortalLinkIntent", "intent-1"),
      "cf-access-jwt-assertion": "test-assertion"
    }
  });

  assert.equal(response.statusCode, 302);
  assert.equal(
    response.headers.location,
    "https://auth.paretoproof.com/?redirect=%2Fprofile&handoff=retry"
  );
  assert.equal(mutationAttempted, false);
});

test("GET /portal/session/finalize/submit completes a normal sign-in handoff once access is attached", async (t) => {
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
        throw new Error("plain sign-in finalize GET should not hit the identity-link mutation path");
      }
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
          subject: "subject-1"
        };
        request.accessRbacContext = {
          email: "person@example.com",
          identityId: "identity-1",
          roles: ["helper"],
          status: "approved",
          subject: "subject-1",
          userId: "user-1"
        };

        return request.accessRbacContext;
      }
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/session/finalize/submit?redirect=/profile",
    headers: {
      accept: "text/html",
      cookie: buildSignedAccessCookie(
        "PortalAccessProvider",
        "cloudflare_google|subject-1"
      ),
      "cf-access-jwt-assertion": "test-assertion"
    }
  });

  assert.equal(response.statusCode, 302);
  assert.equal(response.headers.location, "https://portal.paretoproof.com/profile");
  assert.equal(mutationAttempted, false);

  const setCookies = response.headers["set-cookie"];
  assert.ok(Array.isArray(setCookies));
  assert.equal(setCookies.length, 3);
  assert.match(setCookies[0], /^PortalAccessSession=/);
  assert.match(setCookies[0], /; SameSite=Lax;/);
  assert.match(setCookies[1], /^PortalAccessProvider=/);
  assert.match(setCookies[1], /; SameSite=Strict;/);
  assert.match(setCookies[2], /^PortalLinkIntent=;/);
  assert.match(setCookies[2], /; SameSite=Strict;/);
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
      resolvePortalAccess: async () => null
    }
  );

  const response = await app.inject({
    method: "POST",
    url: "/portal/session/finalize/submit?redirect=/profile",
    headers: {
      accept: "text/html",
      origin: "https://google.auth.paretoproof.com",
      referer: "https://google.auth.paretoproof.com/"
    }
  });

  assert.equal(response.statusCode, 307);
  assert.equal(
    response.headers.location,
    "https://google.auth.paretoproof.com/api/access/finalize?redirect=%2Fprofile"
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
      resolvePortalAccess: async () => null
    }
  );

  const response = await app.inject({
    method: "POST",
    url: "/portal/session/finalize/submit",
    headers: {
      accept: "application/json"
    }
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error, "access_assertion_required");
});

test("POST /portal/session/finalize/submit completes a pending-user handoff from cookie-backed branded access", async (t) => {
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
        throw new Error("pending sign-in finalize submit should not hit the identity-link mutation path");
      }
    } as never,
    () => (_request, _reply, done) => {
      done();
    },
    {
      resolvePortalAccess: async (request) => {
        assert.equal(request.headers["cf-access-jwt-assertion"], undefined);
        assert.match(
          String(request.headers.cookie),
          /CF_Authorization=session-cookie/
        );
        request.accessIdentity = {
          email: "pending@example.com",
          issuer: "https://paretoproof.cloudflareaccess.com",
          provider: "cloudflare_google",
          subject: "subject-pending"
        };
        request.accessRbacContext = {
          email: "pending@example.com",
          identityId: "identity-pending",
          roles: [],
          status: "pending",
          subject: "subject-pending",
          userId: "user-pending"
        };

        return request.accessRbacContext;
      }
    }
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
          "cloudflare_google|subject-pending"
        )
      ].join("; "),
      origin: "https://google.auth.paretoproof.com",
      referer: "https://google.auth.paretoproof.com/"
    }
  });

  assert.equal(response.statusCode, 302);
  assert.equal(
    response.headers.location,
    "https://portal.paretoproof.com/access-request"
  );

  const setCookies = response.headers["set-cookie"];
  assert.ok(Array.isArray(setCookies));
  assert.equal(setCookies.length, 3);
  assert.match(setCookies[0], /^PortalAccessSession=/);
  assert.match(setCookies[0], /; SameSite=Lax;/);
  assert.match(setCookies[1], /^PortalAccessProvider=/);
  assert.match(setCookies[1], /; SameSite=Strict;/);
  assert.match(setCookies[2], /^PortalLinkIntent=;/);
  assert.match(setCookies[2], /; SameSite=Strict;/);
});

test("GET /portal/me accepts the signed portal access session cookie when no Access assertion is present", async (t) => {
  const app = Fastify();
  const originalEnv = {
    ACCESS_PROVIDER_STATE_SECRET: process.env.ACCESS_PROVIDER_STATE_SECRET,
    CF_ACCESS_BRANDED_AUDS: process.env.CF_ACCESS_BRANDED_AUDS,
    CF_ACCESS_PORTAL_AUD: process.env.CF_ACCESS_PORTAL_AUD,
    CF_ACCESS_TEAM_DOMAIN: process.env.CF_ACCESS_TEAM_DOMAIN,
    DATABASE_URL: process.env.DATABASE_URL,
    WORKER_BOOTSTRAP_TOKEN: process.env.WORKER_BOOTSTRAP_TOKEN
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
    {} as never,
    createAccessGuard({} as never)
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/me",
    headers: {
      cookie: buildSignedPortalAccessSessionCookie(
        {
          email: "approved@example.com",
          issuer: "https://paretoproof.cloudflareaccess.com",
          provider: "cloudflare_google",
          subject: "subject-approved"
        },
        {
          email: "approved@example.com",
          identityId: "identity-approved",
          roles: ["helper"],
          status: "approved",
          subject: "subject-approved",
          userId: "user-approved"
        }
      )
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().access.status, "approved");
  assert.equal(response.json().access.email, "approved@example.com");
  assert.deepEqual(response.json().access.roles, ["helper"]);

  const setCookie = response.headers["set-cookie"];
  const normalizedSetCookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  assert.match(String(normalizedSetCookies[0] ?? ""), /^PortalAccessSession=/);
});
