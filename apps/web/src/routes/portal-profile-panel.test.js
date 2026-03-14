import { describe, expect, it } from "bun:test";
import { consumeLinkStatus } from "./portal-profile-panel.tsx";

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
