import { portalAccessRequestInputSchema, portalAccessRequestSummarySchema } from "../schemas/access-request";

export const portalAccessRequestContract = {
  createInput: portalAccessRequestInputSchema,
  summary: portalAccessRequestSummarySchema
};
