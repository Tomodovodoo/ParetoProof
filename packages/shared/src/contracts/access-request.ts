import {
  portalAccessRecoveryInputSchema,
  portalAccessRequestInputSchema,
  portalAccessRequestSummarySchema,
  portalAdminAccessRequestApproveInputSchema,
  portalAdminAccessRequestRejectInputSchema
} from "../schemas/access-request.js";

export const portalAccessRequestContract = {
  adminApproveInput: portalAdminAccessRequestApproveInputSchema,
  adminRejectInput: portalAdminAccessRequestRejectInputSchema,
  createInput: portalAccessRequestInputSchema,
  recoveryInput: portalAccessRecoveryInputSchema,
  summary: portalAccessRequestSummarySchema
};
