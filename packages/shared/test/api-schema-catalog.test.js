import { describe, expect, it } from "bun:test";
import {
  apiEndpointCatalog,
  apiEndpointSchemaCatalog,
  portalAccessRequestInputSchema,
  portalAccessRequestReadResponseSchema,
  portalAdminAccessRequestParamsSchema,
  portalAdminUserParamsSchema,
  portalBenchmarkDatasetParamsSchema,
  portalBenchmarkDatasetResponseSchema,
  portalBenchmarkExportQuerySchema,
  portalBenchmarksListResponseSchema,
  portalRunDetailParamsSchema,
  portalAccessRequestSummaryResponseSchema,
  portalProfileResponseSchema,
  portalSessionRedirectInputSchema,
  portalSessionRedirectRequestBodySchema,
  mathApiUnavailableResponseSchema,
  mathLeanReviewGateUpdateInputSchema,
  mathLeanSubmissionCreateInputSchema,
  mathLeanSubmissionPatchInputSchema,
  mathPackageCandidateParamsSchema,
  mathQuestionParamsSchema,
  mathReleaseParamsSchema,
  mathReviewGateParamsSchema,
  mathReviewParamsSchema,
  mathSubmissionParamsSchema,
  workerJobParamsSchema,
  workerClaimRequestSchema,
  workerClaimResponseSchema
} from "../dist/index.js";

describe("shared api schema catalog", () => {
  it("keeps endpoint ids and schema bindings in lockstep", () => {
    const endpointIds = apiEndpointCatalog.map((entry) => entry.id).slice().sort();
    const schemaIds = Object.keys(apiEndpointSchemaCatalog).slice().sort();

    expect(schemaIds).toEqual(endpointIds);
  });

  it("binds representative portal and worker endpoints to shared schemas", () => {
    expect(apiEndpointSchemaCatalog["portal.access-request.create"]).toEqual({
      requestBody: portalAccessRequestInputSchema,
      requestParams: null,
      requestQuery: null,
      responseBody: portalAccessRequestSummaryResponseSchema
    });

    expect(apiEndpointSchemaCatalog["portal.profile.read"]).toEqual({
      requestBody: null,
      requestParams: null,
      requestQuery: null,
      responseBody: portalProfileResponseSchema
    });

    expect(apiEndpointSchemaCatalog["portal.session.retry.complete"]).toEqual({
      requestBody: null,
      requestParams: null,
      requestQuery: portalSessionRedirectInputSchema,
      responseBody: null
    });

    expect(apiEndpointSchemaCatalog["portal.session.retry.finalize"]).toEqual({
      requestBody: null,
      requestParams: null,
      requestQuery: portalSessionRedirectInputSchema,
      responseBody: null
    });

    expect(apiEndpointSchemaCatalog["portal.session.finalize.read"]).toEqual({
      requestBody: null,
      requestParams: null,
      requestQuery: portalSessionRedirectInputSchema,
      responseBody: null
    });

    expect(apiEndpointSchemaCatalog["portal.session.complete.submit"]).toEqual({
      requestBody: portalSessionRedirectRequestBodySchema,
      requestParams: null,
      requestQuery: portalSessionRedirectInputSchema,
      responseBody: null
    });

    expect(apiEndpointSchemaCatalog["portal.session.finalize.submit"]).toEqual({
      requestBody: portalSessionRedirectRequestBodySchema,
      requestParams: null,
      requestQuery: portalSessionRedirectInputSchema,
      responseBody: null
    });

    expect(apiEndpointSchemaCatalog["portal.session.complete"]).toEqual({
      requestBody: portalSessionRedirectRequestBodySchema,
      requestParams: null,
      requestQuery: portalSessionRedirectInputSchema,
      responseBody: null
    });

    expect(apiEndpointSchemaCatalog["portal.benchmarks.list"].responseBody).toBe(
      portalBenchmarksListResponseSchema
    );

    expect(apiEndpointSchemaCatalog["portal.benchmark-dataset.read"]).toEqual({
      requestBody: null,
      requestParams: portalBenchmarkDatasetParamsSchema,
      requestQuery: null,
      responseBody: portalBenchmarkDatasetResponseSchema
    });

    expect(apiEndpointSchemaCatalog["portal.benchmark-export.read"].requestQuery).toBe(
      portalBenchmarkExportQuerySchema
    );

    expect(apiEndpointSchemaCatalog["portal.access-request.read"]).toEqual({
      requestBody: null,
      requestParams: null,
      requestQuery: null,
      responseBody: portalAccessRequestReadResponseSchema
    });

    expect(apiEndpointSchemaCatalog["math.questions.list"]).toEqual({
      requestBody: null,
      requestParams: null,
      requestQuery: null,
      responseBody: mathApiUnavailableResponseSchema
    });

    expect(apiEndpointSchemaCatalog["math.question.detail"]).toEqual({
      requestBody: null,
      requestParams: mathQuestionParamsSchema,
      requestQuery: null,
      responseBody: mathApiUnavailableResponseSchema
    });

    expect(apiEndpointSchemaCatalog["math.submission.create"]).toEqual({
      requestBody: mathLeanSubmissionCreateInputSchema,
      requestParams: mathQuestionParamsSchema,
      requestQuery: null,
      responseBody: mathApiUnavailableResponseSchema
    });

    expect(apiEndpointSchemaCatalog["math.submission.detail"]).toEqual({
      requestBody: null,
      requestParams: mathSubmissionParamsSchema,
      requestQuery: null,
      responseBody: mathApiUnavailableResponseSchema
    });

    expect(apiEndpointSchemaCatalog["math.submission.lean-profile.update"]).toEqual({
      requestBody: mathLeanSubmissionPatchInputSchema,
      requestParams: mathSubmissionParamsSchema,
      requestQuery: null,
      responseBody: mathApiUnavailableResponseSchema
    });

    expect(apiEndpointSchemaCatalog["math.submission.review-gate.update"]).toEqual({
      requestBody: mathLeanReviewGateUpdateInputSchema,
      requestParams: mathReviewGateParamsSchema,
      requestQuery: null,
      responseBody: mathApiUnavailableResponseSchema
    });

    expect(apiEndpointSchemaCatalog["math.reviews.list"]).toEqual({
      requestBody: null,
      requestParams: null,
      requestQuery: null,
      responseBody: mathApiUnavailableResponseSchema
    });

    expect(apiEndpointSchemaCatalog["math.review.detail"]).toEqual({
      requestBody: null,
      requestParams: mathReviewParamsSchema,
      requestQuery: null,
      responseBody: mathApiUnavailableResponseSchema
    });

    expect(apiEndpointSchemaCatalog["math.package-candidates.list"]).toEqual({
      requestBody: null,
      requestParams: null,
      requestQuery: null,
      responseBody: mathApiUnavailableResponseSchema
    });

    expect(apiEndpointSchemaCatalog["math.package-candidate.detail"]).toEqual({
      requestBody: null,
      requestParams: mathPackageCandidateParamsSchema,
      requestQuery: null,
      responseBody: mathApiUnavailableResponseSchema
    });

    expect(apiEndpointSchemaCatalog["math.releases.list"]).toEqual({
      requestBody: null,
      requestParams: null,
      requestQuery: null,
      responseBody: mathApiUnavailableResponseSchema
    });

    expect(apiEndpointSchemaCatalog["math.release.detail"]).toEqual({
      requestBody: null,
      requestParams: mathReleaseParamsSchema,
      requestQuery: null,
      responseBody: mathApiUnavailableResponseSchema
    });

    expect(apiEndpointSchemaCatalog["math.question-launch.read"]).toEqual({
      requestBody: null,
      requestParams: mathQuestionParamsSchema,
      requestQuery: null,
      responseBody: mathApiUnavailableResponseSchema
    });

    expect(apiEndpointSchemaCatalog["portal.run-detail.read"].requestParams).toBe(
      portalRunDetailParamsSchema
    );

    expect(apiEndpointSchemaCatalog["admin.access-request.detail"].requestParams).toBe(
      portalAdminAccessRequestParamsSchema
    );

    expect(apiEndpointSchemaCatalog["admin.user.detail"].requestParams).toBe(
      portalAdminUserParamsSchema
    );

    expect(apiEndpointSchemaCatalog["internal.worker.claim"]).toEqual({
      requestBody: workerClaimRequestSchema,
      requestParams: null,
      requestQuery: null,
      responseBody: workerClaimResponseSchema
    });

    expect(apiEndpointSchemaCatalog["internal.worker.result.submit"].requestParams).toBe(
      workerJobParamsSchema
    );
  });

  it("makes intentionally unmodeled endpoint responses explicit", () => {
    expect(apiEndpointSchemaCatalog["portal.me.read"].responseBody).toBeNull();
    expect(apiEndpointSchemaCatalog["portal.session.retry.complete"].responseBody).toBeNull();
    expect(apiEndpointSchemaCatalog["portal.session.retry.finalize"].responseBody).toBeNull();
    expect(apiEndpointSchemaCatalog["portal.session.finalize.read"].responseBody).toBeNull();
    expect(apiEndpointSchemaCatalog["portal.session.complete.submit"].responseBody).toBeNull();
    expect(apiEndpointSchemaCatalog["portal.session.finalize.submit"].responseBody).toBeNull();
    expect(apiEndpointSchemaCatalog["portal.session.complete"].responseBody).toBeNull();
  });
});
