import { afterEach, describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AuthEntry,
  buildLocalAuthEntryPreviewState,
  resolveAuthEntryApprovedPortalTargetPath,
  resolveAuthEntrySessionCheckAction,
  shouldStayOnAuthEntryForProviderlessRecovery
} from "./auth-entry.tsx";

const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow) {
    globalThis.window = originalWindow;
    return;
  }

  delete globalThis.window;
});

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

describe("buildLocalAuthEntryPreviewState", () => {
  it("builds a local sign-in preview with portal and access-request entry routes", () => {
    globalThis.window = {
      location: new URL("http://127.0.0.1/?surface=auth")
    };

    expect(buildLocalAuthEntryPreviewState("sign_in")).toMatchObject({
      actions: [
        {
          href: "http://127.0.0.1/?surface=portal",
          title: "Open local portal preview"
        },
        {
          href: "http://127.0.0.1/?surface=auth&redirect=%2Faccess-request",
          title: "Open local access-request preview"
        }
      ],
      footerCta: {
        href: "http://127.0.0.1/?surface=portal",
        label: "Open local portal preview"
      }
    });
  });

  it("builds a local access-request preview with a direct portal route handoff", () => {
    globalThis.window = {
      location: new URL("http://127.0.0.1/?surface=auth&redirect=%2Faccess-request")
    };

    expect(buildLocalAuthEntryPreviewState("access_request")).toMatchObject({
      actions: [
        {
          href: "http://127.0.0.1/access-request?surface=portal",
          title: "Open local access-request route"
        },
        {
          href: "http://127.0.0.1/?surface=auth",
          title: "Open local sign-in guidance"
        }
      ]
    });
  });
});

describe("AuthEntry local rendering", () => {
  it("renders truthful local sign-in guidance instead of provider sign-in CTAs", () => {
    globalThis.window = {
      location: new URL("http://127.0.0.1/?surface=auth")
    };

    const html = renderToStaticMarkup(<AuthEntry redirectPath="/" />);

    expect(html).toContain("Local development bypasses live provider sign-in.");
    expect(html).toContain("Open local portal preview");
    expect(html).toContain("Open local access-request preview");
    expect(html).toContain("Back to local home");
    expect(html).not.toContain("Continue with GitHub");
    expect(html).not.toContain("Continue with Google");
  });

  it("renders truthful local access-request guidance instead of identity-verification promises", () => {
    globalThis.window = {
      location: new URL("http://127.0.0.1/?surface=auth&redirect=%2Faccess-request")
    };

    const html = renderToStaticMarkup(<AuthEntry redirectPath="/access-request" />);

    expect(html).toContain("Local development bypasses provider verification here.");
    expect(html).toContain("Open local access-request route");
    expect(html).toContain("Open local sign-in guidance");
    expect(html).toContain("Back to local home");
    expect(html).not.toContain("Use GitHub or Google to verify your identity.");
  });
});
