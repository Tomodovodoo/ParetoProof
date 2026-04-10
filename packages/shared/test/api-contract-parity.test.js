import { describe, expect, it } from "bun:test";
import {
  apiCallBoundaryCatalog,
  apiEndpointCatalog,
  apiEndpointSchemaCatalog,
  apiEndpointSchemaContract
} from "../dist/index.js";

describe("shared api catalog parity", () => {
  it("keeps endpoint ids and boundary ids in lockstep", () => {
    const endpointIds = apiEndpointCatalog.map((entry) => entry.id);
    const boundaryIds = apiCallBoundaryCatalog.map((entry) => entry.endpointId);
    const schemaIds = Object.keys(apiEndpointSchemaContract);

    expect(new Set(endpointIds).size).toBe(endpointIds.length);
    expect(new Set(boundaryIds).size).toBe(boundaryIds.length);
    expect(new Set(schemaIds).size).toBe(schemaIds.length);

    expect(boundaryIds.slice().sort()).toEqual(endpointIds.slice().sort());
    expect(schemaIds.slice().sort()).toEqual(endpointIds.slice().sort());
  });

  it("covers the admin offline-ingest mutation boundary explicitly", () => {
    expect(apiCallBoundaryCatalog).toContainEqual(
      expect.objectContaining({
        credential: "cloudflare_access_jwt",
        endpointId: "admin.problem9-offline-ingest.create",
        mode: "browser_direct",
        origin: "portal_browser"
      })
    );
  });

  it("exposes non-null schemas for representative catalogued endpoints", () => {
    expect(apiEndpointSchemaContract["health.read"].responseBodySchema).not.toBeNull();
    expect(apiEndpointSchemaContract["portal.access-request.create"].requestBodySchema).not.toBeNull();
    expect(apiEndpointSchemaContract["portal.access-request.read"].responseBodySchema).not.toBeNull();
    expect(apiEndpointSchemaContract["portal.profile.read"].responseBodySchema).not.toBeNull();
    expect(apiEndpointSchemaContract["portal.benchmarks.list"].responseBodySchema).not.toBeNull();
    expect(apiEndpointSchemaContract["portal.benchmark-dataset.read"].paramsSchema).not.toBeNull();
    expect(apiEndpointSchemaContract["portal.profile.link-intent.create"].responseBodySchema).not.toBeNull();
    expect(apiEndpointSchemaContract["admin.problem9-offline-ingest.create"].requestBodySchema).not.toBeNull();
    expect(apiEndpointSchemaContract["internal.worker.claim"].responseBodySchema).not.toBeNull();
  });

  it("uses explicit nulls instead of undefined for absent schema surfaces", () => {
    for (const contractEntry of Object.values(apiEndpointSchemaContract)) {
      expect(Object.keys(contractEntry).sort()).toEqual([
        "paramsSchema",
        "querySchema",
        "requestBodySchema",
        "responseBodySchema"
      ]);
    }

    expect(apiEndpointSchemaContract["portal.me.read"]).toEqual({
      paramsSchema: null,
      querySchema: null,
      requestBodySchema: null,
      responseBodySchema: null
    });

    expect(apiEndpointSchemaContract["portal.benchmark-export.read"].paramsSchema).not.toBeNull();
    expect(apiEndpointSchemaContract["portal.benchmark-export.read"].querySchema).not.toBeNull();
    expect(apiEndpointSchemaContract["portal.benchmark-export.read"].requestBodySchema).toBeNull();
    expect(apiEndpointSchemaContract["portal.benchmark-export.read"].responseBodySchema).toBeNull();
  });

  it("keeps the legacy schema contract derived from the schema catalog", () => {
    for (const endpoint of apiEndpointCatalog) {
      expect(apiEndpointSchemaContract[endpoint.id]).toEqual({
        paramsSchema: apiEndpointSchemaCatalog[endpoint.id].requestParams,
        querySchema: apiEndpointSchemaCatalog[endpoint.id].requestQuery,
        requestBodySchema: apiEndpointSchemaCatalog[endpoint.id].requestBody,
        responseBodySchema: apiEndpointSchemaCatalog[endpoint.id].responseBody
      });
    }
  });
});
