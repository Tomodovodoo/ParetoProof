import { afterEach, describe, expect, it } from "bun:test";
import {
  buildAccessFinalizeUrl,
  buildAccessStartUrl,
  buildAuthGuidanceUrl,
  buildAuthUrl,
  buildMathUrl,
  buildPortalUrl,
  buildPublicUrl,
  readAuthenticatedRedirectSurface,
  readAuthenticatedRedirectTarget,
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
  it("strips synthetic approved access params when building local portal routes", () => {
    setWindowUrl(
      "http://localhost/denied?surface=portal&access=approved&role=helper&reason=insufficient_role&email=lin@paretoproof.local"
    );

    const portalUrl = new URL(buildPortalUrl("/"));

    expect(portalUrl.pathname).toBe("/");
    expect(portalUrl.searchParams.get("surface")).toBe("portal");
    expect(portalUrl.searchParams.has("access")).toBe(false);
    expect(portalUrl.searchParams.has("email")).toBe(false);
    expect(portalUrl.searchParams.has("role")).toBe(false);
    expect(portalUrl.searchParams.has("reason")).toBe(false);
  });

  it("strips synthetic denied access params on denied-flow targets", () => {
    setWindowUrl(
      "http://localhost/denied?surface=portal&access=denied&reason=access_request_required&roles=helper&email=lin@paretoproof.local"
    );

    const portalUrl = new URL(buildPortalUrl("/access-request"));

    expect(portalUrl.pathname).toBe("/access-request");
    expect(portalUrl.searchParams.get("surface")).toBe("portal");
    expect(portalUrl.searchParams.has("access")).toBe(false);
    expect(portalUrl.searchParams.has("email")).toBe(false);
    expect(portalUrl.searchParams.has("reason")).toBe(false);
    expect(portalUrl.searchParams.has("roles")).toBe(false);
  });

  it("keeps explicit insufficient-role route reasons while stripping synthetic access params", () => {
    setWindowUrl(
      "http://localhost/admin/users?surface=portal&access=approved&role=collaborator&email=ada@paretoproof.local"
    );

    const deniedUrl = new URL(buildPortalUrl("/denied?reason=insufficient_role"));

    expect(deniedUrl.pathname).toBe("/denied");
    expect(deniedUrl.searchParams.get("surface")).toBe("portal");
    expect(deniedUrl.searchParams.get("reason")).toBe("insufficient_role");
    expect(deniedUrl.searchParams.has("access")).toBe(false);
    expect(deniedUrl.searchParams.has("email")).toBe(false);
    expect(deniedUrl.searchParams.has("role")).toBe(false);
  });

  it("strips synthetic pending access params when building local portal routes", () => {
    setWindowUrl(
      "http://localhost/pending?surface=portal&access=pending&role=admin&email=ada@paretoproof.local"
    );

    const portalUrl = new URL(buildPortalUrl("/"));

    expect(portalUrl.pathname).toBe("/");
    expect(portalUrl.searchParams.get("surface")).toBe("portal");
    expect(portalUrl.searchParams.has("access")).toBe(false);
    expect(portalUrl.searchParams.has("email")).toBe(false);
    expect(portalUrl.searchParams.has("role")).toBe(false);
  });

  it("strips singular approved role previews on local portal redirects", () => {
    setWindowUrl(
      "http://localhost/?surface=portal&access=approved&role=collaborator&email=ada@paretoproof.local"
    );

    const portalUrl = new URL(buildPortalUrl("/launch"));

    expect(portalUrl.searchParams.has("role")).toBe(false);
    expect(portalUrl.searchParams.has("access")).toBe(false);
    expect(portalUrl.searchParams.has("email")).toBe(false);
    expect(portalUrl.searchParams.has("roles")).toBe(false);
  });

  it("uses the branded finalize relay endpoint on loopback-mapped branded auth hosts", () => {
    setWindowUrl("http://github.auth.paretoproof.com:4371/?surface=auth&app=math");

    expect(
      buildAccessFinalizeUrl("/launch", {
        surface: "math"
      })
    ).toBe(
      "http://github.auth.paretoproof.com:4371/api/access/finalize?app=math&redirect=%2Flaunch"
    );
  });

  it("uses the branded finalize relay endpoint on branded auth hosts", () => {
    setWindowUrl("https://google.auth.paretoproof.com/");

    expect(
      buildAccessFinalizeUrl("/profile", {
        surface: "portal"
      })
    ).toBe(
      "https://google.auth.paretoproof.com/api/access/finalize?app=portal&redirect=%2Fprofile"
    );
  });

  it("builds local provider starts through the loopback-branded auth relay without synthetic access params", () => {
    setWindowUrl(
      "http://127.0.0.1:4173/?surface=auth&access=approved&email=ada@paretoproof.local&role=admin"
    );

    const startUrl = new URL(
      buildAccessStartUrl("github", "/runs/alpha", {
        surface: "portal"
      })
    );

    expect(startUrl.toString()).toBe(
      "http://auth.paretoproof.com:4173/api/access/start/github?app=portal&redirect=%2Fruns%2Falpha"
    );
    expect(startUrl.searchParams.has("access")).toBe(false);
    expect(startUrl.searchParams.has("email")).toBe(false);
    expect(startUrl.searchParams.has("role")).toBe(false);
  });
});

describe("surface ownership helpers", () => {
  it("classifies apex, auth, provider auth, portal, math, and local surfaces", () => {
    setWindowUrl("http://localhost/");

    expect(resolveWebSurface("paretoproof.com")).toBe("public");
    expect(resolveWebSurface("auth.paretoproof.com")).toBe("auth");
    expect(resolveWebSurface("github.auth.paretoproof.com")).toBe("auth");
    expect(resolveWebSurface("portal.paretoproof.com")).toBe("portal");
    expect(resolveWebSurface("math.paretoproof.com")).toBe("math");
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

  it("routes loopback-mapped branded auth, portal, and math hosts back to the local public apex", () => {
    const brandedHosts = [
      "auth.paretoproof.com",
      "github.auth.paretoproof.com",
      "google.auth.paretoproof.com",
      "portal.paretoproof.com",
      "math.paretoproof.com"
    ];

    for (const host of brandedHosts) {
      setWindowUrl(`http://${host}:4173/runs`);

      expect(buildPublicUrl("/")).toBe("http://paretoproof.com:4173/");
      expect(buildPublicUrl("/project")).toBe("http://paretoproof.com:4173/project");
    }
  });

  it("preserves portal-owned redirect targets for auth URLs by default", () => {
    setWindowUrl("https://paretoproof.com/");

    expect(buildAuthUrl("/runs/run-123?tab=events#trace")).toBe(
      "https://auth.paretoproof.com/?app=portal&redirect=%2Fruns%2Frun-123%3Ftab%3Devents%23trace"
    );
    expect(buildAuthUrl("/benchmarks")).toBe("https://auth.paretoproof.com/?app=portal");
  });

  it("preserves math-owned redirect targets when the caller explicitly targets math", () => {
    setWindowUrl("https://math.paretoproof.com/launch");

    expect(
      buildAuthUrl("/launch", undefined, {
        surface: "math"
      })
    ).toBe(
      "https://auth.paretoproof.com/?app=math&redirect=%2Flaunch"
    );
    expect(
      buildAuthUrl("https://math.paretoproof.com/questions/problem-9", undefined, {
        surface: "math"
      })
    ).toBe(
      "https://auth.paretoproof.com/?app=math&redirect=%2Fquestions%2Fproblem-9"
    );
  });

  it("builds auth-guidance URLs that keep the redirect target but skip session reuse", () => {
    setWindowUrl("https://paretoproof.com/");

    expect(buildAuthGuidanceUrl("/runs/run-123?tab=events#trace")).toBe(
      "https://auth.paretoproof.com/?app=portal&redirect=%2Fruns%2Frun-123%3Ftab%3Devents%23trace&guidance=1"
    );
    expect(buildAuthGuidanceUrl("/benchmarks")).toBe(
      "https://auth.paretoproof.com/?app=portal&guidance=1"
    );
  });

  it("preserves the targeted authenticated surface for finalize URLs", () => {
    setWindowUrl("https://github.auth.paretoproof.com/");

    expect(
      buildAccessFinalizeUrl("/admin/users?tab=review", {
        surface: "portal"
      })
    ).toBe(
      "https://github.auth.paretoproof.com/api/access/finalize?app=portal&redirect=%2Fadmin%2Fusers%3Ftab%3Dreview"
    );
    expect(
      buildAccessFinalizeUrl("/launch", {
        surface: "math"
      })
    ).toBe(
      "https://github.auth.paretoproof.com/api/access/finalize?app=math&redirect=%2Flaunch"
    );
  });

  it("reads math-aware auth redirect state and keeps portal compatibility", () => {
    expect(
      readAuthenticatedRedirectTarget(
        "?app=math&redirect=%2Fquestions%2Fproblem-9%3Ftab%3Dreview"
      )
    ).toBe("/questions/problem-9?tab=review");
    expect(
      readAuthenticatedRedirectSurface(
        "?app=math&redirect=%2Fquestions%2Fproblem-9%3Ftab%3Dreview"
      )
    ).toBe("math");
    expect(readPortalRedirectTarget("?redirect=%2Fprofile%3Ftab%3Ddetails")).toBe(
      "/profile?tab=details"
    );
  });

  it("rejects invalid authenticated redirect targets when reading auth redirect state", () => {
    expect(readAuthenticatedRedirectTarget("?redirect=%2Fbenchmarks")).toBe("/");
    expect(readAuthenticatedRedirectSurface("?redirect=%2Fbenchmarks")).toBe("portal");
    expect(
      readAuthenticatedRedirectTarget(
        "?app=math&redirect=https%3A%2F%2Fmath.paretoproof.com%2Fruns%2Fproblem-9"
      )
    ).toBe("/");
    expect(
      readAuthenticatedRedirectTarget(
        "?redirect=https%3A%2F%2Fparetoproof.com%2Fprofile"
      )
    ).toBe("/");
  });

  it("keeps portal and math builders scoped to their owned routes", () => {
    setWindowUrl("https://portal.paretoproof.com/");

    expect(buildPortalUrl("/workers")).toBe("https://portal.paretoproof.com/workers");
    expect(buildPortalUrl("/project")).toBe("https://portal.paretoproof.com/");

    expect(buildMathUrl("/launch")).toBe("https://math.paretoproof.com/launch");
    expect(buildMathUrl("/workers")).toBe("https://math.paretoproof.com/");
  });
});
