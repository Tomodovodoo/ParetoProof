import type { ApiCallBoundaryEntry } from "../types/api-call-boundary.js";

export const apiCallBoundaryCatalog = [
  {
    credential: "none",
    endpointId: "health.read",
    mode: "browser_direct",
    origin: "public_browser",
    rationale:
      "Health checks need to work without Access so Railway and external uptime probes can reach the API."
  },
  {
    credential: "cloudflare_access_jwt",
    endpointId: "portal.me.read",
    mode: "browser_direct",
    origin: "portal_browser",
    rationale:
      "The portal shell needs the caller identity immediately after Access login, so the browser calls the protected route directly."
  },
  {
    credential: "none",
    endpointId: "portal.session.retry.complete",
    mode: "browser_direct",
    origin: "public_browser",
    rationale:
      "Direct visits to the legacy session-completion URL should bounce back to the branded auth surface instead of exposing a raw API response."
  },
  {
    credential: "none",
    endpointId: "portal.session.retry.finalize",
    mode: "browser_direct",
    origin: "public_browser",
    rationale:
      "Direct visits to the session-finalize URL should bounce back to the branded auth surface instead of exposing a raw API response."
  },
  {
    credential: "cloudflare_access_jwt",
    endpointId: "portal.session.complete",
    mode: "browser_navigation",
    origin: "portal_browser",
    rationale:
      "Custom auth buttons finish on a protected API handoff route through a same-site form POST so Cloudflare Access can establish the API audience without leaving a mutating GET finalize path."
  },
  {
    credential: "cloudflare_access_jwt",
    endpointId: "portal.access-request.create",
    mode: "browser_direct",
    origin: "portal_browser",
    rationale:
      "Contributor onboarding is a user-driven mutation that should stay on the authenticated portal audience instead of an internal proxy path."
  },
  {
    credential: "cloudflare_access_jwt",
    endpointId: "portal.access-request.read",
    mode: "browser_direct",
    origin: "portal_browser",
    rationale:
      "Pending contributors need to see their own approval state from the browser without introducing a separate portal server layer."
  },
  {
    credential: "cloudflare_access_jwt",
    endpointId: "portal.access-recovery.create",
    mode: "browser_direct",
    origin: "portal_browser",
    rationale:
      "Identity recovery starts from the denied portal surface, so the authenticated browser must be able to open a manual recovery request without a second backend proxy."
  },
  {
    credential: "cloudflare_access_jwt",
    endpointId: "portal.profile.read",
    mode: "browser_direct",
    origin: "portal_browser",
    rationale:
      "Approved portal users read their own profile directly from the authenticated portal surface."
  },
  {
    credential: "cloudflare_access_jwt",
    endpointId: "portal.profile.update",
    mode: "browser_direct",
    origin: "portal_browser",
    rationale:
      "Profile edits remain first-party portal mutations and use the same portal audience as other user-facing routes."
  },
  {
    credential: "cloudflare_access_jwt",
    endpointId: "portal.profile.link-intent.create",
    mode: "browser_direct",
    origin: "portal_browser",
    rationale:
      "Approved users create identity-link intents from the authenticated portal before a provider-specific handoff starts."
  },
  {
    credential: "cloudflare_access_jwt",
    endpointId: "admin.access-request.list",
    mode: "browser_direct",
    origin: "portal_browser",
    rationale:
      "Admins review contributor access requests from the portal UI, but the backend still narrows access to admin-only callers."
  },
  {
    credential: "cloudflare_access_jwt",
    endpointId: "admin.access-request.detail",
    mode: "browser_direct",
    origin: "portal_browser",
    rationale:
      "The admin review workspace needs a route-local detail fetch for one request without introducing a second admin backend."
  },
  {
    credential: "cloudflare_access_jwt",
    endpointId: "admin.access-request.approve",
    mode: "browser_direct",
    origin: "portal_browser",
    rationale:
      "The portal has no separate admin server layer, so approved admins call the protected decision route directly with their Access identity and RBAC check."
  },
  {
    credential: "cloudflare_access_jwt",
    endpointId: "admin.access-request.reject",
    mode: "browser_direct",
    origin: "portal_browser",
    rationale:
      "Rejection stays on the authenticated portal audience while the backend still enforces admin-only RBAC and audit logging."
  },
  {
    credential: "cloudflare_access_jwt",
    endpointId: "admin.user.list",
    mode: "browser_direct",
    origin: "portal_browser",
    rationale:
      "The admin users workspace is a browser-owned portal surface, so admins fetch contributor posture directly from the protected API."
  },
  {
    credential: "cloudflare_access_jwt",
    endpointId: "admin.user.detail",
    mode: "browser_direct",
    origin: "portal_browser",
    rationale:
      "Admin user inspection stays on the same portal audience while the backend enforces admin-only access and bounded read models."
  },
  {
    credential: "worker_bootstrap_token",
    endpointId: "internal.worker.claim",
    mode: "internal_service_only",
    origin: "worker_service",
    rationale:
      "Idle workers use their environment-scoped bootstrap credential only to claim work and receive a short-lived per-job token."
  },
  {
    credential: "worker_job_token",
    endpointId: "internal.worker.heartbeat",
    mode: "internal_service_only",
    origin: "worker_service",
    rationale:
      "Heartbeats belong to a single leased job and therefore use the short-lived per-job credential instead of the bootstrap token."
  },
  {
    credential: "worker_job_token",
    endpointId: "internal.worker.event.report",
    mode: "internal_service_only",
    origin: "worker_service",
    rationale:
      "Structured execution events must stay scoped to the active assignment that emitted them."
  },
  {
    credential: "worker_job_token",
    endpointId: "internal.worker.artifact-manifest.submit",
    mode: "internal_service_only",
    origin: "worker_service",
    rationale:
      "Artifact registration is part of one job's execution authority and should not be available through the broader bootstrap credential."
  },
  {
    credential: "worker_job_token",
    endpointId: "internal.worker.result.submit",
    mode: "internal_service_only",
    origin: "worker_service",
    rationale:
      "Final results are job-scoped terminal messages and must be authorized only for the leased assignment that produced them."
  },
  {
    credential: "worker_job_token",
    endpointId: "internal.worker.failure.submit",
    mode: "internal_service_only",
    origin: "worker_service",
    rationale:
      "Terminal failure submission must stay bound to the job lease so one worker cannot fail unrelated assignments."
  }
] satisfies ApiCallBoundaryEntry[];
