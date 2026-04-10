export type LeanSubmissionKind =
  | "lean_proof_submission"
  | "lean_formalization_submission"
  | "lean_repair_submission";

export type LeanArtifactRole =
  | "statement_source"
  | "supporting_lean_module"
  | "submission_entrypoint"
  | "compile_output"
  | "compile_diagnostics"
  | "verifier_output"
  | "equivalence_report"
  | "review_attachment";

export type LeanArtifactOwnerScope = "question_revision" | "submission";

export type LeanArtifactLifecycleStage =
  | "question_source"
  | "submission_input"
  | "generated"
  | "review_support";

export type LeanAutomationCheckKind = "compile" | "verifier" | "equivalence";

export type LeanAutomationCheckState =
  | "not_requested"
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "errored"
  | "cancelled"
  | "superseded";

export type LeanAutomationCheckApplicability =
  | "required"
  | "optional"
  | "not_applicable";

export type LeanReviewGateKind =
  | "peer_review"
  | "editor_review"
  | "provenance_review"
  | "policy_review";

export type LeanReviewGateState =
  | "required"
  | "satisfied"
  | "waived"
  | "blocked";

export type LeanReviewGateSource =
  | "default_policy"
  | "automation"
  | "human_reviewer"
  | "admin_override";

export type LeanEquivalenceExpectation =
  | "not_applicable"
  | "canonical_statement"
  | "prior_submission";

export type LeanSubmissionKindCatalogEntry = {
  defaultApplicableCheckKinds: LeanAutomationCheckKind[];
  defaultRequiredReviewGates: LeanReviewGateKind[];
  id: LeanSubmissionKind;
  optionalInputArtifactRoles: LeanArtifactRole[];
  requiredInputArtifactRoles: LeanArtifactRole[];
  summary: string;
};

export type LeanArtifactRoleCatalogEntry = {
  id: LeanArtifactRole;
  lifecycleStage: LeanArtifactLifecycleStage;
  ownerScope: LeanArtifactOwnerScope;
  summary: string;
};

export type LeanAutomationCheckCatalogEntry = {
  generatedArtifactRoles: LeanArtifactRole[];
  id: LeanAutomationCheckKind;
  summary: string;
};

export type LeanReviewGateCatalogEntry = {
  id: LeanReviewGateKind;
  summary: string;
};

type MathLeanUntargetedSubmissionProfile = {
  equivalenceExpectation: "not_applicable";
  leanSubmissionKind: "lean_proof_submission" | "lean_formalization_submission";
  targetDeclarationName: null;
  targetLaneId: null;
  targetModuleName: null;
};

type MathLeanTargetedSubmissionProfile = {
  equivalenceExpectation: "canonical_statement" | "prior_submission";
  leanSubmissionKind: LeanSubmissionKind;
  targetDeclarationName: string;
  targetLaneId: string | null;
  targetModuleName: string;
};

export type MathLeanSubmissionStoredProfile = {
  equivalenceExpectation: LeanEquivalenceExpectation;
  leanSubmissionKind: LeanSubmissionKind;
  targetDeclarationName: string | null;
  targetLaneId: string | null;
  targetModuleName: string | null;
};

export type MathLeanSubmissionProfile =
  | MathLeanUntargetedSubmissionProfile
  | MathLeanTargetedSubmissionProfile;

type MathLeanBaseArtifactRef = {
  artifactId: string | null;
  contentDigest: string | null;
  filename: string;
  mediaType: string | null;
  pathHint: string | null;
};

type MathLeanQuestionSourceArtifactRef = MathLeanBaseArtifactRef & {
  artifactRole: "statement_source";
  lifecycleStage: "question_source";
  ownerScope: "question_revision";
};

type MathLeanSubmissionInputArtifactRef = MathLeanBaseArtifactRef & {
  artifactRole: "supporting_lean_module" | "submission_entrypoint";
  lifecycleStage: "submission_input";
  ownerScope: "submission";
};

type MathLeanGeneratedArtifactRef = MathLeanBaseArtifactRef & {
  artifactRole:
    | "compile_output"
    | "compile_diagnostics"
    | "verifier_output"
    | "equivalence_report";
  lifecycleStage: "generated";
  ownerScope: "submission";
};

type MathLeanReviewAttachmentArtifactRef = MathLeanBaseArtifactRef & {
  artifactRole: "review_attachment";
  lifecycleStage: "review_support";
  ownerScope: "submission";
};

export type MathLeanArtifactRef =
  | MathLeanQuestionSourceArtifactRef
  | MathLeanSubmissionInputArtifactRef
  | MathLeanGeneratedArtifactRef
  | MathLeanReviewAttachmentArtifactRef;

type MathLeanAutomationCheckStatusBase = {
  checkKind: LeanAutomationCheckKind;
  latestArtifactRefId: string | null;
  latestCheckRunId: string | null;
  latestCompletedAt: string | null;
  latestFailureCode: string | null;
  latestSummary: string | null;
};

type MathLeanRequiredAutomationCheckStatus = MathLeanAutomationCheckStatusBase & {
  applicability: "required";
  required: true;
  state: LeanAutomationCheckState;
};

type MathLeanOptionalAutomationCheckStatus = MathLeanAutomationCheckStatusBase & {
  applicability: "optional";
  required: false;
  state: LeanAutomationCheckState;
};

type MathLeanNotApplicableAutomationCheckStatus = {
  applicability: "not_applicable";
  checkKind: LeanAutomationCheckKind;
  latestArtifactRefId: null;
  latestCheckRunId: null;
  latestCompletedAt: null;
  latestFailureCode: null;
  latestSummary: null;
  required: false;
  state: "not_requested";
};

export type MathLeanAutomationCheckStatus =
  | MathLeanRequiredAutomationCheckStatus
  | MathLeanOptionalAutomationCheckStatus
  | MathLeanNotApplicableAutomationCheckStatus;

type MathLeanResolvedReviewGateStatus = {
  gateKind: LeanReviewGateKind;
  rationale: string | null;
  source: LeanReviewGateSource;
  state: "required" | "satisfied";
  updatedAt: string | null;
  updatedByUserId: string | null;
};

type MathLeanExplainedReviewGateStatus = {
  gateKind: LeanReviewGateKind;
  rationale: string;
  source: LeanReviewGateSource;
  state: "waived" | "blocked";
  updatedAt: string | null;
  updatedByUserId: string | null;
};

export type MathLeanReviewGateStatus =
  | MathLeanResolvedReviewGateStatus
  | MathLeanExplainedReviewGateStatus;

export type MathLeanSubmissionDetail = {
  artifacts: MathLeanArtifactRef[];
  checks: MathLeanAutomationCheckStatus[];
  createdAt: string;
  mathQuestionId: string;
  mathQuestionRevisionId: string;
  mathSubmissionId: string;
  profile: MathLeanSubmissionProfile;
  reviewGates: MathLeanReviewGateStatus[];
  updatedAt: string;
};

type MathLeanUntargetedSubmissionCreateInput = {
  equivalenceExpectation: "not_applicable";
  leanSubmissionKind: "lean_proof_submission" | "lean_formalization_submission";
  mathQuestionId: string;
  mathQuestionRevisionId: string;
  targetDeclarationName?: null;
  targetLaneId?: null;
  targetModuleName?: null;
};

type MathLeanTargetedSubmissionCreateInput = {
  equivalenceExpectation: "canonical_statement" | "prior_submission";
  leanSubmissionKind: LeanSubmissionKind;
  mathQuestionId: string;
  mathQuestionRevisionId: string;
  targetDeclarationName: string;
  targetLaneId?: string | null;
  targetModuleName: string;
};

export type MathLeanSubmissionCreateInput =
  | MathLeanUntargetedSubmissionCreateInput
  | MathLeanTargetedSubmissionCreateInput;

type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Keys extends keyof T
  ? Required<Pick<T, Keys>> & Partial<Omit<T, Keys>>
  : never;

type MathLeanUntargetedSubmissionPatchInput = RequireAtLeastOne<{
  equivalenceExpectation: "not_applicable";
  targetDeclarationName?: null;
  targetLaneId?: null;
  targetModuleName?: null;
}>;

type MathLeanFieldOnlySubmissionPatchInput = RequireAtLeastOne<{
  equivalenceExpectation?: never;
  targetDeclarationName?: string | null;
  targetLaneId?: string | null;
  targetModuleName?: string | null;
}>;

type MathLeanTargetedSubmissionPatchInput = RequireAtLeastOne<{
  equivalenceExpectation: "canonical_statement" | "prior_submission";
  targetDeclarationName?: string;
  targetLaneId?: string | null;
  targetModuleName?: string;
}>;

export type MathLeanSubmissionPatchInput =
  | MathLeanUntargetedSubmissionPatchInput
  | MathLeanFieldOnlySubmissionPatchInput
  | MathLeanTargetedSubmissionPatchInput;

export type MathLeanAutomationEnqueueInput = {
  forceRerun?: boolean;
};

type MathLeanResolvedReviewGateUpdateInput = {
  rationale?: string | null;
  state: "required" | "satisfied";
};

type MathLeanExplainedReviewGateUpdateInput = {
  rationale: string;
  state: "waived" | "blocked";
};

export type MathLeanReviewGateUpdateInput =
  | MathLeanResolvedReviewGateUpdateInput
  | MathLeanExplainedReviewGateUpdateInput;
