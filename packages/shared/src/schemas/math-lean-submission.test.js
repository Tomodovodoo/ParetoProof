import { describe, expect, it } from "bun:test";
import {
  mathLeanSubmissionDetailSchema,
  mathLeanSubmissionCreateInputSchema,
  mathLeanSubmissionPatchInputSchema,
  mathLeanReviewGateStatusSchema,
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
    const parsed = mathLeanSubmissionPatchInputSchema.safeParse({
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
    expect(mathLeanSubmissionPatchInputSchema.safeParse({}).success).toBeFalse();
  });

  it("allows sparse targeted-equivalence updates so merged validation can decide final validity", () => {
    expect(
      mathLeanSubmissionPatchInputSchema.safeParse({
        equivalenceExpectation: "canonical_statement"
      }).success
    ).toBeTrue();
    expect(
      mathLeanSubmissionPatchInputSchema.safeParse({
        equivalenceExpectation: "prior_submission"
      }).success
    ).toBeTrue();
  });

  it("rejects explicit target clears when equivalence expectation still requires a target", () => {
    expect(
      mathLeanSubmissionPatchInputSchema.safeParse({
        equivalenceExpectation: "canonical_statement",
        targetDeclarationName: null,
        targetModuleName: null
      }).success
    ).toBeFalse();
  });

  it("rejects repair submissions that do not reference an existing target", () => {
    expect(
      mathLeanSubmissionCreateInputSchema.safeParse({
        equivalenceExpectation: "not_applicable",
        leanSubmissionKind: "lean_repair_submission",
        mathQuestionId: "question-123",
        mathQuestionRevisionId: "revision-5"
      }).success
    ).toBeFalse();
  });

  it("rejects untargeted submissions that still carry target references", () => {
    expect(
      mathLeanSubmissionCreateInputSchema.safeParse({
        equivalenceExpectation: "not_applicable",
        leanSubmissionKind: "lean_proof_submission",
        mathQuestionId: "question-123",
        mathQuestionRevisionId: "revision-5",
        targetDeclarationName: "FirstProof.Problem9.problem9",
        targetModuleName: "FirstProof.Problem9.Candidate"
      }).success
    ).toBeFalse();
  });

  it("rejects artifact details whose owner scope or lifecycle stage contradict the role catalog", () => {
    expect(
      mathLeanSubmissionDetailSchema.safeParse({
        artifacts: [
          {
            artifactId: "artifact-1",
            artifactRole: "compile_output",
            contentDigest: null,
            filename: "compile.txt",
            lifecycleStage: "question_source",
            mediaType: "text/plain",
            ownerScope: "question_revision",
            pathHint: null
          }
        ],
        checks: [],
        createdAt: "2026-04-01T00:00:00.000Z",
        mathQuestionId: "question-123",
        mathQuestionRevisionId: "revision-5",
        mathSubmissionId: "submission-9",
        profile: {
          equivalenceExpectation: "not_applicable",
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

  it("rejects duplicate automation checks and review gates within a submission detail payload", () => {
    expect(
      mathLeanSubmissionDetailSchema.safeParse({
        artifacts: [],
        checks: [
          {
            applicability: "required",
            checkKind: "compile",
            latestArtifactRefId: null,
            latestCheckRunId: null,
            latestCompletedAt: null,
            latestFailureCode: null,
            latestSummary: null,
            required: true,
            state: "queued"
          },
          {
            applicability: "required",
            checkKind: "compile",
            latestArtifactRefId: null,
            latestCheckRunId: null,
            latestCompletedAt: null,
            latestFailureCode: null,
            latestSummary: null,
            required: true,
            state: "running"
          }
        ],
        createdAt: "2026-04-01T00:00:00.000Z",
        mathQuestionId: "question-123",
        mathQuestionRevisionId: "revision-5",
        mathSubmissionId: "submission-9",
        profile: {
          equivalenceExpectation: "not_applicable",
          leanSubmissionKind: "lean_proof_submission",
          targetDeclarationName: null,
          targetLaneId: null,
          targetModuleName: null
        },
        reviewGates: [
          {
            gateKind: "peer_review",
            rationale: null,
            source: "default_policy",
            state: "required",
            updatedAt: null,
            updatedByUserId: null
          },
          {
            gateKind: "peer_review",
            rationale: "duplicate",
            source: "human_reviewer",
            state: "blocked",
            updatedAt: "2026-04-01T00:00:00.000Z",
            updatedByUserId: "user-9"
          }
        ],
        updatedAt: "2026-04-01T00:00:00.000Z"
      }).success
    ).toBeFalse();
  });

  it("rejects contradictory automation check applicability and state combinations", () => {
    expect(
      mathLeanSubmissionDetailSchema.safeParse({
        artifacts: [],
        checks: [
          {
            applicability: "not_applicable",
            checkKind: "equivalence",
            latestArtifactRefId: null,
            latestCheckRunId: null,
            latestCompletedAt: "2026-04-01T00:00:00.000Z",
            latestFailureCode: null,
            latestSummary: null,
            required: true,
            state: "passed"
          }
        ],
        createdAt: "2026-04-01T00:00:00.000Z",
        mathQuestionId: "question-123",
        mathQuestionRevisionId: "revision-5",
        mathSubmissionId: "submission-9",
        profile: {
          equivalenceExpectation: "not_applicable",
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

  it("rejects automation checks whose required flag disagrees with applicability", () => {
    expect(
      mathLeanSubmissionDetailSchema.safeParse({
        artifacts: [],
        checks: [
          {
            applicability: "optional",
            checkKind: "compile",
            latestArtifactRefId: null,
            latestCheckRunId: null,
            latestCompletedAt: null,
            latestFailureCode: null,
            latestSummary: null,
            required: true,
            state: "queued"
          }
        ],
        createdAt: "2026-04-01T00:00:00.000Z",
        mathQuestionId: "question-123",
        mathQuestionRevisionId: "revision-5",
        mathSubmissionId: "submission-9",
        profile: {
          equivalenceExpectation: "not_applicable",
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

  it("rejects equivalence checks that contradict the submission profile target posture", () => {
    expect(
      mathLeanSubmissionDetailSchema.safeParse({
        artifacts: [],
        checks: [
          {
            applicability: "required",
            checkKind: "equivalence",
            latestArtifactRefId: null,
            latestCheckRunId: null,
            latestCompletedAt: null,
            latestFailureCode: null,
            latestSummary: null,
            required: true,
            state: "queued"
          }
        ],
        createdAt: "2026-04-01T00:00:00.000Z",
        mathQuestionId: "question-123",
        mathQuestionRevisionId: "revision-5",
        mathSubmissionId: "submission-9",
        profile: {
          equivalenceExpectation: "not_applicable",
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
