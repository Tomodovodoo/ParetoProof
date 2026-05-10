import { afterEach, describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildApprovedAuthHandoffCookieValue } from "../lib/approved-auth-handoff.ts";
import {
  buildLocalPendingPortalUrl,
  reducePortalStateAfterAuthExpiry
} from "./portal-bootstrap-state.ts";
import {
  PortalBootstrap,
  buildPortalBootstrapErrorState,
  fetchPortalBootstrapState,
  derivePortalRoles,
  mapPortalMutationErrorMessage,
  recoverPortalStateAfterAuthExpiry,
  resolvePortalBootstrapRouteRedirect,
  renderPortalDeniedCard,
  renderPortalPendingCard,
  renderLocalPortalUnauthenticatedCard,
  renderPortalBootstrapErrorCard,
  shouldRestartPortalAuthForMissingProvider
} from "./portal-bootstrap.tsx";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

afterEach(() => {
  if (originalWindow) {
    globalThis.window = originalWindow;
  } else {
    delete globalThis.window;
  }

  if (originalDocument) {
    globalThis.document = originalDocument;
  } else {
    delete globalThis.document;
  }
});

describe("portal bootstrap state", () => {
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

  it("clears stale singular approved role previews when returning to pending", () => {
    expect(
      buildLocalPendingPortalUrl(
        "?surface=portal&access=denied&email=ada@paretoproof.local&role=admin"
      )
    ).toBe("/pending?surface=portal&access=pending&email=ada%40paretoproof.local");
  });

  it("moves stale approved state into recovery loading after auth expiry", () => {
    expect(
      reducePortalStateAfterAuthExpiry({
        email: "tomthegreatest04@gmail.com",
        role: "admin",
        status: "approved"
      })
    ).toEqual({
      status: "loading"
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

  it("keeps unauthenticated state untouched after auth expiry", () => {
    expect(
      reducePortalStateAfterAuthExpiry({
        status: "unauthenticated"
      })
    ).toEqual({
      status: "unauthenticated"
    });
  });

  it("moves pending portal state into recovery loading instead of immediate logout", () => {
    expect(
      reducePortalStateAfterAuthExpiry({
        email: "ada@paretoproof.local",
        status: "pending"
      })
    ).toEqual({
      status: "loading"
    });
  });
});

describe("mapPortalMutationErrorMessage", () => {
  it("parses the approved /portal/me payload from the singular role field", async () => {
    const state = await fetchPortalBootstrapState("https://api.paretoproof.test", {
      fetcher: async () => ({
        json: async () => ({
          access: {
            email: "collab@paretoproof.local",
            role: "collaborator",
            status: "approved"
          },
          identity: {
            provider: "cloudflare_google"
          }
        }),
        ok: true,
        status: 200,
        type: "basic"
      })
    });

    expect(state).toEqual({
      email: "collab@paretoproof.local",
      role: "collaborator",
      status: "approved"
    });
  });

  it("derives the local singleton role list from the approved portal role", () => {
    expect(derivePortalRoles("collaborator")).toEqual(["collaborator"]);
    expect(derivePortalRoles(null)).toEqual([]);
  });

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

  it("describes missing local API wiring explicitly for localhost portal previews", () => {
    expect(
      buildPortalBootstrapErrorState(new Error("Failed to fetch"), {
        apiBaseUrl: "http://127.0.0.1:3000",
        localApiFallback: true
      })
    ).toEqual({
      kind: "local_api_unavailable",
      message:
        "This local portal preview is targeting http://127.0.0.1:3000, but no API responded. Start the local API there or set VITE_API_BASE_URL to a reachable backend before using portal routes.",
      status: "error"
    });
  });

  it("describes missing local API wiring explicitly for localhost math previews", () => {
    expect(
      buildPortalBootstrapErrorState(new Error("Failed to fetch"), {
        apiBaseUrl: "http://127.0.0.1:3000",
        localApiFallback: true,
        surface: "math"
      })
    ).toEqual({
      kind: "local_api_unavailable",
      message:
        "This local math workspace preview is targeting http://127.0.0.1:3000, but no API responded. Start the local API there or set VITE_API_BASE_URL to a reachable backend before using math routes.",
      status: "error"
    });
  });

  it("treats alternate browser network-failure strings as local API availability errors", () => {
    expect(
      buildPortalBootstrapErrorState(new Error("Load failed"), {
        apiBaseUrl: "http://127.0.0.1:3000",
        localApiFallback: true
      })
    ).toEqual({
      kind: "local_api_unavailable",
      message:
        "This local portal preview is targeting http://127.0.0.1:3000, but no API responded. Start the local API there or set VITE_API_BASE_URL to a reachable backend before using portal routes.",
      status: "error"
    });
  });

  it("keeps the generic outage wording for hosted or explicitly configured API targets", () => {
    expect(
      buildPortalBootstrapErrorState(new Error("Failed to fetch"), {
        apiBaseUrl: "https://api.paretoproof.com",
        localApiFallback: false
      })
    ).toEqual({
      kind: "portal_unavailable",
      message:
        "The portal could not reach the API right now. Try again in a moment. If the handoff still feels stuck, restart from the auth entry.",
      status: "error"
    });
  });

  it("renders the local API unavailable bootstrap card with the explicit recovery action", () => {
    globalThis.window = {
      location: new URL("http://127.0.0.1/?surface=portal&access=approved")
    };

    const html = renderToStaticMarkup(
      renderPortalBootstrapErrorCard(
        {
          kind: "local_api_unavailable",
          message:
            "This local portal preview is targeting http://127.0.0.1:3000, but no API responded. Start the local API there or set VITE_API_BASE_URL to a reachable backend before using portal routes.",
          status: "error"
        },
        "/"
      )
    );

    expect(html).toContain("Local API unavailable");
    expect(html).toContain("Retry after starting API");
    expect(html).toContain("Open local auth guidance");
    expect(html).toContain("http://127.0.0.1:3000");
  });

  it("renders pending access state with a clear escape route", () => {
    globalThis.window = {
      location: new URL("https://portal.paretoproof.com/pending")
    };

    const html = renderToStaticMarkup(renderPortalPendingCard("collab@example.com"));

    expect(html).toContain("Approval pending");
    expect(html).toContain("Restart from auth guidance");
    expect(html).toContain("guidance=1");
    expect(html).toContain("Back to paretoproof.com");
  });

  it("renders access-request-required denied state with both request and escape routes", () => {
    globalThis.window = {
      location: new URL("https://portal.paretoproof.com/denied")
    };

    const html = renderToStaticMarkup(
      renderPortalDeniedCard({
        email: "collab@example.com",
        reason: "access_request_required",
        status: "denied"
      })
    );

    expect(html).toContain("Request contributor access");
    expect(html).toContain("Back to paretoproof.com");
  });

  it("renders denied access state with auth and public escape routes", () => {
    globalThis.window = {
      location: new URL("https://portal.paretoproof.com/denied")
    };

    const html = renderToStaticMarkup(
      renderPortalDeniedCard({
        email: "collab@example.com",
        reason: "rejected_or_withdrawn",
        status: "denied"
      })
    );

    expect(html).toContain("Access denied");
    expect(html).toContain("Restart from auth guidance");
    expect(html).toContain("guidance=1");
    expect(html).toContain("Back to paretoproof.com");
  });

  it("renders hosted portal outages with a secondary escape route back to the public site", () => {
    globalThis.window = {
      location: new URL("https://portal.paretoproof.com/runs")
    };

    const html = renderToStaticMarkup(
      renderPortalBootstrapErrorCard(
        {
          kind: "portal_unavailable",
          message:
            "The portal could not reach the API right now. Try again in a moment. If the handoff still feels stuck, restart from the auth entry.",
          status: "error"
        },
        "/runs"
      )
    );

    expect(html).toContain("Portal unavailable");
    expect(html).toContain("Retry portal");
    expect(html).toContain("Back to paretoproof.com");
  });

  it("renders localhost explicit-target outages with a secondary escape route back to the local public surface", () => {
    globalThis.window = {
      location: new URL("http://127.0.0.1/?surface=portal")
    };

    const html = renderToStaticMarkup(
      renderPortalBootstrapErrorCard(
        {
          kind: "portal_unavailable",
          message:
            "The portal could not reach the API right now. Try again in a moment. If the handoff still feels stuck, restart from the auth entry.",
          status: "error"
        },
        "/"
      )
    );

    expect(html).toContain("Portal unavailable");
    expect(html).toContain("Retry portal");
    expect(html).toContain("Back to local home");
  });

  it("renders localhost unauthenticated bootstrap as guidance instead of an immediate redirect loop", () => {
    globalThis.window = {
      location: new URL("http://127.0.0.1/?surface=portal")
    };

    const html = renderToStaticMarkup(renderLocalPortalUnauthenticatedCard("/"));

    expect(html).toContain("Local preview needs auth context");
    expect(html).toContain("Open local auth guidance");
    expect(html).toContain("Back to local home");
    expect(html).not.toContain("Continue to sign in");
  });

  it("renders localhost math unauthenticated bootstrap with math auth guidance", () => {
    globalThis.window = {
      location: new URL("http://127.0.0.1/questions/problem-9?surface=math")
    };

    const html = renderToStaticMarkup(
      renderLocalPortalUnauthenticatedCard("/questions/problem-9", "math")
    );

    expect(html).toContain("localhost math route");
    expect(html).toContain(
      "http://127.0.0.1/?surface=auth&amp;app=math&amp;redirect=%2Fquestions%2Fproblem-9"
    );
    expect(html).not.toContain("Continue to sign in");
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

describe("recoverPortalStateAfterAuthExpiry", () => {
  it("revalidates portal bootstrap once before deciding the user is unauthenticated", async () => {
    const state = await recoverPortalStateAfterAuthExpiry(
      {
        email: "owner@example.com",
        role: "admin",
        status: "approved"
      },
      "https://api.paretoproof.test",
      {
        localApiFallback: true,
        fetcher: async () => ({
          json: async () => ({
            access: {
              email: "owner@example.com",
              role: "admin",
              status: "approved"
            },
            identity: {
              provider: "cloudflare_google"
            }
          }),
          ok: true,
          status: 200,
          type: "basic"
        })
      }
    );

    expect(state).toEqual({
      email: "owner@example.com",
      role: "admin",
      status: "approved"
    });
  });

  it("falls through to unauthenticated only when the recovery bootstrap still returns 401", async () => {
    const state = await recoverPortalStateAfterAuthExpiry(
      {
        email: "owner@example.com",
        role: "admin",
        status: "approved"
      },
      "https://api.paretoproof.test",
      {
        localApiFallback: false,
        fetcher: async () => ({
          json: async () => ({ error: "access_assertion_required" }),
          ok: false,
          status: 401,
          type: "basic"
        })
      }
    );

    expect(state).toEqual({
      status: "unauthenticated"
    });
  });

  it("does not re-fetch when the current state is already unauthenticated", async () => {
    let fetchCalled = false;
    const state = await recoverPortalStateAfterAuthExpiry(
      {
        status: "unauthenticated"
      },
      "https://api.paretoproof.test",
      {
        fetcher: async () => {
          fetchCalled = true;
          throw new Error("should not be called");
        }
      }
    );

    expect(state).toEqual({
      status: "unauthenticated"
    });
    expect(fetchCalled).toBe(false);
  });

  it("does not re-fetch when bootstrap is already loading", async () => {
    let fetchCalled = false;
    const state = await recoverPortalStateAfterAuthExpiry(
      {
        status: "loading"
      },
      "https://api.paretoproof.test",
      {
        fetcher: async () => {
          fetchCalled = true;
          throw new Error("should not be called");
        }
      }
    );

    expect(state).toEqual({
      status: "loading"
    });
    expect(fetchCalled).toBe(false);
  });
});

describe("PortalBootstrap auth handoff", () => {
  it("renders the portal shell immediately when a fresh approved handoff is present", () => {
    const handoffCookie = buildApprovedAuthHandoffCookieValue(
      {
        role: "admin",
        status: "approved",
        surface: "portal"
      },
      Date.now()
    );

    globalThis.window = {
      location: new URL("https://portal.paretoproof.com/")
    };
    globalThis.document = {
      cookie: handoffCookie
    };

    const firstHtml = renderToStaticMarkup(<PortalBootstrap />);
    const secondHtml = renderToStaticMarkup(<PortalBootstrap />);

    expect(firstHtml).not.toContain("Opening portal");
    expect(firstHtml).toContain("Portal landing summary for current run activity");
    expect(firstHtml).toContain("Authenticated session");
    expect(secondHtml).toContain("Portal landing summary for current run activity");
    expect(globalThis.document.cookie).toBe(handoffCookie);
  });

  it("defers insufficient-role redirects while an approved handoff is still provisional", () => {
    globalThis.window = {
      location: new URL(
        "http://127.0.0.1/admin/users?surface=portal&access=approved&role=collaborator"
      )
    };

    expect(
      resolvePortalBootstrapRouteRedirect({
        allowApprovedRouteRedirects: false,
        pathname: "/admin/users",
        routeDeniedReason: null,
        search: "?surface=portal&access=approved&role=collaborator",
        state: {
          email: null,
          role: "collaborator",
          status: "approved"
        },
        surface: "portal"
      })
    ).toBeNull();
  });

  it("restores insufficient-role redirects after bootstrap revalidation", () => {
    globalThis.window = {
      location: new URL(
        "http://127.0.0.1/admin/users?surface=portal&access=approved&role=collaborator"
      )
    };

    const redirectTarget = resolvePortalBootstrapRouteRedirect({
      pathname: "/admin/users",
      routeDeniedReason: null,
      search: "?surface=portal&access=approved&role=collaborator",
      state: {
        email: null,
        role: "collaborator",
        status: "approved"
      },
      surface: "portal"
    });

    expect(redirectTarget).not.toBeNull();
    const redirectUrl = new URL(redirectTarget);

    expect(redirectUrl.pathname).toBe("/denied");
    expect(redirectUrl.searchParams.get("reason")).toBe("insufficient_role");
  });
});
