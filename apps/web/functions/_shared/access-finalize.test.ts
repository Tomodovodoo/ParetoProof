import { describe, expect, it } from "bun:test";
import { handleAccessFinalize } from "./access-finalize";

describe("handleAccessFinalize", () => {
  it("redirects the legacy finalize relay to the API finalize submit handoff", async () => {
    const response = await handleAccessFinalize(
      new Request("https://google.auth.paretoproof.com/api/access/finalize?redirect=%2Fprofile", {
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

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://api.paretoproof.com/portal/session/finalize/submit?redirect=%2Fprofile"
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps local branded-host finalize handoffs on the local API origin", async () => {
    const response = await handleAccessFinalize(
      new Request("http://github.auth.paretoproof.com:4371/api/access/finalize?redirect=%2Fprofile", {
        body: new URLSearchParams({
          redirect: "/profile"
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://github.auth.paretoproof.com:3000/portal/session/finalize/submit?redirect=%2Fprofile"
    );
  });
});
