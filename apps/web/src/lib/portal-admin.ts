import {
  portalAdminAccessRequestApproveInputSchema,
  portalAdminAccessRequestRejectInputSchema,
  portalAdminReadModelsContract,
  type PortalAccessRequestSummary,
  type PortalAdminAccessRequestApproveInput,
  type PortalAdminAccessRequestListItem,
  type PortalAdminUserListItem
} from "@paretoproof/shared";
import { fetchApi } from "./api-fetch";
import { createApiFormBody } from "./api-form";

export type AdminMutationResult =
  | { ok: true }
  | {
      ok: false;
      code: string;
      conflictUserId?: string | null;
      message: string;
    };

type RevokeRoleInput = {
  reason: string;
};

function sortByCreatedDesc<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function mapAdminLoadError(
  statusCode: number,
  errorCode: string | null,
  fallbackMessage: string
) {
  if (statusCode === 401 || statusCode === 403) {
    return "This workspace is restricted to portal admins.";
  }

  if (errorCode === "access_request_not_found") {
    return "That access request is no longer available.";
  }

  if (errorCode === "admin_user_not_found") {
    return "That user record is no longer available.";
  }

  return fallbackMessage;
}

function mapAdminMutationErrorCodeToMessage(code: string) {
  switch (code) {
    case "access_identity_link_required":
      return "Approval is blocked until the matched user has at least one linked sign-in identity.";
    case "access_request_not_pending":
      return "This request has already been reviewed or withdrawn.";
    case "access_request_stale_for_approved_user":
      return "This request is stale because the matched user already has an active role.";
    case "access_request_target_user_missing":
      return "Approval is blocked because the matched user record no longer exists.";
    case "admin_user_no_active_role":
      return "There is no active contributor role left to revoke for this user.";
    case "identity_recovery_identity_conflict":
      return "Recovery is blocked because that identity already belongs to another user.";
    case "identity_recovery_identity_missing":
      return "Recovery is blocked because the requested identity details are incomplete.";
    case "invalid_access_request_approval_payload":
    case "invalid_access_request_rejection_payload":
      return "Check the decision form and try again.";
    case "admin_user_role_revocation_conflict":
      return "This role revocation collided with another admin change. Refresh and try again.";
    case "invalid_admin_role_revocation_payload":
    case "invalid_admin_user_revoke_payload":
      return "Enter a visible revocation reason before removing access.";
    default:
      return "The admin action could not be completed right now.";
  }
}

async function parseApiError(
  response: Response,
  fallbackMessage: string
): Promise<AdminMutationResult> {
  let payload: {
    conflictUserId?: string;
    error?: string;
  } | null = null;

  try {
    payload = (await response.json()) as {
      conflictUserId?: string;
      error?: string;
    };
  } catch {
    payload = null;
  }

  return {
    code: payload?.error ?? `http_${response.status}`,
    conflictUserId: payload?.conflictUserId ?? null,
    message:
      response.status === 401 || response.status === 403
        ? "This workspace is restricted to portal admins."
        : payload?.error
          ? mapAdminMutationErrorCodeToMessage(payload.error)
          : fallbackMessage,
    ok: false
  };
}

export async function loadPortalAdminAccessRequests(apiBaseUrl: string) {
  const response = await fetchApi(`${apiBaseUrl}/portal/admin/access-requests`, {
    credentials: "include",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    let errorCode: string | null = null;

    try {
      errorCode = ((await response.json()) as { error?: string }).error ?? null;
    } catch {
      errorCode = null;
    }

    throw new Error(
      mapAdminLoadError(
        response.status,
        errorCode,
        "The admin access-request queue could not be loaded."
      )
    );
  }

  const payload = await response.json();
  const parsed = portalAdminReadModelsContract.accessRequestListResponse.safeParse(payload);

  if (!parsed.success) {
    throw new Error("The admin access-request queue returned an unexpected payload.");
  }

  return sortByCreatedDesc(parsed.data.items);
}

export async function loadPortalAdminAccessRequestDetail(
  apiBaseUrl: string,
  accessRequestId: string
) {
  const response = await fetchApi(
    `${apiBaseUrl}/portal/admin/access-requests/${encodeURIComponent(accessRequestId)}`,
    {
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    }
  );

  if (!response.ok) {
    let errorCode: string | null = null;

    try {
      errorCode = ((await response.json()) as { error?: string }).error ?? null;
    } catch {
      errorCode = null;
    }

    throw new Error(
      mapAdminLoadError(response.status, errorCode, "The request detail could not be loaded.")
    );
  }

  const payload = await response.json();
  const parsed = portalAdminReadModelsContract.accessRequestDetailResponse.safeParse(payload);

  if (!parsed.success) {
    throw new Error("The request detail returned an unexpected payload.");
  }

  return parsed.data.item;
}

export async function approvePortalAdminAccessRequest(
  apiBaseUrl: string,
  accessRequestId: string,
  input: PortalAdminAccessRequestApproveInput
): Promise<AdminMutationResult> {
  const parsedInput = portalAdminAccessRequestApproveInputSchema.safeParse(input);

  if (!parsedInput.success) {
    return {
      code: "invalid_access_request_approval_payload",
      message: mapAdminMutationErrorCodeToMessage("invalid_access_request_approval_payload"),
      ok: false
    };
  }

  const response = await fetchApi(
    `${apiBaseUrl}/portal/admin/access-requests/${encodeURIComponent(accessRequestId)}/approve`,
    {
      body: createApiFormBody({
        approvedRole: parsedInput.data.approvedRole,
        decisionNote: parsedInput.data.decisionNote ?? ""
      }),
      credentials: "include",
      headers: {
        Accept: "application/json"
      },
      method: "POST"
    }
  );

  if (!response.ok) {
    return parseApiError(response, "The request approval could not be completed.");
  }

  return { ok: true };
}

export async function rejectPortalAdminAccessRequest(
  apiBaseUrl: string,
  accessRequestId: string,
  decisionNote: string
): Promise<AdminMutationResult> {
  const parsedInput = portalAdminAccessRequestRejectInputSchema.safeParse({
    decisionNote
  });

  if (!parsedInput.success) {
    return {
      code: "invalid_access_request_rejection_payload",
      message: mapAdminMutationErrorCodeToMessage("invalid_access_request_rejection_payload"),
      ok: false
    };
  }

  const response = await fetchApi(
    `${apiBaseUrl}/portal/admin/access-requests/${encodeURIComponent(accessRequestId)}/reject`,
    {
      body: createApiFormBody({
        decisionNote: parsedInput.data.decisionNote ?? ""
      }),
      credentials: "include",
      headers: {
        Accept: "application/json"
      },
      method: "POST"
    }
  );

  if (!response.ok) {
    return parseApiError(response, "The request rejection could not be completed.");
  }

  return { ok: true };
}

export async function loadPortalAdminUsers(apiBaseUrl: string) {
  const response = await fetchApi(`${apiBaseUrl}/portal/admin/users`, {
    credentials: "include",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    let errorCode: string | null = null;

    try {
      errorCode = ((await response.json()) as { error?: string }).error ?? null;
    } catch {
      errorCode = null;
    }

    throw new Error(
      mapAdminLoadError(response.status, errorCode, "The admin user directory could not be loaded.")
    );
  }

  const payload = await response.json();
  const parsed = portalAdminReadModelsContract.userListResponse.safeParse(payload);

  if (!parsed.success) {
    throw new Error("The admin user directory returned an unexpected payload.");
  }

  return parsed.data.items;
}

export async function loadPortalAdminUserDetail(apiBaseUrl: string, userId: string) {
  const response = await fetchApi(`${apiBaseUrl}/portal/admin/users/${encodeURIComponent(userId)}`, {
    credentials: "include",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    let errorCode: string | null = null;

    try {
      errorCode = ((await response.json()) as { error?: string }).error ?? null;
    } catch {
      errorCode = null;
    }

    throw new Error(
      mapAdminLoadError(response.status, errorCode, "The user detail could not be loaded.")
    );
  }

  const payload = await response.json();
  const parsed = portalAdminReadModelsContract.userDetailResponse.safeParse(payload);

  if (!parsed.success) {
    throw new Error("The user detail returned an unexpected payload.");
  }

  return parsed.data.item;
}

export async function revokePortalAdminUserRole(
  apiBaseUrl: string,
  userId: string,
  input: RevokeRoleInput
): Promise<AdminMutationResult> {
  const trimmedReason = input.reason.trim();

  if (trimmedReason.length < 8) {
    return {
      code: "invalid_admin_user_revoke_payload",
      message: mapAdminMutationErrorCodeToMessage("invalid_admin_user_revoke_payload"),
      ok: false
    };
  }

  const response = await fetchApi(
    `${apiBaseUrl}/portal/admin/users/${encodeURIComponent(userId)}/revoke-role`,
    {
      body: createApiFormBody({
        reason: trimmedReason
      }),
      credentials: "include",
      headers: {
        Accept: "application/json"
      },
      method: "POST"
    }
  );

  if (!response.ok) {
    return parseApiError(response, "The role revocation could not be completed.");
  }

  return { ok: true };
}

export function summarizeAccessRequestStatus(
  item: Pick<PortalAdminAccessRequestListItem, "requestKind" | "requestedRole" | "status">
) {
  if (item.requestKind === "identity_recovery") {
    return item.status === "pending"
      ? `Recovery review pending · preserve ${item.requestedRole}`
      : `Recovery ${item.status} · preserve ${item.requestedRole}`;
  }

  return `${item.requestedRole} request · ${item.status}`;
}

export function summarizeUserPosture(item: PortalAdminUserListItem) {
  const pendingRequestSummary = item.pendingRequest
    ? `${item.pendingRequest.requestKind === "identity_recovery" ? "Recovery" : "Access"} request pending`
    : null;

  if (item.activeRole) {
    return pendingRequestSummary
      ? `${item.activeRole.role} active + ${pendingRequestSummary.toLowerCase()}`
      : `${item.activeRole.role} active`;
  }

  if (pendingRequestSummary) {
    return pendingRequestSummary;
  }

  if (item.lastReviewedRequestStatus) {
    return `Last review ${item.lastReviewedRequestStatus}`;
  }

  return "No active role";
}

export function toAccessRequestSummaryFromAdminItem(
  item: PortalAdminAccessRequestListItem
): PortalAccessRequestSummary {
  return {
    createdAt: item.createdAt,
    decisionNote: item.decisionNote,
    email: item.email,
    id: item.id,
    requestKind: item.requestKind,
    rationale: item.rationale,
    requestedRole: item.requestedRole,
    reviewedAt: item.reviewedAt,
    status: item.status
  };
}
