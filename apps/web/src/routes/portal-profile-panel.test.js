import { describe, expect, it } from "bun:test";
import {
  consumeLinkStatus,
  parsePortalProfileLinkIntentResponse,
  parsePortalProfileResponse
} from "./portal-profile-panel.tsx";

describe("consumeLinkStatus", () => {
  it("returns the linked message and strips the link query param", () => {
    expect(
      consumeLinkStatus(
        "?surface=portal&access=approved&roles=admin&email=ada@paretoproof.local&link=linked",
        "/profile"
      )
    ).toEqual({
      message: "The new sign-in method has been linked to your portal account.",
      nextHistoryState: {
        portalProfileLinkStatusMessage:
          "The new sign-in method has been linked to your portal account."
      },
      nextUrl:
        "/profile?surface=portal&access=approved&roles=admin&email=ada%40paretoproof.local"
    });
  });

  it("preserves the current URL when no link status is present", () => {
    expect(
      consumeLinkStatus(
        "?surface=portal&access=approved&roles=admin&email=ada@paretoproof.local",
        "/profile",
        "#details"
      )
    ).toEqual({
      message: null,
      nextHistoryState: null,
      nextUrl:
        "/profile?surface=portal&access=approved&roles=admin&email=ada@paretoproof.local#details"
    });
  });

  it("replays and clears the stored one-shot history message after the query param is removed", () => {
    expect(
      consumeLinkStatus(
        "?surface=portal&access=approved&roles=admin&email=ada@paretoproof.local",
        "/profile",
        "",
        {
          portalProfileLinkStatusMessage:
            "The new sign-in method has been linked to your portal account."
        }
      )
    ).toEqual({
      message: "The new sign-in method has been linked to your portal account.",
      nextHistoryState: null,
      nextUrl:
        "/profile?surface=portal&access=approved&roles=admin&email=ada@paretoproof.local"
    });
  });
});

describe("portal profile response parsers", () => {
  it("accepts shared profile response envelopes", () => {
    expect(
      parsePortalProfileResponse({
        profile: {
          createdAt: "2026-04-26T00:00:00.000Z",
          displayName: "Ada",
          email: "ada@example.com",
          identities: [],
          linkedUserId: "11111111-1111-4111-8111-111111111111",
          updatedAt: "2026-04-26T00:00:00.000Z"
        }
      }).profile.email
    ).toBe("ada@example.com");
  });

  it("rejects malformed profile response envelopes", () => {
    expect(() =>
      parsePortalProfileResponse({
        item: {
          email: "ada@example.com"
        }
      })
    ).toThrow("Portal profile response did not match the shared contract.");
  });

  it("accepts shared profile link-intent envelopes", () => {
    expect(
      parsePortalProfileLinkIntentResponse({
        intent: {
          expiresAt: "2026-04-26T00:10:00.000Z",
          provider: "cloudflare_github",
          startUrl: "https://auth.paretoproof.com/api/access/start/github"
        }
      }).intent.provider
    ).toBe("cloudflare_github");
  });

  it("rejects malformed profile link-intent envelopes", () => {
    expect(() =>
      parsePortalProfileLinkIntentResponse({
        intent: {
          provider: "github",
          startUrl: "/api/access/start/github"
        }
      })
    ).toThrow("Portal profile link-intent response did not match the shared contract.");
  });
});
