import { describe, expect, it } from "bun:test";
import config, { paretoProofDevAllowedHosts } from "./vite.config.ts";

describe("web vite host allowlist", () => {
  it("allows the branded ParetoProof hosts used for local auth and portal QA", () => {
    expect(paretoProofDevAllowedHosts).toEqual([
      "paretoproof.com",
      "auth.paretoproof.com",
      "github.auth.paretoproof.com",
      "google.auth.paretoproof.com",
      "portal.paretoproof.com"
    ]);

    expect(config.server?.allowedHosts).toEqual(paretoProofDevAllowedHosts);
  });
});
