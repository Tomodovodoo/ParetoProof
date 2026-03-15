import assert from "node:assert/strict";
import test from "node:test";
import {
  readAccessJwtAssertion,
  selectCloudflareAccessVerifier,
  type CloudflareAccessVerifierSet
} from "../src/auth/cloudflare-access.ts";

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

test("selectCloudflareAccessVerifier keeps the finalize submit boundary on the branded relay audiences", () => {
  const verifiers = {
    brandedRelay: { audiences: ["portal-aud", "github-aud", "google-aud"] },
    internal: { audiences: ["internal-aud"] },
    portal: { audiences: ["portal-aud"] }
  } satisfies Record<keyof CloudflareAccessVerifierSet, { audiences: string[] }>;

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
