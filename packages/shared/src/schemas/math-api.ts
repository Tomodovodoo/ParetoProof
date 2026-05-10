import { z } from "zod";
import { leanReviewGateKindSchema } from "./math-lean-submission.js";

const nonPaddedNonBlankParamStringSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0 && value === value.trim(), {
    message: "Path params must not be blank or padded with whitespace."
  });

export const mathApiUnavailableResourceSchema = z.enum([
  "lean_workflow",
  "launch",
  "package_candidate",
  "package_candidates",
  "question",
  "questions",
  "release",
  "releases",
  "review",
  "reviews",
  "submission"
]);

export const mathApiUnavailableResponseSchema = z.object({
  error: z.literal("math_api_route_not_ready"),
  message: z.string().min(1),
  nextStep: z.string().min(1),
  requiredIssues: z.array(z.string().regex(/^#\d+$/u)).min(1),
  resource: mathApiUnavailableResourceSchema
});

export const mathQuestionParamsSchema = z.object({
  questionId: nonPaddedNonBlankParamStringSchema
});

export const mathSubmissionParamsSchema = z.object({
  submissionId: nonPaddedNonBlankParamStringSchema
});

export const mathReviewParamsSchema = z.object({
  reviewId: nonPaddedNonBlankParamStringSchema
});

export const mathPackageCandidateParamsSchema = z.object({
  packageCandidateId: nonPaddedNonBlankParamStringSchema
});

export const mathReleaseParamsSchema = z.object({
  releaseId: nonPaddedNonBlankParamStringSchema
});

export const mathReviewGateParamsSchema = z.object({
  reviewGateKind: leanReviewGateKindSchema,
  submissionId: nonPaddedNonBlankParamStringSchema
});
