import {
  mathReviewQueueResponseSchema,
  mathReviewRecordDetailSchema,
  type MathReviewQueue,
  type MathReviewQueueResponse,
  type MathReviewRecordDetail
} from "@paretoproof/shared";

const generatedAt = "2026-05-10T12:00:00.000Z";

const baseCapabilities = {
  canApplyAdminOverride: false,
  canAssignPrimary: false,
  canComment: true,
  canEscalate: false,
  canReassignPrimary: false,
  canRecordDecision: false,
  canResolveComment: true,
  canSelfAssign: false,
  canUpdateChecklist: true
};

const problem9LeanSource = `import Mathlib

theorem problem9_candidate
    (a b c : Nat)
    (h : a + b = c) :
    c = b + a := by
  rw [<-h]
  exact Nat.add_comm a b`;

const rawReviewDetails = [
  {
    activeRound: {
      assignments: [
        {
          assignedAt: "2026-05-09T18:20:00.000Z",
          assignmentRole: "primary",
          assigneeDisplayName: "Ada Lovelace",
          closeReason: null,
          state: "active"
        },
        {
          assignedAt: "2026-05-09T18:24:00.000Z",
          assignmentRole: "observer",
          assigneeDisplayName: "Grace Hopper",
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
      ...baseCapabilities,
      canEscalate: true,
      canRecordDecision: true
    },
    checklistItems: [
      {
        family: "peer_correctness",
        id: "peer-addresses-target",
        label: "Submission addresses the targeted question revision",
        rationale: null,
        required: true,
        state: "satisfied",
        updatedAt: "2026-05-09T19:00:00.000Z",
        updatedByDisplayName: "Ada Lovelace"
      },
      {
        family: "peer_correctness",
        id: "peer-automation-current",
        label: "Reviewer-visible automation evidence is current",
        rationale: "Compile passed, verifier output still needs a reviewer read.",
        required: true,
        state: "open",
        updatedAt: "2026-05-09T19:05:00.000Z",
        updatedByDisplayName: "Ada Lovelace"
      },
      {
        family: "peer_correctness",
        id: "peer-correctness-blockers",
        label: "Correctness blockers are fixed, rejected, or escalated",
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
        body: "The rewrite is promising, but the final equality should be checked against the canonical theorem statement before editor handoff.",
        createdAt: "2026-05-09T19:10:00.000Z",
        id: "comment-peer-line-1",
        replies: [
          {
            authorDisplayName: "Grace Hopper",
            body: "Verifier output agrees on the surface equality; I left the gate open for the final human read.",
            createdAt: "2026-05-09T19:18:00.000Z",
            id: "reply-peer-line-1"
          }
        ],
        state: "open"
      }
    ],
    generatedAt,
    reviewId: "review-peer-problem9-submission",
    reviewKind: "peer",
    reviewPosture: "open",
    sourceArtifact: {
      artifactRole: "submission_entrypoint",
      availability: "available",
      content: problem9LeanSource,
      language: "lean",
      lineCount: problem9LeanSource.split(/\r?\n/u).length,
      mathArtifactRefId: "artifact-problem9-candidate",
      path: "FirstProof/Problem9/Candidate.lean",
      reason: null
    },
    subjectId: "submission-problem9-candidate",
    subjectLabel: "Problem 9 Lean proof submission",
    subjectPosture: "human-review-required",
    subjectSummary:
      "Lean proof submission targeting the accepted Problem 9 question revision.",
    subjectType: "submission"
  },
  {
    activeRound: {
      assignments: [],
      decisionOutcome: null,
      decisionSummary: null,
      openedAt: "2026-05-09T17:40:00.000Z",
      posture: "open",
      roundNumber: 1
    },
    capabilities: {
      ...baseCapabilities,
      canComment: false,
      canSelfAssign: true,
      canUpdateChecklist: false
    },
    checklistItems: [
      {
        family: "triage_readiness",
        id: "triage-artifacts-present",
        label: "Required artifacts and metadata are attached",
        rationale: "Statement source is present; equivalence output is missing.",
        required: true,
        state: "blocked",
        updatedAt: "2026-05-09T17:45:00.000Z",
        updatedByDisplayName: "System"
      },
      {
        family: "triage_readiness",
        id: "triage-automation-current",
        label: "Latest automation evidence is present and current",
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
          anchorType: "field",
          field: "automation_summary"
        },
        authorDisplayName: "System",
        body: "Equivalence evidence is missing, so this item should stay in triage until #895-backed automation is available or explicitly escalated.",
        createdAt: "2026-05-09T17:45:00.000Z",
        id: "comment-triage-automation",
        replies: [],
        state: "open"
      }
    ],
    generatedAt,
    reviewId: "review-triage-formalization",
    reviewKind: "triage",
    reviewPosture: "open",
    sourceArtifact: {
      artifactRole: "statement_source",
      availability: "missing",
      content: null,
      language: "text",
      lineCount: 0,
      mathArtifactRefId: null,
      path: "QuestionRevision/Statement.lean",
      reason: "Statement source has not been materialized into review storage."
    },
    subjectId: "submission-formalization-draft",
    subjectLabel: "Formalization submission readiness",
    subjectPosture: "submitted",
    subjectSummary:
      "Triage is checking whether the formalization submission has enough evidence for peer review.",
    subjectType: "submission"
  },
  {
    activeRound: {
      assignments: [
        {
          assignedAt: "2026-05-09T16:15:00.000Z",
          assignmentRole: "primary",
          assigneeDisplayName: "Nicolas Bourbaki",
          closeReason: null,
          state: "active"
        }
      ],
      decisionOutcome: null,
      decisionSummary: null,
      openedAt: "2026-05-09T16:15:00.000Z",
      posture: "open",
      roundNumber: 2
    },
    capabilities: {
      ...baseCapabilities,
      canApplyAdminOverride: true,
      canAssignPrimary: true,
      canEscalate: true,
      canReassignPrimary: true,
      canRecordDecision: true
    },
    checklistItems: [
      {
        family: "release_readiness",
        id: "release-provenance",
        label: "Package-candidate provenance and traceability are complete",
        rationale: null,
        required: true,
        state: "satisfied",
        updatedAt: "2026-05-09T16:40:00.000Z",
        updatedByDisplayName: "Nicolas Bourbaki"
      },
      {
        family: "release_readiness",
        id: "release-holdout",
        label: "Holdout posture is explicitly recorded",
        rationale: "Escalated for policy review before publish-ready posture.",
        required: true,
        state: "blocked",
        updatedAt: "2026-05-09T16:44:00.000Z",
        updatedByDisplayName: "Nicolas Bourbaki"
      }
    ],
    comments: [
      {
        anchor: {
          anchorType: "checklist_item",
          checklistItemId: "release-holdout"
        },
        authorDisplayName: "Nicolas Bourbaki",
        body: "The package candidate is traceable, but release posture needs an explicit holdout decision before downstream freeze work.",
        createdAt: "2026-05-09T16:48:00.000Z",
        id: "comment-release-holdout",
        replies: [],
        state: "open"
      }
    ],
    generatedAt,
    reviewId: "review-release-package-candidate",
    reviewKind: "release",
    reviewPosture: "escalated",
    sourceArtifact: {
      artifactRole: "review_attachment",
      availability: "too_large",
      content: null,
      language: "text",
      lineCount: 0,
      mathArtifactRefId: "artifact-release-bundle",
      path: "release-evidence/bundle-summary.json",
      reason: "Artifact exceeds the first-slice inline preview limit."
    },
    subjectId: "math-candidate-problem9-v1",
    subjectLabel: "Problem 9 package candidate",
    subjectPosture: "proposed",
    subjectSummary:
      "Release decision for the package candidate before repo-sync and freeze workflow.",
    subjectType: "package_candidate"
  }
] satisfies MathReviewRecordDetail[];

const reviewDetails = rawReviewDetails.map((detail) =>
  mathReviewRecordDetailSchema.parse(detail)
) as MathReviewRecordDetail[];

function toQueueItem(detail: MathReviewRecordDetail) {
  const completed = detail.checklistItems.filter(
    (item) => item.state === "satisfied" || item.state === "not_applicable"
  ).length;
  const blocked = detail.checklistItems.filter((item) => item.state === "blocked").length;
  const activePrimary = detail.activeRound.assignments.find(
    (assignment) =>
      assignment.assignmentRole === "primary" && assignment.state === "active"
  );
  const unresolved = detail.comments.filter((comment) => comment.state === "open").length;
  const gateSummary =
    blocked > 0
      ? {
          label: `${blocked} blocked checklist item${blocked === 1 ? "" : "s"}`,
          state: "blocked" as const
        }
      : detail.sourceArtifact.availability === "available"
        ? { label: "Evidence available", state: "clear" as const }
        : { label: "Evidence missing", state: "missing" as const };

  return {
    checklistSummary: {
      blocked,
      completed,
      total: detail.checklistItems.length
    },
    commentSummary: {
      total: detail.comments.length,
      unresolved
    },
    gateSummary,
    href: `/reviews/${detail.reviewId}`,
    primaryAssigneeDisplayName: activePrimary?.assigneeDisplayName ?? null,
    reviewId: detail.reviewId,
    reviewKind: detail.reviewKind,
    roundNumber: detail.activeRound.roundNumber,
    subjectId: detail.subjectId,
    subjectLabel: detail.subjectLabel,
    subjectPosture: detail.subjectPosture,
    subjectType: detail.subjectType,
    tags: [
      detail.reviewPosture === "escalated" ? "escalated" : null,
      detail.sourceArtifact.availability !== "available" ? detail.sourceArtifact.availability : null
    ].filter((tag): tag is string => tag !== null),
    updatedAt: detail.generatedAt
  };
}

const queueItems = reviewDetails.map(toQueueItem);

export function parseMathReviewQueue(search: string): MathReviewQueue {
  const queue = new URLSearchParams(search).get("queue");

  if (
    queue === "assigned" ||
    queue === "triage" ||
    queue === "peer" ||
    queue === "editor" ||
    queue === "release" ||
    queue === "escalated"
  ) {
    return queue;
  }

  return "assigned";
}

export function readMathReviewQueue(queue: MathReviewQueue): MathReviewQueueResponse {
  const items = queueItems.filter((item) => {
    if (queue === "assigned") {
      return item.primaryAssigneeDisplayName !== null;
    }

    if (queue === "escalated") {
      return item.tags.includes("escalated") || item.gateSummary.state === "blocked";
    }

    return item.reviewKind === queue;
  });

  return mathReviewQueueResponseSchema.parse({
    generatedAt,
    items,
    queue
  }) as MathReviewQueueResponse;
}

export function findMathReviewDetail(reviewId: string): MathReviewRecordDetail | null {
  return reviewDetails.find((detail) => detail.reviewId === reviewId) ?? null;
}

export function getMathReviewFixtureDetails() {
  return [...reviewDetails];
}
