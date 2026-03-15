import { describe, expect, it } from "bun:test";
import { handleAccessStart } from "./access-start";

function readSetCookieHeaders(headers: Headers) {
  const cookieHeaders = headers as Headers & {
    getAll?: (name: string) => string[];
    getSetCookie?: () => string[];
  };

  if (typeof cookieHeaders.getSetCookie === "function") {
    return cookieHeaders.getSetCookie();
  }

  if (typeof cookieHeaders.getAll === "function") {
    return cookieHeaders.getAll("set-cookie");
  }

  const singleCookieHeader = headers.get("set-cookie");
  return singleCookieHeader ? [singleCookieHeader] : [];
}

describe("handleAccessStart", () => {
  it("signs provider state and redirects to the branded provider host when the Pages secret is present", async () => {
    const response = await handleAccessStart(
      new Request("https://github.auth.paretoproof.com/api/access/start/github?redirect=/profile"),
      {
        ACCESS_PROVIDER_STATE_SECRET: "state-secret"
      },
      "github"
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://github.auth.paretoproof.com/?redirect=%2Fprofile"
    );

    const setCookies = readSetCookieHeaders(response.headers);
    expect(setCookies.some((cookie) => cookie.includes("PortalAccessProvider="))).toBe(true);
    expect(setCookies.some((cookie) => cookie.includes("PortalLinkIntent="))).toBe(true);
  });

  it("falls back to the branded auth failure surface when the Pages secret is missing", async () => {
    const response = await handleAccessStart(
      new Request("https://google.auth.paretoproof.com/api/access/start/google?redirect=/profile"),
      {},
      "google"
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://auth.paretoproof.com/?redirect=%2Fprofile&handoff=failed"
    );
    expect(readSetCookieHeaders(response.headers)).toHaveLength(0);
  });
});
