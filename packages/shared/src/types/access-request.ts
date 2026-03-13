import type { AuditSeverity } from "./audit-event.js";
import type { PortalIdentityProvider } from "./profile.js";

export type PortalAccessRequestRole = "admin" | "collaborator" | "helper";
export type PortalSelfServiceAccessRequestRole = "collaborator" | "helper";
export type PortalAccessRequestKind = "access_request" | "identity_recovery";

export type PortalAccessRequestInput = {
  rationale: string | null;
  requestedRole: PortalSelfServiceAccessRequestRole;
};

export type PortalAccessRecoveryInput = {
  rationale: string | null;
};

export type PortalAdminApprovedRole = "collaborator" | "helper";

export type PortalAdminAccessRequestApproveInput = {
  approvedRole: PortalAdminApprovedRole;
  decisionNote: string | null;
};

export type PortalAdminAccessRequestRejectInput = {
  decisionNote: string | null;
};

export type PortalAccessRequestStatus =
  | "approved"
  | "pending"
  | "rejected"
  | "withdrawn";

export type PortalAccessRequestSummary = {
  createdAt: string;
  decisionNote: string | null;
  email: string;
  id: string;
  requestKind: PortalAccessRequestKind;
  rationale: string | null;
  requestedRole: PortalAccessRequestRole;
  reviewedAt: string | null;
  status: PortalAccessRequestStatus;
};

export type PortalAdminUserIdentitySummary = {
  createdAt: string;
  id: string;
  lastSeenAt: string;
  provider: PortalIdentityProvider;
  providerEmail: string | null;
};

export type PortalAdminRoleGrantSummary = {
  grantedAt: string;
  grantedByUserEmail: string | null;
  grantedByUserId: string | null;
  id: string;
  revokedAt: string | null;
  revokedByUserEmail: string | null;
  revokedByUserId: string | null;
  role: PortalAccessRequestRole;
};

export type PortalAdminAuditEcho = {
  actorUserEmail: string | null;
  actorUserId: string | null;
  createdAt: string;
  eventId: string;
  id: string;
  payload: Record<string, unknown>;
  severity: AuditSeverity;
  targetUserId: string | null;
};

export type PortalAdminSessionImpact = {
  activeSessionCount: number;
  requiresSessionRefresh: boolean;
};

export type PortalAdminMatchedUserSummary = {
  activeRole: PortalAccessRequestRole | null;
  activeSessionCount: number;
  displayName: string | null;
  email: string;
  id: string;
  latestReviewedRequestStatus: PortalAccessRequestStatus | null;
  linkedIdentityCount: number;
  pendingRequestId: string | null;
};

export type PortalAdminAccessRequestListItem = PortalAccessRequestSummary & {
  approvalIdentityLinkRequired: boolean;
  matchedUser: PortalAdminMatchedUserSummary | null;
  recoveryRequestedIdentityConflicts: boolean;
  recoveryRequestedIdentityProvider: PortalIdentityProvider | null;
  recoveryRequestedIdentityAlreadyLinked: boolean;
  reviewedByUserEmail: string | null;
  reviewedByUserId: string | null;
  staleForApprovedUser: boolean;
};

export type PortalAdminAccessRequestDetail = {
  activeRoleGrant: PortalAdminRoleGrantSummary | null;
  item: PortalAdminAccessRequestListItem;
  matchedUserIdentities: PortalAdminUserIdentitySummary[];
  recentAuditEvents: PortalAdminAuditEcho[];
  relatedRequests: PortalAccessRequestSummary[];
  sessionImpact: PortalAdminSessionImpact | null;
};

export type PortalAdminUserListItem = {
  activeRole: PortalAccessRequestRole | null;
  activeRoleGrantedAt: string | null;
  activeSessionCount: number;
  displayName: string | null;
  email: string;
  id: string;
  latestReviewedAt: string | null;
  latestReviewedRequestStatus: PortalAccessRequestStatus | null;
  linkedIdentityProviders: PortalIdentityProvider[];
  pendingRequestCreatedAt: string | null;
  pendingRequestId: string | null;
  pendingRequestKind: PortalAccessRequestKind | null;
};

export type PortalAdminUserDetail = PortalAdminUserListItem & {
  linkedIdentities: PortalAdminUserIdentitySummary[];
  recentAuditEvents: PortalAdminAuditEcho[];
  requestHistory: PortalAccessRequestSummary[];
  roleGrantHistory: PortalAdminRoleGrantSummary[];
};
