import { z } from "zod";
import {
  mathReviewAssignmentRoles,
  mathReviewAssignmentStates,
  mathReviewChecklistFamilies,
  mathReviewChecklistItemStates,
  mathReviewDecisionOutcomes,
  mathReviewKinds,
  mathReviewPostures,
  mathReviewQueues,
  mathReviewRoundPostures,
  mathReviewSubjectTypes
} from "../types/math-review.js";

const nonEmptyStringSchema = z.string().trim().min(1);

export const mathReviewSubjectTypeSchema = z.enum(mathReviewSubjectTypes);
export const mathReviewKindSchema = z.enum(mathReviewKinds);
export const mathReviewQueueSchema = z.enum(mathReviewQueues);
export const mathReviewPostureSchema = z.enum(mathReviewPostures);
export const mathReviewRoundPostureSchema = z.enum(mathReviewRoundPostures);
export const mathReviewAssignmentRoleSchema = z.enum(mathReviewAssignmentRoles);
export const mathReviewAssignmentStateSchema = z.enum(mathReviewAssignmentStates);
export const mathReviewChecklistFamilySchema = z.enum(mathReviewChecklistFamilies);
export const mathReviewChecklistItemStateSchema = z.enum(
  mathReviewChecklistItemStates
);
export const mathReviewDecisionOutcomeSchema = z.enum(mathReviewDecisionOutcomes);

export const mathReviewChecklistSummarySchema = z.object({
  blocked: z.number().int().min(0),
  completed: z.number().int().min(0),
  total: z.number().int().min(0)
});

export const mathReviewGateSummarySchema = z.object({
  label: nonEmptyStringSchema,
  state: z.enum(["clear", "blocked", "missing", "stale"])
});

export const mathReviewCommentSummarySchema = z.object({
  total: z.number().int().min(0),
  unresolved: z.number().int().min(0)
});

export const mathReviewCapabilitySetSchema = z.object({
  canApplyAdminOverride: z.boolean(),
  canAssignPrimary: z.boolean(),
  canComment: z.boolean(),
  canEscalate: z.boolean(),
  canReassignPrimary: z.boolean(),
  canRecordDecision: z.boolean(),
  canResolveComment: z.boolean(),
  canSelfAssign: z.boolean(),
  canUpdateChecklist: z.boolean()
});

export const mathReviewQueueItemSchema = z.object({
  checklistSummary: mathReviewChecklistSummarySchema,
  commentSummary: mathReviewCommentSummarySchema,
  gateSummary: mathReviewGateSummarySchema,
  href: nonEmptyStringSchema,
  primaryAssigneeDisplayName: nonEmptyStringSchema.nullable(),
  reviewId: nonEmptyStringSchema,
  reviewKind: mathReviewKindSchema,
  roundNumber: z.number().int().min(1),
  subjectId: nonEmptyStringSchema,
  subjectLabel: nonEmptyStringSchema,
  subjectPosture: nonEmptyStringSchema,
  subjectType: mathReviewSubjectTypeSchema,
  tags: z.array(nonEmptyStringSchema),
  updatedAt: nonEmptyStringSchema
});

export const mathReviewQueueResponseSchema = z.object({
  generatedAt: nonEmptyStringSchema,
  items: z.array(mathReviewQueueItemSchema),
  queue: mathReviewQueueSchema
});

export const mathReviewAssignmentSchema = z.object({
  assignedAt: nonEmptyStringSchema,
  assignmentRole: mathReviewAssignmentRoleSchema,
  assigneeDisplayName: nonEmptyStringSchema.nullable(),
  closeReason: nonEmptyStringSchema.nullable(),
  state: mathReviewAssignmentStateSchema
});

export const mathReviewChecklistItemSchema = z.object({
  family: mathReviewChecklistFamilySchema,
  id: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  rationale: nonEmptyStringSchema.nullable(),
  required: z.boolean(),
  state: mathReviewChecklistItemStateSchema,
  updatedAt: nonEmptyStringSchema.nullable(),
  updatedByDisplayName: nonEmptyStringSchema.nullable()
});

const mathReviewLineAnchorBaseSchema = z.object({
  anchorType: z.literal("line"),
  artifactRole: nonEmptyStringSchema,
  endLine: z.number().int().min(1),
  mathArtifactRefId: nonEmptyStringSchema.nullable(),
  path: nonEmptyStringSchema,
  startLine: z.number().int().min(1)
});

function requireOrderedLineAnchor(
  value: z.infer<typeof mathReviewLineAnchorBaseSchema>,
  context: z.RefinementCtx
) {
  if (value.endLine >= value.startLine) {
    return;
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: "Line comment anchors must end on or after their start line.",
    path: ["endLine"]
  });
}

export const mathReviewLineAnchorSchema =
  mathReviewLineAnchorBaseSchema.superRefine(requireOrderedLineAnchor);

export const mathReviewFieldAnchorSchema = z.object({
  anchorType: z.literal("field"),
  field: nonEmptyStringSchema
});

export const mathReviewChecklistAnchorSchema = z.object({
  anchorType: z.literal("checklist_item"),
  checklistItemId: nonEmptyStringSchema
});

export const mathReviewCommentAnchorSchema = z.discriminatedUnion("anchorType", [
  mathReviewChecklistAnchorSchema,
  mathReviewFieldAnchorSchema,
  mathReviewLineAnchorBaseSchema
]).superRefine((value, context) => {
  if (value.anchorType === "line") {
    requireOrderedLineAnchor(value, context);
  }
});

export const mathReviewCommentReplySchema = z.object({
  authorDisplayName: nonEmptyStringSchema,
  body: nonEmptyStringSchema,
  createdAt: nonEmptyStringSchema,
  id: nonEmptyStringSchema
});

export const mathReviewCommentThreadSchema = z.object({
  anchor: mathReviewCommentAnchorSchema,
  authorDisplayName: nonEmptyStringSchema,
  body: nonEmptyStringSchema,
  createdAt: nonEmptyStringSchema,
  id: nonEmptyStringSchema,
  replies: z.array(mathReviewCommentReplySchema),
  state: z.enum(["open", "resolved"])
});

export const mathReviewRoundSchema = z.object({
  assignments: z.array(mathReviewAssignmentSchema),
  decisionOutcome: mathReviewDecisionOutcomeSchema.nullable(),
  decisionSummary: nonEmptyStringSchema.nullable(),
  openedAt: nonEmptyStringSchema,
  posture: mathReviewRoundPostureSchema,
  roundNumber: z.number().int().min(1)
});

export const mathReviewSourceArtifactSchema = z.object({
  artifactRole: nonEmptyStringSchema,
  availability: z.enum(["available", "missing", "quarantined", "too_large"]),
  content: z.string().nullable(),
  language: z.enum(["lean", "text"]),
  lineCount: z.number().int().min(0),
  mathArtifactRefId: nonEmptyStringSchema.nullable(),
  path: nonEmptyStringSchema,
  reason: nonEmptyStringSchema.nullable()
});

export const mathReviewRecordDetailSchema = z.object({
  activeRound: mathReviewRoundSchema,
  capabilities: mathReviewCapabilitySetSchema,
  checklistItems: z.array(mathReviewChecklistItemSchema),
  comments: z.array(mathReviewCommentThreadSchema),
  generatedAt: nonEmptyStringSchema,
  reviewId: nonEmptyStringSchema,
  reviewKind: mathReviewKindSchema,
  reviewPosture: mathReviewPostureSchema,
  sourceArtifact: mathReviewSourceArtifactSchema,
  subjectId: nonEmptyStringSchema,
  subjectLabel: nonEmptyStringSchema,
  subjectPosture: nonEmptyStringSchema,
  subjectSummary: nonEmptyStringSchema,
  subjectType: mathReviewSubjectTypeSchema
});

export const mathReviewDecisionInputSchema = z.object({
  outcome: mathReviewDecisionOutcomeSchema,
  rationale: nonEmptyStringSchema
});

export const mathReviewMutationResponseSchema = z.object({
  detail: mathReviewRecordDetailSchema,
  ok: z.literal(true)
});
