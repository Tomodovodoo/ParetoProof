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
] satisfies ApiEndpointCatalogEntry[];
