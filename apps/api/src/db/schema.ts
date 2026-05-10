import { relations, sql } from "drizzle-orm";
import {
  attemptLifecycleStates,
  evaluationVerdictClasses,
  jobLifecycleStates,
  mathArtifactBackingTypes,
  mathArtifactSubjectTypes,
  mathAutomationSummaryPostures,
  mathPackageCandidatePostures,
  mathPackageCandidateSourceTypes,
  mathQuestionPostures,
  mathQuestionRevisionPostures,
  mathReleaseLinkPostures,
  mathReviewAssignmentRoles,
  mathReviewAssignmentStates,
  mathReviewChecklistStates,
  mathReviewKinds,
  mathReviewRecordPostures,
  mathReviewRoundPostures,
  mathReviewSubjectTypes,
  mathSubmissionPostures,
  runKindValues,
  runLifecycleStates
} from "@paretoproof/shared";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const accessRoleEnum = pgEnum("access_role", [
  "admin",
  "collaborator",
  "helper"
]);

export const accessRequestStatusEnum = pgEnum("access_request_status", [
  "pending",
  "approved",
  "rejected",
  "withdrawn"
]);

export const accessRequestKindEnum = pgEnum("access_request_kind", [
  "access_request",
  "identity_recovery"
]);

export const identityProviderEnum = pgEnum("identity_provider", [
  "cloudflare_one_time_pin",
  "cloudflare_github",
  "cloudflare_google"
]);

export const auditActorKindEnum = pgEnum("audit_actor_kind", [
  "portal_user",
  "internal_service",
  "system_bootstrap"
]);

export const auditSubjectKindEnum = pgEnum("audit_subject_kind", [
  "access_request",
  "benchmark_release",
  "benchmark_version",
  "benchmark_workflow",
  "math_package_candidate",
  "math_question",
  "math_question_revision",
  "math_release_link",
  "math_review_record",
  "math_submission",
  "role_grant",
  "run",
  "user_identity",
  "worker_pool",
  "worker_instance",
  "worker_incident",
  "worker_rollout"
]);

export const auditSeverityEnum = pgEnum("audit_severity", [
  "info",
  "warning",
  "critical"
]);

export const runKindEnum = pgEnum("run_kind", runKindValues);

export const runStateEnum = pgEnum("run_state", runLifecycleStates);

export const jobStateEnum = pgEnum("job_state", jobLifecycleStates);

export const attemptStateEnum = pgEnum("attempt_state", attemptLifecycleStates);

export const evaluationVerdictClassEnum = pgEnum(
  "evaluation_verdict_class",
  evaluationVerdictClasses
);

export const artifactClassEnum = pgEnum("artifact_class", [
  "run_manifest",
  "package_reference",
  "prompt_package",
  "candidate_source",
  "verdict_record",
  "compiler_output",
  "compiler_diagnostics",
  "verifier_output",
  "failure_classification",
  "environment_snapshot",
  "usage_summary",
  "execution_trace"
]);

export const artifactOwnerScopeEnum = pgEnum("artifact_owner_scope", [
  "run_attempt",
  "benchmark_version",
  "run_export"
]);

export const artifactStorageProviderEnum = pgEnum("artifact_storage_provider", [
  "cloudflare_r2"
]);

export const artifactPrefixFamilyEnum = pgEnum("artifact_prefix_family", [
  "run_artifacts",
  "run_logs",
  "run_traces",
  "run_bundles",
  "benchmark_source",
  "benchmark_reports"
]);

export const artifactLifecycleStateEnum = pgEnum("artifact_lifecycle_state", [
  "registered",
  "available",
  "missing",
  "quarantined",
  "deleted"
]);

export const workerExecutionPhaseEnum = pgEnum("worker_execution_phase", [
  "prepare",
  "generate",
  "tool",
  "compile",
  "verify",
  "finalize",
  "cancel"
]);

export const workerExecutionEventKindEnum = pgEnum("worker_execution_event_kind", [
  "attempt_started",
  "compile_started",
  "compile_succeeded",
  "compile_failed",
  "compile_repair_requested",
  "compile_repair_applied",
  "verifier_started",
  "verifier_passed",
  "verifier_failed",
  "verifier_repair_requested",
  "verifier_repair_applied",
  "budget_exhausted",
  "artifact_manifest_written",
  "bundle_finalized"
]);

export const workerRuntimeEnum = pgEnum("worker_runtime", [
  "local_docker",
  "modal"
]);

export const workerPoolRolloutClassEnum = pgEnum("worker_pool_rollout_class", [
  "stable",
  "canary",
  "quarantine"
]);

export const workerInstanceLifecycleStateEnum = pgEnum(
  "worker_instance_lifecycle_state",
  [
    "registering",
    "ready",
    "claiming",
    "running",
    "draining",
    "unhealthy",
    "recovering",
    "terminated"
  ]
);

export const repoSyncStatusEnum = pgEnum("repo_sync_status", [
  "proposed",
  "pr_open",
  "merged",
  "rejected",
  "superseded"
]);

export const packageFreezeStatusEnum = pgEnum("package_freeze_status", [
  "active"
]);

export const benchmarkVersionLaunchabilityEnum = pgEnum(
  "benchmark_version_launchability",
  ["internal_only", "launchable"]
);

export const benchmarkReleaseStatusEnum = pgEnum("benchmark_release_status", [
  "draft",
  "approved",
  "published"
]);

export const benchmarkReleaseVisibilityEnum = pgEnum("benchmark_release_visibility", [
  "internal_only",
  "held_out",
  "public"
]);

export const mathQuestionPostureEnum = pgEnum(
  "math_question_posture",
  mathQuestionPostures
);

export const mathQuestionRevisionPostureEnum = pgEnum(
  "math_question_revision_posture",
  mathQuestionRevisionPostures
);

export const mathSubmissionPostureEnum = pgEnum(
  "math_submission_posture",
  mathSubmissionPostures
);

export const mathAutomationSummaryPostureEnum = pgEnum(
  "math_automation_summary_posture",
  mathAutomationSummaryPostures
);

export const mathArtifactSubjectTypeEnum = pgEnum(
  "math_artifact_subject_type",
  mathArtifactSubjectTypes
);

export const mathArtifactBackingTypeEnum = pgEnum(
  "math_artifact_backing_type",
  mathArtifactBackingTypes
);

export const mathReviewSubjectTypeEnum = pgEnum(
  "math_review_subject_type",
  mathReviewSubjectTypes
);

export const mathReviewKindEnum = pgEnum("math_review_kind", mathReviewKinds);

export const mathReviewRecordPostureEnum = pgEnum(
  "math_review_record_posture",
  mathReviewRecordPostures
);

export const mathReviewRoundPostureEnum = pgEnum(
  "math_review_round_posture",
  mathReviewRoundPostures
);

export const mathReviewAssignmentRoleEnum = pgEnum(
  "math_review_assignment_role",
  mathReviewAssignmentRoles
);

export const mathReviewAssignmentStateEnum = pgEnum(
  "math_review_assignment_state",
  mathReviewAssignmentStates
);

export const mathReviewChecklistStateEnum = pgEnum(
  "math_review_checklist_state",
  mathReviewChecklistStates
);

export const mathPackageCandidateSourceTypeEnum = pgEnum(
  "math_package_candidate_source_type",
  mathPackageCandidateSourceTypes
);

export const mathPackageCandidatePostureEnum = pgEnum(
  "math_package_candidate_posture",
  mathPackageCandidatePostures
);

export const mathReleaseLinkPostureEnum = pgEnum(
  "math_release_link_posture",
  mathReleaseLinkPostures
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    emailUnique: uniqueIndex("users_email_unique").on(table.email)
  })
);

// A single contributor may later attach multiple Access-backed identities.
export const userIdentities = pgTable(
  "user_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: identityProviderEnum("provider").notNull(),
    providerSubject: text("provider_subject").notNull(),
    providerEmail: text("provider_email"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    providerSubjectUnique: uniqueIndex("user_identities_provider_subject_unique").on(
      table.provider,
      table.providerSubject
    ),
    idUserUnique: uniqueIndex("user_identities_id_user_id_unique").on(
      table.id,
      table.userId
    ),
    userIndex: index("user_identities_user_id_idx").on(table.userId)
  })
);

export const roleGrants = pgTable(
  "role_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: accessRoleEnum("role").notNull(),
    grantedByUserId: uuid("granted_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id, {
      onDelete: "set null"
    })
  },
  (table) => ({
    activeUserUnique: uniqueIndex("role_grants_active_user_unique")
      .on(table.userId)
      .where(sql`${table.revokedAt} is null`),
    userIndex: index("role_grants_user_id_idx").on(table.userId),
    roleIndex: index("role_grants_role_idx").on(table.role)
  })
);

export const accessRequests = pgTable(
  "access_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    requestKind: accessRequestKindEnum("request_kind")
      .default("access_request")
      .notNull(),
    requestedRole: accessRoleEnum("requested_role").notNull(),
    status: accessRequestStatusEnum("status").default("pending").notNull(),
    rationale: text("rationale"),
    requestedIdentityProvider: identityProviderEnum("requested_identity_provider"),
    requestedIdentitySubject: text("requested_identity_subject"),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    emailIndex: index("access_requests_email_idx").on(table.email),
    requestedIdentitySubjectIndex: index("access_requests_requested_identity_subject_idx").on(
      table.requestedIdentityProvider,
      table.requestedIdentitySubject
    ),
    statusIndex: index("access_requests_status_idx").on(table.status),
    activePendingEmailKindUnique: uniqueIndex(
      "access_requests_active_pending_email_kind_unique"
    )
      .on(table.email, table.requestKind)
      .where(sql`${table.status} = 'pending'`)
  })
);

// The live session handle should be stored outside Postgres; only its hash belongs here.
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    identityId: uuid("identity_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    identityOwnerForeignKey: foreignKey({
      columns: [table.identityId, table.userId],
      foreignColumns: [userIdentities.id, userIdentities.userId],
      name: "sessions_identity_owner_fk"
    }).onDelete("cascade"),
    tokenHashUnique: uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    userIndex: index("sessions_user_id_idx").on(table.userId),
    identityIndex: index("sessions_identity_id_idx").on(table.identityId)
  })
);

export const identityLinkIntents = pgTable(
  "identity_link_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetProvider: identityProviderEnum("target_provider").notNull(),
    redirectPath: text("redirect_path").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    activeUserProviderUnique: uniqueIndex("identity_link_intents_active_user_provider_unique")
      .on(table.userId, table.targetProvider)
      .where(sql`${table.usedAt} is null`),
    expiresAtIndex: index("identity_link_intents_expires_at_idx").on(table.expiresAt),
    userIndex: index("identity_link_intents_user_id_idx").on(table.userId)
  })
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: text("event_id").notNull(),
    actorKind: auditActorKindEnum("actor_kind").notNull(),
    subjectKind: auditSubjectKindEnum("subject_kind").notNull(),
    severity: auditSeverityEnum("severity").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    targetUserId: uuid("target_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    createdAtIndex: index("audit_events_created_at_idx").on(table.createdAt),
    eventIdIndex: index("audit_events_event_id_idx").on(table.eventId),
    targetUserIdIndex: index("audit_events_target_user_id_idx").on(table.targetUserId)
  })
);

export const workerPoolDefinitions = pgTable(
  "worker_pool_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workerPool: text("worker_pool").notNull(),
    workerRuntime: workerRuntimeEnum("worker_runtime").notNull(),
    defaultRolloutClass: workerPoolRolloutClassEnum("default_rollout_class")
      .default("stable")
      .notNull(),
    ownershipSummary: text("ownership_summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    workerPoolUnique: uniqueIndex("worker_pool_definitions_worker_pool_unique").on(
      table.workerPool
    ),
    runtimeIndex: index("worker_pool_definitions_worker_runtime_idx").on(table.workerRuntime)
  })
);

export const workerInstances = pgTable(
  "worker_instances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workerId: text("worker_id").notNull(),
    workerPoolDefinitionId: uuid("worker_pool_definition_id")
      .notNull()
      .references(() => workerPoolDefinitions.id),
    workerRuntime: workerRuntimeEnum("worker_runtime").notNull(),
    workerVersion: text("worker_version").notNull(),
    currentLifecycleState: workerInstanceLifecycleStateEnum("current_lifecycle_state")
      .default("ready")
      .notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastClaimAt: timestamp("last_claim_at", { withTimezone: true }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    lastLeaseActivityAt: timestamp("last_lease_activity_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    workerIdUnique: uniqueIndex("worker_instances_worker_id_unique").on(table.workerId),
    poolStateIndex: index("worker_instances_pool_state_idx").on(
      table.workerPoolDefinitionId,
      table.currentLifecycleState
    ),
    lastHeartbeatAtIndex: index("worker_instances_last_heartbeat_at_idx").on(
      table.lastHeartbeatAt
    )
  })
);

export const mathQuestions = pgTable(
  "math_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    questionFamily: text("question_family").notNull(),
    laneId: text("lane_id"),
    posture: mathQuestionPostureEnum("posture").default("draft").notNull(),
    ownerUserId: uuid("owner_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    currentHeadRevisionId: uuid("current_head_revision_id"),
    currentAcceptedRevisionId: uuid("current_accepted_revision_id"),
    latestActivePackageCandidateId: text("latest_active_package_candidate_id"),
    latestLinkedBenchmarkVersionId: text("latest_linked_benchmark_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    slugUnique: uniqueIndex("math_questions_slug_unique").on(table.slug),
    familyPostureIndex: index("math_questions_family_posture_idx").on(
      table.questionFamily,
      table.posture
    ),
    ownerIndex: index("math_questions_owner_user_id_idx").on(table.ownerUserId),
    currentHeadRevisionIndex: index("math_questions_current_head_revision_id_idx").on(
      table.currentHeadRevisionId
    ),
    currentAcceptedRevisionIndex: index(
      "math_questions_current_accepted_revision_id_idx"
    ).on(table.currentAcceptedRevisionId),
    latestActivePackageCandidateIndex: index(
      "math_questions_latest_active_package_candidate_id_idx"
    ).on(table.latestActivePackageCandidateId),
    linkedBenchmarkVersionIndex: index(
      "math_questions_latest_linked_benchmark_version_id_idx"
    ).on(table.latestLinkedBenchmarkVersionId)
  })
);

export const mathQuestionRevisions = pgTable(
  "math_question_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mathQuestionId: uuid("math_question_id")
      .notNull()
      .references(() => mathQuestions.id, { onDelete: "restrict" }),
    revisionNumber: integer("revision_number").notNull(),
    authorUserId: uuid("author_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    posture: mathQuestionRevisionPostureEnum("posture")
      .default("draft")
      .notNull(),
    statementPayload: jsonb("statement_payload").$type<Record<string, unknown>>().notNull(),
    formalStatementPayload:
      jsonb("formal_statement_payload").$type<Record<string, unknown> | null>(),
    provenancePayload: jsonb("provenance_payload")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    benchmarkMetadata: jsonb("benchmark_metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    supersedesRevisionId: uuid("supersedes_revision_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    questionRevisionUnique: uniqueIndex(
      "math_question_revisions_question_revision_unique"
    ).on(table.mathQuestionId, table.revisionNumber),
    idQuestionUnique: uniqueIndex("math_question_revisions_id_question_unique").on(
      table.id,
      table.mathQuestionId
    ),
    questionPostureIndex: index("math_question_revisions_question_posture_idx").on(
      table.mathQuestionId,
      table.posture
    ),
    authorIndex: index("math_question_revisions_author_user_id_idx").on(
      table.authorUserId
    ),
    supersedesForeignKey: foreignKey({
      columns: [table.supersedesRevisionId],
      foreignColumns: [table.id],
      name: "math_question_revisions_supersedes_revision_id_fk"
    }).onDelete("set null")
  })
);

export const mathSubmissions = pgTable(
  "math_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mathQuestionId: uuid("math_question_id")
      .notNull()
      .references(() => mathQuestions.id, { onDelete: "restrict" }),
    mathQuestionRevisionId: uuid("math_question_revision_id").notNull(),
    submittingUserId: uuid("submitting_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    submissionKind: text("submission_kind").notNull(),
    posture: mathSubmissionPostureEnum("posture").default("draft").notNull(),
    parentSubmissionId: uuid("parent_submission_id"),
    primaryArtifactRefId: uuid("primary_artifact_ref_id"),
    automationSummaryPosture: mathAutomationSummaryPostureEnum(
      "automation_summary_posture"
    )
      .default("not_requested")
      .notNull(),
    latestReviewRecordId: uuid("latest_review_record_id"),
    latestPackageCandidateId: text("latest_package_candidate_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    revisionQuestionForeignKey: foreignKey({
      columns: [table.mathQuestionRevisionId, table.mathQuestionId],
      foreignColumns: [
        mathQuestionRevisions.id,
        mathQuestionRevisions.mathQuestionId
      ],
      name: "math_submissions_revision_question_fk"
    }).onDelete("restrict"),
    parentSubmissionForeignKey: foreignKey({
      columns: [table.parentSubmissionId],
      foreignColumns: [table.id],
      name: "math_submissions_parent_submission_id_fk"
    }).onDelete("set null"),
    idQuestionUnique: uniqueIndex("math_submissions_id_question_unique").on(
      table.id,
      table.mathQuestionId
    ),
    questionCreatedAtIndex: index("math_submissions_question_created_at_idx").on(
      table.mathQuestionId,
      table.createdAt
    ),
    revisionCreatedAtIndex: index("math_submissions_revision_created_at_idx").on(
      table.mathQuestionRevisionId,
      table.createdAt
    ),
    submittingUserCreatedAtIndex: index(
      "math_submissions_submitting_user_created_at_idx"
    ).on(table.submittingUserId, table.createdAt),
    postureUpdatedAtIndex: index("math_submissions_posture_updated_at_idx").on(
      table.posture,
      table.updatedAt
    )
  })
);

export const mathReviewRecords = pgTable(
  "math_review_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subjectType: mathReviewSubjectTypeEnum("subject_type").notNull(),
    mathQuestionRevisionId: uuid("math_question_revision_id").references(
      () => mathQuestionRevisions.id,
      { onDelete: "restrict" }
    ),
    mathSubmissionId: uuid("math_submission_id").references(() => mathSubmissions.id, {
      onDelete: "restrict"
    }),
    mathPackageCandidateId: text("math_package_candidate_id"),
    reviewKind: mathReviewKindEnum("review_kind").notNull(),
    posture: mathReviewRecordPostureEnum("posture").default("open").notNull(),
    openedByUserId: uuid("opened_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    currentRoundId: uuid("current_round_id"),
    finalDecisionActorUserId: uuid("final_decision_actor_user_id").references(
      () => users.id,
      { onDelete: "set null" }
    ),
    finalDecision: text("final_decision"),
    finalDecisionSummary: text("final_decision_summary"),
    finalDecisionPayload:
      jsonb("final_decision_payload").$type<Record<string, unknown> | null>(),
    escalationRequired: boolean("escalation_required").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true })
  },
  (table) => ({
    subjectShapeCheck: check(
      "math_review_records_subject_shape_check",
      sql`(
        ${table.subjectType} = 'question_revision'
        and ${table.mathQuestionRevisionId} is not null
        and ${table.mathSubmissionId} is null
        and ${table.mathPackageCandidateId} is null
      ) or (
        ${table.subjectType} = 'submission'
        and ${table.mathQuestionRevisionId} is null
        and ${table.mathSubmissionId} is not null
        and ${table.mathPackageCandidateId} is null
      ) or (
        ${table.subjectType} = 'package_candidate'
        and ${table.mathQuestionRevisionId} is null
        and ${table.mathSubmissionId} is null
        and ${table.mathPackageCandidateId} is not null
      )`
    ),
    questionRevisionOpenUnique: uniqueIndex(
      "math_review_records_question_revision_open_unique"
    )
      .on(table.mathQuestionRevisionId, table.reviewKind)
      .where(
        sql`${table.posture} = 'open' and ${table.subjectType} = 'question_revision'`
      ),
    submissionOpenUnique: uniqueIndex("math_review_records_submission_open_unique")
      .on(table.mathSubmissionId, table.reviewKind)
      .where(sql`${table.posture} = 'open' and ${table.subjectType} = 'submission'`),
    packageCandidateOpenUnique: uniqueIndex(
      "math_review_records_package_candidate_open_unique"
    )
      .on(table.mathPackageCandidateId, table.reviewKind)
      .where(
        sql`${table.posture} = 'open' and ${table.subjectType} = 'package_candidate'`
      ),
    kindPostureUpdatedAtIndex: index(
      "math_review_records_kind_posture_updated_at_idx"
    ).on(table.reviewKind, table.posture, table.updatedAt),
    openedByUserCreatedAtIndex: index(
      "math_review_records_opened_by_user_created_at_idx"
    ).on(table.openedByUserId, table.createdAt)
  })
);

export const mathReviewRounds = pgTable(
  "math_review_rounds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mathReviewRecordId: uuid("math_review_record_id")
      .notNull()
      .references(() => mathReviewRecords.id, { onDelete: "restrict" }),
    roundNumber: integer("round_number").notNull(),
    posture: mathReviewRoundPostureEnum("posture").default("open").notNull(),
    openedByUserId: uuid("opened_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    closedByUserId: uuid("closed_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    decision: text("decision"),
    decisionSummary: text("decision_summary"),
    decisionPayload: jsonb("decision_payload").$type<Record<string, unknown> | null>(),
    escalationNote: text("escalation_note"),
    openedAt: timestamp("opened_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    recordRoundUnique: uniqueIndex("math_review_rounds_record_round_unique").on(
      table.mathReviewRecordId,
      table.roundNumber
    ),
    activeRecordUnique: uniqueIndex("math_review_rounds_active_record_unique")
      .on(table.mathReviewRecordId)
      .where(sql`${table.posture} = 'open'`)
  })
);

export const mathReviewAssignments = pgTable(
  "math_review_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mathReviewRoundId: uuid("math_review_round_id")
      .notNull()
      .references(() => mathReviewRounds.id, { onDelete: "restrict" }),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    assignmentRole: mathReviewAssignmentRoleEnum("assignment_role").notNull(),
    state: mathReviewAssignmentStateEnum("state").default("active").notNull(),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closeReason: text("close_reason")
  },
  (table) => ({
    activePrimaryUnique: uniqueIndex(
      "math_review_assignments_active_primary_unique"
    )
      .on(table.mathReviewRoundId)
      .where(sql`${table.assignmentRole} = 'primary' and ${table.state} = 'active'`),
    assigneeStateAssignedAtIndex: index(
      "math_review_assignments_assignee_state_assigned_at_idx"
    ).on(table.assigneeUserId, table.state, table.assignedAt),
    roundStateIndex: index("math_review_assignments_round_state_idx").on(
      table.mathReviewRoundId,
      table.state
    )
  })
);

export const mathReviewChecklistItems = pgTable(
  "math_review_checklist_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mathReviewRoundId: uuid("math_review_round_id")
      .notNull()
      .references(() => mathReviewRounds.id, { onDelete: "restrict" }),
    checklistFamily: text("checklist_family").notNull(),
    checklistVersion: text("checklist_version").notNull(),
    itemKey: text("item_key").notNull(),
    state: mathReviewChecklistStateEnum("state").default("open").notNull(),
    rationale: text("rationale"),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    roundChecklistItemUnique: uniqueIndex(
      "math_review_checklist_items_round_item_unique"
    ).on(
      table.mathReviewRoundId,
      table.checklistFamily,
      table.checklistVersion,
      table.itemKey
    ),
    roundStateIndex: index("math_review_checklist_items_round_state_idx").on(
      table.mathReviewRoundId,
      table.state
    )
  })
);

export const mathReviewComments = pgTable(
  "math_review_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mathReviewRoundId: uuid("math_review_round_id")
      .notNull()
      .references(() => mathReviewRounds.id, { onDelete: "restrict" }),
    authorUserId: uuid("author_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    body: text("body").notNull(),
    anchorPayload: jsonb("anchor_payload").$type<Record<string, unknown> | null>(),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    roundCreatedAtIndex: index("math_review_comments_round_created_at_idx").on(
      table.mathReviewRoundId,
      table.createdAt
    ),
    unresolvedRoundIndex: index("math_review_comments_unresolved_round_idx")
      .on(table.mathReviewRoundId)
      .where(sql`${table.resolvedAt} is null`)
  })
);

export const mathPackageCandidates = pgTable(
  "math_package_candidates",
  {
    mathPackageCandidateId: text("math_package_candidate_id").primaryKey(),
    sourceType: mathPackageCandidateSourceTypeEnum("source_type").notNull(),
    mathQuestionRevisionId: uuid("math_question_revision_id").references(
      () => mathQuestionRevisions.id,
      { onDelete: "restrict" }
    ),
    mathSubmissionId: uuid("math_submission_id").references(() => mathSubmissions.id, {
      onDelete: "restrict"
    }),
    mathQuestionId: uuid("math_question_id")
      .notNull()
      .references(() => mathQuestions.id, { onDelete: "restrict" }),
    posture: mathPackageCandidatePostureEnum("posture")
      .default("proposed")
      .notNull(),
    proposedPackageId: text("proposed_package_id").notNull(),
    proposedPackageVersion: text("proposed_package_version"),
    createdFromReviewRecordId: uuid("created_from_review_record_id").references(
      () => mathReviewRecords.id,
      { onDelete: "set null" }
    ),
    latestReviewRecordId: uuid("latest_review_record_id").references(
      () => mathReviewRecords.id,
      { onDelete: "set null" }
    ),
    linkedBenchmarkVersionId: text("linked_benchmark_version_id"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    sourceShapeCheck: check(
      "math_package_candidates_source_shape_check",
      sql`(
        ${table.sourceType} = 'question_revision'
        and ${table.mathQuestionRevisionId} is not null
        and ${table.mathSubmissionId} is null
      ) or (
        ${table.sourceType} = 'submission'
        and ${table.mathQuestionRevisionId} is null
        and ${table.mathSubmissionId} is not null
      )`
    ),
    revisionQuestionForeignKey: foreignKey({
      columns: [table.mathQuestionRevisionId, table.mathQuestionId],
      foreignColumns: [
        mathQuestionRevisions.id,
        mathQuestionRevisions.mathQuestionId
      ],
      name: "math_package_candidates_revision_question_fk"
    }).onDelete("restrict"),
    submissionQuestionForeignKey: foreignKey({
      columns: [table.mathSubmissionId, table.mathQuestionId],
      foreignColumns: [mathSubmissions.id, mathSubmissions.mathQuestionId],
      name: "math_package_candidates_submission_question_fk"
    }).onDelete("restrict"),
    questionPostureIndex: index("math_package_candidates_question_posture_idx").on(
      table.mathQuestionId,
      table.posture
    ),
    idQuestionUnique: uniqueIndex("math_package_candidates_id_question_unique").on(
      table.mathPackageCandidateId,
      table.mathQuestionId
    ),
    createdFromReviewIndex: index(
      "math_package_candidates_created_from_review_idx"
    ).on(table.createdFromReviewRecordId),
    linkedBenchmarkVersionIndex: index(
      "math_package_candidates_linked_benchmark_version_idx"
    ).on(table.linkedBenchmarkVersionId)
  })
);

export const repoSyncRecords = pgTable(
  "repo_sync_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mathPackageCandidateId: text("math_package_candidate_id").references(
      () => mathPackageCandidates.mathPackageCandidateId,
      { onDelete: "set null" }
    ),
    repoOwner: text("repo_owner").notNull(),
    repoName: text("repo_name").notNull(),
    targetRepoPath: text("target_repo_path").notNull(),
    pullRequestNumber: integer("pull_request_number"),
    pullRequestUrl: text("pull_request_url"),
    mergeCommitSha: text("merge_commit_sha"),
    status: repoSyncStatusEnum("status").default("proposed").notNull(),
    note: text("note"),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    lastUpdatedByUserId: uuid("last_updated_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    statusIndex: index("repo_sync_records_status_idx").on(table.status),
    candidateIndex: index("repo_sync_records_math_package_candidate_id_idx").on(
      table.mathPackageCandidateId
    ),
    pullRequestUnique: uniqueIndex("repo_sync_records_repo_pr_unique")
      .on(table.repoOwner, table.repoName, table.pullRequestNumber)
      .where(sql`${table.pullRequestNumber} is not null`)
  })
);

export const packageFreezes = pgTable(
  "package_freezes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repoSyncRecordId: uuid("repo_sync_record_id")
      .notNull()
      .references(() => repoSyncRecords.id),
    mathPackageCandidateId: text("math_package_candidate_id").references(
      () => mathPackageCandidates.mathPackageCandidateId,
      { onDelete: "set null" }
    ),
    packageId: text("package_id").notNull(),
    packageVersion: text("package_version").notNull(),
    packageDigest: text("package_digest").notNull(),
    benchmarkFamily: text("benchmark_family").notNull(),
    repoCommitSha: text("repo_commit_sha").notNull(),
    repoTreePath: text("repo_tree_path").notNull(),
    status: packageFreezeStatusEnum("status").default("active").notNull(),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    repoSyncRecordUnique: uniqueIndex("package_freezes_repo_sync_record_id_unique").on(
      table.repoSyncRecordId
    ),
    packageDigestUnique: uniqueIndex("package_freezes_package_digest_unique").on(
      table.packageDigest
    ),
    mathPackageCandidateIndex: index("package_freezes_math_package_candidate_id_idx").on(
      table.mathPackageCandidateId
    )
  })
);

export const benchmarkVersions = pgTable(
  "benchmark_versions",
  {
    benchmarkVersionId: text("benchmark_version_id").primaryKey(),
    packageFreezeId: uuid("package_freeze_id")
      .notNull()
      .references(() => packageFreezes.id),
    packageId: text("package_id").notNull(),
    packageVersion: text("package_version").notNull(),
    packageDigest: text("package_digest").notNull(),
    benchmarkFamily: text("benchmark_family").notNull(),
    scopeLabel: text("scope_label").notNull(),
    itemSetDefinition: jsonb("item_set_definition").$type<Record<string, unknown> | null>(),
    launchability: benchmarkVersionLaunchabilityEnum("launchability")
      .default("internal_only")
      .notNull(),
    displayLabel: text("display_label").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    launchabilityIndex: index("benchmark_versions_launchability_idx").on(
      table.launchability
    ),
    packageDigestIndex: index("benchmark_versions_package_digest_idx").on(
      table.packageDigest
    )
  })
);

export const benchmarkReleases = pgTable(
  "benchmark_releases",
  {
    benchmarkReleaseId: text("benchmark_release_id").primaryKey(),
    benchmarkVersionId: text("benchmark_version_id")
      .notNull()
      .references(() => benchmarkVersions.benchmarkVersionId),
    releaseLabel: text("release_label").notNull(),
    status: benchmarkReleaseStatusEnum("status").default("draft").notNull(),
    visibility: benchmarkReleaseVisibilityEnum("visibility")
      .default("internal_only")
      .notNull(),
    methodologyArtifactRefs: jsonb("methodology_artifact_refs").$type<string[]>().notNull(),
    summaryArtifactRefs: jsonb("summary_artifact_refs").$type<string[]>().notNull(),
    summaryPayload: jsonb("summary_payload").$type<Record<string, unknown> | null>(),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    benchmarkVersionIndex: index("benchmark_releases_benchmark_version_id_idx").on(
      table.benchmarkVersionId
    ),
    publicVersionUnique: uniqueIndex("benchmark_releases_public_version_unique")
      .on(table.benchmarkVersionId)
      .where(
        sql`${table.status} = 'published' and ${table.visibility} = 'public'`
      ),
    statusIndex: index("benchmark_releases_status_idx").on(table.status),
    publicFeedIndex: index("benchmark_releases_status_visibility_published_at_idx").on(
      table.status,
      table.visibility,
      table.publishedAt
    )
  })
);

export const mathReleaseLinks = pgTable(
  "math_release_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mathQuestionId: uuid("math_question_id")
      .notNull()
      .references(() => mathQuestions.id, { onDelete: "restrict" }),
    mathPackageCandidateId: text("math_package_candidate_id")
      .notNull()
      .references(() => mathPackageCandidates.mathPackageCandidateId, {
        onDelete: "restrict"
      }),
    benchmarkVersionId: text("benchmark_version_id").references(
      () => benchmarkVersions.benchmarkVersionId,
      { onDelete: "set null" }
    ),
    benchmarkReleaseId: text("benchmark_release_id").references(
      () => benchmarkReleases.benchmarkReleaseId,
      { onDelete: "set null" }
    ),
    posture: mathReleaseLinkPostureEnum("posture").default("planned").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    packageCandidateQuestionForeignKey: foreignKey({
      columns: [table.mathPackageCandidateId, table.mathQuestionId],
      foreignColumns: [
        mathPackageCandidates.mathPackageCandidateId,
        mathPackageCandidates.mathQuestionId
      ],
      name: "math_release_links_candidate_question_fk"
    }).onDelete("restrict"),
    linkageShapeCheck: check(
      "math_release_links_linkage_shape_check",
      sql`(
        ${table.posture} in ('planned', 'withdrawn')
      ) or (
        ${table.posture} = 'version_linked'
        and ${table.benchmarkVersionId} is not null
      ) or (
        ${table.posture} in ('release_linked', 'published')
        and ${table.benchmarkReleaseId} is not null
      )`
    ),
    questionPostureIndex: index("math_release_links_question_posture_idx").on(
      table.mathQuestionId,
      table.posture
    ),
    packageCandidateIndex: index("math_release_links_package_candidate_id_idx").on(
      table.mathPackageCandidateId
    ),
    benchmarkVersionUnique: uniqueIndex(
      "math_release_links_package_candidate_version_unique"
    )
      .on(table.mathPackageCandidateId, table.benchmarkVersionId)
      .where(sql`${table.benchmarkVersionId} is not null`),
    benchmarkReleaseUnique: uniqueIndex(
      "math_release_links_package_candidate_release_unique"
    )
      .on(table.mathPackageCandidateId, table.benchmarkReleaseId)
      .where(sql`${table.benchmarkReleaseId} is not null`)
  })
);

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceRunId: text("source_run_id").notNull(),
    runKind: runKindEnum("run_kind").default("single_run").notNull(),
    state: runStateEnum("state").notNull(),
    verdictClass: evaluationVerdictClassEnum("verdict_class").notNull(),
    benchmarkPackageId: text("benchmark_package_id").notNull(),
    benchmarkPackageVersion: text("benchmark_package_version").notNull(),
    benchmarkPackageDigest: text("benchmark_package_digest").notNull(),
    benchmarkItemId: text("benchmark_item_id").notNull(),
    laneId: text("lane_id").notNull(),
    promptProtocolVersion: text("prompt_protocol_version").notNull(),
    promptPackageDigest: text("prompt_package_digest").notNull(),
    runMode: text("run_mode").notNull(),
    toolProfile: text("tool_profile").notNull(),
    harnessRevision: text("harness_revision").notNull(),
    verifierVersion: text("verifier_version").notNull(),
    providerFamily: text("provider_family").notNull(),
    authMode: text("auth_mode").notNull(),
    modelConfigId: text("model_config_id").notNull(),
    modelSnapshotId: text("model_snapshot_id").notNull(),
    environmentDigest: text("environment_digest").notNull(),
    runConfigDigest: text("run_config_digest").notNull(),
    bundleDigest: text("bundle_digest").notNull(),
    stopReason: text("stop_reason").notNull(),
    primaryFailureFamily: text("primary_failure_family"),
    primaryFailureCode: text("primary_failure_code"),
    primaryFailureSummary: text("primary_failure_summary"),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    sourceRunIdUnique: uniqueIndex("runs_source_run_id_unique").on(table.sourceRunId),
    bundleDigestUnique: uniqueIndex("runs_bundle_digest_unique").on(table.bundleDigest),
    stateIndex: index("runs_state_idx").on(table.state),
    verdictClassIndex: index("runs_verdict_class_idx").on(table.verdictClass),
    benchmarkDigestIndex: index("runs_benchmark_digest_idx").on(table.benchmarkPackageDigest),
    runConfigDigestIndex: index("runs_run_config_digest_idx").on(table.runConfigDigest)
  })
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    sourceJobId: text("source_job_id"),
    state: jobStateEnum("state").notNull(),
    verdictClass: evaluationVerdictClassEnum("verdict_class").notNull(),
    stopReason: text("stop_reason").notNull(),
    primaryFailureFamily: text("primary_failure_family"),
    primaryFailureCode: text("primary_failure_code"),
    primaryFailureSummary: text("primary_failure_summary"),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    runIndex: index("jobs_run_id_idx").on(table.runId),
    stateIndex: index("jobs_state_idx").on(table.state),
    sourceJobIdIndex: index("jobs_source_job_id_idx").on(table.sourceJobId)
  })
);

export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    sourceAttemptId: text("source_attempt_id").notNull(),
    state: attemptStateEnum("state").notNull(),
    verdictClass: evaluationVerdictClassEnum("verdict_class").notNull(),
    verifierResult: text("verifier_result").notNull(),
    benchmarkPackageDigest: text("benchmark_package_digest").notNull(),
    laneId: text("lane_id").notNull(),
    promptPackageDigest: text("prompt_package_digest").notNull(),
    promptProtocolVersion: text("prompt_protocol_version").notNull(),
    providerFamily: text("provider_family").notNull(),
    authMode: text("auth_mode").notNull(),
    modelConfigId: text("model_config_id").notNull(),
    modelSnapshotId: text("model_snapshot_id").notNull(),
    runMode: text("run_mode").notNull(),
    toolProfile: text("tool_profile").notNull(),
    harnessRevision: text("harness_revision").notNull(),
    verifierVersion: text("verifier_version").notNull(),
    stopReason: text("stop_reason").notNull(),
    candidateDigest: text("candidate_digest").notNull(),
    verdictDigest: text("verdict_digest").notNull(),
    environmentDigest: text("environment_digest").notNull(),
    artifactManifestDigest: text("artifact_manifest_digest").notNull(),
    bundleDigest: text("bundle_digest").notNull(),
    primaryFailureFamily: text("primary_failure_family"),
    primaryFailureCode: text("primary_failure_code"),
    primaryFailureSummary: text("primary_failure_summary"),
    failureClassification: jsonb("failure_classification").$type<Record<string, unknown> | null>(),
    verifierVerdict: jsonb("verifier_verdict").$type<Record<string, unknown>>().notNull(),
    usageSummary: jsonb("usage_summary").$type<Record<string, unknown> | null>(),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    runIndex: index("attempts_run_id_idx").on(table.runId),
    jobIndex: index("attempts_job_id_idx").on(table.jobId),
    stateIndex: index("attempts_state_idx").on(table.state),
    sourceAttemptUnique: uniqueIndex("attempts_source_attempt_id_unique").on(
      table.sourceAttemptId
    ),
    bundleDigestUnique: uniqueIndex("attempts_bundle_digest_unique").on(table.bundleDigest)
  })
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    artifactClassId: artifactClassEnum("artifact_class_id").notNull(),
    ownerScope: artifactOwnerScopeEnum("owner_scope").notNull(),
    runId: uuid("run_id").references(() => runs.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }),
    attemptId: uuid("attempt_id").references(() => attempts.id, { onDelete: "cascade" }),
    benchmarkVersionId: text("benchmark_version_id"),
    exportId: text("export_id"),
    relativePath: text("relative_path").notNull(),
    requiredForIngest: boolean("required_for_ingest").notNull(),
    artifactManifestDigest: text("artifact_manifest_digest"),
    storageProvider: artifactStorageProviderEnum("storage_provider").notNull(),
    bucketName: text("bucket_name").notNull(),
    objectKey: text("object_key").notNull(),
    prefixFamily: artifactPrefixFamilyEnum("prefix_family").notNull(),
    sha256: text("sha256").notNull(),
    byteSize: integer("byte_size").notNull(),
    mediaType: text("media_type"),
    contentEncoding: text("content_encoding"),
    providerEtag: text("provider_etag"),
    lifecycleState: artifactLifecycleStateEnum("lifecycle_state").notNull(),
    registeredAt: timestamp("registered_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    missingDetectedAt: timestamp("missing_detected_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true })
  },
  (table) => ({
    storageLocatorUnique: uniqueIndex("artifacts_storage_locator_unique").on(
      table.storageProvider,
      table.bucketName,
      table.objectKey
    ),
    attemptRelativePathUnique: uniqueIndex("artifacts_attempt_relative_path_unique")
      .on(table.attemptId, table.artifactClassId, table.relativePath)
      .where(sql`${table.attemptId} is not null`),
    runIndex: index("artifacts_run_id_idx").on(table.runId),
    attemptStateIndex: index("artifacts_attempt_id_lifecycle_state_idx").on(
      table.attemptId,
      table.lifecycleState
    ),
    runClassIndex: index("artifacts_run_id_artifact_class_idx").on(
      table.runId,
      table.artifactClassId
    ),
    manifestDigestIndex: index("artifacts_manifest_digest_idx").on(
      table.artifactManifestDigest
    ),
    sha256Index: index("artifacts_sha256_idx").on(table.sha256)
  })
);

export const mathArtifactRefs = pgTable(
  "math_artifact_refs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subjectType: mathArtifactSubjectTypeEnum("subject_type").notNull(),
    mathQuestionRevisionId: uuid("math_question_revision_id").references(
      () => mathQuestionRevisions.id,
      { onDelete: "restrict" }
    ),
    mathSubmissionId: uuid("math_submission_id").references(() => mathSubmissions.id, {
      onDelete: "restrict"
    }),
    artifactRole: text("artifact_role").notNull(),
    backingType: mathArtifactBackingTypeEnum("backing_type").notNull(),
    artifactId: uuid("artifact_id").references(() => artifacts.id, {
      onDelete: "set null"
    }),
    contentDigest: text("content_digest"),
    filename: text("filename").notNull(),
    pathHint: text("path_hint"),
    mediaType: text("media_type"),
    backingMetadata: jsonb("backing_metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    subjectShapeCheck: check(
      "math_artifact_refs_subject_shape_check",
      sql`(
        ${table.subjectType} = 'question_revision'
        and ${table.mathQuestionRevisionId} is not null
        and ${table.mathSubmissionId} is null
      ) or (
        ${table.subjectType} = 'submission'
        and ${table.mathQuestionRevisionId} is null
        and ${table.mathSubmissionId} is not null
      )`
    ),
    backingLocatorCheck: check(
      "math_artifact_refs_backing_locator_check",
      sql`${table.artifactId} is not null or ${table.contentDigest} is not null`
    ),
    repoLinkedMetadataCheck: check(
      "math_artifact_refs_repo_linked_metadata_check",
      sql`${table.backingType} <> 'repo_linked_reference' or ${table.backingMetadata} <> '{}'::jsonb`
    ),
    questionRevisionRoleIndex: index(
      "math_artifact_refs_question_revision_role_idx"
    ).on(table.mathQuestionRevisionId, table.artifactRole),
    submissionRoleIndex: index("math_artifact_refs_submission_role_idx").on(
      table.mathSubmissionId,
      table.artifactRole
    ),
    artifactIndex: index("math_artifact_refs_artifact_id_idx").on(table.artifactId),
    digestIndex: index("math_artifact_refs_content_digest_idx").on(
      table.contentDigest
    )
  })
);

export const workerJobLeases = pgTable(
  "worker_job_leases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    workerInstanceId: uuid("worker_instance_id").references(() => workerInstances.id, {
      onDelete: "set null"
    }),
    workerId: text("worker_id").notNull(),
    workerPool: text("worker_pool").notNull(),
    workerRuntime: workerRuntimeEnum("worker_runtime").notNull(),
    workerVersion: text("worker_version").notNull(),
    heartbeatIntervalSeconds: integer("heartbeat_interval_seconds").notNull(),
    heartbeatTimeoutSeconds: integer("heartbeat_timeout_seconds").notNull(),
    lastEventSequence: integer("last_event_sequence").default(0).notNull(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }).notNull(),
    jobTokenHash: text("job_token_hash").notNull(),
    jobTokenExpiresAt: timestamp("job_token_expires_at", { withTimezone: true }).notNull(),
    jobTokenScopes: jsonb("job_token_scopes").$type<string[]>().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    activeJobUnique: uniqueIndex("worker_job_leases_active_job_unique")
      .on(table.jobId)
      .where(sql`${table.revokedAt} is null`),
    activeAttemptUnique: uniqueIndex("worker_job_leases_active_attempt_unique")
      .on(table.attemptId)
      .where(sql`${table.revokedAt} is null`),
    tokenHashUnique: uniqueIndex("worker_job_leases_job_token_hash_unique").on(table.jobTokenHash),
    runIndex: index("worker_job_leases_run_id_idx").on(table.runId),
    jobIndex: index("worker_job_leases_job_id_idx").on(table.jobId),
    attemptIndex: index("worker_job_leases_attempt_id_idx").on(table.attemptId),
    workerInstanceIndex: index("worker_job_leases_worker_instance_id_idx").on(
      table.workerInstanceId
    ),
    leaseExpiryIndex: index("worker_job_leases_lease_expires_at_idx").on(table.leaseExpiresAt)
  })
);

export const workerAttemptEvents = pgTable(
  "worker_attempt_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    leaseId: uuid("lease_id")
      .notNull()
      .references(() => workerJobLeases.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    phase: workerExecutionPhaseEnum("phase").notNull(),
    eventKind: workerExecutionEventKindEnum("event_kind").notNull(),
    summary: text("summary").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    attemptSequenceUnique: uniqueIndex("worker_attempt_events_attempt_sequence_unique").on(
      table.attemptId,
      table.sequence
    ),
    attemptRecordedAtIndex: index("worker_attempt_events_attempt_recorded_at_idx").on(
      table.attemptId,
      table.recordedAt
    ),
    leaseIndex: index("worker_attempt_events_lease_id_idx").on(table.leaseId)
  })
);

export const usersRelations = relations(users, ({ many }) => ({
  identities: many(userIdentities),
  identityLinkIntents: many(identityLinkIntents),
  roleGrants: many(roleGrants),
  accessRequests: many(accessRequests),
  sessions: many(sessions),
  auditEventsAsActor: many(auditEvents, {
    relationName: "audit_event_actor"
  }),
  auditEventsAsTarget: many(auditEvents, {
    relationName: "audit_event_target"
  })
}));

export const userIdentitiesRelations = relations(userIdentities, ({ one, many }) => ({
  user: one(users, {
    fields: [userIdentities.userId],
    references: [users.id]
  }),
  sessions: many(sessions)
}));

export const identityLinkIntentsRelations = relations(identityLinkIntents, ({ one }) => ({
  user: one(users, {
    fields: [identityLinkIntents.userId],
    references: [users.id]
  })
}));

export const roleGrantsRelations = relations(roleGrants, ({ one }) => ({
  user: one(users, {
    fields: [roleGrants.userId],
    references: [users.id]
  }),
  grantedByUser: one(users, {
    fields: [roleGrants.grantedByUserId],
    references: [users.id]
  }),
  revokedByUser: one(users, {
    fields: [roleGrants.revokedByUserId],
    references: [users.id]
  })
}));

export const accessRequestsRelations = relations(accessRequests, ({ one }) => ({
  requestedByUser: one(users, {
    fields: [accessRequests.requestedByUserId],
    references: [users.id]
  }),
  reviewedByUser: one(users, {
    fields: [accessRequests.reviewedByUserId],
    references: [users.id]
  })
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id]
  }),
  identity: one(userIdentities, {
    fields: [sessions.identityId],
    references: [userIdentities.id]
  })
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  actorUser: one(users, {
    fields: [auditEvents.actorUserId],
    references: [users.id],
    relationName: "audit_event_actor"
  }),
  targetUser: one(users, {
    fields: [auditEvents.targetUserId],
    references: [users.id],
    relationName: "audit_event_target"
  })
}));
