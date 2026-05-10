import { z } from "zod";
import {
  mathArtifactBackingTypes,
  mathArtifactSubjectTypes,
  mathAutomationSummaryPostures,
  mathPackageCandidatePostures,
  mathPackageCandidateSourceTypes,
  mathQuestionPostures,
  mathQuestionRevisionPostures,
  mathReleaseLinkPostures,
  mathReviewAssignmentRoles,
  mathReviewAssignmentStates,
  mathReviewChecklistStates,
  mathReviewKinds,
  mathReviewRecordPostures,
  mathReviewRoundPostures,
  mathReviewSubjectTypes,
  mathSubmissionPostures
} from "../types/math-workflow.js";

const nonEmptyStringSchema = z.string().trim().min(1);
const uuidSchema = z.string().uuid();
const nullableUuidSchema = uuidSchema.nullable();

export const mathQuestionPostureSchema = z.enum(mathQuestionPostures);
export const mathQuestionRevisionPostureSchema = z.enum(
  mathQuestionRevisionPostures
);
export const mathSubmissionPostureSchema = z.enum(mathSubmissionPostures);
export const mathAutomationSummaryPostureSchema = z.enum(
  mathAutomationSummaryPostures
);
export const mathArtifactSubjectTypeSchema = z.enum(mathArtifactSubjectTypes);
export const mathArtifactBackingTypeSchema = z.enum(mathArtifactBackingTypes);
export const mathReviewSubjectTypeSchema = z.enum(mathReviewSubjectTypes);
export const mathReviewKindSchema = z.enum(mathReviewKinds);
export const mathReviewRecordPostureSchema = z.enum(mathReviewRecordPostures);
export const mathReviewRoundPostureSchema = z.enum(mathReviewRoundPostures);
export const mathReviewAssignmentRoleSchema = z.enum(mathReviewAssignmentRoles);
export const mathReviewAssignmentStateSchema = z.enum(
  mathReviewAssignmentStates
);
export const mathReviewChecklistStateSchema = z.enum(mathReviewChecklistStates);
export const mathPackageCandidateSourceTypeSchema = z.enum(
  mathPackageCandidateSourceTypes
);
export const mathPackageCandidatePostureSchema = z.enum(
  mathPackageCandidatePostures
);
export const mathReleaseLinkPostureSchema = z.enum(mathReleaseLinkPostures);

const mathQuestionRevisionArtifactRefSchema = z.object({
  artifactId: nullableUuidSchema,
  artifactRole: nonEmptyStringSchema,
  backingMetadata: z.record(z.string(), z.unknown()),
  backingType: mathArtifactBackingTypeSchema,
  contentDigest: nonEmptyStringSchema.nullable(),
  filename: nonEmptyStringSchema,
  id: uuidSchema,
  mathQuestionRevisionId: uuidSchema,
  mediaType: nonEmptyStringSchema.nullable(),
  pathHint: nonEmptyStringSchema.nullable(),
  subjectType: z.literal("question_revision")
});

const mathSubmissionArtifactRefSchema = z.object({
  artifactId: nullableUuidSchema,
  artifactRole: nonEmptyStringSchema,
  backingMetadata: z.record(z.string(), z.unknown()),
  backingType: mathArtifactBackingTypeSchema,
  contentDigest: nonEmptyStringSchema.nullable(),
  filename: nonEmptyStringSchema,
  id: uuidSchema,
  mathSubmissionId: uuidSchema,
  mediaType: nonEmptyStringSchema.nullable(),
  pathHint: nonEmptyStringSchema.nullable(),
  subjectType: z.literal("submission")
});

export const mathArtifactRefSchema = z
  .discriminatedUnion("subjectType", [
    mathQuestionRevisionArtifactRefSchema,
    mathSubmissionArtifactRefSchema
  ])
  .superRefine((value, context) => {
    if (value.artifactId === null && value.contentDigest === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "artifactId or contentDigest is required for a math artifact ref.",
        path: ["artifactId"]
      });
    }

    if (
      value.backingType === "repo_linked_reference" &&
      Object.keys(value.backingMetadata).length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "repo_linked_reference artifact refs require repository metadata.",
        path: ["backingMetadata"]
      });
    }
  });

const mathQuestionRevisionReviewSubjectSchema = z.object({
  mathQuestionRevisionId: uuidSchema,
  subjectType: z.literal("question_revision")
});

const mathSubmissionReviewSubjectSchema = z.object({
  mathSubmissionId: uuidSchema,
  subjectType: z.literal("submission")
});

const mathPackageCandidateReviewSubjectSchema = z.object({
  mathPackageCandidateId: nonEmptyStringSchema,
  subjectType: z.literal("package_candidate")
});

export const mathReviewSubjectRefSchema = z.discriminatedUnion("subjectType", [
  mathQuestionRevisionReviewSubjectSchema,
  mathSubmissionReviewSubjectSchema,
  mathPackageCandidateReviewSubjectSchema
]);

const mathQuestionRevisionPackageCandidateSourceSchema = z.object({
  mathQuestionId: uuidSchema,
  mathQuestionRevisionId: uuidSchema,
  sourceType: z.literal("question_revision")
});

const mathSubmissionPackageCandidateSourceSchema = z.object({
  mathQuestionId: uuidSchema,
  mathSubmissionId: uuidSchema,
  sourceType: z.literal("submission")
});

export const mathPackageCandidateSourceRefSchema = z.discriminatedUnion(
  "sourceType",
  [
    mathQuestionRevisionPackageCandidateSourceSchema,
    mathSubmissionPackageCandidateSourceSchema
  ]
);

export const mathReleaseLinkSchema = z
  .object({
    benchmarkReleaseId: nonEmptyStringSchema.nullable(),
    benchmarkVersionId: nonEmptyStringSchema.nullable(),
    id: uuidSchema,
    mathPackageCandidateId: nonEmptyStringSchema,
    mathQuestionId: uuidSchema,
    posture: mathReleaseLinkPostureSchema
  })
  .superRefine((value, context) => {
    if (value.posture === "version_linked" && value.benchmarkVersionId === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Version-linked math release links require a benchmark version reference.",
        path: ["benchmarkVersionId"]
      });
    }

    if (
      (value.posture === "release_linked" || value.posture === "published") &&
      value.benchmarkReleaseId === null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Released math release links require a benchmark release reference.",
        path: ["posture"]
      });
    }
  });

export const mathWorkflowContractSummarySchema = z.object({
  artifactBackingTypes: z.array(mathArtifactBackingTypeSchema),
  artifactSubjectTypes: z.array(mathArtifactSubjectTypeSchema),
  packageCandidatePostures: z.array(mathPackageCandidatePostureSchema),
  questionPostures: z.array(mathQuestionPostureSchema),
  reviewKinds: z.array(mathReviewKindSchema),
  submissionPostures: z.array(mathSubmissionPostureSchema)
});
