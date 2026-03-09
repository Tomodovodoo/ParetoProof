import { z } from "zod";

export const portalAccessRequestRoleSchema = z.enum(["admin", "helper", "collaborator"]);
export const portalSelfServiceAccessRequestRoleSchema = z.enum([
  "helper",
  "collaborator"
]);

export const portalAccessRequestInputSchema = z.object({
  rationale: z.string().trim().max(500).nullish().transform((value) => {
    if (!value) {
      return null;
    }

    return value;
  }),
  requestedRole: portalSelfServiceAccessRequestRoleSchema
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
  rationale: z.string().nullable(),
  requestedRole: portalAccessRequestRoleSchema,
  reviewedAt: z.string().nullable(),
  status: portalAccessRequestStatusSchema
});
