import type { ApiCallBoundaryEntry } from "../types/api-call-boundary";

// MVP keeps portal traffic simple: the browser talks directly to /portal routes, while /internal stays service-only.
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
    credential: "none",
    endpointId: "benchmarks.list",
    mode: "browser_direct",
    origin: "public_browser",
    rationale:
      "Public benchmark metadata is read directly by the public website without portal mediation."
  },
  {
    credential: "none",
    endpointId: "benchmark-report.read",
    mode: "browser_direct",
    origin: "public_browser",
    rationale:
      "Published benchmark reports are public read traffic, so the website can fetch them directly from the browser."
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
    endpointId: "portal.runs.list",
    mode: "browser_direct",
    origin: "portal_browser",
    rationale:
      "Run listings are first-party portal data and the browser already arrives with an Access-backed identity assertion."
  },
  {
    credential: "cloudflare_access_jwt",
    endpointId: "portal.runs.read",
    mode: "browser_direct",
    origin: "portal_browser",
    rationale:
      "Authenticated users inspect run status directly from the portal, so the browser can call the matching portal route."
  },
  {
    credential: "cloudflare_access_jwt",
    endpointId: "portal.runs.create",
    mode: "browser_direct",
    origin: "portal_browser",
    rationale:
      "Benchmark launches remain user-initiated portal actions; the backend still enforces collaborator-or-admin role checks."
  },
  {
    credential: "cloudflare_access_jwt",
    endpointId: "portal.runs.cancel",
    mode: "browser_direct",
    origin: "portal_browser",
    rationale:
      "Run cancellation is the same authenticated portal control-plane action and does not need a second server mediation layer in MVP."
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
    endpointId: "admin.access-request.approve",
    mode: "browser_direct",
    origin: "portal_browser",
    rationale:
      "The MVP portal has no separate admin server layer, so approved admins call the protected decision route directly with their Access identity and RBAC check."
  },
  {
    credential: "cloudflare_access_jwt",
    endpointId: "admin.access-request.reject",
    mode: "browser_direct",
    origin: "portal_browser",
    rationale:
      "Rejection stays on the authenticated portal audience for MVP, while the backend still enforces admin-only RBAC and audit logging."
  },
  {
    credential: "cloudflare_service_token",
    endpointId: "worker.jobs.heartbeat",
    mode: "internal_service_only",
    origin: "worker_service",
    rationale:
      "Heartbeat traffic is machine-to-machine control-plane traffic and must never be reachable from the browser."
  },
  {
    credential: "cloudflare_service_token",
    endpointId: "worker.jobs.event",
    mode: "internal_service_only",
    origin: "worker_service",
    rationale:
      "Worker event ingestion is internal telemetry and should stay behind the internal Access audience and service token boundary."
  },
  {
    credential: "cloudflare_service_token",
    endpointId: "worker.jobs.result",
    mode: "internal_service_only",
    origin: "worker_service",
    rationale:
      "Final worker result submission carries privileged run state and artifact references, so it is restricted to internal service callers."
  }
] satisfies ApiCallBoundaryEntry[];
