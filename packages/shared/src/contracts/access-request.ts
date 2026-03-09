import {
  portalAccessRequestInputSchema,
  portalAccessRequestSummarySchema,
  portalAdminAccessRequestApproveInputSchema,
  portalAdminAccessRequestRejectInputSchema
} from "../schemas/access-request";

export const portalAccessRequestContract = {
  adminApproveInput: portalAdminAccessRequestApproveInputSchema,
  adminRejectInput: portalAdminAccessRequestRejectInputSchema,
  createInput: portalAccessRequestInputSchema,
  summary: portalAccessRequestSummarySchema
};
