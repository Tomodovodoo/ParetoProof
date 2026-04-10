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

export type MathLeanSubmissionProfile = {
  equivalenceExpectation: LeanEquivalenceExpectation;
  leanSubmissionKind: LeanSubmissionKind;
  targetDeclarationName: string | null;
  targetLaneId: string | null;
  targetModuleName: string | null;
};

export type MathLeanArtifactRef = {
  artifactId: string | null;
  artifactRole: LeanArtifactRole;
  contentDigest: string | null;
  filename: string;
  lifecycleStage: LeanArtifactLifecycleStage;
  mediaType: string | null;
  ownerScope: LeanArtifactOwnerScope;
  pathHint: string | null;
};

export type MathLeanAutomationCheckStatus = {
  applicability: LeanAutomationCheckApplicability;
  checkKind: LeanAutomationCheckKind;
  latestArtifactRefId: string | null;
  latestCheckRunId: string | null;
  latestCompletedAt: string | null;
  latestFailureCode: string | null;
  latestSummary: string | null;
  required: boolean;
  state: LeanAutomationCheckState;
};

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

export type MathLeanSubmissionCreateInput = {
  equivalenceExpectation: LeanEquivalenceExpectation;
  leanSubmissionKind: LeanSubmissionKind;
  mathQuestionId: string;
  mathQuestionRevisionId: string;
  targetDeclarationName?: string | null;
  targetLaneId?: string | null;
  targetModuleName?: string | null;
};

export type MathLeanSubmissionPatchInput = {
  equivalenceExpectation?: LeanEquivalenceExpectation;
  targetDeclarationName?: string | null;
  targetLaneId?: string | null;
  targetModuleName?: string | null;
};

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
