import { z } from "zod";
import {
  portalAccessRequestKindSchema,
  portalAccessRequestRoleSchema,
  portalAccessRequestStatusSchema
} from "./access-request.js";
import {
  auditSeveritySchema,
  auditSubjectKindSchema
} from "./audit-event.js";
import { portalIdentityProviderSchema } from "./profile.js";

export const portalAdminActorSummarySchema = z.object({
  displayName: z.string().nullable(),
  email: z.string().email().nullable(),
  label: z.string(),
  userId: z.string().uuid()
});

export const portalAdminMatchedUserSummarySchema = z.object({
  displayName: z.string().nullable(),
  email: z.string().email(),
  userId: z.string().uuid()
});

export const portalAdminAccessPostureSchema = z.enum([
  "approved",
  "no_active_role",
  "pending_request",
  "review_history_only"
]);

export const portalAdminRoleGrantSummarySchema = z.object({
  grantedAt: z.string(),
  grantedBy: portalAdminActorSummarySchema.nullable(),
  revokedAt: z.string().nullable(),
  revokedBy: portalAdminActorSummarySchema.nullable(),
  role: portalAccessRequestRoleSchema
});

export const portalAdminUserPostureSummarySchema = z.object({
  accessPosture: portalAdminAccessPostureSchema,
  activeRole: portalAdminRoleGrantSummarySchema.nullable(),
  lastReviewedRequestStatus: portalAccessRequestStatusSchema.nullable(),
  linkedIdentityCount: z.number().int().nonnegative(),
  pendingRequestId: z.string().uuid().nullable()
});

export const portalAdminRecoveryContextSchema = z.object({
  conflictingUser: portalAdminMatchedUserSummarySchema.nullable(),
  preserveExistingRole: portalAccessRequestRoleSchema.nullable(),
  requestedIdentityAlreadyLinked: z.boolean(),
  requestedIdentityProvider: portalIdentityProviderSchema.nullable(),
  requestedIdentitySubject: z.string().nullable()
});

export const portalAdminAccessRequestListItemSchema = z.object({
  createdAt: z.string(),
  decisionNote: z.string().nullable(),
  email: z.string().email(),
  id: z.string().uuid(),
  matchedUser: portalAdminMatchedUserSummarySchema.nullable(),
  matchedUserPosture: portalAdminUserPostureSummarySchema.nullable(),
  rationale: z.string().nullable(),
  recovery: portalAdminRecoveryContextSchema.nullable(),
  requestKind: portalAccessRequestKindSchema,
  requestedRole: portalAccessRequestRoleSchema,
  reviewedAt: z.string().nullable(),
  reviewer: portalAdminActorSummarySchema.nullable(),
  status: portalAccessRequestStatusSchema
});

export const portalAdminIdentitySummarySchema = z.object({
  createdAt: z.string(),
  id: z.string().uuid(),
  lastSeenAt: z.string(),
  provider: portalIdentityProviderSchema,
  providerEmail: z.string().email().nullable(),
  providerSubject: z.string()
});

export const portalAdminAuditEchoSchema = z.object({
  actor: portalAdminActorSummarySchema.nullable(),
  createdAt: z.string(),
  eventId: z.string(),
  id: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()),
  severity: auditSeveritySchema,
  subjectKind: auditSubjectKindSchema,
  targetUserId: z.string().uuid().nullable()
});

export const portalAdminSessionPostureSchema = z.object({
  activeSessionCount: z.number().int().nonnegative(),
  latestSessionExpiresAt: z.string().nullable()
});

export const portalAdminAccessRequestDetailSchema =
  portalAdminAccessRequestListItemSchema.extend({
    activeRole: portalAdminRoleGrantSummarySchema.nullable(),
    auditEchoes: z.array(portalAdminAuditEchoSchema),
    linkedIdentities: z.array(portalAdminIdentitySummarySchema),
    relatedRequests: z.array(portalAdminAccessRequestListItemSchema),
    sessionPosture: portalAdminSessionPostureSchema
  });

export const portalAdminUserPendingRequestSummarySchema = z.object({
  createdAt: z.string(),
  id: z.string().uuid(),
  requestKind: portalAccessRequestKindSchema
});

export const portalAdminUserListItemSchema = z.object({
  accessPosture: portalAdminAccessPostureSchema,
  activeRole: portalAdminRoleGrantSummarySchema.nullable(),
  displayName: z.string().nullable(),
  email: z.string().email(),
  lastReviewedRequestStatus: portalAccessRequestStatusSchema.nullable(),
  linkedIdentityProviders: z.array(portalIdentityProviderSchema),
  pendingRequest: portalAdminUserPendingRequestSummarySchema.nullable(),
  userId: z.string().uuid()
});

export const portalAdminUserDetailSchema = portalAdminUserListItemSchema.extend({
  auditHistory: z.array(portalAdminAuditEchoSchema),
  linkedIdentities: z.array(portalAdminIdentitySummarySchema),
  requestHistory: z.array(portalAdminAccessRequestListItemSchema),
  roleGrantHistory: z.array(portalAdminRoleGrantSummarySchema),
  sessionPosture: portalAdminSessionPostureSchema
});

export const portalAdminUserRevokeInputSchema = z.object({
  reason: z.string().trim().min(1).max(500)
});

export const portalAdminAccessRequestListResponseSchema = z.object({
  items: z.array(portalAdminAccessRequestListItemSchema)
});

export const portalAdminAccessRequestDetailResponseSchema = z.object({
  item: portalAdminAccessRequestDetailSchema
});

export const portalAdminUserListResponseSchema = z.object({
  items: z.array(portalAdminUserListItemSchema)
});

export const portalAdminUserDetailResponseSchema = z.object({
  item: portalAdminUserDetailSchema
});
