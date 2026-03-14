import { describe, expect, it } from "bun:test";
import { isLocalDevelopmentLocation } from "./local-development.ts";

describe("isLocalDevelopmentLocation", () => {
  it("treats loopback-mapped branded hosts on explicit http ports as local dev", () => {
    expect(
      isLocalDevelopmentLocation({
        hostname: "auth.paretoproof.com",
        port: "4371",
        protocol: "http:"
      })
    ).toBe(true);

    expect(
      isLocalDevelopmentLocation({
        hostname: "github.auth.paretoproof.com",
        port: "3000",
        protocol: "http:"
      })
    ).toBe(true);
  });

  it("keeps production branded hosts out of the local-dev path", () => {
    expect(
      isLocalDevelopmentLocation({
        hostname: "auth.paretoproof.com",
        protocol: "https:"
      })
    ).toBe(false);
  });
});
