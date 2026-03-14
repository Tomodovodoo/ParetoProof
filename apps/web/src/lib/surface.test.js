import { describe, expect, it } from "bun:test";
import { mergeLocalPortalStateSearch } from "./surface.ts";

describe("mergeLocalPortalStateSearch", () => {
  it("drops stale denial reasons once local access is approved", () => {
    expect(
      mergeLocalPortalStateSearch(
        "",
        "?surface=portal&access=approved&roles=helper&reason=insufficient_role&email=lin@paretoproof.local"
      )
    ).toBe("access=approved&email=lin%40paretoproof.local&roles=helper");
  });

  it("preserves denial reasons while the local access state is denied", () => {
    expect(
      mergeLocalPortalStateSearch(
        "",
        "?surface=portal&access=denied&reason=access_request_required&email=lin@paretoproof.local"
      )
    ).toBe("access=denied&email=lin%40paretoproof.local&reason=access_request_required");
  });

  it("keeps an explicit target reason untouched", () => {
    expect(
      mergeLocalPortalStateSearch(
        "?reason=existing",
        "?surface=portal&access=approved&reason=insufficient_role"
      )
    ).toBe("reason=existing&access=approved");
  });
});
