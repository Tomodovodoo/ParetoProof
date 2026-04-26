import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { portalMeResponseSchema } from "@paretoproof/shared";
import { registerPortalRoutes } from "../src/routes/portal.ts";

function createAuthenticatedAccessGuard() {
  return () =>
    (
      request: {
        accessIdentity?: unknown;
        accessRbacContext?: unknown;
      },
      _reply: unknown,
      done: () => void,
    ) => {
      request.accessIdentity = {
        email: "helper@example.com",
        issuer: "https://paretoproof.cloudflareaccess.com",
        provider: "cloudflare_github",
        subject: "github|123",
      };
      request.accessRbacContext = {
        email: "helper@example.com",
        identityId: "identity-1",
        role: "helper",
        status: "approved",
        subject: "github|123",
        userId: "user-1",
      };
      done();
    };
}

test("GET /portal/me returns the shared authenticated bootstrap contract", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(
    app,
    {} as never,
    createAuthenticatedAccessGuard() as never,
    {
      resolvePortalAccess: async () => null,
    },
  );

  const response = await app.inject({
    headers: {
      accept: "application/json",
    },
    method: "GET",
    url: "/portal/me",
  });

  assert.equal(response.statusCode, 200);

  const responseBody = response.json();
  const parsed = portalMeResponseSchema.safeParse(responseBody);

  assert.equal(parsed.success, true);
  assert.equal(responseBody.access.email, "helper@example.com");
  assert.equal(responseBody.access.role, "helper");
  assert.equal(responseBody.identity.provider, "cloudflare_github");
});
