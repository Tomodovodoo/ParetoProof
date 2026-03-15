import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { handleAccessSession } from "./access-session";

const originalFetch = globalThis.fetch;

describe("handleAccessSession", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("relays a session status check with the Access assertion to the API", async () => {
    globalThis.fetch = async (input, init) => {
      expect(input).toBe("https://api.paretoproof.com/portal/session/status");
      expect(init?.method).toBe("GET");
      expect((init?.headers as Headers).get("cf-access-jwt-assertion")).toBe("assertion-1");

      return new Response(
        JSON.stringify({
          identity: { subject: "user-1", email: "user@example.com" },
          access: { status: "approved", roles: ["contributor"] }
        }),
        { status: 200 }
      );
    };

    const response = await handleAccessSession(
      new Request("https://auth.paretoproof.com/api/access/session", {
        headers: {
          "cf-access-jwt-assertion": "assertion-1",
          cookie: "CF_Authorization=session-cookie"
        }
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.json();
    expect(body.identity.subject).toBe("user-1");
    expect(body.access.status).toBe("approved");
  });

  it("relays a session status check with a cookie-only Access session", async () => {
    globalThis.fetch = async (_input, init) => {
      expect((init?.headers as Headers).get("cf-access-jwt-assertion")).toBeNull();
      expect((init?.headers as Headers).get("cookie")).toContain("CF_Authorization=session-cookie");

      return new Response(
        JSON.stringify({
          identity: { subject: "user-2" },
          access: { status: "pending" }
        }),
        { status: 200 }
      );
    };

    const response = await handleAccessSession(
      new Request("https://github.auth.paretoproof.com/api/access/session", {
        headers: {
          cookie: "CF_Authorization=session-cookie"
        }
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.identity.subject).toBe("user-2");
  });

  it("returns inactive when no Access assertion or session cookie is present", async () => {
    const response = await handleAccessSession(
      new Request("https://auth.paretoproof.com/api/access/session")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ active: false });
  });

  it("returns inactive when only non-Access cookies are present", async () => {
    const response = await handleAccessSession(
      new Request("https://auth.paretoproof.com/api/access/session", {
        headers: {
          cookie: "PortalAccessProvider=signed"
        }
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ active: false });
  });

  it("returns inactive when the API rejects the session", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "access_assertion_required" }), {
        status: 401
      });

    const response = await handleAccessSession(
      new Request("https://auth.paretoproof.com/api/access/session", {
        headers: {
          "cf-access-jwt-assertion": "stale-assertion"
        }
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ active: false });
  });

  it("returns inactive when the API fetch fails", async () => {
    globalThis.fetch = async () => {
      throw new Error("Network error");
    };

    const response = await handleAccessSession(
      new Request("https://auth.paretoproof.com/api/access/session", {
        headers: {
          "cf-access-jwt-assertion": "assertion-1"
        }
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ active: false });
  });
});
