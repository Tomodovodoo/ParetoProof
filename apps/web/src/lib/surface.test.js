import { afterEach, describe, expect, it } from "bun:test";
import {
  buildAccessFinalizeUrl,
  buildAuthUrl,
  buildPortalUrl,
  buildPublicUrl,
  readPortalRedirectTarget,
  resolveWebSurface
} from "./surface.ts";

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
      "http://localhost/denied?surface=portal&access=approved&role=helper&reason=insufficient_role&email=lin@paretoproof.local"
    );

    const portalUrl = new URL(buildPortalUrl("/"));

    expect(portalUrl.pathname).toBe("/");
    expect(portalUrl.searchParams.get("surface")).toBe("portal");
    expect(portalUrl.searchParams.get("access")).toBe("approved");
    expect(portalUrl.searchParams.get("email")).toBe("lin@paretoproof.local");
    expect(portalUrl.searchParams.get("role")).toBe("helper");
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
      "http://localhost/pending?surface=portal&access=pending&role=admin&email=ada@paretoproof.local"
    );

    const portalUrl = new URL(buildPortalUrl("/"));

    expect(portalUrl.pathname).toBe("/");
    expect(portalUrl.searchParams.get("surface")).toBe("portal");
    expect(portalUrl.searchParams.get("access")).toBe("pending");
    expect(portalUrl.searchParams.get("email")).toBe("ada@paretoproof.local");
    expect(portalUrl.searchParams.has("role")).toBe(false);
  });

  it("preserves the singular approved role preview on local portal redirects", () => {
    setWindowUrl(
      "http://localhost/?surface=portal&access=approved&role=collaborator&email=ada@paretoproof.local"
    );

    const portalUrl = new URL(buildPortalUrl("/launch"));

    expect(portalUrl.searchParams.get("role")).toBe("collaborator");
    expect(portalUrl.searchParams.has("roles")).toBe(false);
  });

  it("uses the local API finalize endpoint on loopback-mapped branded auth hosts", () => {
    setWindowUrl("http://github.auth.paretoproof.com:4371/");

    expect(buildAccessFinalizeUrl("/profile")).toBe(
      "http://github.auth.paretoproof.com:3000/portal/session/finalize/submit?redirect=%2Fprofile"
    );
  });

  it("uses the branded finalize relay endpoint on branded auth hosts", () => {
    setWindowUrl("https://google.auth.paretoproof.com/");

    expect(buildAccessFinalizeUrl("/profile")).toBe(
      "https://google.auth.paretoproof.com/api/access/finalize?redirect=%2Fprofile"
    );
  });
});

describe("surface ownership helpers", () => {
  it("classifies apex, auth, provider auth, portal, and local surfaces", () => {
    setWindowUrl("http://localhost/");

    expect(resolveWebSurface("paretoproof.com")).toBe("public");
    expect(resolveWebSurface("auth.paretoproof.com")).toBe("auth");
    expect(resolveWebSurface("github.auth.paretoproof.com")).toBe("auth");
    expect(resolveWebSurface("portal.paretoproof.com")).toBe("portal");
    expect(resolveWebSurface("localhost")).toBe("public");
  });

  it("allows only public-site owned routes when building public URLs", () => {
    setWindowUrl("https://paretoproof.com/");

    expect(buildPublicUrl("/project")).toBe("https://paretoproof.com/project");
    expect(buildPublicUrl("/reports/problem-9-v1?view=table#scores")).toBe(
      "https://paretoproof.com/reports/problem-9-v1?view=table#scores"
    );
    expect(buildPublicUrl("/profile")).toBe("https://paretoproof.com/");
  });

  it("routes loopback-mapped branded auth and portal hosts back to the local public apex", () => {
    const brandedHosts = [
      "auth.paretoproof.com",
      "github.auth.paretoproof.com",
      "google.auth.paretoproof.com",
      "portal.paretoproof.com"
    ];

    for (const host of brandedHosts) {
      setWindowUrl(`http://${host}:4173/runs`);

      expect(buildPublicUrl("/")).toBe("http://paretoproof.com:4173/");
      expect(buildPublicUrl("/project")).toBe("http://paretoproof.com:4173/project");
    }
  });

  it("preserves only portal-owned redirect targets for auth URLs", () => {
    setWindowUrl("https://paretoproof.com/");

    expect(buildAuthUrl("/runs/run-123?tab=events#trace")).toBe(
      "https://auth.paretoproof.com/?redirect=%2Fruns%2Frun-123%3Ftab%3Devents%23trace"
    );
    expect(buildAuthUrl("/benchmarks")).toBe("https://auth.paretoproof.com/");
    expect(buildAuthUrl("https://math.paretoproof.com/runs/problem-9")).toBe(
      "https://auth.paretoproof.com/"
    );
  });

  it("preserves only portal-owned redirect targets for finalize URLs", () => {
    setWindowUrl("https://github.auth.paretoproof.com/");

    expect(buildAccessFinalizeUrl("/admin/users?tab=review")).toBe(
      "https://github.auth.paretoproof.com/api/access/finalize?redirect=%2Fadmin%2Fusers%3Ftab%3Dreview"
    );
    expect(buildAccessFinalizeUrl("/project")).toBe(
      "https://github.auth.paretoproof.com/api/access/finalize"
    );
  });

  it("rejects public-site and external redirect targets when reading auth redirect state", () => {
    expect(readPortalRedirectTarget("?redirect=%2Fprofile%3Ftab%3Ddetails")).toBe(
      "/profile?tab=details"
    );
    expect(readPortalRedirectTarget("?redirect=%2Fbenchmarks")).toBe("/");
    expect(
      readPortalRedirectTarget(
        "?redirect=https%3A%2F%2Fmath.paretoproof.com%2Fruns%2Fproblem-9"
      )
    ).toBe("/");
    expect(readPortalRedirectTarget("?redirect=https%3A%2F%2Fparetoproof.com%2Fprofile")).toBe(
      "/"
    );
  });

  it("rejects public-site targets when building portal URLs", () => {
    setWindowUrl("https://portal.paretoproof.com/");

    expect(buildPortalUrl("/workers")).toBe("https://portal.paretoproof.com/workers");
    expect(buildPortalUrl("/project")).toBe("https://portal.paretoproof.com/");
    expect(buildPortalUrl("/math/problem-9")).toBe("https://portal.paretoproof.com/");
  });
});
