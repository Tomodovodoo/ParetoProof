import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { createTrustedMutationOriginHook } from "../src/server/trusted-mutation-origin.ts";

test("trusted mutation origin hook rejects state-changing portal requests without an Origin header", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  app.addHook(
    "onRequest",
    createTrustedMutationOriginHook({
      allowLocalhostOrigins: false,
      allowedOrigins: ["https://portal.paretoproof.com"]
    })
  );

  app.post("/portal/access-requests", async () => ({ ok: true }));

  const response = await app.inject({
    method: "POST",
    payload: {
      rationale: "test"
    },
    url: "/portal/access-requests"
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), {
    error: "trusted_origin_required"
  });
});

test("trusted mutation origin hook rejects state-changing portal requests from untrusted origins", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  app.addHook(
    "onRequest",
    createTrustedMutationOriginHook({
      allowLocalhostOrigins: false,
      allowedOrigins: ["https://portal.paretoproof.com"]
    })
  );

  app.post("/portal/admin/access-requests/req_123/approve", async () => ({ ok: true }));

  const response = await app.inject({
    method: "POST",
    payload: {
      approvedRole: "helper",
      decisionNote: "test"
    },
    url: "/portal/admin/access-requests/req_123/approve",
    headers: {
      origin: "https://evil.example"
    }
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), {
    error: "trusted_origin_not_allowed"
  });
});

test("trusted mutation origin hook also protects admin role revocation mutations", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  app.addHook(
    "onRequest",
    createTrustedMutationOriginHook({
      allowLocalhostOrigins: false,
      allowedOrigins: ["https://portal.paretoproof.com"]
    })
  );

  app.post("/portal/admin/users/user_123/revoke-role", async () => ({ ok: true }));

  const response = await app.inject({
    method: "POST",
    payload: {
      reason: "test"
    },
    url: "/portal/admin/users/user_123/revoke-role",
    headers: {
      origin: "https://evil.example"
    }
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), {
    error: "trusted_origin_not_allowed"
  });
});

test("trusted mutation origin hook allows trusted portal origins and safe GET redirects", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  app.addHook(
    "onRequest",
    createTrustedMutationOriginHook({
      allowLocalhostOrigins: false,
      allowedOrigins: ["https://portal.paretoproof.com"]
    })
  );

  app.post("/portal/profile", async () => ({ ok: true }));
  app.get("/portal/session/finalize/submit", async () => ({ ok: true }));

  const trustedPost = await app.inject({
    method: "POST",
    payload: {
      displayName: "Ada"
    },
    url: "/portal/profile",
    headers: {
      origin: "https://portal.paretoproof.com"
    }
  });

  const redirectGet = await app.inject({
    method: "GET",
    url: "/portal/session/finalize/submit"
  });

  assert.equal(trustedPost.statusCode, 200);
  assert.deepEqual(trustedPost.json(), {
    ok: true
  });
  assert.equal(redirectGet.statusCode, 200);
  assert.deepEqual(redirectGet.json(), {
    ok: true
  });
});
