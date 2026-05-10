export const mathReviewSubjectTypes = [
  "question_revision",
  "submission",
  "package_candidate"
] as const;

export type MathReviewSubjectType = (typeof mathReviewSubjectTypes)[number];

export const mathReviewKinds = ["triage", "peer", "editor", "release"] as const;

export type MathReviewKind = (typeof mathReviewKinds)[number];

export const mathReviewQueues = [
  "assigned",
  "triage",
  "peer",
  "editor",
  "release",
  "escalated"
] as const;

export type MathReviewQueue = (typeof mathReviewQueues)[number];

export const mathReviewPostures = [
  "open",
  "decided",
  "escalated",
  "superseded"
] as const;

export type MathReviewPosture = (typeof mathReviewPostures)[number];

export const mathReviewRoundPostures = ["open", "closed", "superseded"] as const;

export type MathReviewRoundPosture = (typeof mathReviewRoundPostures)[number];

export const mathReviewAssignmentRoles = [
  "primary",
  "secondary",
  "observer"
] as const;

export type MathReviewAssignmentRole = (typeof mathReviewAssignmentRoles)[number];

export const mathReviewAssignmentStates = [
  "active",
  "reassigned",
  "recused",
  "abandoned",
  "completed"
] as const;

export type MathReviewAssignmentState =
  (typeof mathReviewAssignmentStates)[number];

export const mathReviewChecklistFamilies = [
  "triage_readiness",
  "peer_correctness",
  "editor_policy_and_quality",
  "release_readiness"
] as const;

export type MathReviewChecklistFamily =
  (typeof mathReviewChecklistFamilies)[number];

export const mathReviewChecklistItemStates = [
  "open",
  "satisfied",
  "blocked",
  "not_applicable"
] as const;

export type MathReviewChecklistItemState =
  (typeof mathReviewChecklistItemStates)[number];

export const mathReviewDecisionOutcomes = [
  "routed_to_peer_review",
  "routed_to_editor_review",
  "routed_to_release_decision",
  "incomplete",
  "approved_for_editor_review",
  "approved_for_release_decision",
  "changes_requested",
  "rejected",
  "hold_for_policy",
  "approved_internal_only",
  "holdout",
  "deferred",
  "publish_ready",
  "escalated",
  "withdrawn",
  "invalid",
  "superseded"
] as const;

export type MathReviewDecisionOutcome =
  (typeof mathReviewDecisionOutcomes)[number];

export type MathReviewChecklistSummary = {
  blocked: number;
  completed: number;
  total: number;
};

export type MathReviewGateSummary = {
  label: string;
  state: "clear" | "blocked" | "missing" | "stale";
};

export type MathReviewCommentSummary = {
  total: number;
  unresolved: number;
};

export type MathReviewCapabilitySet = {
  canApplyAdminOverride: boolean;
  canAssignPrimary: boolean;
  canComment: boolean;
  canEscalate: boolean;
  canReassignPrimary: boolean;
  canRecordDecision: boolean;
  canResolveComment: boolean;
  canSelfAssign: boolean;
  canUpdateChecklist: boolean;
};

export type MathReviewQueueItem = {
  checklistSummary: MathReviewChecklistSummary;
  commentSummary: MathReviewCommentSummary;
  gateSummary: MathReviewGateSummary;
  href: string;
  primaryAssigneeDisplayName: string | null;
  reviewId: string;
  reviewKind: MathReviewKind;
  roundNumber: number;
  subjectId: string;
  subjectLabel: string;
  subjectPosture: string;
  subjectType: MathReviewSubjectType;
  tags: string[];
  updatedAt: string;
};

export type MathReviewQueueResponse = {
  generatedAt: string;
  items: MathReviewQueueItem[];
  queue: MathReviewQueue;
};

export type MathReviewAssignment = {
  assignedAt: string;
  assignmentRole: MathReviewAssignmentRole;
  assigneeDisplayName: string | null;
  closeReason: string | null;
  state: MathReviewAssignmentState;
};

export type MathReviewChecklistItem = {
  id: string;
  family: MathReviewChecklistFamily;
  label: string;
  rationale: string | null;
  required: boolean;
  state: MathReviewChecklistItemState;
  updatedAt: string | null;
  updatedByDisplayName: string | null;
};

export type MathReviewLineAnchor = {
  anchorType: "line";
  artifactRole: string;
  endLine: number;
  mathArtifactRefId: string | null;
  path: string;
  startLine: number;
};

export type MathReviewFieldAnchor = {
  anchorType: "field";
  field: string;
};

export type MathReviewChecklistAnchor = {
  anchorType: "checklist_item";
  checklistItemId: string;
};

export type MathReviewCommentAnchor =
  | MathReviewChecklistAnchor
  | MathReviewFieldAnchor
  | MathReviewLineAnchor;

export type MathReviewCommentReply = {
  authorDisplayName: string;
  body: string;
  createdAt: string;
  id: string;
};

export type MathReviewCommentThread = {
  anchor: MathReviewCommentAnchor;
  authorDisplayName: string;
  body: string;
  createdAt: string;
  id: string;
  replies: MathReviewCommentReply[];
  state: "open" | "resolved";
};

export type MathReviewRound = {
  assignments: MathReviewAssignment[];
  decisionOutcome: MathReviewDecisionOutcome | null;
  decisionSummary: string | null;
  openedAt: string;
  posture: MathReviewRoundPosture;
  roundNumber: number;
};

export type MathReviewSourceArtifact = {
  availability: "available" | "missing" | "quarantined" | "too_large";
  artifactRole: string;
  content: string | null;
  language: "lean" | "text";
  lineCount: number;
  mathArtifactRefId: string | null;
  path: string;
  reason: string | null;
};

export type MathReviewRecordDetail = {
  activeRound: MathReviewRound;
  capabilities: MathReviewCapabilitySet;
  checklistItems: MathReviewChecklistItem[];
  comments: MathReviewCommentThread[];
  generatedAt: string;
  reviewId: string;
  reviewKind: MathReviewKind;
  reviewPosture: MathReviewPosture;
  sourceArtifact: MathReviewSourceArtifact;
  subjectId: string;
  subjectLabel: string;
  subjectPosture: string;
  subjectSummary: string;
  subjectType: MathReviewSubjectType;
};

export type MathReviewDecisionInput = {
  outcome: MathReviewDecisionOutcome;
  rationale: string;
};

export type MathReviewMutationResponse = {
  detail: MathReviewRecordDetail;
  ok: true;
};
