import { z } from "zod";

const optionalNullableTrimmedStringSchema = z
  .union([z.string().trim().min(1), z.null()])
  .optional();

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i);

export const leanSubmissionKindSchema = z.enum([
  "lean_proof_submission",
  "lean_formalization_submission",
  "lean_repair_submission"
]);

export const leanArtifactRoleSchema = z.enum([
  "statement_source",
  "supporting_lean_module",
  "submission_entrypoint",
  "compile_output",
  "compile_diagnostics",
  "verifier_output",
  "equivalence_report",
  "review_attachment"
]);

export const leanArtifactOwnerScopeSchema = z.enum(["question_revision", "submission"]);

export const leanArtifactLifecycleStageSchema = z.enum([
  "question_source",
  "submission_input",
  "generated",
  "review_support"
]);

export const leanAutomationCheckKindSchema = z.enum([
  "compile",
  "verifier",
  "equivalence"
]);

export const leanAutomationCheckStateSchema = z.enum([
  "not_requested",
  "queued",
  "running",
  "passed",
  "failed",
  "errored",
  "cancelled",
  "superseded"
]);

export const leanAutomationCheckApplicabilitySchema = z.enum([
  "required",
  "optional",
  "not_applicable"
]);

export const leanReviewGateKindSchema = z.enum([
  "peer_review",
  "editor_review",
  "provenance_review",
  "policy_review"
]);

export const leanReviewGateStateSchema = z.enum([
  "required",
  "satisfied",
  "waived",
  "blocked"
]);

export const leanReviewGateSourceSchema = z.enum([
  "default_policy",
  "automation",
  "human_reviewer",
  "admin_override"
]);

export const leanEquivalenceExpectationSchema = z.enum([
  "not_applicable",
  "canonical_statement",
  "prior_submission"
]);

function addMissingEquivalenceTargetIssues(
  value: {
    equivalenceExpectation:
      | "not_applicable"
      | "canonical_statement"
      | "prior_submission";
    targetDeclarationName?: string | null;
    targetModuleName?: string | null;
  },
  context: z.RefinementCtx
) {
  if (value.equivalenceExpectation === "not_applicable") {
    return;
  }

  if (!value.targetModuleName) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "targetModuleName is required when equivalenceExpectation references an existing target.",
      path: ["targetModuleName"]
    });
  }

  if (!value.targetDeclarationName) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "targetDeclarationName is required when equivalenceExpectation references an existing target.",
      path: ["targetDeclarationName"]
    });
  }
}

function addMissingReviewGateRationaleIssues(
  value: {
    rationale?: string | null;
    state: "required" | "satisfied" | "waived" | "blocked";
  },
  context: z.RefinementCtx
) {
  if ((value.state === "blocked" || value.state === "waived") && !value.rationale) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "rationale is required when a review gate is blocked or waived.",
      path: ["rationale"]
    });
  }
}

export const mathLeanSubmissionProfileSchema = z.object({
  equivalenceExpectation: leanEquivalenceExpectationSchema,
  leanSubmissionKind: leanSubmissionKindSchema,
  targetDeclarationName: z.string().trim().min(1).nullable(),
  targetLaneId: z.string().trim().min(1).nullable(),
  targetModuleName: z.string().trim().min(1).nullable()
}).superRefine(addMissingEquivalenceTargetIssues);

export const mathLeanArtifactRefSchema = z.object({
  artifactId: z.string().min(1).nullable(),
  artifactRole: leanArtifactRoleSchema,
  contentDigest: sha256Schema.nullable(),
  filename: z.string().trim().min(1),
  lifecycleStage: leanArtifactLifecycleStageSchema,
  mediaType: z.string().trim().min(1).nullable(),
  ownerScope: leanArtifactOwnerScopeSchema,
  pathHint: z.string().trim().min(1).nullable()
});

export const mathLeanAutomationCheckStatusSchema = z.object({
  applicability: leanAutomationCheckApplicabilitySchema,
  checkKind: leanAutomationCheckKindSchema,
  latestArtifactRefId: z.string().min(1).nullable(),
  latestCheckRunId: z.string().min(1).nullable(),
  latestCompletedAt: z.string().nullable(),
  latestFailureCode: z.string().trim().min(1).nullable(),
  latestSummary: z.string().trim().min(1).nullable(),
  required: z.boolean(),
  state: leanAutomationCheckStateSchema
});

export const mathLeanReviewGateStatusSchema = z.object({
  gateKind: leanReviewGateKindSchema,
  rationale: z.string().trim().min(1).nullable(),
  source: leanReviewGateSourceSchema,
  state: leanReviewGateStateSchema,
  updatedAt: z.string().nullable(),
  updatedByUserId: z.string().min(1).nullable()
}).superRefine(addMissingReviewGateRationaleIssues);

export const mathLeanSubmissionDetailSchema = z.object({
  artifacts: z.array(mathLeanArtifactRefSchema),
  checks: z.array(mathLeanAutomationCheckStatusSchema),
  createdAt: z.string(),
  mathQuestionId: z.string().min(1),
  mathQuestionRevisionId: z.string().min(1),
  mathSubmissionId: z.string().min(1),
  profile: mathLeanSubmissionProfileSchema,
  reviewGates: z.array(mathLeanReviewGateStatusSchema),
  updatedAt: z.string()
});

export const mathLeanSubmissionCreateInputSchema = z.object({
  equivalenceExpectation: leanEquivalenceExpectationSchema,
  leanSubmissionKind: leanSubmissionKindSchema,
  mathQuestionId: z.string().trim().min(1),
  mathQuestionRevisionId: z.string().trim().min(1),
  targetDeclarationName: optionalNullableTrimmedStringSchema,
  targetLaneId: optionalNullableTrimmedStringSchema,
  targetModuleName: optionalNullableTrimmedStringSchema
}).superRefine(addMissingEquivalenceTargetIssues);

export const mathLeanSubmissionUpdateInputSchema = z
  .object({
    equivalenceExpectation: leanEquivalenceExpectationSchema.optional(),
    targetDeclarationName: optionalNullableTrimmedStringSchema,
    targetLaneId: optionalNullableTrimmedStringSchema,
    targetModuleName: optionalNullableTrimmedStringSchema
  })
  .refine(
    (value) =>
      value.equivalenceExpectation !== undefined ||
      value.targetDeclarationName !== undefined ||
      value.targetLaneId !== undefined ||
      value.targetModuleName !== undefined,
    {
      message: "At least one Lean submission field must be updated."
    }
  )
  .superRefine((value, context) => {
    if (
      !value.equivalenceExpectation ||
      value.equivalenceExpectation === "not_applicable"
    ) {
      return;
    }

    if (value.targetModuleName === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "targetModuleName cannot be cleared when equivalenceExpectation references an existing target.",
        path: ["targetModuleName"]
      });
    }

    if (value.targetDeclarationName === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "targetDeclarationName cannot be cleared when equivalenceExpectation references an existing target.",
        path: ["targetDeclarationName"]
      });
    }
  });

export const mathLeanAutomationEnqueueInputSchema = z.object({
  forceRerun: z.boolean().default(false)
});

export const mathLeanReviewGateUpdateInputSchema = z.object({
  rationale: optionalNullableTrimmedStringSchema,
  state: leanReviewGateStateSchema
}).superRefine(addMissingReviewGateRationaleIssues);
