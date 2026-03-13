import {
  portalAdminAccessRequestDetailResponseSchema,
  portalAdminAccessRequestListResponseSchema,
  portalAdminUserRevokeInputSchema,
  portalAdminUserDetailResponseSchema,
  portalAdminUserListResponseSchema
} from "../schemas/portal-admin.js";

export const portalAdminReadModelsContract = {
  accessRequestDetailResponse: portalAdminAccessRequestDetailResponseSchema,
  accessRequestListResponse: portalAdminAccessRequestListResponseSchema,
  userRevokeInput: portalAdminUserRevokeInputSchema,
  userDetailResponse: portalAdminUserDetailResponseSchema,
  userListResponse: portalAdminUserListResponseSchema
};
