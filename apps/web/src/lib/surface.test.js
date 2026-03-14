import { afterEach, describe, expect, it } from "bun:test";
import { buildAccessFinalizeUrl, buildPortalUrl } from "./surface.ts";

const originalWindow = globalThis.window;

function setWindowUrl(url) {
  globalThis.window = {
    location: new URL(url)
  };
}

afterEach(() => {
  if (originalWindow) {
    globalThis.window = originalWindow;
    return;
  }

  delete globalThis.window;
});

describe("buildPortalUrl", () => {
  it("drops stale denial reasons when building approved portal routes", () => {
    setWindowUrl(
      "http://localhost/denied?surface=portal&access=approved&roles=helper&reason=insufficient_role&email=lin@paretoproof.local"
    );

    const portalUrl = new URL(buildPortalUrl("/"));

    expect(portalUrl.pathname).toBe("/");
    expect(portalUrl.searchParams.get("surface")).toBe("portal");
    expect(portalUrl.searchParams.get("access")).toBe("approved");
    expect(portalUrl.searchParams.get("email")).toBe("lin@paretoproof.local");
    expect(portalUrl.searchParams.get("roles")).toBe("helper");
    expect(portalUrl.searchParams.has("reason")).toBe(false);
  });

  it("keeps denied reasons on denied-flow targets", () => {
    setWindowUrl(
      "http://localhost/denied?surface=portal&access=denied&reason=access_request_required&roles=helper&email=lin@paretoproof.local"
    );

    const portalUrl = new URL(buildPortalUrl("/access-request"));

    expect(portalUrl.pathname).toBe("/access-request");
    expect(portalUrl.searchParams.get("surface")).toBe("portal");
    expect(portalUrl.searchParams.get("access")).toBe("denied");
    expect(portalUrl.searchParams.get("email")).toBe("lin@paretoproof.local");
    expect(portalUrl.searchParams.get("reason")).toBe("access_request_required");
    expect(portalUrl.searchParams.has("roles")).toBe(false);
  });

  it("drops stale approved roles when the current preview access is pending", () => {
    setWindowUrl(
      "http://localhost/pending?surface=portal&access=pending&roles=admin&email=ada@paretoproof.local"
    );

    const portalUrl = new URL(buildPortalUrl("/"));

    expect(portalUrl.pathname).toBe("/");
    expect(portalUrl.searchParams.get("surface")).toBe("portal");
    expect(portalUrl.searchParams.get("access")).toBe("pending");
    expect(portalUrl.searchParams.get("email")).toBe("ada@paretoproof.local");
    expect(portalUrl.searchParams.has("roles")).toBe(false);
  });

  it("uses the local finalize endpoint on loopback-mapped branded auth hosts", () => {
    setWindowUrl("http://github.auth.paretoproof.com:4371/");

    expect(buildAccessFinalizeUrl("/profile")).toBe(
      "http://github.auth.paretoproof.com:3000/portal/session/finalize/submit?redirect=%2Fprofile"
    );
  });

  it("uses the protected API finalize submit endpoint on branded auth hosts", () => {
    setWindowUrl("https://google.auth.paretoproof.com/");

    expect(buildAccessFinalizeUrl("/profile")).toBe(
      "https://api.paretoproof.com/portal/session/finalize/submit?redirect=%2Fprofile"
    );
  });
});
