import { describe, expect, it } from "bun:test";
import {
  resolveAuthEntryApprovedPortalTargetPath,
  resolveAuthEntrySessionCheckAction,
  shouldStayOnAuthEntryForProviderlessRecovery
} from "./auth-entry.tsx";

describe("shouldStayOnAuthEntryForProviderlessRecovery", () => {
  it("keeps auth entry active when /portal/me reports providerless recovery drift", () => {
    expect(
      shouldStayOnAuthEntryForProviderlessRecovery({
        access: {
          reason: "identity_recovery_required",
          status: "denied"
        },
        identity: {
          provider: null
        }
      })
    ).toBe(true);
  });

  it("does not treat ordinary approved sessions as providerless recovery drift", () => {
    expect(
      shouldStayOnAuthEntryForProviderlessRecovery({
        access: {
          status: "approved"
        },
        identity: {
          provider: "cloudflare_google"
        }
      })
    ).toBe(false);
  });
});

describe("resolveAuthEntrySessionCheckAction", () => {
  it("stays on auth entry for providerless recovery responses", () => {
    expect(
      resolveAuthEntrySessionCheckAction(
        {
          ok: true,
          status: 200,
          type: "basic"
        },
        {
          access: {
            reason: "identity_recovery_required",
            status: "denied"
          },
          identity: {
            provider: null
          }
        }
      )
    ).toBe("stay_on_auth_entry");
  });

  it("redirects to portal for ordinary successful session checks", () => {
    expect(
      resolveAuthEntrySessionCheckAction(
        {
          ok: true,
          status: 200,
          type: "basic"
        },
        {
          access: {
            status: "approved"
          },
          identity: {
            provider: "cloudflare_google"
          }
        }
      )
    ).toBe("redirect_portal");
  });

  it("redirects pending users straight to the pending route", () => {
    expect(
      resolveAuthEntrySessionCheckAction(
        {
          ok: true,
          status: 200,
          type: "basic"
        },
        {
          access: {
            status: "pending"
          },
          identity: {
            provider: "cloudflare_google"
          }
        }
      )
    ).toBe("redirect_pending");
  });

  it("redirects access-request-required users straight to the access-request route", () => {
    expect(
      resolveAuthEntrySessionCheckAction(
        {
          ok: true,
          status: 200,
          type: "basic"
        },
        {
          access: {
            reason: "access_request_required",
            status: "denied"
          },
          identity: {
            provider: "cloudflare_google"
          }
        }
      )
    ).toBe("redirect_access_request");
  });

  it("redirects signed-in denied users to the denied route when no recovery flow applies", () => {
    expect(
      resolveAuthEntrySessionCheckAction(
        {
          ok: true,
          status: 200,
          type: "basic"
        },
        {
          access: {
            reason: "rejected_or_withdrawn",
            status: "denied"
          },
          identity: {
            provider: "cloudflare_google"
          }
        }
      )
    ).toBe("redirect_denied");
  });

  it("redirects provider-backed identity recovery users to the denied route instead of reusing access-request routing", () => {
    expect(
      resolveAuthEntrySessionCheckAction(
        {
          ok: true,
          status: 200,
          type: "basic"
        },
        {
          access: {
            reason: "identity_recovery_required",
            status: "denied"
          },
          identity: {
            provider: "cloudflare_google"
          }
        }
      )
    ).toBe("redirect_denied");
  });
});

describe("resolveAuthEntryApprovedPortalTargetPath", () => {
  it("sends approved users from the access-request entry to portal home instead of back through /access-request", () => {
    expect(resolveAuthEntryApprovedPortalTargetPath("/access-request")).toBe("/");
  });

  it("preserves ordinary approved portal redirects", () => {
    expect(resolveAuthEntryApprovedPortalTargetPath("/profile")).toBe("/profile");
  });
});
