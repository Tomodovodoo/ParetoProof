import { describe, expect, it } from "bun:test";
import {
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
});
