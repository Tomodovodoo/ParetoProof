import { afterEach, describe, expect, it } from "bun:test";
import { resolvePortalRouteRedirect } from "./portal-route-access.ts";

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

describe("resolvePortalRouteRedirect", () => {
  it("strips stale denial reasons from approved routes", () => {
    setWindowUrl(
      "http://localhost/profile?surface=portal&access=approved&roles=helper&reason=insufficient_role&email=lin@paretoproof.local"
    );

    const redirect = new URL(
      resolvePortalRouteRedirect({
        pathname: "/profile",
        reason: "insufficient_role",
        roles: ["helper"],
        search:
          "?surface=portal&access=approved&roles=helper&reason=insufficient_role&email=lin@paretoproof.local",
        status: "approved"
      }),
      "http://localhost"
    );

    expect(redirect.pathname).toBe("/profile");
    expect(redirect.searchParams.get("surface")).toBe("portal");
    expect(redirect.searchParams.get("access")).toBe("approved");
    expect(redirect.searchParams.get("email")).toBe("lin@paretoproof.local");
    expect(redirect.searchParams.get("roles")).toBe("helper");
    expect(redirect.searchParams.has("reason")).toBe(false);
  });
});
