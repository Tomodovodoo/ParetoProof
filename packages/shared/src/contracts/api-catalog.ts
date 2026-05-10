import type { ApiEndpointCatalogEntry } from "../types/api-catalog.js";

export const apiEndpointCatalog = [
  {
    access: "anonymous",
    audience: "public",
    id: "health.read",
    method: "GET",
    path: "/health",
    purpose: "Infrastructure health probe for Railway and external uptime checks."
  },
  {
    access: "authenticated_access_identity",
    audience: "portal",
    id: "portal.me.read",
    method: "GET",
    path: "/portal/me",
    purpose: "Return the caller's resolved identity, role summary, and approval state."
  },
  {
    access: "anonymous",
    audience: "public",
    id: "portal.session.retry.complete",
    method: "GET",
    path: "/portal/session/complete",
    purpose:
      "Restart the branded auth entry when a browser lands on the legacy session-completion URL directly."
  },
  {
    access: "anonymous",
    audience: "public",
    id: "portal.session.retry.finalize",
    method: "GET",
    path: "/portal/session/finalize",
    purpose:
      "Restart the branded auth entry when a browser lands on the raw session-finalize URL directly."
  },
  {
    access: "anonymous",
    audience: "public",
    id: "portal.session.finalize.read",
    method: "GET",
    path: "/portal/session/finalize/submit",
    purpose:
      "Handle the branded-auth finalize navigation by either completing the session handoff or bouncing the browser back to the retry relay."
  },
  {
    access: "authenticated_access_identity",
    audience: "portal",
    id: "portal.session.complete.submit",
    method: "POST",
    path: "/portal/session/complete",
    purpose:
      "Finish the Cloudflare Access login handoff on the legacy complete POST alias without requiring the caller to switch away from the authenticated browser surface."
  },
  {
    access: "authenticated_access_identity",
    audience: "portal",
    id: "portal.session.finalize.submit",
    method: "POST",
    path: "/portal/session/finalize",
    purpose:
      "Finish the Cloudflare Access login handoff on the legacy finalize POST alias while preserving the same redirect-bearing session semantics as the canonical submit route."
  },
  {
    access: "authenticated_access_identity",
    audience: "portal",
    id: "portal.session.complete",
    method: "POST",
    path: "/portal/session/finalize/submit",
    purpose:
      "Finish the Cloudflare Access login handoff with a first-party POST on the API audience and return the browser to the static portal host."
  },
  {
    access: "authenticated_access_identity",
    audience: "portal",
    id: "portal.access-request.create",
    method: "POST",
    path: "/portal/access-requests",
    purpose: "Create or refresh the caller's contributor access request."
  },
  {
    access: "authenticated_access_identity",
    audience: "portal",
    id: "portal.access-request.read",
    method: "GET",
    path: "/portal/access-requests/me",
    purpose: "Show the caller's latest access request state inside the portal."
  },
  {
    access: "authenticated_access_identity",
    audience: "portal",
    id: "portal.access-recovery.create",
    method: "POST",
    path: "/portal/access-recovery",
    purpose:
      "Create or refresh an approved-user recovery request when a new Cloudflare Access subject must be linked by an admin."
  },
  {
    access: "authenticated_access_identity",
    audience: "portal",
    id: "portal.profile.read",
    method: "GET",
    path: "/portal/profile",
    purpose: "Return the caller's editable portal profile details and linked identities."
  },
  {
    access: "approved_helper_or_higher",
    audience: "portal",
    id: "portal.overview.read",
    method: "GET",
    path: "/portal/overview",
    purpose:
      "Return the portal landing overview read model with real benchmark activity, queue posture, and recent incident summaries."
  },
  {
    access: "approved_helper_or_higher",
    audience: "portal",
    id: "portal.benchmarks.list",
    method: "GET",
    path: "/portal/benchmarks",
    purpose:
      "Return the benchmark dataset index read model for approved portal users browsing benchmark performance slices."
  },
  {
    access: "approved_helper_or_higher",
    audience: "portal",
    id: "portal.benchmark-dataset.read",
    method: "GET",
    path: "/portal/benchmarks/:packageId/dataset",
    purpose:
      "Return one benchmark package dataset with run, job, attempt, and verdict summaries for portal analysis."
  },
  {
    access: "approved_helper_or_higher",
    audience: "portal",
    id: "portal.benchmark-export.read",
    method: "GET",
    path: "/portal/benchmarks/:packageId/export",
    purpose:
      "Export one benchmark package dataset in the requested operator-facing format without bypassing the portal read-model boundary."
  },
  {
    access: "approved_helper_or_higher",
    audience: "portal",
    id: "portal.runs.list",
    method: "GET",
    path: "/portal/runs",
    purpose:
      "Return the canonical private run index read model for approved portal users, including bounded filters and benchmark-operation summaries."
  },
  {
    access: "approved_helper_or_higher",
    audience: "portal",
    id: "portal.run-detail.read",
    method: "GET",
    path: "/portal/runs/:runId",
    purpose:
      "Return the canonical evidence view for one run, including timeline, artifact, attempt, and worker-lease summaries."
  },
  {
    access: "approved_collaborator_or_higher",
    audience: "portal",
    id: "portal.launch.read",
    method: "GET",
    path: "/portal/launch",
    purpose:
      "Return launch preflight metadata for benchmark selection, run-shape policy, and contributor-visible governance limits."
  },
  {
    access: "approved_helper_or_higher",
    audience: "portal",
    id: "portal.harnesses.read",
    method: "GET",
    path: "/portal/harnesses",
    purpose:
      "Return the official harness registry catalog, including runtime class, auth posture, and published image identity metadata."
  },
  {
    access: "approved_collaborator_or_higher",
    audience: "portal",
    id: "portal.workers.read",
    method: "GET",
    path: "/portal/workers",
    purpose:
      "Return the bounded worker-operations overview for queue pressure, active leases, and derived operational incidents."
  },
  {
    access: "authenticated_access_identity",
    audience: "portal",
    id: "portal.profile.update",
    method: "PATCH",
    path: "/portal/profile",
    purpose: "Update the caller's portal profile fields without changing role grants."
  },
  {
    access: "approved_helper_or_higher",
    audience: "portal",
    id: "portal.profile.link-intent.create",
    method: "POST",
    path: "/portal/profile/link-intents",
    purpose:
      "Create a short-lived identity-link handoff so an approved user can attach another sign-in method."
  },
  {
    access: "approved_helper_or_higher",
    audience: "math",
    id: "math.questions.list",
    method: "GET",
    path: "/math/questions",
    purpose:
      "List math questions once the durable math question persistence layer is available."
  },
  {
    access: "approved_helper_or_higher",
    audience: "math",
    id: "math.question.detail",
    method: "GET",
    path: "/math/questions/:questionId",
    purpose:
      "Read one math question and its workflow posture once the durable math question model is available."
  },
  {
    access: "approved_collaborator_or_higher",
    audience: "math",
    id: "math.submission.create",
    method: "POST",
    path: "/math/questions/:questionId/submissions",
    purpose:
      "Create a math submission against one question revision once the durable submission layer is available."
  },
  {
    access: "approved_helper_or_higher",
    audience: "math",
    id: "math.submission.detail",
    method: "GET",
    path: "/math/submissions/:submissionId",
    purpose:
      "Read one math submission with Lean profile, automation, and review-gate posture once persistence is available."
  },
  {
    access: "approved_collaborator_or_higher",
    audience: "math",
    id: "math.submission.lean-profile.update",
    method: "PATCH",
    path: "/math/submissions/:submissionId/lean-profile",
    purpose:
      "Update the Lean submission profile boundary once durable submission workflow state is available."
  },
  {
    access: "approved_collaborator_or_higher",
    audience: "math",
    id: "math.submission.review-gate.update",
    method: "PATCH",
    path: "/math/submissions/:submissionId/review-gates/:reviewGateKind",
    purpose:
      "Update one Lean review gate from the math workflow surface once review persistence is available."
  },
  {
    access: "approved_helper_or_higher",
    audience: "math",
    id: "math.reviews.list",
    method: "GET",
    path: "/math/reviews",
    purpose:
      "List math review records and queues once the durable review workflow tables are available."
  },
  {
    access: "approved_helper_or_higher",
    audience: "math",
    id: "math.review.detail",
    method: "GET",
    path: "/math/reviews/:reviewId",
    purpose:
      "Read one math review record once durable review workflow persistence is available."
  },
  {
    access: "approved_helper_or_higher",
    audience: "math",
    id: "math.package-candidates.list",
    method: "GET",
    path: "/math/package-candidates",
    purpose:
      "List math package-candidate posture without moving package authority out of the admin workflow."
  },
  {
    access: "approved_helper_or_higher",
    audience: "math",
    id: "math.package-candidate.detail",
    method: "GET",
    path: "/math/package-candidates/:packageCandidateId",
    purpose:
      "Read one math package-candidate posture without moving package authority out of the admin workflow."
  },
  {
    access: "approved_helper_or_higher",
    audience: "math",
    id: "math.releases.list",
    method: "GET",
    path: "/math/releases",
    purpose:
      "List release lineage visible to the math workflow once release persistence is available."
  },
  {
    access: "approved_helper_or_higher",
    audience: "math",
    id: "math.release.detail",
    method: "GET",
    path: "/math/releases/:releaseId",
    purpose:
      "Read one release lineage record visible to the math workflow once release persistence is available."
  },
  {
    access: "approved_helper_or_higher",
    audience: "math",
    id: "math.question-launch.read",
    method: "GET",
    path: "/math/questions/:questionId/launch",
    purpose:
      "Read question-scoped launch readiness once launch-source and benchmark-version linkage are available."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.problem9-offline-ingest.create",
    method: "POST",
    path: "/portal/admin/offline-ingest/problem9-run-bundles",
    purpose:
      "Import one completed canonical Problem 9 offline run bundle into terminal run, job, attempt, and artifact metadata records."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.access-request.list",
    method: "GET",
    path: "/portal/admin/access-requests",
    purpose:
      "List contributor access requests with reviewer, matched-user, and recovery-conflict posture for admin review."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.access-request.detail",
    method: "GET",
    path: "/portal/admin/access-requests/:accessRequestId",
    purpose:
      "Return the full admin review context for one access request, including linked identities, request history, and audit echoes."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.access-request.approve",
    method: "POST",
    path: "/portal/admin/access-requests/:accessRequestId/approve",
    purpose: "Approve an access request and issue the chosen contributor role grant."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.access-request.reject",
    method: "POST",
    path: "/portal/admin/access-requests/:accessRequestId/reject",
    purpose: "Reject an access request and record the admin decision note."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.user.list",
    method: "GET",
    path: "/portal/admin/users",
    purpose:
      "List contributor accounts with active-role posture, linked identity providers, and pending-request markers."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.user.detail",
    method: "GET",
    path: "/portal/admin/users/:userId",
    purpose:
      "Return one contributor's admin detail view, including linked identities, request history, audit history, and session posture."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.user.revoke",
    method: "POST",
    path: "/portal/admin/users/:userId/revoke-role",
    purpose:
      "Revoke the active helper or collaborator role for one contributor, audit the reason, and invalidate active sessions."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.repo-sync-record.create",
    method: "POST",
    path: "/portal/admin/repo-sync-records",
    purpose:
      "Record the repository review linkage for one benchmark candidate before it may be frozen into a launchable package snapshot."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.repo-sync-record.list",
    method: "GET",
    path: "/portal/admin/repo-sync-records",
    purpose:
      "List repo sync records so admins can review candidate repository state and merge posture."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.repo-sync-record.detail",
    method: "GET",
    path: "/portal/admin/repo-sync-records/:repoSyncRecordId",
    purpose:
      "Return one repo sync record for detailed admin review before freeze creation."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.repo-sync-record.status.update",
    method: "POST",
    path: "/portal/admin/repo-sync-records/:repoSyncRecordId/status",
    purpose:
      "Advance or close the repository review state for one candidate, including merged linkage."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.package-freeze.create",
    method: "POST",
    path: "/portal/admin/package-freezes",
    purpose:
      "Create an immutable package freeze from a merged repo sync record so later versions and releases share a durable package snapshot."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.package-freeze.list",
    method: "GET",
    path: "/portal/admin/package-freezes",
    purpose:
      "List package freezes with their source repo sync linkage for admin workflow review."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.package-freeze.detail",
    method: "GET",
    path: "/portal/admin/package-freezes/:packageFreezeId",
    purpose:
      "Return one immutable package freeze with its recorded provenance fields."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.benchmark-version.create",
    method: "POST",
    path: "/portal/admin/package-freezes/:packageFreezeId/benchmark-versions",
    purpose:
      "Create a benchmark version from an immutable freeze so launchability may be governed explicitly."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.benchmark-version.list",
    method: "GET",
    path: "/portal/admin/benchmark-versions",
    purpose:
      "List benchmark versions and their launchability posture for admin review."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.benchmark-version.detail",
    method: "GET",
    path: "/portal/admin/benchmark-versions/:benchmarkVersionId",
    purpose:
      "Return one benchmark version with its freeze-backed provenance and launchability state."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.benchmark-version.launchability.update",
    method: "POST",
    path: "/portal/admin/benchmark-versions/:benchmarkVersionId/launchability",
    purpose:
      "Promote one benchmark version into launchable state without mutating the underlying freeze."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.benchmark-release.create",
    method: "POST",
    path: "/portal/admin/benchmark-versions/:benchmarkVersionId/releases",
    purpose:
      "Create a draft benchmark release for one benchmark version with visibility and summary metadata."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.benchmark-release.list",
    method: "GET",
    path: "/portal/admin/benchmark-releases",
    purpose:
      "List benchmark releases and their publication posture for admin reporting review."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.benchmark-release.detail",
    method: "GET",
    path: "/portal/admin/benchmark-releases/:benchmarkReleaseId",
    purpose:
      "Return one benchmark release with its approval and publication state."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.benchmark-release.approve",
    method: "POST",
    path: "/portal/admin/benchmark-releases/:benchmarkReleaseId/approve",
    purpose:
      "Approve one benchmark release so it becomes eligible for publication."
  },
  {
    access: "admin_only",
    audience: "portal",
    id: "admin.benchmark-release.publish",
    method: "POST",
    path: "/portal/admin/benchmark-releases/:benchmarkReleaseId/publish",
    purpose:
      "Publish one approved public benchmark release so it can appear on the public reporting surface."
  },
  {
    access: "service_token",
    audience: "internal",
    id: "internal.worker.claim",
    method: "POST",
    path: "/internal/worker/claims",
    purpose:
      "Lease the next runnable worker assignment to an authenticated worker and return a short-lived per-job token when work is available."
  },
  {
    access: "service_token",
    audience: "internal",
    id: "internal.worker.heartbeat",
    method: "POST",
    path: "/internal/worker/jobs/:jobId/heartbeat",
    purpose:
      "Renew or invalidate an active worker lease and communicate whether execution should continue or cancel."
  },
  {
    access: "service_token",
    audience: "internal",
    id: "internal.worker.event.report",
    method: "POST",
    path: "/internal/worker/jobs/:jobId/events",
    purpose:
      "Store structured worker execution events such as start, progress, warnings, and checkpoints."
  },
  {
    access: "service_token",
    audience: "internal",
    id: "internal.worker.artifact-manifest.submit",
    method: "POST",
    path: "/internal/worker/jobs/:jobId/artifacts",
    purpose:
      "Register the artifact manifest for one worker assignment before or alongside upload completion."
  },
  {
    access: "service_token",
    audience: "internal",
    id: "internal.worker.result.submit",
    method: "POST",
    path: "/internal/worker/jobs/:jobId/result",
    purpose:
      "Submit the terminal success payload for one worker assignment, including result summary data and referenced artifacts."
  },
  {
    access: "service_token",
    audience: "internal",
    id: "internal.worker.failure.submit",
    method: "POST",
    path: "/internal/worker/jobs/:jobId/failure",
    purpose:
      "Submit a terminal failure payload for one worker assignment when execution cannot produce a valid success result."
  }
] as const satisfies readonly ApiEndpointCatalogEntry[];

export type ApiEndpointId = (typeof apiEndpointCatalog)[number]["id"];

export const apiEndpointIds = apiEndpointCatalog.map((entry) => entry.id) as [
  ApiEndpointId,
  ...ApiEndpointId[]
];
