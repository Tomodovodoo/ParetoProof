import type { ApiEndpointCatalogEntry } from "../types/api-catalog";

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
    access: "anonymous",
    audience: "public",
    id: "benchmarks.list",
    method: "GET",
    path: "/public/benchmarks",
    purpose: "List the public benchmark versions that can be shown on the website."
  },
  {
    access: "anonymous",
    audience: "public",
    id: "benchmark-report.read",
    method: "GET",
    path: "/public/benchmark-reports/:benchmarkVersionId",
    purpose: "Serve the published public report for a benchmark version."
  },
  {
    access: "pending_or_approved",
    audience: "portal",
    id: "portal.me.read",
    method: "GET",
    path: "/portal/me",
    purpose: "Return the caller's resolved identity, role summary, and approval state."
  },
  {
    access: "pending_or_approved",
    audience: "portal",
    id: "portal.access-request.create",
    method: "POST",
    path: "/portal/access-requests",
    purpose: "Create or refresh the caller's contributor access request."
  },
  {
    access: "pending_or_approved",
    audience: "portal",
    id: "portal.access-request.read",
    method: "GET",
    path: "/portal/access-requests/me",
    purpose: "Show the caller's latest access request state inside the portal."
  },
  {
    access: "approved_helper_or_higher",
    audience: "portal",
    id: "portal.runs.list",
    method: "GET",
    path: "/portal/runs",
    purpose: "List runs visible to the authenticated portal user."
  },
  {
    access: "approved_helper_or_higher",
    audience: "portal",
    id: "portal.runs.read",
    method: "GET",
    path: "/portal/runs/:runId",
    purpose: "Read the status, summary, and events for one run."
  },
  {
    access: "approved_collaborator_or_higher",
    audience: "portal",
    id: "portal.runs.create",
    method: "POST",
    path: "/portal/runs",
    purpose: "Create a benchmark run from the authenticated portal."
  },
  {
    access: "approved_collaborator_or_higher",
    audience: "portal",
    id: "portal.runs.cancel",
    method: "POST",
    path: "/portal/runs/:runId/cancel",
    purpose: "Cancel a run the caller is allowed to manage."
  },
  {
    access: "admin_only",
    audience: "internal",
    id: "admin.access-request.approve",
    method: "POST",
    path: "/internal/admin/access-requests/:accessRequestId/approve",
    purpose: "Approve an access request and issue the requested role grant."
  },
  {
    access: "admin_only",
    audience: "internal",
    id: "admin.access-request.reject",
    method: "POST",
    path: "/internal/admin/access-requests/:accessRequestId/reject",
    purpose: "Reject an access request and record the decision note."
  },
  {
    access: "service_token",
    audience: "internal",
    id: "worker.jobs.heartbeat",
    method: "POST",
    path: "/internal/jobs/:jobId/heartbeat",
    purpose: "Accept worker heartbeat updates for a leased job attempt."
  },
  {
    access: "service_token",
    audience: "internal",
    id: "worker.jobs.event",
    method: "POST",
    path: "/internal/jobs/:jobId/events",
    purpose: "Append structured worker events during execution."
  },
  {
    access: "service_token",
    audience: "internal",
    id: "worker.jobs.result",
    method: "POST",
    path: "/internal/jobs/:jobId/result",
    purpose: "Submit the final job result and artifact references."
  }
] satisfies ApiEndpointCatalogEntry[];
