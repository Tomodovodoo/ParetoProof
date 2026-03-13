import { z } from "zod";

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

export const portalAdminApprovedRoleSchema = z.enum(["helper", "collaborator"]);

export const portalAdminAccessRequestApproveInputSchema = z.object({
  approvedRole: portalAdminApprovedRoleSchema,
  decisionNote: portalAccessDecisionNoteSchema
});

export const portalAdminAccessRequestRejectInputSchema = z.object({
  decisionNote: portalAccessDecisionNoteSchema
});

