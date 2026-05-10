export const mathQuestionPostures = [
  "draft",
  "active",
  "superseded",
  "withdrawn"
] as const;

export type MathQuestionPosture = (typeof mathQuestionPostures)[number];

export const mathQuestionRevisionPostures = [
  "draft",
  "reviewable",
  "accepted",
  "rejected",
  "superseded",
  "withdrawn"
] as const;

export type MathQuestionRevisionPosture =
  (typeof mathQuestionRevisionPostures)[number];

export const mathSubmissionPostures = [
  "draft",
  "submitted",
  "automation_complete",
  "human_review_required",
  "accepted",
  "rejected",
  "withdrawn",
  "superseded"
] as const;

export type MathSubmissionPosture = (typeof mathSubmissionPostures)[number];

export const mathAutomationSummaryPostures = [
  "not_requested",
  "pending",
  "passed",
  "failed",
  "requires_review",
  "superseded"
] as const;

export type MathAutomationSummaryPosture =
  (typeof mathAutomationSummaryPostures)[number];

export const mathArtifactSubjectTypes = [
  "question_revision",
  "submission"
] as const;

export type MathArtifactSubjectType = (typeof mathArtifactSubjectTypes)[number];

export const mathArtifactBackingTypes = [
  "uploaded_artifact",
  "generated_artifact",
  "repo_linked_reference"
] as const;

export type MathArtifactBackingType = (typeof mathArtifactBackingTypes)[number];

export const mathReviewSubjectTypes = [
  "question_revision",
  "submission",
  "package_candidate"
] as const;

export type MathReviewSubjectType = (typeof mathReviewSubjectTypes)[number];

export const mathReviewKinds = [
  "triage",
  "peer_review",
  "editor_review",
  "release_decision"
] as const;

export type MathReviewKind = (typeof mathReviewKinds)[number];

export const mathReviewRecordPostures = [
  "open",
  "decided",
  "superseded",
  "closed"
] as const;

export type MathReviewRecordPosture = (typeof mathReviewRecordPostures)[number];

export const mathReviewRoundPostures = [
  "open",
  "decided",
  "superseded",
  "closed"
] as const;

export type MathReviewRoundPosture = (typeof mathReviewRoundPostures)[number];

export const mathReviewAssignmentRoles = [
  "primary",
  "secondary",
  "observer"
] as const;

export type MathReviewAssignmentRole = (typeof mathReviewAssignmentRoles)[number];

export const mathReviewAssignmentStates = [
  "active",
  "completed",
  "recused",
  "reassigned",
  "cancelled"
] as const;

export type MathReviewAssignmentState =
  (typeof mathReviewAssignmentStates)[number];

export const mathReviewChecklistStates = [
  "open",
  "satisfied",
  "blocked",
  "waived",
  "not_applicable"
] as const;

export type MathReviewChecklistState = (typeof mathReviewChecklistStates)[number];

export const mathPackageCandidateSourceTypes = [
  "question_revision",
  "submission"
] as const;

export type MathPackageCandidateSourceType =
  (typeof mathPackageCandidateSourceTypes)[number];

export const mathPackageCandidatePostures = [
  "proposed",
  "review_ready",
  "repo_synced",
  "frozen",
  "version_linked",
  "release_linked",
  "rejected",
  "superseded",
  "withdrawn"
] as const;

export type MathPackageCandidatePosture =
  (typeof mathPackageCandidatePostures)[number];

export const mathReleaseLinkPostures = [
  "planned",
  "version_linked",
  "release_linked",
  "published",
  "withdrawn"
] as const;

export type MathReleaseLinkPosture = (typeof mathReleaseLinkPostures)[number];

export type MathWorkflowCatalogEntry<TId extends string> = {
  id: TId;
  summary: string;
};
