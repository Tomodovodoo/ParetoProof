import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSignedAccessCookie,
  readAccessJwtAssertion,
  selectCloudflareAccessVerifier,
  verifyAccessProviderHint,
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

test("PortalAccessProvider verification continues to use ACCESS_PROVIDER_STATE_SECRET", () => {
  const originalProviderSecret = process.env.ACCESS_PROVIDER_STATE_SECRET;
  const originalSessionSecret = process.env.PORTAL_SESSION_SECRET;
  process.env.ACCESS_PROVIDER_STATE_SECRET = "provider-secret";
  process.env.PORTAL_SESSION_SECRET = "session-secret";

  try {
    const providerCookie = buildSignedAccessCookie(
      "PortalAccessProvider",
      "cloudflare_google|subject-1"
    );

    assert.equal(
      verifyAccessProviderHint(providerCookie, {
        expectedSubject: "subject-1"
      }),
      "cloudflare_google"
    );

    process.env.PORTAL_SESSION_SECRET = "wrong-session-secret";

    assert.equal(
      verifyAccessProviderHint(providerCookie, {
        expectedSubject: "subject-1"
      }),
      "cloudflare_google"
    );
  } finally {
    process.env.ACCESS_PROVIDER_STATE_SECRET = originalProviderSecret;
    process.env.PORTAL_SESSION_SECRET = originalSessionSecret;
  }
});

test("PortalAccessProvider verification can use a runtime-provided secret without reparsing process.env", () => {
  const originalProviderSecret = process.env.ACCESS_PROVIDER_STATE_SECRET;
  process.env.ACCESS_PROVIDER_STATE_SECRET = "wrong-provider-secret";

  try {
    const providerCookie = buildSignedAccessCookie(
      "PortalAccessProvider",
      "cloudflare_google|subject-1",
      {
        secret: "runtime-provider-secret"
      }
    );

    assert.equal(
      verifyAccessProviderHint(providerCookie, {
        expectedSubject: "subject-1",
        secret: "runtime-provider-secret"
      }),
      "cloudflare_google"
    );
    assert.equal(
      verifyAccessProviderHint(providerCookie, {
        expectedSubject: "subject-1",
        secret: "wrong-provider-secret"
      }),
      null
    );
  } finally {
    process.env.ACCESS_PROVIDER_STATE_SECRET = originalProviderSecret;
  }
});

test("createAccessResolver accepts an opaque portal access session when the DB session lookup succeeds", async () => {
  const originalEnv = {
    ACCESS_PROVIDER_STATE_SECRET: process.env.ACCESS_PROVIDER_STATE_SECRET,
    CF_ACCESS_BRANDED_AUDS: process.env.CF_ACCESS_BRANDED_AUDS,
    CF_ACCESS_PORTAL_AUD: process.env.CF_ACCESS_PORTAL_AUD,
    CF_ACCESS_TEAM_DOMAIN: process.env.CF_ACCESS_TEAM_DOMAIN
  };

  process.env.ACCESS_PROVIDER_STATE_SECRET = "wrong-env-secret";
  process.env.CF_ACCESS_BRANDED_AUDS = "wrong-branded-audience";
  process.env.CF_ACCESS_PORTAL_AUD = "wrong-portal-audience";
  process.env.CF_ACCESS_TEAM_DOMAIN = "wrong-team.example";

  try {
    let touchedSession = false;
    const resolveAccess = createAccessResolver({
      query: {
        sessions: {
          findFirst: async () => ({
            expiresAt: new Date(Date.now() + 60_000),
            id: "session-1",
            identity: {
              id: "identity-1",
              provider: "cloudflare_google",
              providerEmail: "person@example.com",
              providerSubject: "subject-1",
              user: {
                email: "person@example.com",
                id: "user-1"
              }
            },
            revokedAt: null
          })
        },
        userIdentities: {
          findFirst: async () => ({
            id: "identity-1",
            provider: "cloudflare_google",
            providerEmail: "person@example.com",
            providerSubject: "subject-1",
            user: {
              email: "person@example.com",
              id: "user-1"
            }
          })
        }
      },
      select() {
        return {
          from() {
            return {
              where: async () => [{ role: "helper" }]
            };
          }
        };
      },
      update() {
        return {
          set() {
            return {
              where: async () => {
                touchedSession = true;
              }
            };
          }
        };
      }
    } as never, {
      accessProviderStateSecret: "runtime-secret",
      teamDomain: "paretoproof.cloudflareaccess.com",
      verifiers: {
        brandedRelay: { audiences: ["branded"] },
        internal: { audiences: ["internal"] },
        portal: { audiences: ["portal"] }
      } as never
    });
    const request = {
      accessIdentity: null,
      accessRbacContext: null,
      headers: {
        cookie: "PortalAccessSession=opaque-session-token"
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
    assert.equal(
      request.accessIdentity?.issuer,
      "https://paretoproof.cloudflareaccess.com"
    );
    assert.equal(touchedSession, true);
  } finally {
    Object.assign(process.env, originalEnv);
  }
});

test("createAccessResolver gracefully rejects legacy signed portal session cookies when no DB session exists", async () => {
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
    const resolveAccess = createAccessResolver({
      query: {
        sessions: {
          findFirst: async () => null
        }
      }
    } as never, {
      teamDomain: "paretoproof.cloudflareaccess.com",
      verifiers: {
        brandedRelay: { audiences: ["branded"] },
        internal: { audiences: ["internal"] },
        portal: { audiences: ["portal"] }
      } as never
    });
    const request = {
      accessIdentity: null,
      accessRbacContext: null,
      headers: {
        cookie: "PortalAccessSession=legacy.payload.signature"
      },
      raw: {
        url: "/portal/me"
      },
      routeOptions: {
        url: "/portal/me"
      }
    } as never;

    const context = await resolveAccess(request);

    assert.equal(context, null);
    assert.equal(request.accessIdentity, null);
  } finally {
    Object.assign(process.env, originalEnv);
  }
});

test("createAccessResolver rejects revoked opaque portal sessions", async () => {
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
    let touchedSession = false;
    const resolveAccess = createAccessResolver({
      query: {
        sessions: {
          findFirst: async () => ({
            expiresAt: new Date(Date.now() + 60_000),
            id: "session-1",
            identity: {
              id: "identity-1",
              provider: "cloudflare_google",
              providerEmail: "person@example.com",
              providerSubject: "subject-1",
              user: {
                email: "person@example.com",
                id: "user-1"
              }
            },
            revokedAt: new Date()
          })
        }
      },
      update() {
        return {
          set() {
            return {
              where: async () => {
                touchedSession = true;
              }
            };
          }
        };
      }
    } as never, {
      teamDomain: "paretoproof.cloudflareaccess.com",
      verifiers: {
        brandedRelay: { audiences: ["branded"] },
        internal: { audiences: ["internal"] },
        portal: { audiences: ["portal"] }
      } as never
    });
    const request = {
      accessIdentity: null,
      accessRbacContext: null,
      headers: {
        cookie: "PortalAccessSession=opaque-session-token"
      },
      raw: {
        url: "/portal/me"
      },
      routeOptions: {
        url: "/portal/me"
      }
    } as never;

    const context = await resolveAccess(request);

    assert.equal(context, null);
    assert.equal(touchedSession, false);
  } finally {
    Object.assign(process.env, originalEnv);
  }
});

test("selectCloudflareAccessVerifier keeps branded relay audiences only on POST finalize-submit", () => {
  const verifiers = {
    brandedRelay: { audiences: ["portal-aud", "github-aud", "google-aud"] },
    internal: { audiences: ["internal-aud"] },
    portal: { audiences: ["portal-aud"] }
  } satisfies Record<keyof CloudflareAccessVerifierSet, { audiences: string[] }>;

  assert.equal(
    selectCloudflareAccessVerifier(
      {
        method: "POST",
        raw: {
          url: "/portal/session/finalize"
        },
        routeOptions: {
          url: "/portal/session/finalize"
        }
      } as never,
      verifiers as never
    ),
    verifiers.portal
  );
  assert.equal(
    selectCloudflareAccessVerifier(
      {
        method: "POST",
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
        method: "GET",
        raw: {
          url: "/portal/session/finalize/submit"
        },
        routeOptions: {
          url: "/portal/session/finalize/submit"
        }
      } as never,
      verifiers as never
    ),
    verifiers.portal
  );
  assert.equal(
    selectCloudflareAccessVerifier(
      {
        method: "GET",
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
        method: "POST",
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
