import { describe, expect, it } from "bun:test";
import { handleAccessStart } from "./access-start";

function readSetCookies(response: Response) {
  return (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
}

describe("handleAccessStart", () => {
  it("starts Google sign-in with Strict provider state and clears abandoned link state", async () => {
    const response = await handleAccessStart(
      new Request("https://auth.paretoproof.com/api/access/start/google?redirect=/profile"),
      {
        ACCESS_PROVIDER_STATE_SECRET: "test-secret"
      },
      "google"
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://google.auth.paretoproof.com/?redirect=%2Fprofile"
    );

    const setCookies = readSetCookies(response);
    expect(setCookies).toHaveLength(2);
    expect(setCookies[0]).toContain("PortalLinkIntent=");
    expect(setCookies[0]).toContain("SameSite=Strict");
    expect(setCookies[1]).toContain("PortalAccessProvider=");
    expect(setCookies[1]).toContain("SameSite=Strict");
  });

  it("starts GitHub profile linking without clearing the existing link intent and keeps provider state Strict", async () => {
    const response = await handleAccessStart(
      new Request(
        "https://auth.paretoproof.com/api/access/start/github?flow=link&redirect=/profile?tab=identities"
      ),
      {
        ACCESS_PROVIDER_STATE_SECRET: "test-secret"
      },
      "github"
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://github.auth.paretoproof.com/?redirect=%2Fprofile%3Ftab%3Didentities&flow=link"
    );

    const setCookies = readSetCookies(response);
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]).toContain("PortalAccessProvider=");
    expect(setCookies[0]).toContain("SameSite=Strict");
  });
});
