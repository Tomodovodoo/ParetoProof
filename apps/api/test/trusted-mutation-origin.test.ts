import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { createTrustedMutationOriginHook } from "../src/server/trusted-mutation-origin.ts";

const allowedOriginsBySurface = {
  math: ["https://math.preview.paretoproof.com"],
  portal: ["https://portal.preview.paretoproof.com"],
};

test("trusted mutation origin hook rejects state-changing portal requests without an Origin header", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  app.addHook(
    "onRequest",
    createTrustedMutationOriginHook({
      allowLocalhostOrigins: false,
      allowedOriginsBySurface,
      brandedAuthOrigins: [],
    }),
  );

  app.post("/portal/access-requests", async () => ({ ok: true }));

  const response = await app.inject({
    method: "POST",
    payload: {
      rationale: "test",
    },
    url: "/portal/access-requests",
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), {
    error: "trusted_origin_required",
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
      allowedOriginsBySurface,
      brandedAuthOrigins: [],
    }),
  );

  app.post("/portal/admin/access-requests/req_123/approve", async () => ({
    ok: true,
  }));

  const response = await app.inject({
    method: "POST",
    payload: {
      approvedRole: "helper",
      decisionNote: "test",
    },
    url: "/portal/admin/access-requests/req_123/approve",
    headers: {
      origin: "https://evil.example",
    },
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), {
    error: "trusted_origin_not_allowed",
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
      allowedOriginsBySurface,
      brandedAuthOrigins: [],
    }),
  );

  app.post("/portal/admin/users/user_123/revoke-role", async () => ({
    ok: true,
  }));

  const response = await app.inject({
    method: "POST",
    payload: {
      reason: "test",
    },
    url: "/portal/admin/users/user_123/revoke-role",
    headers: {
      origin: "https://evil.example",
    },
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), {
    error: "trusted_origin_not_allowed",
  });
});

test("trusted mutation origin hook also protects portal-admin offline ingest mutations", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  app.addHook(
    "onRequest",
    createTrustedMutationOriginHook({
      allowLocalhostOrigins: false,
      allowedOriginsBySurface,
      brandedAuthOrigins: [],
    }),
  );

  app.post("/portal/admin/offline-ingest/problem9-run-bundles", async () => ({
    ok: true,
  }));

  const response = await app.inject({
    method: "POST",
    payload: {
      bundle: {},
    },
    url: "/portal/admin/offline-ingest/problem9-run-bundles",
    headers: {
      origin: "https://evil.example",
    },
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), {
    error: "trusted_origin_not_allowed",
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
      allowedOriginsBySurface,
      brandedAuthOrigins: [],
    }),
  );

  app.post("/portal/profile", async () => ({ ok: true }));
  app.get("/portal/session/finalize/submit", async () => ({ ok: true }));

  const trustedPost = await app.inject({
    method: "POST",
    payload: {
      displayName: "Ada",
    },
    url: "/portal/profile",
    headers: {
      origin: "https://portal.preview.paretoproof.com",
    },
  });

  const redirectGet = await app.inject({
    method: "GET",
    url: "/portal/session/finalize/submit",
  });

  assert.equal(trustedPost.statusCode, 200);
  assert.deepEqual(trustedPost.json(), {
    ok: true,
  });
  assert.equal(redirectGet.statusCode, 200);
  assert.deepEqual(redirectGet.json(), {
    ok: true,
  });
});

test("trusted mutation origin hook still rejects math-origin portal mutations outside the finalize-submit boundary", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  app.addHook(
    "onRequest",
    createTrustedMutationOriginHook({
      allowLocalhostOrigins: false,
      allowedOriginsBySurface,
      brandedAuthOrigins: [],
    }),
  );

  app.post("/portal/profile", async () => ({ ok: true }));

  const response = await app.inject({
    method: "POST",
    payload: {
      displayName: "Ada",
    },
    url: "/portal/profile",
    headers: {
      origin: "https://math.preview.paretoproof.com",
    },
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), {
    error: "trusted_origin_not_allowed",
  });
});

test("trusted mutation origin hook only allows branded auth POSTs on the finalize-submit handoff boundary", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  app.addHook(
    "onRequest",
    createTrustedMutationOriginHook({
      allowLocalhostOrigins: false,
      allowedOriginsBySurface: {
        math: ["https://math.preview.paretoproof.com"],
        portal: [
          "https://auth.preview.paretoproof.com",
          "https://github.auth.preview.paretoproof.com",
          "https://google.auth.preview.paretoproof.com",
          "https://portal.preview.paretoproof.com",
        ],
      },
      brandedAuthOrigins: [
        "https://auth.preview.paretoproof.com",
        "https://github.auth.preview.paretoproof.com",
        "https://google.auth.preview.paretoproof.com",
      ],
    }),
  );

  app.post("/portal/session/finalize", async () => ({ ok: true }));
  app.post("/portal/session/finalize/submit", async () => ({ ok: true }));
  app.post("/portal/profile", async () => ({ ok: true }));

  const finalizeResponse = await app.inject({
    method: "POST",
    payload: {
      redirect: "/profile",
    },
    url: "/portal/session/finalize",
    headers: {
      origin: "https://github.auth.preview.paretoproof.com",
    },
  });

  const submitResponse = await app.inject({
    method: "POST",
    payload: {
      redirect: "/profile",
    },
    url: "/portal/session/finalize/submit",
    headers: {
      origin: "https://github.auth.preview.paretoproof.com",
    },
  });

  const profileResponse = await app.inject({
    method: "POST",
    payload: {
      displayName: "Ada",
    },
    url: "/portal/profile",
    headers: {
      origin: "https://github.auth.preview.paretoproof.com",
    },
  });

  assert.equal(finalizeResponse.statusCode, 403);
  assert.deepEqual(finalizeResponse.json(), {
    error: "trusted_origin_not_allowed",
  });
  assert.equal(submitResponse.statusCode, 200);
  assert.deepEqual(submitResponse.json(), {
    ok: true,
  });
  assert.equal(profileResponse.statusCode, 403);
  assert.deepEqual(profileResponse.json(), {
    error: "trusted_origin_not_allowed",
  });
});

test("trusted mutation origin hook only allows loopback-mapped branded auth origins on finalize-submit when localhost mode is enabled", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  app.addHook(
    "onRequest",
    createTrustedMutationOriginHook({
      allowLocalhostOrigins: true,
      allowedOriginsBySurface,
      brandedAuthOrigins: [
        "https://auth.preview.paretoproof.com",
        "https://github.auth.preview.paretoproof.com",
        "https://google.auth.preview.paretoproof.com",
      ],
    }),
  );

  app.post("/portal/session/finalize/submit", async () => ({ ok: true }));
  app.post("/portal/profile", async () => ({ ok: true }));

  const finalizeResponse = await app.inject({
    method: "POST",
    payload: {
      redirect: "/profile",
    },
    url: "/portal/session/finalize/submit",
    headers: {
      origin: "http://github.auth.preview.paretoproof.com:4371",
    },
  });

  const profileResponse = await app.inject({
    method: "POST",
    payload: {
      displayName: "Ada",
    },
    url: "/portal/profile",
    headers: {
      origin: "http://github.auth.preview.paretoproof.com:4371",
    },
  });

  assert.equal(finalizeResponse.statusCode, 200);
  assert.deepEqual(finalizeResponse.json(), {
    ok: true,
  });
  assert.equal(profileResponse.statusCode, 403);
  assert.deepEqual(profileResponse.json(), {
    error: "trusted_origin_not_allowed",
  });
});

test("trusted mutation origin hook rejects portal-surface callers for math mutations but allows the math surface", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  app.addHook(
    "onRequest",
    createTrustedMutationOriginHook({
      allowLocalhostOrigins: false,
      allowedOriginsBySurface,
      brandedAuthOrigins: [],
    }),
  );

  app.post("/math/submissions/sub_123/review-gates/policy_review", async () => ({
    ok: true,
  }));

  const portalOriginResponse = await app.inject({
    method: "POST",
    payload: {
      status: "satisfied",
    },
    url: "/math/submissions/sub_123/review-gates/policy_review",
    headers: {
      origin: "https://portal.preview.paretoproof.com",
    },
  });

  const mathOriginResponse = await app.inject({
    method: "POST",
    payload: {
      status: "satisfied",
    },
    url: "/math/submissions/sub_123/review-gates/policy_review",
    headers: {
      origin: "https://math.preview.paretoproof.com",
    },
  });

  assert.equal(portalOriginResponse.statusCode, 403);
  assert.deepEqual(portalOriginResponse.json(), {
    error: "trusted_origin_not_allowed",
  });
  assert.equal(mathOriginResponse.statusCode, 200);
  assert.deepEqual(mathOriginResponse.json(), {
    ok: true,
  });
});
