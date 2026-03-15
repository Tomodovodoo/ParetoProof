import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSignedPortalAccessSessionCookie,
  readAccessJwtAssertion,
  selectCloudflareAccessVerifier,
  verifyPortalAccessSession,
  type CloudflareAccessVerifierSet
} from "../src/auth/cloudflare-access.ts";
import { createAccessResolver } from "../src/auth/require-access.ts";

test("readAccessJwtAssertion falls back to CF_Authorization when the Access header is absent", () => {
  const assertion = readAccessJwtAssertion({
    headers: {
      cookie: "CF_Authorization=session-cookie; PortalAccessProvider=signed"
    }
  } as never);

  assert.equal(assertion, "session-cookie");
});

test("readAccessJwtAssertion prefers the Access header over the cookie fallback", () => {
  const assertion = readAccessJwtAssertion({
    headers: {
      "cf-access-jwt-assertion": "header-assertion",
      cookie: "CF_Authorization=session-cookie"
    }
  } as never);

  assert.equal(assertion, "header-assertion");
});

test("readAccessJwtAssertion returns null when no usable Access assertion is present", () => {
  const assertion = readAccessJwtAssertion({
    headers: {
      cookie: "PortalAccessProvider=signed"
    }
  } as never);

  assert.equal(assertion, null);
});

test("verifyPortalAccessSession round-trips a signed portal access session cookie", () => {
  const originalSecret = process.env.ACCESS_PROVIDER_STATE_SECRET;
  process.env.ACCESS_PROVIDER_STATE_SECRET = "test-secret";

  try {
    const cookie = buildSignedPortalAccessSessionCookie(
      {
        email: "person@example.com",
        issuer: "https://paretoproof.cloudflareaccess.com",
        provider: "cloudflare_google",
        subject: "subject-1"
      },
      {
        email: "person@example.com",
        identityId: "identity-1",
        roles: ["helper"],
        status: "approved",
        subject: "subject-1",
        userId: "user-1"
      }
    );

    assert.deepEqual(verifyPortalAccessSession(cookie), {
      context: {
        email: "person@example.com",
        identityId: "identity-1",
        roles: ["helper"],
        status: "approved",
        subject: "subject-1",
        userId: "user-1"
      },
      identity: {
        email: "person@example.com",
        issuer: "https://paretoproof.cloudflareaccess.com",
        provider: "cloudflare_google",
        subject: "subject-1"
      }
    });
  } finally {
    process.env.ACCESS_PROVIDER_STATE_SECRET = originalSecret;
  }
});

test("createAccessResolver accepts the signed portal access session on portal routes without touching Access verification", async () => {
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

  try {
    const resolveAccess = createAccessResolver({} as never);
    const request = {
      accessIdentity: null,
      accessRbacContext: null,
      headers: {
        cookie: buildSignedPortalAccessSessionCookie(
          {
            email: "person@example.com",
            issuer: "https://paretoproof.cloudflareaccess.com",
            provider: "cloudflare_google",
            subject: "subject-1"
          },
          {
            email: "person@example.com",
            identityId: "identity-1",
            roles: ["helper"],
            status: "approved",
            subject: "subject-1",
            userId: "user-1"
          }
        )
      },
      raw: {
        url: "/portal/me"
      },
      routeOptions: {
        url: "/portal/me"
      }
    } as never;

    const context = await resolveAccess(request);

    assert.deepEqual(context, {
      email: "person@example.com",
      identityId: "identity-1",
      roles: ["helper"],
      status: "approved",
      subject: "subject-1",
      userId: "user-1"
    });
    assert.equal(request.accessIdentity?.subject, "subject-1");
    assert.equal(request.accessIdentity?.provider, "cloudflare_google");
  } finally {
    Object.assign(process.env, originalEnv);
  }
});

test("selectCloudflareAccessVerifier keeps the branded finalize boundaries on the relay audiences", () => {
  const verifiers = {
    brandedRelay: { audiences: ["portal-aud", "github-aud", "google-aud"] },
    internal: { audiences: ["internal-aud"] },
    portal: { audiences: ["portal-aud"] }
  } satisfies Record<keyof CloudflareAccessVerifierSet, { audiences: string[] }>;

  assert.equal(
    selectCloudflareAccessVerifier(
      {
        raw: {
          url: "/portal/session/finalize"
        },
        routeOptions: {
          url: "/portal/session/finalize"
        }
      } as never,
      verifiers as never
    ),
    verifiers.brandedRelay
  );
  assert.equal(
    selectCloudflareAccessVerifier(
      {
        raw: {
          url: "/portal/session/finalize/submit"
        },
        routeOptions: {
          url: "/portal/session/finalize/submit"
        }
      } as never,
      verifiers as never
    ),
    verifiers.brandedRelay
  );
  assert.equal(
    selectCloudflareAccessVerifier(
      {
        raw: {
          url: "/portal/me"
        },
        routeOptions: {
          url: "/portal/me"
        }
      } as never,
      verifiers as never
    ),
    verifiers.portal
  );
  assert.equal(
    selectCloudflareAccessVerifier(
      {
        raw: {
          url: "/internal/worker/claims"
        },
        routeOptions: {
          url: "/internal/worker/claims"
        }
      } as never,
      verifiers as never
    ),
    verifiers.internal
  );
});
