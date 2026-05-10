import { describe, expect, it } from "bun:test";
import { findMathReviewDetail } from "./math-review.ts";
import {
  addLineCommentToReview,
  escalateReview,
  reassignPrimaryReview,
  recordReviewDecision,
  resolveReviewComment,
  selfAssignReview,
  updateReviewChecklistItemState
} from "./math-review-actions.ts";

const context = {
  actorDisplayName: "Current Reviewer",
  now: "2026-05-10T13:00:00.000Z"
};

function requireDetail(reviewId) {
  const detail = findMathReviewDetail(reviewId);

  if (!detail) {
    throw new Error(`Missing fixture review ${reviewId}`);
  }

  return detail;
}

describe("math review action helpers", () => {
  it("self-assigns only when the review is assignable and has no active primary", () => {
    const triage = requireDetail("review-triage-formalization");
    const assigned = selfAssignReview(triage, context);
    const peer = requireDetail("review-peer-problem9-submission");

    expect(assigned.activeRound.assignments).toContainEqual(
      expect.objectContaining({
        assignmentRole: "primary",
        assigneeDisplayName: "Current Reviewer",
        state: "active"
      })
    );
    expect(selfAssignReview(peer, context)).toBe(peer);
  });

  it("reassigns the active primary while preserving assignment history", () => {
    const release = requireDetail("review-release-package-candidate");
    const reassigned = reassignPrimaryReview(release, context);

    expect(reassigned.activeRound.assignments).toContainEqual(
      expect.objectContaining({
        assigneeDisplayName: "Nicolas Bourbaki",
        state: "reassigned"
      })
    );
    expect(reassigned.activeRound.assignments.at(-1)).toMatchObject({
      assignmentRole: "primary",
      assigneeDisplayName: "Current Reviewer",
      state: "active"
    });
  });

  it("updates checklist state and reviewer attribution", () => {
    const peer = requireDetail("review-peer-problem9-submission");
    const updated = updateReviewChecklistItemState(
      peer,
      "peer-automation-current",
      "satisfied",
      context
    );

    expect(
      updated.checklistItems.find((item) => item.id === "peer-automation-current")
    ).toMatchObject({
      state: "satisfied",
      updatedAt: context.now,
      updatedByDisplayName: "Current Reviewer"
    });
  });

  it("adds and resolves line-anchored comments inside available Lean artifacts", () => {
    const peer = requireDetail("review-peer-problem9-submission");
    const commented = addLineCommentToReview(
      peer,
      {
        body: "Please double-check the theorem-level target before editor handoff.",
        lineNumber: 3
      },
      context
    );
    const addedComment = commented.comments.at(-1);
    const outOfRange = addLineCommentToReview(
      peer,
      {
        body: "This should not attach.",
        lineNumber: 99
      },
      context
    );
    const resolved = resolveReviewComment(commented, addedComment.id, context);

    expect(addedComment.anchor).toMatchObject({
      anchorType: "line",
      path: "FirstProof/Problem9/Candidate.lean",
      startLine: 3
    });
    expect(outOfRange).toBe(peer);
    expect(resolved.comments.at(-1)).toMatchObject({
      id: addedComment.id,
      state: "resolved"
    });
  });

  it("records only lane-compatible review decisions", () => {
    const peer = requireDetail("review-peer-problem9-submission");
    const decided = recordReviewDecision(
      peer,
      "approved_for_editor_review",
      "Peer checks passed.",
      context
    );
    const rejected = recordReviewDecision(
      peer,
      "publish_ready",
      "Wrong lane.",
      context
    );

    expect(decided.reviewPosture).toBe("decided");
    expect(decided.activeRound.decisionOutcome).toBe("approved_for_editor_review");
    expect(rejected).toBe(peer);
  });

  it("escalates review rounds when the user has escalation capability", () => {
    const peer = requireDetail("review-peer-problem9-submission");
    const escalated = escalateReview(peer, "Independence conflict.", context);

    expect(escalated.reviewPosture).toBe("escalated");
    expect(escalated.activeRound.decisionOutcome).toBe("escalated");
    expect(escalated.activeRound.decisionSummary).toBe("Independence conflict.");
  });
});
