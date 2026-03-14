import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerPortalRoutes } from "../src/routes/portal.ts";

test("POST /portal/access-requests rejects requests without an allowed origin", async (t) => {
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
        throw new Error("mutation should be blocked before db writes");
      }
    } as never,
    () => (request, _reply, done) => {
      (request as { accessIdentity?: { email: string; subject: string } }).accessIdentity = {
        email: "user@example.com",
        subject: "subject"
      };
      done();
    }
  );

  const response = await app.inject({
    method: "POST",
    url: "/portal/access-requests",
    payload: {
      rationale: "I need access",
      requestedRole: "helper"
    }
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error, "invalid_mutation_origin");
  assert.equal(mutationAttempted, false);
});

test("POST /portal/access-requests allows configured portal origin", async (t) => {
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
        throw new Error("expected test database failure");
      }
    } as never,
    () => (request, _reply, done) => {
      (request as { accessIdentity?: { email: string; subject: string } }).accessIdentity = {
        email: "user@example.com",
        subject: "subject"
      };
      done();
    }
  );

  const response = await app.inject({
    method: "POST",
    url: "/portal/access-requests",
    headers: {
      origin: "https://portal.paretoproof.com"
    },
    payload: {
      rationale: "I need access",
      requestedRole: "helper"
    }
  });

  assert.equal(response.statusCode, 500);
  assert.equal(mutationAttempted, true);
});

