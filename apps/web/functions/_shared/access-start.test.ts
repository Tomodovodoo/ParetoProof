import { describe, expect, it } from "bun:test";
import { handleAccessStart } from "./access-start";

function readSetCookies(response: Response) {
  return (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
}

describe("handleAccessStart", () => {
  it("starts Google sign-in with Strict provider state and clears abandoned link state", async () => {
    const response = await handleAccessStart(
      new Request(
        "https://auth.paretoproof.com/api/access/start/google?app=portal&redirect=/profile"
      ),
      {
        ACCESS_PROVIDER_STATE_SECRET: "test-secret"
      },
      "google"
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://google.auth.paretoproof.com/?app=portal&redirect=%2Fprofile"
    );

    const setCookies = readSetCookies(response);
    expect(setCookies).toHaveLength(2);
    expect(setCookies[0]).toContain("PortalLinkIntent=");
    expect(setCookies[0]).toContain("Domain=.paretoproof.com");
    expect(setCookies[0]).toContain("SameSite=Strict");
    expect(setCookies[0]).toContain("Secure");
    expect(setCookies[1]).toContain("PortalAccessProvider=");
    expect(setCookies[1]).toContain("Domain=.paretoproof.com");
    expect(setCookies[1]).toContain("SameSite=Strict");
    expect(setCookies[1]).toContain("Secure");
  });

  it("starts GitHub profile linking without clearing the existing link intent and keeps provider state Strict", async () => {
    const response = await handleAccessStart(
      new Request(
        "https://auth.paretoproof.com/api/access/start/github?app=portal&flow=link&redirect=/profile?tab=identities"
      ),
      {
        ACCESS_PROVIDER_STATE_SECRET: "test-secret"
      },
      "github"
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://github.auth.paretoproof.com/?app=portal&redirect=%2Fprofile%3Ftab%3Didentities&flow=link"
    );

    const setCookies = readSetCookies(response);
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]).toContain("PortalAccessProvider=");
    expect(setCookies[0]).toContain("SameSite=Strict");
  });

  it("preserves math-surface continuation on the branded provider handoff", async () => {
    const response = await handleAccessStart(
      new Request(
        "https://auth.paretoproof.com/api/access/start/google?app=math&redirect=/questions/problem-9"
      ),
      {
        ACCESS_PROVIDER_STATE_SECRET: "test-secret"
      },
      "google"
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://google.auth.paretoproof.com/?app=math&redirect=%2Fquestions%2Fproblem-9"
    );
  });

  it("routes loopback-branded starts to the matching local provider host and emits non-Secure shared cookies", async () => {
    const response = await handleAccessStart(
      new Request(
        "http://auth.paretoproof.com:4173/api/access/start/google?app=portal&redirect=/profile"
      ),
      {
        ACCESS_PROVIDER_STATE_SECRET: "test-secret"
      },
      "google"
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://google.auth.paretoproof.com:4173/?app=portal&redirect=%2Fprofile"
    );

    const setCookies = readSetCookies(response);
    expect(setCookies).toHaveLength(2);
    expect(setCookies[0]).toContain("PortalLinkIntent=");
    expect(setCookies[0]).toContain("Domain=.paretoproof.com");
    expect(setCookies[0]).not.toContain("; Secure");
    expect(setCookies[1]).toContain("PortalAccessProvider=");
    expect(setCookies[1]).toContain("Domain=.paretoproof.com");
    expect(setCookies[1]).not.toContain("; Secure");
  });

  it("keeps local start failures on the loopback-branded auth entry", async () => {
    const response = await handleAccessStart(
      new Request(
        "http://auth.paretoproof.com:4173/api/access/start/github?app=portal&redirect=/profile"
      ),
      {},
      "github"
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://auth.paretoproof.com:4173/?app=portal&redirect=%2Fprofile&handoff=failed"
    );
  });
});
