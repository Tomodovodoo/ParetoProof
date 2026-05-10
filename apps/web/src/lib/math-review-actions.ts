import {
  getMathReviewDecisionOutcomes,
  type MathReviewAssignment,
  type MathReviewChecklistItemState,
  type MathReviewDecisionOutcome,
  type MathReviewRecordDetail
} from "@paretoproof/shared";

export type MathReviewActionContext = {
  actorDisplayName: string;
  now: string;
};

function activePrimaryAssignments(detail: MathReviewRecordDetail) {
  return detail.activeRound.assignments.filter(
    (assignment) =>
      assignment.assignmentRole === "primary" && assignment.state === "active"
  );
}

function createPrimaryAssignment(
  context: MathReviewActionContext
): MathReviewAssignment {
  return {
    assignedAt: context.now,
    assignmentRole: "primary",
    assigneeDisplayName: context.actorDisplayName,
    closeReason: null,
    state: "active"
  };
}

export function selfAssignReview(
  detail: MathReviewRecordDetail,
  context: MathReviewActionContext
): MathReviewRecordDetail {
  if (!detail.capabilities.canSelfAssign || activePrimaryAssignments(detail).length > 0) {
    return detail;
  }

  return {
    ...detail,
    activeRound: {
      ...detail.activeRound,
      assignments: [...detail.activeRound.assignments, createPrimaryAssignment(context)]
    },
    generatedAt: context.now
  };
}

export function reassignPrimaryReview(
  detail: MathReviewRecordDetail,
  context: MathReviewActionContext
): MathReviewRecordDetail {
  if (!detail.capabilities.canReassignPrimary) {
    return detail;
  }

  return {
    ...detail,
    activeRound: {
      ...detail.activeRound,
      assignments: [
        ...detail.activeRound.assignments.map((assignment) =>
          assignment.assignmentRole === "primary" && assignment.state === "active"
            ? {
                ...assignment,
                closeReason: `Reassigned to ${context.actorDisplayName}.`,
                state: "reassigned" as const
              }
            : assignment
        ),
        createPrimaryAssignment(context)
      ]
    },
    generatedAt: context.now
  };
}

export function updateReviewChecklistItemState(
  detail: MathReviewRecordDetail,
  checklistItemId: string,
  state: MathReviewChecklistItemState,
  context: MathReviewActionContext
): MathReviewRecordDetail {
  if (
    !detail.capabilities.canUpdateChecklist ||
    !detail.checklistItems.some((item) => item.id === checklistItemId)
  ) {
    return detail;
  }

  return {
    ...detail,
    checklistItems: detail.checklistItems.map((item) =>
      item.id === checklistItemId
        ? {
            ...item,
            state,
            updatedAt: context.now,
            updatedByDisplayName: context.actorDisplayName
          }
        : item
    ),
    generatedAt: context.now
  };
}

export function addLineCommentToReview(
  detail: MathReviewRecordDetail,
  options: {
    body: string;
    lineNumber: number;
  },
  context: MathReviewActionContext
): MathReviewRecordDetail {
  const body = options.body.trim();

  if (
    !detail.capabilities.canComment ||
    !Number.isInteger(options.lineNumber) ||
    options.lineNumber < 1 ||
    options.lineNumber > detail.sourceArtifact.lineCount ||
    detail.sourceArtifact.availability !== "available" ||
    detail.sourceArtifact.content === null ||
    body.length === 0
  ) {
    return detail;
  }

  const nextCommentNumber = detail.comments.length + 1;

  return {
    ...detail,
    comments: [
      ...detail.comments,
      {
        anchor: {
          anchorType: "line",
          artifactRole: detail.sourceArtifact.artifactRole,
          endLine: options.lineNumber,
          mathArtifactRefId: detail.sourceArtifact.mathArtifactRefId,
          path: detail.sourceArtifact.path,
          startLine: options.lineNumber
        },
        authorDisplayName: context.actorDisplayName,
        body,
        createdAt: context.now,
        id: `comment-${detail.reviewId}-${nextCommentNumber}`,
        replies: [],
        state: "open"
      }
    ],
    generatedAt: context.now
  };
}

export function resolveReviewComment(
  detail: MathReviewRecordDetail,
  commentId: string,
  context: MathReviewActionContext
): MathReviewRecordDetail {
  if (
    !detail.capabilities.canResolveComment ||
    !detail.comments.some((comment) => comment.id === commentId)
  ) {
    return detail;
  }

  return {
    ...detail,
    comments: detail.comments.map((comment) =>
      comment.id === commentId
        ? {
            ...comment,
            state: "resolved" as const
          }
        : comment
    ),
    generatedAt: context.now
  };
}

export function recordReviewDecision(
  detail: MathReviewRecordDetail,
  outcome: MathReviewDecisionOutcome,
  rationale: string,
  context: MathReviewActionContext
): MathReviewRecordDetail {
  if (
    !detail.capabilities.canRecordDecision ||
    !getMathReviewDecisionOutcomes(detail.reviewKind).includes(outcome)
  ) {
    return detail;
  }

  return {
    ...detail,
    activeRound: {
      ...detail.activeRound,
      decisionOutcome: outcome,
      decisionSummary: rationale.trim() || `Recorded ${outcome}.`,
      posture: "closed"
    },
    generatedAt: context.now,
    reviewPosture: outcome === "escalated" ? "escalated" : "decided"
  };
}

export function escalateReview(
  detail: MathReviewRecordDetail,
  rationale: string,
  context: MathReviewActionContext
): MathReviewRecordDetail {
  if (!detail.capabilities.canEscalate) {
    return detail;
  }

  return recordReviewDecision(
    {
      ...detail,
      capabilities: {
        ...detail.capabilities,
        canRecordDecision: true
      }
    },
    "escalated",
    rationale,
    context
  );
}
