import { describe, expect, it } from "bun:test";
import {
  mathApiContract,
  mathApiUnavailableResponseSchema,
  mathQuestionParamsSchema,
  mathReleaseParamsSchema,
  mathReviewGateParamsSchema
} from "../dist/index.js";

describe("math api contracts", () => {
  it("validates explicit unavailable responses for blocked math route families", () => {
    expect(
      mathApiUnavailableResponseSchema.safeParse({
        error: "math_api_route_not_ready",
        message: "Math question persistence is not configured yet.",
        nextStep: "Land #893 before enabling durable question routes.",
        requiredIssues: ["#893"],
        resource: "questions"
      }).success
    ).toBeTrue();
  });

  it("rejects padded route params so route ids stay canonical", () => {
    expect(
      mathQuestionParamsSchema.safeParse({
        questionId: "problem-9"
      }).success
    ).toBeTrue();
    expect(
      mathQuestionParamsSchema.safeParse({
        questionId: " problem-9 "
      }).success
    ).toBeFalse();
  });

  it("exports the route parameter schemas through the shared contract", () => {
    expect(mathApiContract.questionParams).toBe(mathQuestionParamsSchema);
    expect(mathApiContract.releaseParams).toBe(mathReleaseParamsSchema);
    expect(mathApiContract.reviewGateParams).toBe(mathReviewGateParamsSchema);
    expect(mathApiContract.unavailableResponse).toBe(mathApiUnavailableResponseSchema);
  });

  it("validates canonical review-gate route params", () => {
    expect(
      mathReviewGateParamsSchema.safeParse({
        reviewGateKind: "policy_review",
        submissionId: "submission-1"
      }).success
    ).toBeTrue();
    expect(
      mathReviewGateParamsSchema.safeParse({
        reviewGateKind: "portal_review",
        submissionId: "submission-1"
      }).success
    ).toBeFalse();
  });
});
