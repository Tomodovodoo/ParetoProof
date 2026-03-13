import {
  portalAdminAccessRequestApproveInputSchema,
  portalAdminAccessRequestRejectInputSchema,
  portalAdminReadModelsContract,
  type PortalAccessRequestSummary,
  type PortalAdminAccessRequestApproveInput,
  type PortalAdminAccessRequestDetail,
  type PortalAdminAccessRequestListItem,
  type PortalAdminActorSummary,
  type PortalAdminAuditEcho,
  type PortalAdminMatchedUserSummary,
  type PortalAdminRoleGrantSummary,
  type PortalAdminUserDetail,
  type PortalAdminUserListItem
} from "@paretoproof/shared";
import { createApiFormBody } from "./api-form";
import { isLocalHostname } from "./surface";

export type AdminMutationResult =
  | { ok: true }
  | {
      ok: false;
      code: string;
      conflictUserId?: string | null;
      message: string;
    };

type LocalAdminState = {
  accessRequests: PortalAdminAccessRequestDetail[];
  users: PortalAdminUserDetail[];
};

type RevokeRoleInput = {
  reason: string;
};

const localAdminStateStorageKey = "paretoproof.portal.admin.workspace";

const localReviewer: PortalAdminActorSummary = {
  displayName: "Portal Admin",
  email: "admin@paretoproof.local",
  label: "Portal Admin",
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
};

function createAuditEcho(
  id: string,
  eventId: string,
  createdAt: string,
  subjectKind: PortalAdminAuditEcho["subjectKind"],
  severity: PortalAdminAuditEcho["severity"],
  targetUserId: string | null,
  payload: Record<string, unknown>,
  actor: PortalAdminActorSummary | null = localReviewer
): PortalAdminAuditEcho {
  return {
    actor,
    createdAt,
    eventId,
    id,
    payload,
    severity,
    subjectKind,
    targetUserId
  };
}

function createActiveRoleSummary(
  role: PortalAdminRoleGrantSummary["role"],
  grantedAt: string
): PortalAdminRoleGrantSummary {
  return {
    grantedAt,
    grantedBy: localReviewer,
    revokedAt: null,
    revokedBy: null,
    role
  };
}

function createLocalAdminState(): LocalAdminState {
  const adaUserId = "11111111-1111-4111-8111-111111111111";
  const linUserId = "22222222-2222-4222-8222-222222222222";
  const theoUserId = "33333333-3333-4333-8333-333333333333";
  const staleUserId = "44444444-4444-4444-8444-444444444444";

  const collaboratorRole = createActiveRoleSummary(
    "collaborator",
    "2026-03-13T16:25:00.000Z"
  );
  const staleRole = createActiveRoleSummary("helper", "2026-03-13T12:42:00.000Z");

  const users: PortalAdminUserDetail[] = [
    {
      accessPosture: "approved",
      activeRole: collaboratorRole,
      auditHistory: [
        createAuditEcho(
          "audit-ada-approve",
          "access_request.approved",
          "2026-03-12T15:02:00.000Z",
          "access_request",
          "critical",
          adaUserId,
          {
            accessRequestId: "request-ada-approved",
            approvedRole: "collaborator",
            targetUserId: adaUserId
          }
        ),
        createAuditEcho(
          "audit-ada-linked",
          "user_identity.linked",
          "2026-03-13T17:06:00.000Z",
          "user_identity",
          "critical",
          adaUserId,
          {
            identityProvider: "cloudflare_google",
            identitySubject: "google-ada-new",
            targetUserId: adaUserId
          }
        )
      ],
      displayName: "Ada Researcher",
      email: "ada@paretoproof.local",
      lastReviewedRequestStatus: "approved",
      linkedIdentities: [
        {
          createdAt: "2026-03-11T09:00:00.000Z",
          id: "identity-ada-github",
          lastSeenAt: "2026-03-13T19:14:00.000Z",
          provider: "cloudflare_github",
          providerEmail: "ada@paretoproof.local",
          providerSubject: "github-ada"
        },
        {
          createdAt: "2026-03-13T17:06:00.000Z",
          id: "identity-ada-google",
          lastSeenAt: "2026-03-13T17:06:00.000Z",
          provider: "cloudflare_google",
          providerEmail: "ada@paretoproof.local",
          providerSubject: "google-ada-new"
        }
      ],
      linkedIdentityProviders: ["cloudflare_github", "cloudflare_google"],
      pendingRequest: {
        createdAt: "2026-03-13T17:00:00.000Z",
        id: "request-ada-recovery",
        requestKind: "identity_recovery"
      },
      requestHistory: [],
      roleGrantHistory: [collaboratorRole],
      sessionPosture: {
        activeSessionCount: 2,
        latestSessionExpiresAt: "2026-03-14T21:20:00.000Z"
      },
      userId: adaUserId
    },
    {
      accessPosture: "no_active_role",
      activeRole: null,
      auditHistory: [
        createAuditEcho(
          "audit-lin-reject",
          "access_request.rejected",
          "2026-03-12T08:42:00.000Z",
          "access_request",
          "warning",
          linUserId,
          {
            accessRequestId: "request-lin-rejected",
            decisionNote: "Need a stronger benchmark contribution summary.",
            targetUserId: linUserId
          }
        )
      ],
      displayName: "Lin Contributor",
      email: "lin@paretoproof.local",
      lastReviewedRequestStatus: "rejected",
      linkedIdentities: [
        {
          createdAt: "2026-03-10T12:20:00.000Z",
          id: "identity-lin-github",
          lastSeenAt: "2026-03-13T09:18:00.000Z",
          provider: "cloudflare_github",
          providerEmail: "lin@paretoproof.local",
          providerSubject: "github-lin"
        }
      ],
      linkedIdentityProviders: ["cloudflare_github"],
      pendingRequest: {
        createdAt: "2026-03-13T18:12:00.000Z",
        id: "request-lin-pending",
        requestKind: "access_request"
      },
      requestHistory: [],
      roleGrantHistory: [],
      sessionPosture: {
        activeSessionCount: 0,
        latestSessionExpiresAt: null
      },
      userId: linUserId
    },
    {
      accessPosture: "review_history_only",
      activeRole: null,
      auditHistory: [
        createAuditEcho(
          "audit-theo-revoke",
          "role_grant.revoked",
          "2026-03-09T13:20:00.000Z",
          "role_grant",
          "critical",
          theoUserId,
          {
            revocationReason: "Access request was approved under a stale email domain.",
            revokedRole: "helper",
            targetUserId: theoUserId
          }
        )
      ],
      displayName: "Theo Former Helper",
      email: "theo@paretoproof.local",
      lastReviewedRequestStatus: "approved",
      linkedIdentities: [
        {
          createdAt: "2026-03-02T10:10:00.000Z",
          id: "identity-theo-google",
          lastSeenAt: "2026-03-09T12:58:00.000Z",
          provider: "cloudflare_google",
          providerEmail: "theo@paretoproof.local",
          providerSubject: "google-theo"
        }
      ],
      linkedIdentityProviders: ["cloudflare_google"],
      pendingRequest: null,
      requestHistory: [],
      roleGrantHistory: [
        {
          grantedAt: "2026-03-01T09:00:00.000Z",
          grantedBy: localReviewer,
          revokedAt: "2026-03-09T13:20:00.000Z",
          revokedBy: localReviewer,
          role: "helper"
        }
      ],
      sessionPosture: {
        activeSessionCount: 0,
        latestSessionExpiresAt: null
      },
      userId: theoUserId
    },
    {
      accessPosture: "approved",
      activeRole: staleRole,
      auditHistory: [
        createAuditEcho(
          "audit-stale-approve",
          "access_request.approved",
          "2026-03-13T12:42:00.000Z",
          "access_request",
          "critical",
          staleUserId,
          {
            accessRequestId: "request-stale-approved",
            approvedRole: "helper",
            targetUserId: staleUserId
          }
        )
      ],
      displayName: "Morgan Already Approved",
      email: "morgan@paretoproof.local",
      lastReviewedRequestStatus: "approved",
      linkedIdentities: [
        {
          createdAt: "2026-03-13T12:10:00.000Z",
          id: "identity-stale-github",
          lastSeenAt: "2026-03-13T19:00:00.000Z",
          provider: "cloudflare_github",
          providerEmail: "morgan@paretoproof.local",
          providerSubject: "github-morgan"
        }
      ],
      linkedIdentityProviders: ["cloudflare_github"],
      pendingRequest: {
        createdAt: "2026-03-13T18:25:00.000Z",
        id: "request-stale-pending",
        requestKind: "access_request"
      },
      requestHistory: [],
      roleGrantHistory: [staleRole],
      sessionPosture: {
        activeSessionCount: 1,
        latestSessionExpiresAt: "2026-03-14T18:40:00.000Z"
      },
      userId: staleUserId
    }
  ];

  const toMatchedUserSummary = (
    user: PortalAdminUserDetail | undefined
  ): PortalAdminMatchedUserSummary | null =>
    user
      ? {
          displayName: user.displayName,
          email: user.email,
          userId: user.userId
        }
      : null;

  const toPostureSummary = (user: PortalAdminUserDetail | undefined) =>
    user
      ? {
          accessPosture: user.accessPosture,
          activeRole: user.activeRole,
          lastReviewedRequestStatus: user.lastReviewedRequestStatus,
          linkedIdentityCount: user.linkedIdentities.length,
          pendingRequestId: user.pendingRequest?.id ?? null
        }
      : null;

  const accessRequests: PortalAdminAccessRequestDetail[] = [
    {
      activeRole: null,
      auditEchoes: [
        createAuditEcho(
          "audit-lin-submit",
          "access_request.submitted",
          "2026-03-13T18:12:00.000Z",
          "access_request",
          "warning",
          linUserId,
          {
            accessRequestId: "request-lin-pending",
            targetUserId: linUserId
          },
          null
        )
      ],
      createdAt: "2026-03-13T18:12:00.000Z",
      decisionNote: null,
      email: "lin@paretoproof.local",
      id: "request-lin-pending",
      linkedIdentities: users[1].linkedIdentities,
      matchedUser: toMatchedUserSummary(users[1]),
      matchedUserPosture: toPostureSummary(users[1]),
      rationale: "I need collaborator access to compare offline Problem 9 runs.",
      recovery: null,
      relatedRequests: [],
      requestKind: "access_request",
      requestedRole: "collaborator",
      reviewedAt: null,
      reviewer: null,
      sessionPosture: users[1].sessionPosture,
      status: "pending"
    },
    {
      activeRole: collaboratorRole,
      auditEchoes: [
        createAuditEcho(
          "audit-ada-recovery-submit",
          "access_request.submitted",
          "2026-03-13T17:00:00.000Z",
          "access_request",
          "warning",
          adaUserId,
          {
            accessRequestId: "request-ada-recovery",
            targetUserId: adaUserId
          },
          null
        )
      ],
      createdAt: "2026-03-13T17:00:00.000Z",
      decisionNote: null,
      email: "ada@paretoproof.local",
      id: "request-ada-recovery",
      linkedIdentities: users[0].linkedIdentities,
      matchedUser: toMatchedUserSummary(users[0]),
      matchedUserPosture: toPostureSummary(users[0]),
      rationale: "My Google Access identity rotated after a device reset.",
      recovery: {
        conflictingUser: null,
        preserveExistingRole: "collaborator",
        requestedIdentityAlreadyLinked: false,
        requestedIdentityProvider: "cloudflare_google",
        requestedIdentitySubject: "google-ada-new"
      },
      relatedRequests: [],
      requestKind: "identity_recovery",
      requestedRole: "collaborator",
      reviewedAt: null,
      reviewer: null,
      sessionPosture: users[0].sessionPosture,
      status: "pending"
    },
    {
      activeRole: null,
      auditEchoes: [
        createAuditEcho(
          "audit-lin-rejected-history",
          "access_request.rejected",
          "2026-03-12T08:42:00.000Z",
          "access_request",
          "warning",
          linUserId,
          {
            accessRequestId: "request-lin-rejected",
            decisionNote: "Need a stronger benchmark contribution summary.",
            targetUserId: linUserId
          }
        )
      ],
      createdAt: "2026-03-12T08:18:00.000Z",
      decisionNote: "Need a stronger benchmark contribution summary.",
      email: "lin@paretoproof.local",
      id: "request-lin-rejected",
      linkedIdentities: users[1].linkedIdentities,
      matchedUser: toMatchedUserSummary(users[1]),
      matchedUserPosture: toPostureSummary(users[1]),
      rationale: "I want to help with benchmark result review.",
      recovery: null,
      relatedRequests: [],
      requestKind: "access_request",
      requestedRole: "helper",
      reviewedAt: "2026-03-12T08:42:00.000Z",
      reviewer: localReviewer,
      sessionPosture: users[1].sessionPosture,
      status: "rejected"
    },
    {
      activeRole: staleRole,
      auditEchoes: [
        createAuditEcho(
          "audit-stale-submit",
          "access_request.submitted",
          "2026-03-13T18:25:00.000Z",
          "access_request",
          "warning",
          staleUserId,
          {
            accessRequestId: "request-stale-pending",
            targetUserId: staleUserId
          },
          null
        )
      ],
      createdAt: "2026-03-13T18:25:00.000Z",
      decisionNote: null,
      email: "morgan@paretoproof.local",
      id: "request-stale-pending",
      linkedIdentities: users[3].linkedIdentities,
      matchedUser: toMatchedUserSummary(users[3]),
      matchedUserPosture: toPostureSummary(users[3]),
      rationale: "Re-open contributor access after a temporary pause.",
      recovery: null,
      relatedRequests: [],
      requestKind: "access_request",
      requestedRole: "helper",
      reviewedAt: null,
      reviewer: null,
      sessionPosture: users[3].sessionPosture,
      status: "pending"
    }
  ];

  const state = {
    accessRequests,
    users
  };

  return synchronizeLocalState(state);
}

function readLocalAdminState() {
  const storedState = window.localStorage.getItem(localAdminStateStorageKey);

  if (!storedState) {
    const seededState = createLocalAdminState();
    writeLocalAdminState(seededState);
    return seededState;
  }

  try {
    return synchronizeLocalState(JSON.parse(storedState) as LocalAdminState);
  } catch {
    const seededState = createLocalAdminState();
    writeLocalAdminState(seededState);
    return seededState;
  }
}

function writeLocalAdminState(state: LocalAdminState) {
  window.localStorage.setItem(localAdminStateStorageKey, JSON.stringify(state));
}

function cloneLocalState(state: LocalAdminState) {
  return JSON.parse(JSON.stringify(state)) as LocalAdminState;
}

function toAccessRequestListItem(
  item: PortalAdminAccessRequestDetail
): PortalAdminAccessRequestListItem {
  return {
    createdAt: item.createdAt,
    decisionNote: item.decisionNote,
    email: item.email,
    id: item.id,
    matchedUser: item.matchedUser,
    matchedUserPosture: item.matchedUserPosture,
    rationale: item.rationale,
    recovery: item.recovery,
    requestKind: item.requestKind,
    requestedRole: item.requestedRole,
    reviewedAt: item.reviewedAt,
    reviewer: item.reviewer,
    status: item.status
  };
}

function toUserListItem(item: PortalAdminUserDetail): PortalAdminUserListItem {
  return {
    accessPosture: item.accessPosture,
    activeRole: item.activeRole,
    displayName: item.displayName,
    email: item.email,
    lastReviewedRequestStatus: item.lastReviewedRequestStatus,
    linkedIdentityProviders: item.linkedIdentityProviders,
    pendingRequest: item.pendingRequest,
    userId: item.userId
  };
}

function synchronizeLocalState(state: LocalAdminState) {
  const nextState = cloneLocalState(state);
  const userMap = new Map(nextState.users.map((user) => [user.userId, user]));

  for (const user of nextState.users) {
    const requestHistory = nextState.accessRequests
      .filter(
        (requestItem) =>
          requestItem.matchedUser?.userId === user.userId || requestItem.email === user.email
      )
      .map(toAccessRequestListItem)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const pendingRequest =
      requestHistory.find((requestItem) => requestItem.status === "pending") ?? null;
    const reviewedRequest =
      requestHistory.find((requestItem) => requestItem.status !== "pending") ?? null;
    const activeRole =
      user.roleGrantHistory.find((roleGrant) => roleGrant.revokedAt === null) ?? null;

    user.requestHistory = requestHistory;
    user.pendingRequest = pendingRequest
      ? {
          createdAt: pendingRequest.createdAt,
          id: pendingRequest.id,
          requestKind: pendingRequest.requestKind
        }
      : null;
    user.activeRole = activeRole;
    user.accessPosture = activeRole
      ? "approved"
      : pendingRequest
        ? "pending_request"
        : reviewedRequest
          ? "review_history_only"
          : "no_active_role";
    user.lastReviewedRequestStatus = reviewedRequest?.status ?? null;
    user.linkedIdentityProviders = user.linkedIdentities.map((identity) => identity.provider);
  }

  for (const requestItem of nextState.accessRequests) {
    const matchedUser = requestItem.matchedUser
      ? userMap.get(requestItem.matchedUser.userId) ?? null
      : null;
    requestItem.matchedUser = matchedUser
      ? {
          displayName: matchedUser.displayName,
          email: matchedUser.email,
          userId: matchedUser.userId
        }
      : null;
    requestItem.matchedUserPosture = matchedUser
      ? {
          accessPosture: matchedUser.accessPosture,
          activeRole: matchedUser.activeRole,
          lastReviewedRequestStatus: matchedUser.lastReviewedRequestStatus,
          linkedIdentityCount: matchedUser.linkedIdentities.length,
          pendingRequestId: matchedUser.pendingRequest?.id ?? null
        }
      : null;
    requestItem.activeRole = matchedUser?.activeRole ?? null;
    requestItem.linkedIdentities = matchedUser?.linkedIdentities ?? [];
    requestItem.sessionPosture = matchedUser?.sessionPosture ?? {
      activeSessionCount: 0,
      latestSessionExpiresAt: null
    };
    requestItem.relatedRequests = nextState.accessRequests
      .filter(
        (candidate) =>
          candidate.id !== requestItem.id &&
          (candidate.email === requestItem.email ||
            candidate.matchedUser?.userId === requestItem.matchedUser?.userId)
      )
      .map(toAccessRequestListItem)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  return nextState;
}

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
  if (isLocalHostname(window.location.hostname)) {
    return sortByCreatedDesc(readLocalAdminState().accessRequests.map(toAccessRequestListItem));
  }

  const response = await fetch(`${apiBaseUrl}/portal/admin/access-requests`, {
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
  if (isLocalHostname(window.location.hostname)) {
    const item = readLocalAdminState().accessRequests.find(
      (candidate) => candidate.id === accessRequestId
    );

    if (!item) {
      throw new Error("That access request is no longer available.");
    }

    return item;
  }

  const response = await fetch(
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

  if (isLocalHostname(window.location.hostname)) {
    const state = readLocalAdminState();
    const requestItem = state.accessRequests.find((candidate) => candidate.id === accessRequestId);

    if (!requestItem) {
      return {
        code: "access_request_not_found",
        message: "That access request is no longer available.",
        ok: false
      };
    }

    if (requestItem.status !== "pending") {
      return {
        code: "access_request_not_pending",
        message: mapAdminMutationErrorCodeToMessage("access_request_not_pending"),
        ok: false
      };
    }

    if (requestItem.requestKind === "access_request" && !requestItem.linkedIdentities.length) {
      return {
        code: "access_identity_link_required",
        message: mapAdminMutationErrorCodeToMessage("access_identity_link_required"),
        ok: false
      };
    }

    if (
      requestItem.requestKind === "identity_recovery" &&
      requestItem.recovery?.conflictingUser
    ) {
      return {
        code: "identity_recovery_identity_conflict",
        conflictUserId: requestItem.recovery.conflictingUser.userId,
        message: mapAdminMutationErrorCodeToMessage("identity_recovery_identity_conflict"),
        ok: false
      };
    }

    if (
      requestItem.requestKind === "access_request" &&
      requestItem.matchedUserPosture?.activeRole
    ) {
      return {
        code: "access_request_stale_for_approved_user",
        message: mapAdminMutationErrorCodeToMessage("access_request_stale_for_approved_user"),
        ok: false
      };
    }

    requestItem.status = "approved";
    requestItem.reviewedAt = new Date().toISOString();
    requestItem.reviewer = localReviewer;
    requestItem.decisionNote = parsedInput.data.decisionNote;
    requestItem.auditEchoes.unshift(
      createAuditEcho(
        `audit-${requestItem.id}-approved`,
        "access_request.approved",
        requestItem.reviewedAt,
        "access_request",
        "critical",
        requestItem.matchedUser?.userId ?? null,
        {
          accessRequestId: requestItem.id,
          approvedRole:
            requestItem.requestKind === "identity_recovery"
              ? requestItem.requestedRole
              : parsedInput.data.approvedRole,
          targetUserId: requestItem.matchedUser?.userId ?? null
        }
      )
    );

    const matchedUser = requestItem.matchedUser
      ? state.users.find((candidate) => candidate.userId === requestItem.matchedUser?.userId)
      : null;

    if (matchedUser) {
      if (requestItem.requestKind === "identity_recovery") {
        const hasLinkedIdentity = matchedUser.linkedIdentities.some(
          (identity) =>
            identity.provider === requestItem.recovery?.requestedIdentityProvider &&
            identity.providerSubject === requestItem.recovery?.requestedIdentitySubject
        );

        if (!hasLinkedIdentity && requestItem.recovery?.requestedIdentityProvider) {
          matchedUser.linkedIdentities.push({
            createdAt: requestItem.reviewedAt,
            id: `identity-${requestItem.id}`,
            lastSeenAt: requestItem.reviewedAt,
            provider: requestItem.recovery.requestedIdentityProvider,
            providerEmail: requestItem.email,
            providerSubject: requestItem.recovery.requestedIdentitySubject ?? `${requestItem.id}-subject`
          });
          matchedUser.auditHistory.unshift(
            createAuditEcho(
              `audit-${requestItem.id}-linked`,
              "user_identity.linked",
              requestItem.reviewedAt,
              "user_identity",
              "critical",
              matchedUser.userId,
              {
                identityProvider: requestItem.recovery.requestedIdentityProvider,
                identitySubject: requestItem.recovery.requestedIdentitySubject,
                targetUserId: matchedUser.userId
              }
            )
          );
        }
      } else {
        matchedUser.roleGrantHistory.unshift({
          grantedAt: requestItem.reviewedAt,
          grantedBy: localReviewer,
          revokedAt: null,
          revokedBy: null,
          role: parsedInput.data.approvedRole
        });
      }

      matchedUser.auditHistory.unshift(
        createAuditEcho(
          `audit-${requestItem.id}-user-approved`,
          "access_request.approved",
          requestItem.reviewedAt,
          "access_request",
          "critical",
          matchedUser.userId,
          {
            accessRequestId: requestItem.id,
            approvedRole:
              requestItem.requestKind === "identity_recovery"
                ? requestItem.requestedRole
                : parsedInput.data.approvedRole,
            targetUserId: matchedUser.userId
          }
        )
      );
    }

    writeLocalAdminState(synchronizeLocalState(state));
    return { ok: true };
  }

  const response = await fetch(
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

  if (isLocalHostname(window.location.hostname)) {
    const state = readLocalAdminState();
    const requestItem = state.accessRequests.find((candidate) => candidate.id === accessRequestId);

    if (!requestItem) {
      return {
        code: "access_request_not_found",
        message: "That access request is no longer available.",
        ok: false
      };
    }

    if (requestItem.status !== "pending") {
      return {
        code: "access_request_not_pending",
        message: mapAdminMutationErrorCodeToMessage("access_request_not_pending"),
        ok: false
      };
    }

    requestItem.status = "rejected";
    requestItem.reviewedAt = new Date().toISOString();
    requestItem.reviewer = localReviewer;
    requestItem.decisionNote = parsedInput.data.decisionNote;
    requestItem.auditEchoes.unshift(
      createAuditEcho(
        `audit-${requestItem.id}-rejected`,
        "access_request.rejected",
        requestItem.reviewedAt,
        "access_request",
        "warning",
        requestItem.matchedUser?.userId ?? null,
        {
          accessRequestId: requestItem.id,
          decisionNote: parsedInput.data.decisionNote,
          targetUserId: requestItem.matchedUser?.userId ?? null
        }
      )
    );

    const matchedUser = requestItem.matchedUser
      ? state.users.find((candidate) => candidate.userId === requestItem.matchedUser?.userId)
      : null;

    if (matchedUser) {
      matchedUser.auditHistory.unshift(
        createAuditEcho(
          `audit-${requestItem.id}-user-rejected`,
          "access_request.rejected",
          requestItem.reviewedAt,
          "access_request",
          "warning",
          matchedUser.userId,
          {
            accessRequestId: requestItem.id,
            decisionNote: parsedInput.data.decisionNote,
            targetUserId: matchedUser.userId
          }
        )
      );
    }

    writeLocalAdminState(synchronizeLocalState(state));
    return { ok: true };
  }

  const response = await fetch(
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
  if (isLocalHostname(window.location.hostname)) {
    return [...readLocalAdminState().users]
      .sort((left, right) => left.email.localeCompare(right.email))
      .map(toUserListItem);
  }

  const response = await fetch(`${apiBaseUrl}/portal/admin/users`, {
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
  if (isLocalHostname(window.location.hostname)) {
    const item = readLocalAdminState().users.find((candidate) => candidate.userId === userId);

    if (!item) {
      throw new Error("That user record is no longer available.");
    }

    return item;
  }

  const response = await fetch(`${apiBaseUrl}/portal/admin/users/${encodeURIComponent(userId)}`, {
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

  if (isLocalHostname(window.location.hostname)) {
    const state = readLocalAdminState();
    const userItem = state.users.find((candidate) => candidate.userId === userId);

    if (!userItem) {
      return {
        code: "admin_user_not_found",
        message: "That user record is no longer available.",
        ok: false
      };
    }

    const activeRole = userItem.roleGrantHistory.find((roleGrant) => roleGrant.revokedAt === null);

    if (!activeRole) {
      return {
        code: "admin_user_no_active_role",
        message: mapAdminMutationErrorCodeToMessage("admin_user_no_active_role"),
        ok: false
      };
    }

    activeRole.revokedAt = new Date().toISOString();
    activeRole.revokedBy = localReviewer;
    userItem.sessionPosture = {
      activeSessionCount: 0,
      latestSessionExpiresAt: null
    };
    userItem.auditHistory.unshift(
      createAuditEcho(
        `audit-${userId}-revoked`,
        "role_grant.revoked",
        activeRole.revokedAt,
        "role_grant",
        "critical",
        userId,
        {
          revocationReason: trimmedReason,
          revokedRole: activeRole.role,
          targetUserId: userId
        }
      )
    );

    writeLocalAdminState(synchronizeLocalState(state));
    return { ok: true };
  }

  const response = await fetch(
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
  if (item.activeRole) {
    return `${item.activeRole.role} active`;
  }

  if (item.pendingRequest) {
    return `${item.pendingRequest.requestKind === "identity_recovery" ? "Recovery" : "Access"} request pending`;
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
