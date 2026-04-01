import { describe, expect, it } from "bun:test";
import {
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
});
