import { describe, expect, it } from "bun:test";
import {
  buildLocalPendingPortalUrl,
  reducePortalStateAfterAuthExpiry
} from "./portal-bootstrap-state.ts";
import {
  mapPortalMutationErrorMessage,
  shouldRestartPortalAuthForMissingProvider
} from "./portal-bootstrap.tsx";

describe("buildLocalPendingPortalUrl", () => {
  it("promotes the local access state to pending and clears denial-only params", () => {
    expect(
      buildLocalPendingPortalUrl(
        "?surface=portal&access=denied&reason=access_request_required&email=lin@paretoproof.local&roles=helper"
      )
    ).toBe("/pending?surface=portal&access=pending&email=lin%40paretoproof.local");
  });

  it("preserves the local email when no denial reason is present", () => {
    expect(
      buildLocalPendingPortalUrl("?surface=portal&access=denied&email=ada@paretoproof.local")
    ).toBe("/pending?surface=portal&access=pending&email=ada%40paretoproof.local");
  });

  it("collapses stale approved state back to unauthenticated after auth expiry", () => {
    expect(
      reducePortalStateAfterAuthExpiry({
        email: "tomthegreatest04@gmail.com",
        roles: ["admin"],
        status: "approved"
      })
    ).toEqual({
      status: "unauthenticated"
    });
  });

  it("keeps loading state untouched while bootstrap is still resolving", () => {
    expect(
      reducePortalStateAfterAuthExpiry({
        status: "loading"
      })
    ).toEqual({
      status: "loading"
    });
  });
});

describe("mapPortalMutationErrorMessage", () => {
  it("surfaces a restart message when the API cannot prove the sign-in provider", () => {
    expect(
      mapPortalMutationErrorMessage("access_request", 409, "identity_provider_required")
    ).toBe(
      "The sign-in provider could not be verified. Restart from the auth entry and choose GitHub or Google again."
    );
  });

  it("falls back to the request-specific status message for unknown API errors", () => {
    expect(mapPortalMutationErrorMessage("identity_recovery", 500, "unexpected")).toBe(
      "Access recovery failed with 500."
    );
  });
});

describe("shouldRestartPortalAuthForMissingProvider", () => {
  it("restarts auth when the portal bootstrap sees providerless recovery drift", () => {
    expect(
      shouldRestartPortalAuthForMissingProvider({
        access: {
          email: "owner@example.com",
          reason: "identity_recovery_required",
          status: "denied"
        },
        identity: {
          provider: null
        }
      })
    ).toBe(true);
  });

  it("does not restart auth for ordinary linked recovery flows", () => {
    expect(
      shouldRestartPortalAuthForMissingProvider({
        access: {
          email: "owner@example.com",
          reason: "identity_recovery_required",
          status: "denied"
        },
        identity: {
          provider: "cloudflare_google"
        }
      })
    ).toBe(false);
  });
});
