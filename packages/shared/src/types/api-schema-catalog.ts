import type { ZodTypeAny } from "zod";

export type ApiEndpointSchemaCatalogEntry = {
  requestBody: ZodTypeAny | null;
  requestParams: ZodTypeAny | null;
  requestQuery: ZodTypeAny | null;
  responseBody: ZodTypeAny | null;
};
