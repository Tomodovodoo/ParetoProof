export type AuditActorKind = "portal_user" | "internal_service" | "system_bootstrap";

export type AuditSubjectKind =
  | "access_request"
  | "role_grant"
  | "run"
  | "user_identity";

export type AuditSeverity = "info" | "warning" | "critical";

export type AuditEventCatalogEntry = {
  actor: AuditActorKind;
  id: string;
  rationale: string;
  requiredFields: string[];
  severity: AuditSeverity;
  subject: AuditSubjectKind;
};
