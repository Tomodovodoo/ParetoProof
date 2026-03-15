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
      expect(input).toBe("https://api.paretoproof.com/portal/session/finalize/submit");
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
              "PortalAccessSession=signed; Domain=.paretoproof.com; Path=/; Secure; HttpOnly"
            ],
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
    expect(setCookies).toHaveLength(3);
    expect(setCookies[0]).toContain("PortalAccessSession=signed");
    expect(setCookies[1]).toContain("PortalAccessProvider=signed");
    expect(setCookies[2]).toContain("PortalLinkIntent=");
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

  it("targets the API finalize-submit boundary for branded relay handoffs", async () => {
    const relayTargets: string[] = [];

    globalThis.fetch = async (input) => {
      relayTargets.push(String(input));

      return new Response(
        JSON.stringify({
          redirectTo: "https://portal.paretoproof.com/profile"
        }),
        {
          status: 200
        }
      );
    };

    await handleAccessFinalize(
      new Request("https://github.auth.paretoproof.com/api/access/finalize", {
        body: new URLSearchParams({
          redirect: "/profile"
        }),
        headers: {
          "cf-access-jwt-assertion": "assertion-3",
          "content-type": "application/x-www-form-urlencoded"
        },
        method: "POST"
      })
    );

    expect(relayTargets).toEqual([
      "https://api.paretoproof.com/portal/session/finalize/submit"
    ]);
  });

  it("preserves the finalized portal path when converting the response into a browser redirect", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          redirectTo: "https://portal.paretoproof.com/admin/users?tab=review#pending"
        }),
        {
          status: 200
        }
      );

    const response = await handleAccessFinalize(
      new Request("https://github.auth.paretoproof.com/api/access/finalize", {
        body: new URLSearchParams({
          redirect: "/profile"
        }),
        headers: {
          "cf-access-jwt-assertion": "assertion-4",
          "content-type": "application/x-www-form-urlencoded"
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://portal.paretoproof.com/admin/users?tab=review#pending"
    );
  });

  it("splits a combined Set-Cookie fallback header into individual cookies", async () => {
    globalThis.fetch = async () => {
      const response = new Response(
        JSON.stringify({
          redirectTo: "https://portal.paretoproof.com/profile"
        }),
        {
          headers: {
            "set-cookie": [
              "PortalAccessSession=session; Domain=.paretoproof.com; Path=/; Secure; HttpOnly",
              "PortalAccessProvider=provider; Domain=.paretoproof.com; Path=/; Secure; HttpOnly",
              "PortalLinkIntent=; Domain=.paretoproof.com; Path=/; Max-Age=0; Secure; HttpOnly"
            ].join(", ")
          },
          status: 200
        }
      );

      const responseHeaders = response.headers as Headers & {
        getAll?: undefined;
        getSetCookie?: undefined;
      };

      Object.defineProperty(responseHeaders, "getAll", {
        value: undefined
      });
      Object.defineProperty(responseHeaders, "getSetCookie", {
        value: undefined
      });

      return response;
    };

    const response = await handleAccessFinalize(
      new Request("https://google.auth.paretoproof.com/api/access/finalize", {
        body: new URLSearchParams({
          redirect: "/profile"
        }),
        headers: {
          "cf-access-jwt-assertion": "assertion-5",
          "content-type": "application/x-www-form-urlencoded"
        },
        method: "POST"
      })
    );

    const setCookies =
      (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    expect(setCookies).toHaveLength(3);
    expect(setCookies[0]).toContain("PortalAccessSession=session");
    expect(setCookies[1]).toContain("PortalAccessProvider=provider");
    expect(setCookies[2]).toContain("PortalLinkIntent=");
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

  it("redirects back to the branded retry surface when branded state cookies exist without a usable Access session", async () => {
    const response = await handleAccessFinalize(
      new Request("https://github.auth.paretoproof.com/api/access/finalize", {
        body: new URLSearchParams({
          redirect: "/profile"
        }),
        headers: {
          cookie: "PortalAccessProvider=signed; PortalLinkIntent=intent-1",
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
