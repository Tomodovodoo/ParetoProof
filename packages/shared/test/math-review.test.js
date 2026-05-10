import { describe, expect, it } from "bun:test";
import {
  getMathReviewDecisionOutcomes,
  isMathReviewKindAllowedForSubject,
  mathReviewCommentAnchorSchema,
  mathReviewRecordDetailSchema
} from "../dist/index.js";

const validReviewDetail = {
  activeRound: {
    assignments: [
      {
        assignedAt: "2026-05-09T18:20:00.000Z",
        assignmentRole: "primary",
        assigneeDisplayName: "Ada Lovelace",
        closeReason: null,
        state: "active"
      }
    ],
    decisionOutcome: null,
    decisionSummary: null,
    openedAt: "2026-05-09T18:20:00.000Z",
    posture: "open",
    roundNumber: 1
  },
  capabilities: {
    canApplyAdminOverride: false,
    canAssignPrimary: false,
    canComment: true,
    canEscalate: true,
    canReassignPrimary: false,
    canRecordDecision: true,
    canResolveComment: true,
    canSelfAssign: false,
    canUpdateChecklist: true
  },
  checklistItems: [
    {
      family: "peer_correctness",
      id: "peer-automation-current",
      label: "Reviewer-visible automation evidence is current",
      rationale: null,
      required: true,
      state: "open",
      updatedAt: null,
      updatedByDisplayName: null
    }
  ],
  comments: [
    {
      anchor: {
        anchorType: "line",
        artifactRole: "submission_entrypoint",
        endLine: 7,
        mathArtifactRefId: "artifact-problem9-candidate",
        path: "FirstProof/Problem9/Candidate.lean",
        startLine: 6
      },
      authorDisplayName: "Ada Lovelace",
      body: "The final equality should be checked against the canonical theorem statement.",
      createdAt: "2026-05-09T19:10:00.000Z",
      id: "comment-peer-line-1",
      replies: [],
      state: "open"
    }
  ],
  generatedAt: "2026-05-10T12:00:00.000Z",
  reviewId: "review-peer-problem9-submission",
  reviewKind: "peer",
  reviewPosture: "open",
  sourceArtifact: {
    artifactRole: "submission_entrypoint",
    availability: "available",
    content: "theorem problem9_candidate : True := by\n  trivial",
    language: "lean",
    lineCount: 2,
    mathArtifactRefId: "artifact-problem9-candidate",
    path: "FirstProof/Problem9/Candidate.lean",
    reason: null
  },
  subjectId: "submission-problem9-candidate",
  subjectLabel: "Problem 9 Lean proof submission",
  subjectPosture: "human-review-required",
  subjectSummary: "Lean proof submission targeting the accepted Problem 9 question revision.",
  subjectType: "submission"
};

describe("math review contract", () => {
  it("keeps review kinds scoped to compatible math subject types", () => {
    expect(isMathReviewKindAllowedForSubject("submission", "peer")).toBe(true);
    expect(isMathReviewKindAllowedForSubject("submission", "release")).toBe(false);
    expect(isMathReviewKindAllowedForSubject("package_candidate", "release")).toBe(
      true
    );
    expect(isMathReviewKindAllowedForSubject("package_candidate", "peer")).toBe(
      false
    );
  });

  it("exposes decision outcomes by review lane without crossing lane semantics", () => {
    expect(getMathReviewDecisionOutcomes("peer")).toContain(
      "approved_for_editor_review"
    );
    expect(getMathReviewDecisionOutcomes("peer")).not.toContain("publish_ready");
    expect(getMathReviewDecisionOutcomes("release")).toContain("publish_ready");
  });

  it("validates detailed review records with line-anchored comments", () => {
    expect(mathReviewRecordDetailSchema.safeParse(validReviewDetail).success).toBe(
      true
    );
  });

  it("rejects reversed line-anchor ranges", () => {
    const result = mathReviewCommentAnchorSchema.safeParse({
      anchorType: "line",
      artifactRole: "submission_entrypoint",
      endLine: 4,
      mathArtifactRefId: "artifact-problem9-candidate",
      path: "FirstProof/Problem9/Candidate.lean",
      startLine: 7
    });

    expect(result.success).toBe(false);
  });
});
