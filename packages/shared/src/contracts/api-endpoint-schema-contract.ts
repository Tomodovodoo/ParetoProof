import { apiEndpointCatalog } from "./api-catalog.js";
import { apiEndpointSchemaCatalog } from "./api-schema-catalog.js";
import type { ApiEndpointSchemaContract } from "../types/api-endpoint-schema-contract.js";

export const apiEndpointSchemaContract = Object.fromEntries(
  apiEndpointCatalog.map((entry) => [
    entry.id,
    {
      paramsSchema: apiEndpointSchemaCatalog[entry.id].requestParams,
      querySchema: apiEndpointSchemaCatalog[entry.id].requestQuery,
      requestBodySchema: apiEndpointSchemaCatalog[entry.id].requestBody,
      responseBodySchema: apiEndpointSchemaCatalog[entry.id].responseBody
    }
  ])
) as ApiEndpointSchemaContract;
