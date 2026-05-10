export type AuditActorKind = "portal_user" | "internal_service" | "system_bootstrap";

export type AuditSubjectKind =
  | "access_request"
  | "benchmark_release"
  | "benchmark_version"
  | "benchmark_workflow"
  | "math_package_candidate"
  | "math_question"
  | "math_question_revision"
  | "math_release_link"
  | "math_review_record"
  | "math_submission"
  | "role_grant"
  | "run"
  | "user_identity"
  | "worker_pool"
  | "worker_instance"
  | "worker_incident"
  | "worker_rollout";

export type AuditSeverity = "info" | "warning" | "critical";

export type AuditEventCatalogEntry = {
  actor: AuditActorKind;
  id: string;
  rationale: string;
  requiredFields: string[];
  severity: AuditSeverity;
  subject: AuditSubjectKind;
};
