import { describe, expect, it } from "bun:test";
import { buildLocalPendingPortalUrl } from "./portal-bootstrap.tsx";

describe("buildLocalPendingPortalUrl", () => {
  it("promotes the local access state to pending and clears denial-only params", () => {
    expect(
      buildLocalPendingPortalUrl(
        "?surface=portal&access=denied&reason=access_request_required&email=lin@paretoproof.local&roles=helper"
      )
    ).toBe("/pending?surface=portal&access=pending&email=lin%40paretoproof.local");
  });

  it("preserves the local email when no denial reason is present", () => {
    expect(
      buildLocalPendingPortalUrl("?surface=portal&access=denied&email=ada@paretoproof.local")
    ).toBe("/pending?surface=portal&access=pending&email=ada%40paretoproof.local");
  });
});
