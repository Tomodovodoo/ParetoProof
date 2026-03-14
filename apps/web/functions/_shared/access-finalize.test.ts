import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { handleAccessFinalize } from "./access-finalize";

const originalFetch = globalThis.fetch;

describe("handleAccessFinalize", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("relays a successful finalize response back to the portal and forwards cookies", async () => {
    globalThis.fetch = async (input, init) => {
      expect(input).toBe("https://api.paretoproof.com/portal/session/finalize");
      expect(init?.method).toBe("POST");
      expect((init?.headers as Headers).get("cf-access-jwt-assertion")).toBe("assertion-1");
      expect((init?.headers as Headers).get("cookie")).toContain("PortalAccessProvider=");
      expect((init?.headers as Headers).get("origin")).toBe("https://google.auth.paretoproof.com");
      expect(init?.redirect).toBe("manual");
      expect(init?.body).toBe(JSON.stringify({ redirect: "/profile" }));

      return new Response(
        JSON.stringify({
          redirectTo: "https://portal.paretoproof.com/profile"
        }),
        {
          headers: [
            [
              "set-cookie",
              "PortalAccessProvider=signed; Domain=.paretoproof.com; Path=/; Secure; HttpOnly"
            ],
            [
              "set-cookie",
              "PortalLinkIntent=; Domain=.paretoproof.com; Path=/; Max-Age=0; Secure; HttpOnly"
            ]
          ],
          status: 200
        }
      );
    };

    const response = await handleAccessFinalize(
      new Request("https://google.auth.paretoproof.com/api/access/finalize", {
        body: new URLSearchParams({
          redirect: "/profile"
        }),
        headers: {
          "cf-access-jwt-assertion": "assertion-1",
          cookie: "PortalAccessProvider=signed; PortalLinkIntent=intent-1",
          "content-type": "application/x-www-form-urlencoded"
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://portal.paretoproof.com/profile");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const setCookies =
      (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    expect(setCookies).toHaveLength(2);
    expect(setCookies[0]).toContain("PortalAccessProvider=signed");
    expect(setCookies[1]).toContain("PortalLinkIntent=");
  });

  it("relays a cookie-only branded Access session back to the API finalize boundary", async () => {
    globalThis.fetch = async (_input, init) => {
      expect((init?.headers as Headers).get("cf-access-jwt-assertion")).toBeNull();
      expect((init?.headers as Headers).get("cookie")).toContain("CF_Authorization=session-cookie");
      expect((init?.headers as Headers).get("origin")).toBe("https://github.auth.paretoproof.com");

      return new Response(
        JSON.stringify({
          redirectTo: "https://portal.paretoproof.com/access-request"
        }),
        {
          headers: [
            [
              "set-cookie",
              "PortalAccessProvider=signed; Domain=.paretoproof.com; Path=/; Secure; HttpOnly"
            ]
          ],
          status: 200
        }
      );
    };

    const response = await handleAccessFinalize(
      new Request("https://github.auth.paretoproof.com/api/access/finalize", {
        body: new URLSearchParams({
          redirect: "/access-request"
        }),
        headers: {
          cookie: "CF_Authorization=session-cookie; PortalAccessProvider=signed",
          "content-type": "application/x-www-form-urlencoded"
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://portal.paretoproof.com/access-request");
  });

  it("redirects back to the branded retry surface when the branded handoff lacks both Access header and session cookie", async () => {
    const response = await handleAccessFinalize(
      new Request("https://github.auth.paretoproof.com/api/access/finalize", {
        body: new URLSearchParams({
          redirect: "/profile"
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://auth.paretoproof.com/?redirect=%2Fprofile&handoff=retry"
    );
  });

  it("redirects back to the branded retry surface when the API finalize call fails", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: "access_assertion_required"
        }),
        {
          status: 401
        }
      );

    const response = await handleAccessFinalize(
      new Request("https://github.auth.paretoproof.com/api/access/finalize", {
        body: new URLSearchParams({
          redirect: "/profile"
        }),
        headers: {
          "cf-access-jwt-assertion": "assertion-2",
          "content-type": "application/x-www-form-urlencoded"
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://auth.paretoproof.com/?redirect=%2Fprofile&handoff=retry"
    );
  });
});
