import {
  portalAdminAccessRequestDetailResponseSchema,
  portalAdminAccessRequestListResponseSchema,
  portalAdminUserDetailResponseSchema,
  portalAdminUserListResponseSchema
} from "../schemas/portal-admin.js";

export const portalAdminReadModelsContract = {
  accessRequestDetailResponse: portalAdminAccessRequestDetailResponseSchema,
  accessRequestListResponse: portalAdminAccessRequestListResponseSchema,
  userDetailResponse: portalAdminUserDetailResponseSchema,
  userListResponse: portalAdminUserListResponseSchema
};
