import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerPortalRoutes } from "../src/routes/portal.ts";
import { createTrustedMutationOriginHook } from "../src/server/trusted-mutation-origin.ts";

function createAuthenticatedAccessGuard() {
  return () => (
    request: {
      accessIdentity?: {
        email: string;
        provider: "cloudflare_google";
        subject: string;
      };
    },
    _reply: unknown,
    done: () => void
  ) => {
    request.accessIdentity = {
      email: "person@example.com",
      provider: "cloudflare_google",
      subject: "subject-1"
    };
    done();
  };
}

function createMutationTrackingDb(onMutationAttempt: () => void) {
  return {
    transaction: async () => {
      onMutationAttempt();
      throw new Error("expected test database failure");
    }
  } as never;
}

function registerPortalAccessRequestTestApp(options: {
  allowLocalhostOrigins?: boolean;
  allowedOrigins?: string[];
  onMutationAttempt: () => void;
}) {
  const app = Fastify();

  app.addHook(
    "onRequest",
    createTrustedMutationOriginHook({
      allowLocalhostOrigins: options.allowLocalhostOrigins ?? false,
      allowedOrigins: options.allowedOrigins ?? ["https://portal.paretoproof.com"]
    })
  );

  registerPortalRoutes(
    app,
    createMutationTrackingDb(options.onMutationAttempt),
    createAuthenticatedAccessGuard(),
    {
      resolvePortalAccess: async () => null
    }
  );

  return app;
}

test("POST /portal/access-requests rejects requests without an Origin header before mutation work runs", async (t) => {
  let mutationAttempted = false;
  const app = registerPortalAccessRequestTestApp({
    onMutationAttempt: () => {
      mutationAttempted = true;
    }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    payload: {
      rationale: "Need contributor access",
      requestedRole: "helper"
    },
    url: "/portal/access-requests"
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), {
    error: "trusted_origin_required"
  });
  assert.equal(mutationAttempted, false);
});

test("POST /portal/access-requests rejects untrusted origins before mutation work runs", async (t) => {
  let mutationAttempted = false;
  const app = registerPortalAccessRequestTestApp({
    onMutationAttempt: () => {
      mutationAttempted = true;
    }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    payload: {
      rationale: "Need contributor access",
      requestedRole: "helper"
    },
    url: "/portal/access-requests",
    headers: {
      origin: "https://evil.example"
    }
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), {
    error: "trusted_origin_not_allowed"
  });
  assert.equal(mutationAttempted, false);
});

test("POST /portal/access-requests allows the trusted portal origin to reach mutation work", async (t) => {
  let mutationAttempted = false;
  const app = registerPortalAccessRequestTestApp({
    onMutationAttempt: () => {
      mutationAttempted = true;
    }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    payload: {
      rationale: "Need contributor access",
      requestedRole: "helper"
    },
    url: "/portal/access-requests",
    headers: {
      origin: "https://portal.paretoproof.com"
    }
  });

  assert.equal(response.statusCode, 500);
  assert.equal(mutationAttempted, true);
});
