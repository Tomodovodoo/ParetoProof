import type { ZodTypeAny } from "zod";
import type { ApiEndpointId } from "../contracts/api-catalog.js";

export type ApiEndpointSchemaContractEntry = {
  paramsSchema: ZodTypeAny | null;
  querySchema: ZodTypeAny | null;
  requestBodySchema: ZodTypeAny | null;
  responseBodySchema: ZodTypeAny | null;
};

export type ApiEndpointSchemaContract = Record<
  ApiEndpointId,
  ApiEndpointSchemaContractEntry
>;
