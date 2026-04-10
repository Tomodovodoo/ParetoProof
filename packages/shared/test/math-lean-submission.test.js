import { describe, expect, it } from "bun:test";
import {
  applyMathLeanSubmissionProfileUpdate,
  defaultLeanReviewGateMatrixBySubmissionKind,
  getApplicableLeanAutomationChecks,
  getGeneratedLeanArtifactRolesForCheckKind,
  getRequiredLeanInputArtifactRoles,
  isLeanArtifactRoleAllowedForSubmissionKind,
  leanSubmissionKindCatalog,
  mathLeanSubmissionContract
} from "../dist/index.js";

describe("math lean submission contracts", () => {
  it("defines a narrow Lean submission kind catalog", () => {
    expect(leanSubmissionKindCatalog.map((entry) => entry.id)).toEqual([
      "lean_proof_submission",
      "lean_formalization_submission",
      "lean_repair_submission"
    ]);
  });

  it("exposes default checks and gates per submission kind", () => {
    expect(getApplicableLeanAutomationChecks("lean_proof_submission")).toEqual([
      "compile",
      "verifier",
      "equivalence"
    ]);
    expect(defaultLeanReviewGateMatrixBySubmissionKind.lean_formalization_submission).toEqual([
      "peer_review",
      "editor_review",
      "provenance_review",
      "policy_review"
    ]);
  });

  it("limits allowed input artifact roles to input-only roles", () => {
    expect(getRequiredLeanInputArtifactRoles("lean_repair_submission")).toEqual([
      "submission_entrypoint"
    ]);
    expect(
      isLeanArtifactRoleAllowedForSubmissionKind(
        "lean_proof_submission",
        "compile_output"
      )
    ).toBeFalse();
    expect(
      isLeanArtifactRoleAllowedForSubmissionKind(
        "lean_proof_submission",
        "supporting_lean_module"
      )
    ).toBeTrue();
  });

  it("maps generated artifact roles by automation check kind", () => {
    expect(getGeneratedLeanArtifactRolesForCheckKind("compile")).toEqual([
      "compile_output",
      "compile_diagnostics"
    ]);
    expect(getGeneratedLeanArtifactRolesForCheckKind("equivalence")).toEqual([
      "equivalence_report"
    ]);
  });

  it("exposes the core submission schemas through the shared contract", () => {
    expect(
      mathLeanSubmissionContract.submissionCreateInput.safeParse({
        equivalenceExpectation: "not_applicable",
        leanSubmissionKind: "lean_formalization_submission",
        mathQuestionId: "question-1",
        mathQuestionRevisionId: "revision-1"
      }).success
    ).toBeTrue();
  });

  it("exposes sparse patch validation through the shared contract", () => {
    expect(
      mathLeanSubmissionContract.submissionPatchInput.safeParse({
        equivalenceExpectation: "canonical_statement"
      }).success
    ).toBeTrue();
    expect(
      mathLeanSubmissionContract.submissionPatchInput.safeParse({
        equivalenceExpectation: "prior_submission"
      }).success
    ).toBeTrue();
  });

  it("validates merged Lean submission profile updates against the full profile invariants", () => {
    expect(() =>
      applyMathLeanSubmissionProfileUpdate(
        {
          equivalenceExpectation: "not_applicable",
          leanSubmissionKind: "lean_proof_submission",
          targetDeclarationName: null,
          targetLaneId: null,
          targetModuleName: null
        },
        {
          equivalenceExpectation: "canonical_statement"
        }
      )
    ).toThrow();

    expect(() =>
      applyMathLeanSubmissionProfileUpdate(
        {
          equivalenceExpectation: "canonical_statement",
          leanSubmissionKind: "lean_proof_submission",
          targetDeclarationName: "FirstProof.Problem9.problem9",
          targetLaneId: null,
          targetModuleName: "FirstProof.Problem9.Candidate"
        },
        {
          targetModuleName: null
        }
      )
    ).toThrow();

    expect(
      applyMathLeanSubmissionProfileUpdate(
        {
          equivalenceExpectation: "canonical_statement",
          leanSubmissionKind: "lean_proof_submission",
          targetDeclarationName: "FirstProof.Problem9.problem9",
          targetLaneId: null,
          targetModuleName: "FirstProof.Problem9.Candidate"
        },
        {
          equivalenceExpectation: "prior_submission"
        }
      )
    ).toEqual({
      equivalenceExpectation: "prior_submission",
      leanSubmissionKind: "lean_proof_submission",
      targetDeclarationName: "FirstProof.Problem9.problem9",
      targetLaneId: null,
      targetModuleName: "FirstProof.Problem9.Candidate"
    });
  });

  it("allows sparse targeted patches when the stored profile already has a valid target", () => {
    expect(
      applyMathLeanSubmissionProfileUpdate(
        {
          equivalenceExpectation: "canonical_statement",
          leanSubmissionKind: "lean_proof_submission",
          targetDeclarationName: "FirstProof.Problem9.problem9",
          targetLaneId: null,
          targetModuleName: "FirstProof.Problem9.Candidate"
        },
        {
          equivalenceExpectation: "prior_submission"
        }
      )
    ).toEqual({
      equivalenceExpectation: "prior_submission",
      leanSubmissionKind: "lean_proof_submission",
      targetDeclarationName: "FirstProof.Problem9.problem9",
      targetLaneId: null,
      targetModuleName: "FirstProof.Problem9.Candidate"
    });
  });

  it("still rejects targetless targeted-equivalence updates after merging with an invalid stored profile", () => {
    expect(() =>
      applyMathLeanSubmissionProfileUpdate(
        {
          equivalenceExpectation: "canonical_statement",
          leanSubmissionKind: "lean_proof_submission",
          targetDeclarationName: null,
          targetLaneId: null,
          targetModuleName: null
        },
        {
          equivalenceExpectation: "prior_submission"
        }
      )
    ).toThrow();
  });

  it("can repair a legacy invalid profile when the patch supplies the missing target fields", () => {
    expect(
      applyMathLeanSubmissionProfileUpdate(
        {
          equivalenceExpectation: "canonical_statement",
          leanSubmissionKind: "lean_proof_submission",
          targetDeclarationName: null,
          targetLaneId: null,
          targetModuleName: null
        },
        {
          equivalenceExpectation: "canonical_statement",
          targetDeclarationName: "FirstProof.Problem9.problem9",
          targetModuleName: "FirstProof.Problem9.Candidate"
        }
      )
    ).toEqual({
      equivalenceExpectation: "canonical_statement",
      leanSubmissionKind: "lean_proof_submission",
      targetDeclarationName: "FirstProof.Problem9.problem9",
      targetLaneId: null,
      targetModuleName: "FirstProof.Problem9.Candidate"
    });
  });
});
