import { describe, expect, it } from "bun:test";
import {
  buildRunDetailTargetPath,
  buildRunsIndexTargetPath
} from "./portal-benchmark-ops-surfaces.tsx";

describe("portal benchmark ops route targets", () => {
  it("keeps the current runs query when routing into run detail", () => {
    expect(
      buildRunDetailTargetPath(
        "PP-320",
        "?surface=portal&access=approved&roles=helper&providerFamily=google"
      )
    ).toBe(
      "/runs/PP-320?surface=portal&access=approved&roles=helper&providerFamily=google"
    );
  });

  it("normalizes query strings without a leading question mark", () => {
    expect(
      buildRunDetailTargetPath(
        "PP 320",
        "surface=portal&access=approved&roles=helper&providerFamily=google"
      )
    ).toBe(
      "/runs/PP%20320?surface=portal&access=approved&roles=helper&providerFamily=google"
    );
  });

  it("preserves the originating runs slice for the back-to-runs action", () => {
    expect(
      buildRunsIndexTargetPath(
        "?surface=portal&access=approved&roles=helper&providerFamily=google"
      )
    ).toBe(
      "/runs?surface=portal&access=approved&roles=helper&providerFamily=google"
    );
  });
});
