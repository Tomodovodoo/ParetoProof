import {
  portalAccessRecoveryInputSchema,
  portalAccessRequestInputSchema,
  portalAdminAccessRequestDetailSchema,
  portalAdminAccessRequestListItemSchema,
  portalAccessRequestSummarySchema,
  portalAdminUserDetailSchema,
  portalAdminUserListItemSchema,
  portalAdminAccessRequestApproveInputSchema,
  portalAdminAccessRequestRejectInputSchema
} from "../schemas/access-request.js";

export const portalAccessRequestContract = {
  adminApproveInput: portalAdminAccessRequestApproveInputSchema,
  adminDetail: portalAdminAccessRequestDetailSchema,
  adminRejectInput: portalAdminAccessRequestRejectInputSchema,
  adminRequestListItem: portalAdminAccessRequestListItemSchema,
  adminUserDetail: portalAdminUserDetailSchema,
  adminUserListItem: portalAdminUserListItemSchema,
  createInput: portalAccessRequestInputSchema,
  recoveryInput: portalAccessRecoveryInputSchema,
  summary: portalAccessRequestSummarySchema
};
