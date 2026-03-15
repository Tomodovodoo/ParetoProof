import { describe, expect, it } from "bun:test";
import {
  buildAuthEntrySessionCheckRequestInit,
  resolveAuthEntryMode,
  resolveAuthEntrySessionCheckAction
} from "./auth-entry.tsx";

describe("auth entry session handoff checks", () => {
  it("checks existing sessions with same-origin credentials", () => {
    const controller = new AbortController();
    const init = buildAuthEntrySessionCheckRequestInit(controller.signal);

    expect(init.credentials).toBe("same-origin");
    expect(init.signal).toBe(controller.signal);
    expect(init.headers).toEqual({
      Accept: "application/json"
    });
  });

  it("stays on the auth entry when the session probe returns inactive", () => {
    expect(
      resolveAuthEntrySessionCheckAction(
        { ok: true, status: 200 },
        { active: false }
      )
    ).toBe("stay_on_auth_entry");
  });

  it("redirects into the portal when the session probe returns an active session", () => {
    expect(
      resolveAuthEntrySessionCheckAction(
        { ok: true, status: 200 },
        { identity: { subject: "user-1" }, access: { status: "approved" } }
      )
    ).toBe("redirect_portal");
  });

  it("stays on the auth entry when the session probe fails", () => {
    expect(
      resolveAuthEntrySessionCheckAction(
        { ok: false, status: 500 },
        null
      )
    ).toBe("stay_on_auth_entry");
  });

  it("treats the access-request redirect target as a separate new-collaborator mode", () => {
    expect(resolveAuthEntryMode("/access-request")).toBe("access_request");
    expect(resolveAuthEntryMode("/")).toBe("sign_in");
  });
});
