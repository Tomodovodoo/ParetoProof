import {
  mathReviewDecisionInputSchema,
  mathReviewMutationResponseSchema,
  mathReviewQueueResponseSchema,
  mathReviewRecordDetailSchema
} from "../schemas/math-review.js";
import type {
  MathReviewDecisionOutcome,
  MathReviewKind,
  MathReviewQueue,
  MathReviewSubjectType
} from "../types/math-review.js";

export const mathReviewQueueTabs = [
  {
    id: "assigned",
    label: "Assigned to me",
    summary: "Open review rounds where the current user is an active assignee."
  },
  {
    id: "triage",
    label: "Triage",
    summary: "Readiness routing before substantive review begins."
  },
  {
    id: "peer",
    label: "Peer review",
    summary: "Substantive review for math submissions."
  },
  {
    id: "editor",
    label: "Editor review",
    summary: "Benchmark policy, clarity, and package-readiness review."
  },
  {
    id: "release",
    label: "Release decision",
    summary: "Package-candidate readiness before downstream freeze work."
  },
  {
    id: "escalated",
    label: "Escalated",
    summary: "Review rounds blocked on conflict, policy, or admin handling."
  }
] satisfies Array<{
  id: MathReviewQueue;
  label: string;
  summary: string;
}>;

export const mathReviewKindsBySubjectType = {
  package_candidate: ["triage", "release"],
  question_revision: ["triage", "editor"],
  submission: ["triage", "peer", "editor"]
} as const satisfies Record<MathReviewSubjectType, readonly MathReviewKind[]>;

export const mathReviewDecisionOutcomesByKind = {
  editor: [
    "approved_for_release_decision",
    "changes_requested",
    "rejected",
    "hold_for_policy",
    "escalated",
    "withdrawn",
    "invalid",
    "superseded"
  ],
  peer: [
    "approved_for_editor_review",
    "changes_requested",
    "rejected",
    "escalated",
    "withdrawn",
    "invalid",
    "superseded"
  ],
  release: [
    "approved_internal_only",
    "holdout",
    "deferred",
    "publish_ready",
    "escalated",
    "rejected",
    "withdrawn",
    "invalid",
    "superseded"
  ],
  triage: [
    "routed_to_peer_review",
    "routed_to_editor_review",
    "routed_to_release_decision",
    "incomplete",
    "withdrawn",
    "invalid",
    "escalated"
  ]
} as const satisfies Record<MathReviewKind, readonly MathReviewDecisionOutcome[]>;

export function isMathReviewKindAllowedForSubject(
  subjectType: MathReviewSubjectType,
  reviewKind: MathReviewKind
) {
  const allowedKinds = mathReviewKindsBySubjectType[subjectType] as readonly MathReviewKind[];
  return allowedKinds.includes(reviewKind);
}

export function getMathReviewDecisionOutcomes(reviewKind: MathReviewKind) {
  return [...mathReviewDecisionOutcomesByKind[reviewKind]];
}

export const mathReviewContract = {
  decisionInput: mathReviewDecisionInputSchema,
  mutationResponse: mathReviewMutationResponseSchema,
  queueResponse: mathReviewQueueResponseSchema,
  recordDetail: mathReviewRecordDetailSchema
};
