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

export const leanArtifactOwnerScopeByArtifactRole = {
  statement_source: "question_revision",
  supporting_lean_module: "submission",
  submission_entrypoint: "submission",
  compile_output: "submission",
  compile_diagnostics: "submission",
  verifier_output: "submission",
  equivalence_report: "submission",
  review_attachment: "submission"
} as const;

export const leanArtifactLifecycleStageByArtifactRole = {
  statement_source: "question_source",
  supporting_lean_module: "submission_input",
  submission_entrypoint: "submission_input",
  compile_output: "generated",
  compile_diagnostics: "generated",
  verifier_output: "generated",
  equivalence_report: "generated",
  review_attachment: "review_support"
} as const;

function addDuplicateStatusEntryIssues<T extends string>(
  keys: T[],
  path: "checks" | "reviewGates",
  field: "checkKind" | "gateKind",
  context: z.RefinementCtx
) {
  const firstIndexByKey = new Map<T, number>();

  keys.forEach((key, index) => {
    if (!firstIndexByKey.has(key)) {
      firstIndexByKey.set(key, index);
      return;
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${field} values must be unique within ${path}.`,
      path: [path, index, field]
    });
  });
}

export const mathLeanSubmissionProfileBaseSchema = z.object({
  equivalenceExpectation: leanEquivalenceExpectationSchema,
  leanSubmissionKind: leanSubmissionKindSchema,
  targetDeclarationName: z.string().trim().min(1).nullable(),
  targetLaneId: z.string().trim().min(1).nullable(),
  targetModuleName: z.string().trim().min(1).nullable()
});

const mathLeanUntargetedSubmissionProfileSchema = mathLeanSubmissionProfileBaseSchema.extend({
  equivalenceExpectation: z.literal("not_applicable"),
  leanSubmissionKind: z.enum(["lean_proof_submission", "lean_formalization_submission"]),
  targetDeclarationName: z.null(),
  targetLaneId: z.null(),
  targetModuleName: z.null()
});

const mathLeanCanonicalStatementProfileSchema = mathLeanSubmissionProfileBaseSchema.extend({
  equivalenceExpectation: z.literal("canonical_statement"),
  targetDeclarationName: z.string().trim().min(1),
  targetModuleName: z.string().trim().min(1)
});

const mathLeanPriorSubmissionProfileSchema = mathLeanSubmissionProfileBaseSchema.extend({
  equivalenceExpectation: z.literal("prior_submission"),
  targetDeclarationName: z.string().trim().min(1),
  targetModuleName: z.string().trim().min(1)
});

export const mathLeanSubmissionProfileSchema = z.discriminatedUnion(
  "equivalenceExpectation",
  [
    mathLeanUntargetedSubmissionProfileSchema,
    mathLeanCanonicalStatementProfileSchema,
    mathLeanPriorSubmissionProfileSchema
  ]
);

const mathLeanArtifactRefBaseSchema = z.object({
  artifactId: z.string().min(1).nullable(),
  contentDigest: sha256Schema.nullable(),
  filename: z.string().trim().min(1),
  mediaType: z.string().trim().min(1).nullable(),
  pathHint: z.string().trim().min(1).nullable()
});

const mathLeanStatementSourceArtifactRefSchema = mathLeanArtifactRefBaseSchema.extend({
  artifactRole: z.literal("statement_source"),
  lifecycleStage: z.literal("question_source"),
  ownerScope: z.literal("question_revision")
});

const mathLeanSupportingLeanModuleArtifactRefSchema = mathLeanArtifactRefBaseSchema.extend({
  artifactRole: z.literal("supporting_lean_module"),
  lifecycleStage: z.literal("submission_input"),
  ownerScope: z.literal("submission")
});

const mathLeanSubmissionEntrypointArtifactRefSchema = mathLeanArtifactRefBaseSchema.extend({
  artifactRole: z.literal("submission_entrypoint"),
  lifecycleStage: z.literal("submission_input"),
  ownerScope: z.literal("submission")
});

const mathLeanCompileOutputArtifactRefSchema = mathLeanArtifactRefBaseSchema.extend({
  artifactRole: z.literal("compile_output"),
  lifecycleStage: z.literal("generated"),
  ownerScope: z.literal("submission")
});

const mathLeanCompileDiagnosticsArtifactRefSchema = mathLeanArtifactRefBaseSchema.extend({
  artifactRole: z.literal("compile_diagnostics"),
  lifecycleStage: z.literal("generated"),
  ownerScope: z.literal("submission")
});

const mathLeanVerifierOutputArtifactRefSchema = mathLeanArtifactRefBaseSchema.extend({
  artifactRole: z.literal("verifier_output"),
  lifecycleStage: z.literal("generated"),
  ownerScope: z.literal("submission")
});

const mathLeanEquivalenceReportArtifactRefSchema = mathLeanArtifactRefBaseSchema.extend({
  artifactRole: z.literal("equivalence_report"),
  lifecycleStage: z.literal("generated"),
  ownerScope: z.literal("submission")
});

const mathLeanReviewAttachmentArtifactRefSchema = mathLeanArtifactRefBaseSchema.extend({
  artifactRole: z.literal("review_attachment"),
  lifecycleStage: z.literal("review_support"),
  ownerScope: z.literal("submission")
});

export const mathLeanArtifactRefSchema = z.discriminatedUnion("artifactRole", [
  mathLeanStatementSourceArtifactRefSchema,
  mathLeanSupportingLeanModuleArtifactRefSchema,
  mathLeanSubmissionEntrypointArtifactRefSchema,
  mathLeanCompileOutputArtifactRefSchema,
  mathLeanCompileDiagnosticsArtifactRefSchema,
  mathLeanVerifierOutputArtifactRefSchema,
  mathLeanEquivalenceReportArtifactRefSchema,
  mathLeanReviewAttachmentArtifactRefSchema
]);

const mathLeanAutomationCheckStatusBaseSchema = z.object({
  checkKind: leanAutomationCheckKindSchema,
  latestArtifactRefId: z.string().min(1).nullable(),
  latestCheckRunId: z.string().min(1).nullable(),
  latestCompletedAt: z.string().nullable(),
  latestFailureCode: z.string().trim().min(1).nullable(),
  latestSummary: z.string().trim().min(1).nullable()
});

const mathLeanRequiredAutomationCheckStatusSchema =
  mathLeanAutomationCheckStatusBaseSchema.extend({
    applicability: z.literal("required"),
    required: z.literal(true),
    state: leanAutomationCheckStateSchema
  });

const mathLeanOptionalAutomationCheckStatusSchema =
  mathLeanAutomationCheckStatusBaseSchema.extend({
    applicability: z.literal("optional"),
    required: z.literal(false),
    state: leanAutomationCheckStateSchema
  });

const mathLeanNotApplicableAutomationCheckStatusSchema =
  mathLeanAutomationCheckStatusBaseSchema.extend({
    applicability: z.literal("not_applicable"),
    latestArtifactRefId: z.null(),
    latestCheckRunId: z.null(),
    latestCompletedAt: z.null(),
    latestFailureCode: z.null(),
    latestSummary: z.null(),
    required: z.literal(false),
    state: z.literal("not_requested")
  });

export const mathLeanAutomationCheckStatusSchema = z.discriminatedUnion(
  "applicability",
  [
    mathLeanRequiredAutomationCheckStatusSchema,
    mathLeanOptionalAutomationCheckStatusSchema,
    mathLeanNotApplicableAutomationCheckStatusSchema
  ]
);

const mathLeanResolvedReviewGateStatusSchema = z.object({
  gateKind: leanReviewGateKindSchema,
  rationale: z.string().trim().min(1).nullable(),
  source: leanReviewGateSourceSchema,
  state: z.enum(["required", "satisfied"]),
  updatedAt: z.string().nullable(),
  updatedByUserId: z.string().min(1).nullable()
});

const mathLeanExplainedReviewGateStatusSchema = z.object({
  gateKind: leanReviewGateKindSchema,
  rationale: z.string().trim().min(1),
  source: leanReviewGateSourceSchema,
  state: z.enum(["waived", "blocked"]),
  updatedAt: z.string().nullable(),
  updatedByUserId: z.string().min(1).nullable()
});

export const mathLeanReviewGateStatusSchema = z.discriminatedUnion("state", [
  mathLeanResolvedReviewGateStatusSchema,
  mathLeanExplainedReviewGateStatusSchema
]);

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
}).superRefine((value, context) => {
  addDuplicateStatusEntryIssues(
    value.checks.map((entry) => entry.checkKind),
    "checks",
    "checkKind",
    context
  );
  addDuplicateStatusEntryIssues(
    value.reviewGates.map((entry) => entry.gateKind),
    "reviewGates",
    "gateKind",
    context
  );

  const equivalenceCheckIndex = value.checks.findIndex(
    (entry) => entry.checkKind === "equivalence"
  );

  if (equivalenceCheckIndex === -1) {
    return;
  }

  const equivalenceCheck = value.checks[equivalenceCheckIndex];
  const expectsEquivalence = value.profile.equivalenceExpectation !== "not_applicable";

  if (expectsEquivalence && equivalenceCheck.applicability === "not_applicable") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "equivalence checks cannot be marked not_applicable when the submission profile references an existing target.",
      path: ["checks", equivalenceCheckIndex, "applicability"]
    });
  }

  if (!expectsEquivalence && equivalenceCheck.applicability !== "not_applicable") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "equivalence checks must be marked not_applicable when the submission profile does not reference an existing target.",
      path: ["checks", equivalenceCheckIndex, "applicability"]
    });
  }
});

const mathLeanUntargetedSubmissionCreateInputSchema = z.object({
  equivalenceExpectation: z.literal("not_applicable"),
  leanSubmissionKind: z.enum(["lean_proof_submission", "lean_formalization_submission"]),
  mathQuestionId: z.string().trim().min(1),
  mathQuestionRevisionId: z.string().trim().min(1),
  targetDeclarationName: z.null().optional(),
  targetLaneId: z.null().optional(),
  targetModuleName: z.null().optional()
});

const mathLeanCanonicalStatementCreateInputSchema = z.object({
  equivalenceExpectation: z.literal("canonical_statement"),
  leanSubmissionKind: leanSubmissionKindSchema,
  mathQuestionId: z.string().trim().min(1),
  mathQuestionRevisionId: z.string().trim().min(1),
  targetDeclarationName: z.string().trim().min(1),
  targetLaneId: optionalNullableTrimmedStringSchema,
  targetModuleName: z.string().trim().min(1)
});

const mathLeanPriorSubmissionCreateInputSchema = z.object({
  equivalenceExpectation: z.literal("prior_submission"),
  leanSubmissionKind: leanSubmissionKindSchema,
  mathQuestionId: z.string().trim().min(1),
  mathQuestionRevisionId: z.string().trim().min(1),
  targetDeclarationName: z.string().trim().min(1),
  targetLaneId: optionalNullableTrimmedStringSchema,
  targetModuleName: z.string().trim().min(1)
});

export const mathLeanSubmissionCreateInputSchema = z.discriminatedUnion(
  "equivalenceExpectation",
  [
    mathLeanUntargetedSubmissionCreateInputSchema,
    mathLeanCanonicalStatementCreateInputSchema,
    mathLeanPriorSubmissionCreateInputSchema
  ]
);

const nullableTrimmedStringSchema = z.union([z.string().trim().min(1), z.null()]);

const mathLeanFieldOnlySubmissionPatchInputSchema = z.union([
  z.object({
    targetDeclarationName: nullableTrimmedStringSchema,
    targetLaneId: optionalNullableTrimmedStringSchema,
    targetModuleName: optionalNullableTrimmedStringSchema
  }).strict(),
  z.object({
    targetDeclarationName: optionalNullableTrimmedStringSchema,
    targetLaneId: nullableTrimmedStringSchema,
    targetModuleName: optionalNullableTrimmedStringSchema
  }).strict(),
  z.object({
    targetDeclarationName: optionalNullableTrimmedStringSchema,
    targetLaneId: optionalNullableTrimmedStringSchema,
    targetModuleName: nullableTrimmedStringSchema
  }).strict()
]);

const mathLeanUntargetedSubmissionPatchInputSchema = z.object({
  equivalenceExpectation: z.literal("not_applicable"),
  targetDeclarationName: z.null().optional(),
  targetLaneId: z.null().optional(),
  targetModuleName: z.null().optional()
});

const mathLeanCanonicalStatementSubmissionPatchInputSchema = z.object({
  equivalenceExpectation: z.literal("canonical_statement"),
  targetDeclarationName: z.string().trim().min(1).optional(),
  targetLaneId: optionalNullableTrimmedStringSchema,
  targetModuleName: z.string().trim().min(1).optional()
});

const mathLeanPriorSubmissionPatchInputSchema = z.object({
  equivalenceExpectation: z.literal("prior_submission"),
  targetDeclarationName: z.string().trim().min(1).optional(),
  targetLaneId: optionalNullableTrimmedStringSchema,
  targetModuleName: z.string().trim().min(1).optional()
});

export const mathLeanSubmissionPatchInputSchema = z.union([
  mathLeanFieldOnlySubmissionPatchInputSchema,
  mathLeanUntargetedSubmissionPatchInputSchema,
  mathLeanCanonicalStatementSubmissionPatchInputSchema,
  mathLeanPriorSubmissionPatchInputSchema
]);

export const mathLeanAutomationEnqueueInputSchema = z.object({
  forceRerun: z.boolean().default(false)
});

const mathLeanResolvedReviewGateUpdateInputSchema = z.object({
  rationale: optionalNullableTrimmedStringSchema,
  state: z.enum(["required", "satisfied"])
});

const mathLeanExplainedReviewGateUpdateInputSchema = z.object({
  rationale: z.string().trim().min(1),
  state: z.enum(["waived", "blocked"])
});

export const mathLeanReviewGateUpdateInputSchema = z.discriminatedUnion("state", [
  mathLeanResolvedReviewGateUpdateInputSchema,
  mathLeanExplainedReviewGateUpdateInputSchema
]);
