import { z } from "zod";

export const auditActorKindSchema = z.enum([
  "portal_user",
  "internal_service",
  "system_bootstrap"
]);

export const auditSubjectKindSchema = z.enum([
  "access_request",
  "role_grant",
  "run",
  "user_identity"
]);

export const auditSeveritySchema = z.enum(["info", "warning", "critical"]);

export const auditEventCatalogEntrySchema = z.object({
  actor: auditActorKindSchema,
  id: z.string(),
  rationale: z.string(),
  requiredFields: z.array(z.string()),
  severity: auditSeveritySchema,
  subject: auditSubjectKindSchema
});
