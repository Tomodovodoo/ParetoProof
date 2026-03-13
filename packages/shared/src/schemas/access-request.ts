import { z } from "zod";
import { auditSeveritySchema } from "./audit-event.js";
import { portalIdentityProviderSchema } from "./profile.js";

export const portalAccessRequestRoleSchema = z.enum(["admin", "helper", "collaborator"]);
export const portalSelfServiceAccessRequestRoleSchema = z.enum([
  "helper",
  "collaborator"
]);
export const portalAccessRequestKindSchema = z.enum([
  "access_request",
  "identity_recovery"
]);

export const portalAccessRequestInputSchema = z.object({
  rationale: z.string().trim().max(500).nullish().transform((value: string | null | undefined) => {
    if (!value) {
      return null;
    }

    return value;
  }),
  requestedRole: portalSelfServiceAccessRequestRoleSchema
});

export const portalAccessRecoveryInputSchema = z.object({
  rationale: z.string().trim().max(500).nullish().transform((value: string | null | undefined) => {
    if (!value) {
      return null;
    }

    return value;
  })
});

const portalAccessDecisionNoteSchema = z.string().trim().max(500).nullish().transform((value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  return value;
});

export const portalAccessRequestStatusSchema = z.enum([
  "approved",
  "pending",
  "rejected",
  "withdrawn"
]);

export const portalAccessRequestSummarySchema = z.object({
  createdAt: z.string(),
  decisionNote: z.string().nullable(),
  email: z.string().email(),
  id: z.string().uuid(),
  requestKind: portalAccessRequestKindSchema,
  rationale: z.string().nullable(),
  requestedRole: portalAccessRequestRoleSchema,
  reviewedAt: z.string().nullable(),
  status: portalAccessRequestStatusSchema
});

export const portalAdminUserIdentitySummarySchema = z.object({
  createdAt: z.string(),
  id: z.string().uuid(),
  lastSeenAt: z.string(),
  provider: portalIdentityProviderSchema,
  providerEmail: z.string().email().nullable()
});

export const portalAdminRoleGrantSummarySchema = z.object({
  grantedAt: z.string(),
  grantedByUserEmail: z.string().email().nullable(),
  grantedByUserId: z.string().uuid().nullable(),
  id: z.string().uuid(),
  revokedAt: z.string().nullable(),
  revokedByUserEmail: z.string().email().nullable(),
  revokedByUserId: z.string().uuid().nullable(),
  role: portalAccessRequestRoleSchema
});

export const portalAdminAuditEchoSchema = z.object({
  actorUserEmail: z.string().email().nullable(),
  actorUserId: z.string().uuid().nullable(),
  createdAt: z.string(),
  eventId: z.string(),
  id: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()),
  severity: auditSeveritySchema,
  targetUserId: z.string().uuid().nullable()
});

export const portalAdminSessionImpactSchema = z.object({
  activeSessionCount: z.number().int().nonnegative(),
  requiresSessionRefresh: z.boolean()
});

export const portalAdminMatchedUserSummarySchema = z.object({
  activeRole: portalAccessRequestRoleSchema.nullable(),
  activeSessionCount: z.number().int().nonnegative(),
  displayName: z.string().nullable(),
  email: z.string().email(),
  id: z.string().uuid(),
  latestReviewedRequestStatus: portalAccessRequestStatusSchema.nullable(),
  linkedIdentityCount: z.number().int().nonnegative(),
  pendingRequestId: z.string().uuid().nullable()
});

export const portalAdminAccessRequestListItemSchema = portalAccessRequestSummarySchema.extend({
  approvalIdentityLinkRequired: z.boolean(),
  matchedUser: portalAdminMatchedUserSummarySchema.nullable(),
  recoveryRequestedIdentityAlreadyLinked: z.boolean(),
  recoveryRequestedIdentityConflicts: z.boolean(),
  recoveryRequestedIdentityProvider: portalIdentityProviderSchema.nullable(),
  reviewedByUserEmail: z.string().email().nullable(),
  reviewedByUserId: z.string().uuid().nullable(),
  staleForApprovedUser: z.boolean()
});

export const portalAdminAccessRequestDetailSchema = z.object({
  activeRoleGrant: portalAdminRoleGrantSummarySchema.nullable(),
  item: portalAdminAccessRequestListItemSchema,
  matchedUserIdentities: z.array(portalAdminUserIdentitySummarySchema),
  recentAuditEvents: z.array(portalAdminAuditEchoSchema),
  relatedRequests: z.array(portalAccessRequestSummarySchema),
  sessionImpact: portalAdminSessionImpactSchema.nullable()
});

export const portalAdminUserListItemSchema = z.object({
  activeRole: portalAccessRequestRoleSchema.nullable(),
  activeRoleGrantedAt: z.string().nullable(),
  activeSessionCount: z.number().int().nonnegative(),
  displayName: z.string().nullable(),
  email: z.string().email(),
  id: z.string().uuid(),
  latestReviewedAt: z.string().nullable(),
  latestReviewedRequestStatus: portalAccessRequestStatusSchema.nullable(),
  linkedIdentityProviders: z.array(portalIdentityProviderSchema),
  pendingRequestCreatedAt: z.string().nullable(),
  pendingRequestId: z.string().uuid().nullable(),
  pendingRequestKind: portalAccessRequestKindSchema.nullable()
});

export const portalAdminUserDetailSchema = portalAdminUserListItemSchema.extend({
  linkedIdentities: z.array(portalAdminUserIdentitySummarySchema),
  recentAuditEvents: z.array(portalAdminAuditEchoSchema),
  requestHistory: z.array(portalAccessRequestSummarySchema),
  roleGrantHistory: z.array(portalAdminRoleGrantSummarySchema)
});

export const portalAdminApprovedRoleSchema = z.enum(["helper", "collaborator"]);

export const portalAdminAccessRequestApproveInputSchema = z.object({
  approvedRole: portalAdminApprovedRoleSchema,
  decisionNote: portalAccessDecisionNoteSchema
});

export const portalAdminAccessRequestRejectInputSchema = z.object({
  decisionNote: portalAccessDecisionNoteSchema
});

