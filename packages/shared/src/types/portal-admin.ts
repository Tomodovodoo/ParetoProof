import type {
  PortalAccessRequestKind,
  PortalAccessRequestRole,
  PortalAccessRequestStatus
} from "./access-request.js";
import type { AuditSeverity, AuditSubjectKind } from "./audit-event.js";
import type { PortalIdentityProvider } from "./profile.js";

export type PortalAdminActorSummary = {
  displayName: string | null;
  email: string | null;
  label: string;
  userId: string;
};

export type PortalAdminMatchedUserSummary = {
  displayName: string | null;
  email: string;
  userId: string;
};

export type PortalAdminAccessPosture =
  | "approved"
  | "no_active_role"
  | "pending_request"
  | "review_history_only";

export type PortalAdminRoleGrantSummary = {
  grantedAt: string;
  grantedBy: PortalAdminActorSummary | null;
  revokedAt: string | null;
  revokedBy: PortalAdminActorSummary | null;
  role: PortalAccessRequestRole;
};

export type PortalAdminUserPostureSummary = {
  accessPosture: PortalAdminAccessPosture;
  activeRole: PortalAdminRoleGrantSummary | null;
  lastReviewedRequestStatus: PortalAccessRequestStatus | null;
  linkedIdentityCount: number;
  pendingRequestId: string | null;
};

export type PortalAdminRecoveryContext = {
  conflictingUser: PortalAdminMatchedUserSummary | null;
  preserveExistingRole: PortalAccessRequestRole | null;
  requestedIdentityAlreadyLinked: boolean;
  requestedIdentityProvider: PortalIdentityProvider | null;
  requestedIdentitySubject: string | null;
};

export type PortalAdminAccessRequestListItem = {
  createdAt: string;
  decisionNote: string | null;
  email: string;
  id: string;
  matchedUser: PortalAdminMatchedUserSummary | null;
  matchedUserPosture: PortalAdminUserPostureSummary | null;
  rationale: string | null;
  recovery: PortalAdminRecoveryContext | null;
  requestKind: PortalAccessRequestKind;
  requestedRole: PortalAccessRequestRole;
  reviewedAt: string | null;
  reviewer: PortalAdminActorSummary | null;
  status: PortalAccessRequestStatus;
};

export type PortalAdminIdentitySummary = {
  createdAt: string;
  id: string;
  lastSeenAt: string;
  provider: PortalIdentityProvider;
  providerEmail: string | null;
  providerSubject: string;
};

export type PortalAdminAuditEcho = {
  actor: PortalAdminActorSummary | null;
  createdAt: string;
  eventId: string;
  id: string;
  payload: Record<string, unknown>;
  severity: AuditSeverity;
  subjectKind: AuditSubjectKind;
  targetUserId: string | null;
};

export type PortalAdminSessionPosture = {
  activeSessionCount: number;
  latestSessionExpiresAt: string | null;
};

export type PortalAdminAccessRequestDetail = PortalAdminAccessRequestListItem & {
  activeRole: PortalAdminRoleGrantSummary | null;
  auditEchoes: PortalAdminAuditEcho[];
  linkedIdentities: PortalAdminIdentitySummary[];
  relatedRequests: PortalAdminAccessRequestListItem[];
  sessionPosture: PortalAdminSessionPosture;
};

export type PortalAdminUserPendingRequestSummary = {
  createdAt: string;
  id: string;
  requestKind: PortalAccessRequestKind;
};

export type PortalAdminUserListItem = {
  accessPosture: PortalAdminAccessPosture;
  activeRole: PortalAdminRoleGrantSummary | null;
  displayName: string | null;
  email: string;
  lastReviewedRequestStatus: PortalAccessRequestStatus | null;
  linkedIdentityProviders: PortalIdentityProvider[];
  pendingRequest: PortalAdminUserPendingRequestSummary | null;
  userId: string;
};

export type PortalAdminUserDetail = PortalAdminUserListItem & {
  auditHistory: PortalAdminAuditEcho[];
  linkedIdentities: PortalAdminIdentitySummary[];
  requestHistory: PortalAdminAccessRequestListItem[];
  roleGrantHistory: PortalAdminRoleGrantSummary[];
  sessionPosture: PortalAdminSessionPosture;
};

export type PortalAdminAccessRequestListResponse = {
  items: PortalAdminAccessRequestListItem[];
};

export type PortalAdminAccessRequestDetailResponse = {
  item: PortalAdminAccessRequestDetail;
};

export type PortalAdminUserListResponse = {
  items: PortalAdminUserListItem[];
};

export type PortalAdminUserDetailResponse = {
  item: PortalAdminUserDetail;
};
