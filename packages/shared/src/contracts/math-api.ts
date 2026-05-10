import {
  mathApiUnavailableResponseSchema,
  mathPackageCandidateParamsSchema,
  mathQuestionParamsSchema,
  mathReleaseParamsSchema,
  mathReviewGateParamsSchema,
  mathReviewParamsSchema,
  mathSubmissionParamsSchema
} from "../schemas/math-api.js";

export const mathApiContract = {
  packageCandidateParams: mathPackageCandidateParamsSchema,
  questionParams: mathQuestionParamsSchema,
  releaseParams: mathReleaseParamsSchema,
  reviewGateParams: mathReviewGateParamsSchema,
  reviewParams: mathReviewParamsSchema,
  submissionParams: mathSubmissionParamsSchema,
  unavailableResponse: mathApiUnavailableResponseSchema
};
