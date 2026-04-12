import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerAdminRoutes } from "../src/routes/admin.ts";
import { registerHealthRoute } from "../src/routes/health.ts";
import {
  createInMemoryRateLimiter,
  createRateLimitPreHandlers
} from "../src/middleware/rate-limit.ts";
import { registerPortalRoutes } from "../src/routes/portal.ts";

function createApprovedAccessGuard() {
  return () => (
    request: {
      accessIdentity?: unknown;
      accessRbacContext?: unknown;
    },
    _reply: unknown,
    done: () => void
  ) => {
    request.accessIdentity = {
      email: "person@example.com",
      issuer: "https://paretoproof.cloudflareaccess.com",
      provider: "cloudflare_github",
      subject: "subject-1"
    };
    request.accessRbacContext = {
      email: "person@example.com",
      identityId: "identity-1",
      role: "admin",
      status: "approved",
      subject: "subject-1",
      userId: "user-1"
    };
    done();
  };
}

function createPublicRequest(options: {
  headers?: Record<string, string>;
  ip?: string;
}) {
  return {
    headers: options.headers ?? {},
    ip: options.ip ?? "198.51.100.10"
  } as never;
}

test("public routes emit rate-limit headers and block after the configured budget", async (t) => {
  const app = Fastify();
  const rateLimitPreHandlers = createRateLimitPreHandlers(
    createInMemoryRateLimiter({
      policies: {
        public: {
          limit: 2
        }
      }
    })
  );

  t.after(async () => {
    await app.close();
  });

  registerHealthRoute(app, {
    rateLimitPreHandlers
  });

  const firstResponse = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(firstResponse.headers["x-ratelimit-limit"], "2");
  assert.equal(firstResponse.headers["x-ratelimit-remaining"], "1");

  const secondResponse = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(secondResponse.statusCode, 200);
  assert.equal(secondResponse.headers["x-ratelimit-remaining"], "0");

  const blockedResponse = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(blockedResponse.statusCode, 429);
  assert.equal(blockedResponse.headers["x-ratelimit-remaining"], "0");
  assert.equal(blockedResponse.json().error, "rate_limit_exceeded");
  assert.equal(blockedResponse.json().scope, "public");
});

test("authenticated portal and admin routes share the authenticated per-user budget", async (t) => {
  const app = Fastify();
  const rateLimitPreHandlers = createRateLimitPreHandlers(
    createInMemoryRateLimiter({
      policies: {
        authenticated: {
          limit: 2
        }
      }
    })
  );

  t.after(async () => {
    await app.close();
  });

  registerPortalRoutes(app, {} as never, createApprovedAccessGuard() as never, {
    rateLimitPreHandlers,
    resolvePortalAccess: async (request) => {
      request.accessIdentity = {
        email: "person@example.com",
        issuer: "https://paretoproof.cloudflareaccess.com",
        provider: "cloudflare_github",
        subject: "subject-1"
      };
      request.accessRbacContext = {
        email: "person@example.com",
        identityId: "identity-1",
        role: "admin",
        status: "approved",
        subject: "subject-1",
        userId: "user-1"
      };

      return request.accessRbacContext;
    }
  });
  registerAdminRoutes(app, {
    query: {
      users: {
        findMany: async () => [],
        findFirst: async () => null
      }
    }
  } as never, createApprovedAccessGuard() as never, {
    rateLimitPreHandlers
  });

  const portalResponse = await app.inject({
    method: "GET",
    url: "/portal/me"
  });

  assert.equal(portalResponse.statusCode, 200);
  assert.equal(portalResponse.headers["x-ratelimit-limit"], "2");
  assert.equal(portalResponse.headers["x-ratelimit-remaining"], "1");
  assert.deepEqual(portalResponse.json().access, {
    email: "person@example.com",
    identityId: "identity-1",
    role: "admin",
    status: "approved",
    subject: "subject-1",
    userId: "user-1"
  });

  const adminResponse = await app.inject({
    method: "GET",
    url: "/portal/admin/users"
  });

  assert.equal(adminResponse.statusCode, 200);
  assert.equal(adminResponse.headers["x-ratelimit-remaining"], "0");

  const blockedResponse = await app.inject({
    method: "GET",
    url: "/portal/runs"
  });

  assert.equal(blockedResponse.statusCode, 429);
  assert.equal(blockedResponse.json().scope, "authenticated");
  assert.equal(blockedResponse.headers["retry-after"], "60");
});

test("public rate limiting ignores spoofed forwarding headers and keys off the trusted request ip", () => {
  const rateLimiter = createInMemoryRateLimiter({
    policies: {
      public: {
        limit: 2
      }
    }
  });

  const firstResult = rateLimiter.check(
    "public",
    createPublicRequest({
      headers: {
        "cf-connecting-ip": "203.0.113.1",
        "x-forwarded-for": "203.0.113.2"
      },
      ip: "198.51.100.25"
    })
  );
  const secondResult = rateLimiter.check(
    "public",
    createPublicRequest({
      headers: {
        "cf-connecting-ip": "203.0.113.99",
        "x-forwarded-for": "203.0.113.100"
      },
      ip: "198.51.100.25"
    })
  );
  const blockedResult = rateLimiter.check(
    "public",
    createPublicRequest({
      headers: {
        "cf-connecting-ip": "192.0.2.1",
        "x-forwarded-for": "192.0.2.2"
      },
      ip: "198.51.100.25"
    })
  );

  assert.equal(firstResult.allowed, true);
  assert.equal(secondResult.allowed, true);
  assert.equal(blockedResult.allowed, false);
  assert.equal(blockedResult.decision.remaining, 0);
});

test("public rate limiting stays bounded under high-cardinality client pressure", () => {
  const rateLimiter = createInMemoryRateLimiter({
    maxTrackedKeys: 3,
    policies: {
      public: {
        limit: 1,
        windowMs: 60_000
      }
    }
  });

  const first = rateLimiter.check("public", createPublicRequest({ ip: "198.51.100.1" }));
  const second = rateLimiter.check("public", createPublicRequest({ ip: "198.51.100.2" }));
  const thirdDistinct = rateLimiter.check("public", createPublicRequest({ ip: "198.51.100.3" }));
  const overflowFirst = rateLimiter.check(
    "public",
    createPublicRequest({ ip: "198.51.100.4" })
  );
  const overflowBlocked = rateLimiter.check(
    "public",
    createPublicRequest({ ip: "198.51.100.5" })
  );

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(thirdDistinct.allowed, true);
  assert.equal(overflowFirst.allowed, true);
  assert.equal(overflowBlocked.allowed, false);
  assert.equal(rateLimiter.getTrackedKeyCount(), 3);
});
