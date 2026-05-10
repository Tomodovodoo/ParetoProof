import type {
  MathPackageCandidatePosture,
  MathQuestionRevisionPosture,
  MathReleaseLinkPosture,
  MathReviewRecordPosture,
  MathReviewRoundPosture,
  MathSubmissionPosture
} from "@paretoproof/shared";
import { and, eq } from "drizzle-orm";
import {
  auditEvents,
  mathArtifactRefs,
  mathPackageCandidates,
  mathQuestionRevisions,
  mathQuestions,
  mathReleaseLinks,
  mathReviewAssignments,
  mathReviewChecklistItems,
  mathReviewComments,
  mathReviewRecords,
  mathReviewRounds,
  mathSubmissions
} from "../db/schema.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";

type MathWorkflowAuditEventId =
  | "math_package_candidate.created"
  | "math_package_candidate.posture_updated"
  | "math_question.created"
  | "math_question_revision.created"
  | "math_question_revision.posture_updated"
  | "math_release_link.created"
  | "math_release_link.posture_updated"
  | "math_review.assignment_changed"
  | "math_review.checklist_updated"
  | "math_review.comment_added"
  | "math_review.decision_recorded"
  | "math_review.record_opened"
  | "math_review.round_opened"
  | "math_submission.created"
  | "math_submission.posture_updated";

type MathWorkflowAuditSubjectKind =
  | "math_package_candidate"
  | "math_question"
  | "math_question_revision"
  | "math_release_link"
  | "math_review_record"
  | "math_submission";

type MathWorkflowAuditSeverity = "critical" | "info" | "warning";

function expectSingleRow<T>(rows: T[], action: string): T {
  const row = rows[0];

  if (!row) {
    throw new Error(`Expected ${action} to return a row.`);
  }

  return row;
}

function isActivePackageCandidatePosture(posture: MathPackageCandidatePosture) {
  return !["rejected", "superseded", "withdrawn"].includes(posture);
}

function packageCandidatePostureForReleaseLink(
  posture: MathReleaseLinkPosture
): MathPackageCandidatePosture | null {
  if (posture === "version_linked") {
    return "version_linked";
  }

  if (posture === "release_linked" || posture === "published") {
    return "release_linked";
  }

  return null;
}

export function createMathWorkflowAuditEvent(options: {
  actorUserId: string;
  eventId: MathWorkflowAuditEventId;
  payload: Record<string, unknown>;
  severity: MathWorkflowAuditSeverity;
  subjectKind: MathWorkflowAuditSubjectKind;
}): typeof auditEvents.$inferInsert {
  return {
    actorKind: "portal_user",
    actorUserId: options.actorUserId,
    eventId: options.eventId,
    payload: options.payload,
    severity: options.severity,
    subjectKind: options.subjectKind,
    targetUserId: null
  };
}

export type MathReviewDecisionInput = {
  actorUserId: string;
  decision: string;
  decisionPayload?: Record<string, unknown> | null;
  decisionSummary?: string | null;
  escalationRequired?: boolean;
  mathReviewRecordId: string;
  mathReviewRoundId: string;
  recordPosture?: Extract<MathReviewRecordPosture, "closed" | "decided">;
  roundPosture?: Extract<MathReviewRoundPosture, "closed" | "decided">;
};

export function createMathWorkflowRepository(db: ReturnTypeOfCreateDbClient) {
  return {
    async createMathQuestion(
      input: typeof mathQuestions.$inferInsert,
      actorUserId: string
    ) {
      return db.transaction(async (tx) => {
        const row = expectSingleRow(
          await tx.insert(mathQuestions).values(input).returning(),
          "math question creation"
        );

        await tx.insert(auditEvents).values(
          createMathWorkflowAuditEvent({
            actorUserId,
            eventId: "math_question.created",
            payload: {
              actorUserId,
              mathQuestionId: row.id,
              slug: row.slug
            },
            severity: "info",
            subjectKind: "math_question"
          })
        );

        return row;
      });
    },

    async createMathQuestionRevision(
      input: typeof mathQuestionRevisions.$inferInsert,
      actorUserId: string
    ) {
      const now = new Date();

      return db.transaction(async (tx) => {
        const row = expectSingleRow(
          await tx.insert(mathQuestionRevisions).values(input).returning(),
          "math question revision creation"
        );

        await tx
          .update(mathQuestions)
          .set({
            currentHeadRevisionId: row.id,
            updatedAt: now
          })
          .where(eq(mathQuestions.id, row.mathQuestionId));

        await tx.insert(auditEvents).values(
          createMathWorkflowAuditEvent({
            actorUserId,
            eventId: "math_question_revision.created",
            payload: {
              actorUserId,
              mathQuestionId: row.mathQuestionId,
              mathQuestionRevisionId: row.id,
              revisionNumber: row.revisionNumber
            },
            severity: "info",
            subjectKind: "math_question_revision"
          })
        );

        return row;
      });
    },

    async updateMathQuestionRevisionPosture(options: {
      actorUserId: string;
      mathQuestionRevisionId: string;
      posture: MathQuestionRevisionPosture;
    }) {
      const now = new Date();

      return db.transaction(async (tx) => {
        const row = expectSingleRow(
          await tx
            .update(mathQuestionRevisions)
            .set({ posture: options.posture })
            .where(eq(mathQuestionRevisions.id, options.mathQuestionRevisionId))
            .returning(),
          "math question revision posture update"
        );

        if (options.posture === "accepted") {
          await tx
            .update(mathQuestions)
            .set({
              currentAcceptedRevisionId: row.id,
              currentHeadRevisionId: row.id,
              posture: "active",
              updatedAt: now
            })
            .where(eq(mathQuestions.id, row.mathQuestionId));
        }

        await tx.insert(auditEvents).values(
          createMathWorkflowAuditEvent({
            actorUserId: options.actorUserId,
            eventId: "math_question_revision.posture_updated",
            payload: {
              actorUserId: options.actorUserId,
              mathQuestionId: row.mathQuestionId,
              mathQuestionRevisionId: row.id,
              posture: row.posture
            },
            severity: "warning",
            subjectKind: "math_question_revision"
          })
        );

        return row;
      });
    },

    async createMathSubmission(
      input: typeof mathSubmissions.$inferInsert,
      actorUserId: string
    ) {
      return db.transaction(async (tx) => {
        const row = expectSingleRow(
          await tx.insert(mathSubmissions).values(input).returning(),
          "math submission creation"
        );

        await tx.insert(auditEvents).values(
          createMathWorkflowAuditEvent({
            actorUserId,
            eventId: "math_submission.created",
            payload: {
              actorUserId,
              mathQuestionId: row.mathQuestionId,
              mathQuestionRevisionId: row.mathQuestionRevisionId,
              mathSubmissionId: row.id
            },
            severity: "info",
            subjectKind: "math_submission"
          })
        );

        return row;
      });
    },

    async updateMathSubmissionPosture(options: {
      actorUserId: string;
      mathSubmissionId: string;
      posture: MathSubmissionPosture;
    }) {
      const now = new Date();

      return db.transaction(async (tx) => {
        const row = expectSingleRow(
          await tx
            .update(mathSubmissions)
            .set({
              posture: options.posture,
              updatedAt: now
            })
            .where(eq(mathSubmissions.id, options.mathSubmissionId))
            .returning(),
          "math submission posture update"
        );

        await tx.insert(auditEvents).values(
          createMathWorkflowAuditEvent({
            actorUserId: options.actorUserId,
            eventId: "math_submission.posture_updated",
            payload: {
              actorUserId: options.actorUserId,
              mathSubmissionId: row.id,
              posture: row.posture
            },
            severity: "warning",
            subjectKind: "math_submission"
          })
        );

        return row;
      });
    },

    async createMathArtifactRef(input: typeof mathArtifactRefs.$inferInsert) {
      const row = expectSingleRow(
        await db.insert(mathArtifactRefs).values(input).returning(),
        "math artifact ref creation"
      );

      return row;
    },

    async createMathReviewRecord(
      input: typeof mathReviewRecords.$inferInsert,
      actorUserId: string
    ) {
      return db.transaction(async (tx) => {
        const row = expectSingleRow(
          await tx.insert(mathReviewRecords).values(input).returning(),
          "math review record creation"
        );

        await tx.insert(auditEvents).values(
          createMathWorkflowAuditEvent({
            actorUserId,
            eventId: "math_review.record_opened",
            payload: {
              actorUserId,
              mathReviewRecordId: row.id,
              reviewKind: row.reviewKind,
              subjectType: row.subjectType
            },
            severity: "info",
            subjectKind: "math_review_record"
          })
        );

        return row;
      });
    },

    async createMathReviewRound(
      input: typeof mathReviewRounds.$inferInsert,
      actorUserId: string
    ) {
      const now = new Date();

      return db.transaction(async (tx) => {
        const row = expectSingleRow(
          await tx.insert(mathReviewRounds).values(input).returning(),
          "math review round creation"
        );

        await tx
          .update(mathReviewRecords)
          .set({
            currentRoundId: row.id,
            updatedAt: now
          })
          .where(eq(mathReviewRecords.id, row.mathReviewRecordId));

        await tx.insert(auditEvents).values(
          createMathWorkflowAuditEvent({
            actorUserId,
            eventId: "math_review.round_opened",
            payload: {
              actorUserId,
              mathReviewRecordId: row.mathReviewRecordId,
              mathReviewRoundId: row.id
            },
            severity: "info",
            subjectKind: "math_review_record"
          })
        );

        return row;
      });
    },

    async createMathReviewAssignment(
      input: typeof mathReviewAssignments.$inferInsert,
      actorUserId: string
    ) {
      return db.transaction(async (tx) => {
        const row = expectSingleRow(
          await tx.insert(mathReviewAssignments).values(input).returning(),
          "math review assignment creation"
        );

        await tx.insert(auditEvents).values(
          createMathWorkflowAuditEvent({
            actorUserId,
            eventId: "math_review.assignment_changed",
            payload: {
              actorUserId,
              assignmentRole: row.assignmentRole,
              mathReviewAssignmentId: row.id,
              mathReviewRoundId: row.mathReviewRoundId,
              state: row.state
            },
            severity: "warning",
            subjectKind: "math_review_record"
          })
        );

        return row;
      });
    },

    async createMathReviewChecklistItem(
      input: typeof mathReviewChecklistItems.$inferInsert,
      actorUserId: string
    ) {
      return db.transaction(async (tx) => {
        const row = expectSingleRow(
          await tx.insert(mathReviewChecklistItems).values(input).returning(),
          "math review checklist item creation"
        );

        await tx.insert(auditEvents).values(
          createMathWorkflowAuditEvent({
            actorUserId,
            eventId: "math_review.checklist_updated",
            payload: {
              actorUserId,
              checklistFamily: row.checklistFamily,
              itemKey: row.itemKey,
              mathReviewChecklistItemId: row.id,
              mathReviewRoundId: row.mathReviewRoundId,
              state: row.state
            },
            severity: "info",
            subjectKind: "math_review_record"
          })
        );

        return row;
      });
    },

    async createMathReviewComment(
      input: typeof mathReviewComments.$inferInsert,
      actorUserId: string
    ) {
      return db.transaction(async (tx) => {
        const row = expectSingleRow(
          await tx.insert(mathReviewComments).values(input).returning(),
          "math review comment creation"
        );

        await tx.insert(auditEvents).values(
          createMathWorkflowAuditEvent({
            actorUserId,
            eventId: "math_review.comment_added",
            payload: {
              actorUserId,
              mathReviewCommentId: row.id,
              mathReviewRoundId: row.mathReviewRoundId
            },
            severity: "info",
            subjectKind: "math_review_record"
          })
        );

        return row;
      });
    },

    async recordMathReviewDecision(input: MathReviewDecisionInput) {
      const now = new Date();

      return db.transaction(async (tx) => {
        const round = expectSingleRow(
          await tx
            .update(mathReviewRounds)
            .set({
              closedAt: now,
              closedByUserId: input.actorUserId,
              decision: input.decision,
              decisionPayload: input.decisionPayload ?? null,
              decisionSummary: input.decisionSummary ?? null,
              posture: input.roundPosture ?? "decided",
              updatedAt: now
            })
            .where(
              and(
                eq(mathReviewRounds.id, input.mathReviewRoundId),
                eq(mathReviewRounds.mathReviewRecordId, input.mathReviewRecordId)
              )
            )
            .returning(),
          "math review round decision update"
        );

        const record = expectSingleRow(
          await tx
            .update(mathReviewRecords)
            .set({
              closedAt: now,
              currentRoundId: input.mathReviewRoundId,
              escalationRequired: input.escalationRequired ?? false,
              finalDecision: input.decision,
              finalDecisionActorUserId: input.actorUserId,
              finalDecisionPayload: input.decisionPayload ?? null,
              finalDecisionSummary: input.decisionSummary ?? null,
              posture: input.recordPosture ?? "decided",
              updatedAt: now
            })
            .where(eq(mathReviewRecords.id, input.mathReviewRecordId))
            .returning(),
          "math review record decision update"
        );

        await tx.insert(auditEvents).values(
          createMathWorkflowAuditEvent({
            actorUserId: input.actorUserId,
            eventId: "math_review.decision_recorded",
            payload: {
              actorUserId: input.actorUserId,
              decision: input.decision,
              mathReviewRecordId: record.id,
              mathReviewRoundId: round.id
            },
            severity: "critical",
            subjectKind: "math_review_record"
          })
        );

        return { record, round };
      });
    },

    async createMathPackageCandidate(
      input: typeof mathPackageCandidates.$inferInsert,
      actorUserId: string
    ) {
      const now = new Date();

      return db.transaction(async (tx) => {
        const row = expectSingleRow(
          await tx.insert(mathPackageCandidates).values(input).returning(),
          "math package candidate creation"
        );

        if (isActivePackageCandidatePosture(row.posture)) {
          await tx
            .update(mathQuestions)
            .set({
              latestActivePackageCandidateId: row.mathPackageCandidateId,
              updatedAt: now
            })
            .where(eq(mathQuestions.id, row.mathQuestionId));
        }

        await tx.insert(auditEvents).values(
          createMathWorkflowAuditEvent({
            actorUserId,
            eventId: "math_package_candidate.created",
            payload: {
              actorUserId,
              mathPackageCandidateId: row.mathPackageCandidateId,
              mathQuestionId: row.mathQuestionId,
              sourceType: row.sourceType
            },
            severity: "info",
            subjectKind: "math_package_candidate"
          })
        );

        return row;
      });
    },

    async updateMathPackageCandidatePosture(options: {
      actorUserId: string;
      mathPackageCandidateId: string;
      posture: MathPackageCandidatePosture;
    }) {
      const now = new Date();

      return db.transaction(async (tx) => {
        const row = expectSingleRow(
          await tx
            .update(mathPackageCandidates)
            .set({
              posture: options.posture,
              updatedAt: now
            })
            .where(
              eq(
                mathPackageCandidates.mathPackageCandidateId,
                options.mathPackageCandidateId
              )
            )
            .returning(),
          "math package candidate posture update"
        );

        if (isActivePackageCandidatePosture(row.posture)) {
          await tx
            .update(mathQuestions)
            .set({
              latestActivePackageCandidateId: row.mathPackageCandidateId,
              updatedAt: now
            })
            .where(eq(mathQuestions.id, row.mathQuestionId));
        }

        await tx.insert(auditEvents).values(
          createMathWorkflowAuditEvent({
            actorUserId: options.actorUserId,
            eventId: "math_package_candidate.posture_updated",
            payload: {
              actorUserId: options.actorUserId,
              mathPackageCandidateId: row.mathPackageCandidateId,
              posture: row.posture
            },
            severity: "warning",
            subjectKind: "math_package_candidate"
          })
        );

        return row;
      });
    },

    async createMathReleaseLink(
      input: typeof mathReleaseLinks.$inferInsert,
      actorUserId: string
    ) {
      const now = new Date();

      return db.transaction(async (tx) => {
        const row = expectSingleRow(
          await tx.insert(mathReleaseLinks).values(input).returning(),
          "math release link creation"
        );
        const nextCandidatePosture = packageCandidatePostureForReleaseLink(row.posture);

        if (nextCandidatePosture) {
          const candidateUpdate =
            row.benchmarkVersionId === null
              ? {
                  posture: nextCandidatePosture,
                  updatedAt: now
                }
              : {
                  linkedBenchmarkVersionId: row.benchmarkVersionId,
                  posture: nextCandidatePosture,
                  updatedAt: now
                };

          await tx
            .update(mathPackageCandidates)
            .set(candidateUpdate)
            .where(
              eq(
                mathPackageCandidates.mathPackageCandidateId,
                row.mathPackageCandidateId
              )
            );
        }

        if (row.benchmarkVersionId !== null) {
          await tx
            .update(mathQuestions)
            .set({
              latestLinkedBenchmarkVersionId: row.benchmarkVersionId,
              updatedAt: now
            })
            .where(eq(mathQuestions.id, row.mathQuestionId));
        }

        await tx.insert(auditEvents).values(
          createMathWorkflowAuditEvent({
            actorUserId,
            eventId: "math_release_link.created",
            payload: {
              actorUserId,
              benchmarkReleaseId: row.benchmarkReleaseId,
              benchmarkVersionId: row.benchmarkVersionId,
              mathPackageCandidateId: row.mathPackageCandidateId,
              mathReleaseLinkId: row.id
            },
            severity: "info",
            subjectKind: "math_release_link"
          })
        );

        if (row.posture !== "planned") {
          await tx.insert(auditEvents).values(
            createMathWorkflowAuditEvent({
              actorUserId,
              eventId: "math_release_link.posture_updated",
              payload: {
                actorUserId,
                mathReleaseLinkId: row.id,
                posture: row.posture
              },
              severity: "warning",
              subjectKind: "math_release_link"
            })
          );
        }

        return row;
      });
    }
  };
}

export const mathWorkflowRepositoryTestUtils = {
  createMathWorkflowAuditEvent,
  packageCandidatePostureForReleaseLink
};
