import { afterEach, describe, expect, it } from "bun:test";
import {
  resolvePortalRouteRedirect,
  resolveSurfaceRouteRedirect
} from "./portal-route-access.ts";

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

  it("strips stale approved roles from pending routes", () => {
    setWindowUrl(
      "http://localhost/admin/users?surface=portal&access=pending&roles=admin&email=ada@paretoproof.local"
    );

    const redirect = new URL(
      resolvePortalRouteRedirect({
        pathname: "/admin/users",
        roles: [],
        search:
          "?surface=portal&access=pending&roles=admin&email=ada@paretoproof.local",
        status: "pending"
      }),
      "http://localhost"
    );

    expect(redirect.pathname).toBe("/pending");
    expect(redirect.searchParams.get("surface")).toBe("portal");
    expect(redirect.searchParams.get("access")).toBe("pending");
    expect(redirect.searchParams.get("email")).toBe("ada@paretoproof.local");
    expect(redirect.searchParams.has("roles")).toBe(false);
  });

  it("does not self-redirect denied access-request routes when query param order differs", () => {
    setWindowUrl(
      "http://localhost/access-request?surface=portal&access=denied&reason=access_request_required&email=lin@paretoproof.local"
    );

    expect(
      resolvePortalRouteRedirect({
        pathname: "/access-request",
        reason: "access_request_required",
        roles: [],
        search:
          "?surface=portal&access=denied&reason=access_request_required&email=lin@paretoproof.local",
        status: "denied"
      })
    ).toBeNull();
  });

  it("keeps unauthenticated users on the portal surface for non-public portal routes", () => {
    setWindowUrl("http://localhost/profile?surface=portal");

    const redirect = new URL(
      resolvePortalRouteRedirect({
        pathname: "/profile",
        roles: [],
        search: "?surface=portal",
        status: "unauthenticated"
      }),
      "http://localhost"
    );

    expect(redirect.pathname).toBe("/");
    expect(redirect.searchParams.get("surface")).toBe("portal");
  });

  it("sends unauthenticated users to the public apex only for portal routes that explicitly allow it", () => {
    setWindowUrl("http://localhost/?surface=portal");

    expect(
      resolvePortalRouteRedirect({
        pathname: "/",
        roles: [],
        search: "?surface=portal",
        status: "unauthenticated"
      })
    ).toBe("http://localhost/");
  });

  it("sends approved helpers without collaborator access to the denied surface for collaborator routes", () => {
    setWindowUrl(
      "http://localhost/launch?surface=portal&access=approved&roles=helper&email=lin@paretoproof.local"
    );

    const redirect = new URL(
      resolvePortalRouteRedirect({
        pathname: "/launch",
        roles: ["helper"],
        search: "?surface=portal&access=approved&roles=helper&email=lin@paretoproof.local",
        status: "approved"
      }),
      "http://localhost"
    );

    expect(redirect.pathname).toBe("/denied");
    expect(redirect.searchParams.get("surface")).toBe("portal");
    expect(redirect.searchParams.get("reason")).toBe("insufficient_role");
  });

  it("keeps approved users on owned math routes and preserves the math surface locally", () => {
    setWindowUrl(
      "http://localhost/questions/problem-9?surface=math&access=approved&roles=helper&email=lin@paretoproof.local"
    );

    expect(
      resolveSurfaceRouteRedirect({
        pathname: "/questions/problem-9",
        roles: ["helper"],
        search:
          "?surface=math&access=approved&roles=helper&email=lin@paretoproof.local",
        status: "approved",
        surface: "math"
      })
    ).toBeNull();
  });

  it("redirects pending math users to the portal pending surface", () => {
    setWindowUrl(
      "http://localhost/launch?surface=math&access=pending&email=ada@paretoproof.local"
    );

    const redirect = new URL(
      resolveSurfaceRouteRedirect({
        pathname: "/launch",
        roles: [],
        search: "?surface=math&access=pending&email=ada@paretoproof.local",
        status: "pending",
        surface: "math"
      }),
      "http://localhost"
    );

    expect(redirect.pathname).toBe("/pending");
    expect(redirect.searchParams.get("surface")).toBe("portal");
    expect(redirect.searchParams.get("access")).toBe("pending");
  });

  it("canonicalizes hosted pending math users onto the portal host even when the path already matches", () => {
    setWindowUrl(
      "https://math.paretoproof.com/pending?access=pending&email=ada@paretoproof.com"
    );

    const redirect = resolveSurfaceRouteRedirect({
      pathname: "/pending",
      roles: [],
      search: "?access=pending&email=ada@paretoproof.com",
      status: "pending",
      surface: "math"
    });

    expect(redirect).toBe(
      "https://portal.paretoproof.com/pending"
    );
  });

  it("redirects unknown approved math paths back to the math home surface", () => {
    setWindowUrl(
      "http://localhost/unknown?surface=math&access=approved&roles=helper&email=lin@paretoproof.local"
    );

    const redirect = new URL(
      resolveSurfaceRouteRedirect({
        pathname: "/unknown",
        roles: ["helper"],
        search:
          "?surface=math&access=approved&roles=helper&email=lin@paretoproof.local",
        status: "approved",
        surface: "math"
      }),
      "http://localhost"
    );

    expect(redirect.pathname).toBe("/");
    expect(redirect.searchParams.get("surface")).toBe("math");
    expect(redirect.searchParams.get("access")).toBe("approved");
  });
});
