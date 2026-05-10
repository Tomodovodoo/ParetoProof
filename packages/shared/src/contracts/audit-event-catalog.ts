import type { AuditEventCatalogEntry } from "../types/audit-event.js";

export const auditEventCatalog = [
  {
    actor: "portal_user",
    id: "math_question.created",
    rationale:
      "Question creation establishes a durable math workflow identity for revisions, submissions, and later release lineage.",
    requiredFields: ["actorUserId", "mathQuestionId", "slug"],
    severity: "info",
    subject: "math_question"
  },
  {
    actor: "portal_user",
    id: "math_question_revision.created",
    rationale:
      "Question revisions are immutable review targets, so creation must preserve the author and parent question.",
    requiredFields: ["actorUserId", "mathQuestionId", "mathQuestionRevisionId"],
    severity: "info",
    subject: "math_question_revision"
  },
  {
    actor: "portal_user",
    id: "math_question_revision.posture_updated",
    rationale:
      "Revision posture changes decide whether a question definition is reviewable, accepted, or retired.",
    requiredFields: ["actorUserId", "mathQuestionRevisionId", "posture"],
    severity: "warning",
    subject: "math_question_revision"
  },
  {
    actor: "portal_user",
    id: "math_submission.created",
    rationale:
      "Submissions are durable units of math work and need a traceable submitter, question, and targeted revision.",
    requiredFields: [
      "actorUserId",
      "mathQuestionId",
      "mathQuestionRevisionId",
      "mathSubmissionId"
    ],
    severity: "info",
    subject: "math_submission"
  },
  {
    actor: "portal_user",
    id: "math_submission.posture_updated",
    rationale:
      "Submission posture changes affect review and package-candidate eligibility and must retain the actor and resulting state.",
    requiredFields: ["actorUserId", "mathSubmissionId", "posture"],
    severity: "warning",
    subject: "math_submission"
  },
  {
    actor: "portal_user",
    id: "math_review.record_opened",
    rationale:
      "Opening a math review record creates the durable review anchor for a specific subject and kind.",
    requiredFields: ["actorUserId", "mathReviewRecordId", "reviewKind", "subjectType"],
    severity: "info",
    subject: "math_review_record"
  },
  {
    actor: "portal_user",
    id: "math_review.round_opened",
    rationale:
      "Review rounds preserve separate review attempts under a durable record and need an auditable opener.",
    requiredFields: ["actorUserId", "mathReviewRecordId", "mathReviewRoundId"],
    severity: "info",
    subject: "math_review_record"
  },
  {
    actor: "portal_user",
    id: "math_review.assignment_changed",
    rationale:
      "Assignment changes decide who owns a round and must preserve reassignment or recusal history.",
    requiredFields: ["actorUserId", "assignmentRole", "mathReviewRoundId"],
    severity: "warning",
    subject: "math_review_record"
  },
  {
    actor: "portal_user",
    id: "math_review.checklist_updated",
    rationale:
      "Checklist state is structured review evidence and should not be reconstructed from comments.",
    requiredFields: ["actorUserId", "checklistFamily", "itemKey", "mathReviewRoundId"],
    severity: "info",
    subject: "math_review_record"
  },
  {
    actor: "portal_user",
    id: "math_review.comment_added",
    rationale:
      "Review comments are round-owned evidence and discussion tied to a durable review subject.",
    requiredFields: ["actorUserId", "mathReviewCommentId", "mathReviewRoundId"],
    severity: "info",
    subject: "math_review_record"
  },
  {
    actor: "portal_user",
    id: "math_review.decision_recorded",
    rationale:
      "Review decisions determine progression through math workflow and must preserve the actor, round, and outcome.",
    requiredFields: ["actorUserId", "decision", "mathReviewRecordId", "mathReviewRoundId"],
    severity: "critical",
    subject: "math_review_record"
  },
  {
    actor: "portal_user",
    id: "math_package_candidate.created",
    rationale:
      "Package candidates bridge accepted math workflow output into repository-backed benchmark material.",
    requiredFields: ["actorUserId", "mathPackageCandidateId", "mathQuestionId", "sourceType"],
    severity: "info",
    subject: "math_package_candidate"
  },
  {
    actor: "portal_user",
    id: "math_package_candidate.posture_updated",
    rationale:
      "Package-candidate posture changes decide whether math output may progress toward freeze, version, or release linkage.",
    requiredFields: ["actorUserId", "mathPackageCandidateId", "posture"],
    severity: "warning",
    subject: "math_package_candidate"
  },
  {
    actor: "portal_user",
    id: "math_release_link.created",
    rationale:
      "Release links record how a math package candidate connects to benchmark version or release objects.",
    requiredFields: ["actorUserId", "mathPackageCandidateId", "mathReleaseLinkId"],
    severity: "info",
    subject: "math_release_link"
  },
  {
    actor: "portal_user",
    id: "math_release_link.posture_updated",
    rationale:
      "Release-link posture changes affect the traceable path from math workflow to benchmark product objects.",
    requiredFields: ["actorUserId", "mathReleaseLinkId", "posture"],
    severity: "warning",
    subject: "math_release_link"
  },
  {
    actor: "portal_user",
    id: "benchmark_workflow.repo_sync_recorded",
    rationale:
      "Recording a repo sync candidate establishes the repository review boundary between proposed math output and launchable benchmark source.",
    requiredFields: ["actorUserId", "repoSyncRecordId", "repoName", "repoOwner", "status"],
    severity: "info",
    subject: "benchmark_workflow"
  },
  {
    actor: "portal_user",
    id: "benchmark_workflow.repo_sync_status_updated",
    rationale:
      "Repo sync status changes decide whether a candidate can progress into an immutable freeze and therefore need a durable actor and resulting state.",
    requiredFields: ["actorUserId", "repoSyncRecordId", "status"],
    severity: "warning",
    subject: "benchmark_workflow"
  },
  {
    actor: "portal_user",
    id: "benchmark_workflow.package_frozen",
    rationale:
      "Package freezes define the immutable benchmark package snapshot that later benchmark versions and releases depend on.",
    requiredFields: ["actorUserId", "packageFreezeId", "packageDigest", "repoSyncRecordId"],
    severity: "critical",
    subject: "benchmark_workflow"
  },
  {
    actor: "portal_user",
    id: "benchmark_version.created",
    rationale:
      "Creating a benchmark version makes one frozen package addressable as a launch candidate and needs durable provenance back to the freeze.",
    requiredFields: ["actorUserId", "benchmarkVersionId", "packageFreezeId"],
    severity: "info",
    subject: "benchmark_version"
  },
  {
    actor: "portal_user",
    id: "benchmark_version.launchability_updated",
    rationale:
      "Launchability changes alter which benchmark versions operators may expose to launch surfaces and must be auditable.",
    requiredFields: ["actorUserId", "benchmarkVersionId", "launchability"],
    severity: "critical",
    subject: "benchmark_version"
  },
  {
    actor: "portal_user",
    id: "benchmark_release.drafted",
    rationale:
      "Draft releases start the reporting workflow and should retain who created the release identifier, label, and visibility intent.",
    requiredFields: ["actorUserId", "benchmarkReleaseId", "benchmarkVersionId", "visibility"],
    severity: "info",
    subject: "benchmark_release"
  },
  {
    actor: "portal_user",
    id: "benchmark_release.approved",
    rationale:
      "Approvals gate the transition from draft reporting metadata into something eligible for publication and require an auditable approver.",
    requiredFields: ["actorUserId", "benchmarkReleaseId", "benchmarkVersionId"],
    severity: "critical",
    subject: "benchmark_release"
  },
  {
    actor: "portal_user",
    id: "benchmark_release.published",
    rationale:
      "Publishing a release changes the public evidence surface and therefore needs a durable approval and publication trail.",
    requiredFields: ["actorUserId", "benchmarkReleaseId", "benchmarkVersionId", "publishedAt"],
    severity: "critical",
    subject: "benchmark_release"
  },
  {
    actor: "portal_user",
    id: "access_request.submitted",
    rationale:
      "Contributor onboarding starts with a user action, so the system needs a durable record of who requested which role.",
    requiredFields: ["accessRequestId", "actorUserId", "requestKind", "targetEmail"],
    severity: "info",
    subject: "access_request"
  },
  {
    actor: "portal_user",
    id: "access_request.approved",
    rationale:
      "Approvals change who may use protected parts of the platform and must preserve the approving admin, target user, and requested role.",
    requiredFields: [
      "accessRequestId",
      "actorUserId",
      "approvedRole",
      "targetUserId"
    ],
    severity: "critical",
    subject: "access_request"
  },
  {
    actor: "portal_user",
    id: "access_request.rejected",
    rationale:
      "Rejected access requests still need an auditable trail because they affect future review state and contributor expectations.",
    requiredFields: ["accessRequestId", "actorUserId", "decisionNote", "targetEmail"],
    severity: "warning",
    subject: "access_request"
  },
  {
    actor: "portal_user",
    id: "role_grant.granted",
    rationale:
      "Role grants are the backend authorization source of truth, so every active grant needs an auditable issuer and target.",
    requiredFields: ["actorUserId", "grantedRole", "targetUserId"],
    severity: "critical",
    subject: "role_grant"
  },
  {
    actor: "portal_user",
    id: "role_grant.revoked",
    rationale:
      "Revocations are as security-sensitive as grants and must retain who removed the role and which active grant changed state.",
    requiredFields: ["actorUserId", "revokedRole", "targetUserId"],
    severity: "critical",
    subject: "role_grant"
  },
  {
    actor: "portal_user",
    id: "user_identity.link_intent_created",
    rationale:
      "Creating a short-lived identity-link intent starts a privileged handoff that should retain who initiated it, which provider it targeted, and when it expires.",
    requiredFields: [
      "actorUserId",
      "intentId",
      "targetProvider",
      "targetUserId",
      "expiresAt"
    ],
    severity: "info",
    subject: "user_identity"
  },
  {
    actor: "portal_user",
    id: "user_identity.linked",
    rationale:
      "Attaching another sign-in identity changes who can authenticate as an approved user and must preserve the actor, provider, and linked subject.",
    requiredFields: [
      "actorUserId",
      "identityProvider",
      "identitySubject",
      "targetUserId"
    ],
    severity: "critical",
    subject: "user_identity"
  },
  {
    actor: "portal_user",
    id: "run.created",
    rationale:
      "Benchmark launches consume compute budget and need a durable actor, benchmark selection, and run identifier before workers exist.",
    requiredFields: ["actorUserId", "benchmarkVersionId", "runId", "runKind"],
    severity: "info",
    subject: "run"
  },
  {
    actor: "portal_user",
    id: "run.cancel_requested",
    rationale:
      "Cancellation attempts should be visible even before the runner finishes stopping work, because they change the control-plane intent.",
    requiredFields: ["actorUserId", "runId"],
    severity: "warning",
    subject: "run"
  },
  {
    actor: "internal_service",
    id: "run.cancelled",
    rationale:
      "The control plane needs a separate final cancellation event once the backend actually transitions the run into a cancelled state.",
    requiredFields: ["runId", "sourceRequestActorUserId"],
    severity: "warning",
    subject: "run"
  },
  {
    actor: "system_bootstrap",
    id: "user_identity.bootstrapped_admin",
    rationale:
      "The initial owner bootstrap bypasses normal approval flow, so the system must keep a one-time audit record of that privileged setup path.",
    requiredFields: ["providerSubject", "targetUserId", "targetEmail"],
    severity: "critical",
    subject: "user_identity"
  }
] satisfies AuditEventCatalogEntry[];
