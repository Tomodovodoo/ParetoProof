import { describe, expect, it } from "bun:test";
import { brandedDevServerHosts } from "./vite.allowed-hosts";

describe("brandedDevServerHosts", () => {
  it("covers the branded browser hosts used by the web surfaces", () => {
    expect(brandedDevServerHosts).toEqual([
      "paretoproof.com",
      "www.paretoproof.com",
      "auth.paretoproof.com",
      "github.auth.paretoproof.com",
      "google.auth.paretoproof.com",
      "portal.paretoproof.com"
    ]);
  });
});
