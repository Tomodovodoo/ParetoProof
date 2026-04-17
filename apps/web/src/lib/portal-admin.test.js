import { describe, expect, it } from "bun:test";
import { portalAdminLocalTestUtils } from "./portal-admin.ts";

describe("portal admin local preview fixtures", () => {
  it("marks the seeded reviewer and user records as local preview content", () => {
    const state = portalAdminLocalTestUtils.createLocalAdminState();

    expect(portalAdminLocalTestUtils.localReviewer.label).toBe("Local preview reviewer");
    expect(state.users.map((user) => user.displayName)).toEqual([
      "Demo collaborator record",
      "Demo pending requester",
      "Demo former helper",
      "Demo approved helper"
    ]);
    expect(state.users.every((user) => user.email.includes("@preview.paretoproof.local"))).toBe(
      true
    );
  });

  it("keeps local access-request narratives explicitly scoped to preview layout review", () => {
    const state = portalAdminLocalTestUtils.createLocalAdminState();

    expect(state.accessRequests.map((request) => request.rationale)).toEqual([
      "Local preview request used to exercise collaborator approval layout.",
      "Local preview recovery request for a rotated Google identity.",
      "Local preview request used to exercise rejected helper review state.",
      "Local preview request used to exercise pending helper review state."
    ]);
    expect(
      state.accessRequests
        .filter((request) => request.decisionNote !== null)
        .map((request) => request.decisionNote)
    ).toEqual(["Local preview rejection note for the review-state layout."]);
    expect(
      state.accessRequests
        .filter((request) => request.reviewedAt !== null)
        .map((request) => request.reviewer?.label)
    ).toEqual(["Local preview reviewer"]);
  });
});
