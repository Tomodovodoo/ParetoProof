import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { buildSignedAccessCookie } from "../src/auth/cloudflare-access.ts";
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
  assert.equal(setCookies.length, 2);
  assert.match(setCookies[0], /^PortalAccessProvider=/);
  assert.match(setCookies[1], /^PortalLinkIntent=;/);
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
