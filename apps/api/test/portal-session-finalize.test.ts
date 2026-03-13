import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerPortalRoutes } from "../src/routes/portal.ts";

test("GET /portal/session/finalize/submit redirects back to the auth retry handoff", async (t) => {
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
        throw new Error("portal finalize GET should not reach the mutation path");
      }
    } as never,
    () => (_request, _reply, done) => {
      done();
    }
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/session/finalize/submit?redirect=/profile",
    headers: {
      accept: "text/html",
      cookie: "PortalLinkIntent=test; PortalAccessProvider=test",
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
