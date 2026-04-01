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
    expect(apiEndpointSchemaCatalog["portal.session.complete"].responseBody).toBeNull();
  });
});
