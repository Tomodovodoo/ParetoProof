import { describe, expect, it } from "bun:test";
import {
  mathLeanSubmissionDetailSchema,
  mathLeanSubmissionCreateInputSchema,
  mathLeanReviewGateStatusSchema,
  mathLeanSubmissionUpdateInputSchema,
  mathLeanReviewGateUpdateInputSchema
} from "./math-lean-submission.js";

describe("math lean submission schemas", () => {
  it("accepts a minimal Lean proof submission create payload", () => {
    const parsed = mathLeanSubmissionCreateInputSchema.safeParse({
      equivalenceExpectation: "not_applicable",
      leanSubmissionKind: "lean_proof_submission",
      mathQuestionId: "question-123",
      mathQuestionRevisionId: "revision-5"
    });

    expect(parsed.success).toBeTrue();
  });

  it("requires target fields when equivalence expectation references an existing target", () => {
    expect(
      mathLeanSubmissionCreateInputSchema.safeParse({
        equivalenceExpectation: "canonical_statement",
        leanSubmissionKind: "lean_proof_submission",
        mathQuestionId: "question-123",
        mathQuestionRevisionId: "revision-5"
      }).success
    ).toBeFalse();
  });

  it("trims accepted update payload values", () => {
    const parsed = mathLeanSubmissionUpdateInputSchema.safeParse({
      targetDeclarationName: "  FirstProof.Problem9.problem9  ",
      targetModuleName: "  FirstProof.Problem9.Candidate  "
    });

    expect(parsed.success).toBeTrue();

    if (!parsed.success) {
      return;
    }

    expect(parsed.data.targetDeclarationName).toBe("FirstProof.Problem9.problem9");
    expect(parsed.data.targetModuleName).toBe("FirstProof.Problem9.Candidate");
  });

  it("rejects empty update payloads", () => {
    expect(mathLeanSubmissionUpdateInputSchema.safeParse({}).success).toBeFalse();
  });

  it("allows sparse targeted-equivalence updates so merged validation can decide final validity", () => {
    expect(
      mathLeanSubmissionUpdateInputSchema.safeParse({
        equivalenceExpectation: "canonical_statement"
      }).success
    ).toBeTrue();
    expect(
      mathLeanSubmissionUpdateInputSchema.safeParse({
        equivalenceExpectation: "prior_submission"
      }).success
    ).toBeTrue();
  });

  it("rejects explicit target clears when equivalence expectation still requires a target", () => {
    expect(
      mathLeanSubmissionUpdateInputSchema.safeParse({
        equivalenceExpectation: "canonical_statement",
        targetDeclarationName: null,
        targetModuleName: null
      }).success
    ).toBeFalse();
  });

  it("rejects persisted submission details with an impossible equivalence target profile", () => {
    expect(
      mathLeanSubmissionDetailSchema.safeParse({
        artifacts: [],
        checks: [],
        createdAt: "2026-04-01T00:00:00.000Z",
        mathQuestionId: "question-123",
        mathQuestionRevisionId: "revision-5",
        mathSubmissionId: "submission-9",
        profile: {
          equivalenceExpectation: "canonical_statement",
          leanSubmissionKind: "lean_proof_submission",
          targetDeclarationName: null,
          targetLaneId: null,
          targetModuleName: null
        },
        reviewGates: [],
        updatedAt: "2026-04-01T00:00:00.000Z"
      }).success
    ).toBeFalse();
  });

  it("rejects persisted blocked review gates without a rationale", () => {
    expect(
      mathLeanReviewGateStatusSchema.safeParse({
        gateKind: "peer_review",
        rationale: null,
        source: "human_reviewer",
        state: "blocked",
        updatedAt: "2026-04-01T00:00:00.000Z",
        updatedByUserId: "user-9"
      }).success
    ).toBeFalse();
    expect(
      mathLeanReviewGateStatusSchema.safeParse({
        gateKind: "peer_review",
        rationale: null,
        source: "default_policy",
        state: "required",
        updatedAt: null,
        updatedByUserId: null
      }).success
    ).toBeTrue();
  });

  it("rejects blank review-gate rationales", () => {
    expect(
      mathLeanReviewGateUpdateInputSchema.safeParse({
        rationale: "   ",
        state: "blocked"
      }).success
    ).toBeFalse();
  });

  it("requires rationale when a review gate is blocked or waived", () => {
    expect(
      mathLeanReviewGateUpdateInputSchema.safeParse({
        state: "blocked"
      }).success
    ).toBeFalse();
    expect(
      mathLeanReviewGateUpdateInputSchema.safeParse({
        state: "waived"
      }).success
    ).toBeFalse();
    expect(
      mathLeanReviewGateUpdateInputSchema.safeParse({
        state: "satisfied"
      }).success
    ).toBeTrue();
  });
});
