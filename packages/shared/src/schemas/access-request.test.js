import { describe, expect, it } from "bun:test";
import {
  portalAccessRecoveryInputSchema,
  portalAccessRequestInputSchema
} from "./access-request.js";

describe("portal access request inputs", () => {
  it("rejects blank access-request rationale values", () => {
    expect(
      portalAccessRequestInputSchema.safeParse({
        rationale: "   ",
        requestedRole: "helper"
      }).success
    ).toBeFalse();
  });

  it("rejects blank recovery rationale values", () => {
    expect(
      portalAccessRecoveryInputSchema.safeParse({
        rationale: "   "
      }).success
    ).toBeFalse();
  });

  it("trims accepted rationale values", () => {
    const parsed = portalAccessRequestInputSchema.safeParse({
      rationale: "  Need contributor access for benchmark triage.  ",
      requestedRole: "collaborator"
    });

    expect(parsed.success).toBeTrue();

    if (!parsed.success) {
      return;
    }

    expect(parsed.data.rationale).toBe("Need contributor access for benchmark triage.");
  });
});
