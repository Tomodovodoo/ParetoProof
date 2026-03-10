import type { AppRouteMatrixEntry } from "../types/route-access.js";

export const appRouteAccessMatrix = [
  {
    access: "public",
    host: "paretoproof.com",
    id: "public.home",
    path: "/",
    redirectIfDenied: "public_home",
    surface: "public_site",
    summary: "Marketing home and public project overview."
  },
  {
    access: "public",
    host: "paretoproof.com",
    id: "public.benchmarks",
    path: "/benchmarks",
    redirectIfDenied: "public_home",
    surface: "public_site",
    summary: "Public benchmark listing and methodology context."
  },
  {
    access: "public",
    host: "paretoproof.com",
    id: "public.benchmark-report",
    path: "/reports/:benchmarkVersionId",
    redirectIfDenied: "public_home",
    surface: "public_site",
    summary: "Published benchmark report and aggregate public results."
  },
  {
    access: "portal_authenticated",
    host: "portal.paretoproof.com",
    id: "portal.home",
    path: "/",
    redirectIfDenied: "public_home",
    surface: "portal",
    summary: "Authenticated portal landing page after Cloudflare Access."
  },
  {
    access: "access_request_required_only",
    host: "portal.paretoproof.com",
    id: "portal.access-request",
    path: "/access-request",
    redirectIfDenied: "portal_denied",
    surface: "portal",
    summary: "Contributor request screen for authenticated identities that have never been reviewed."
  },
  {
    access: "approved_helper_or_higher",
    host: "portal.paretoproof.com",
    id: "portal.profile",
    path: "/profile",
    redirectIfDenied: "portal_pending",
    surface: "portal",
    summary: "Editable contributor profile details and linked Access identities."
  },
  {
    access: "pending_only",
    host: "portal.paretoproof.com",
    id: "portal.pending",
    path: "/pending",
    redirectIfDenied: "portal_home",
    surface: "portal",
    summary: "Pending approval holding page after the user is identified."
  },
  {
    access: "denied_only",
    host: "portal.paretoproof.com",
    id: "portal.denied",
    path: "/denied",
    redirectIfDenied: "portal_denied",
    surface: "portal",
    summary: "Access denied page for rejected or insufficiently provisioned users."
  },
  {
    access: "approved_helper_or_higher",
    host: "portal.paretoproof.com",
    id: "portal.runs",
    path: "/runs",
    redirectIfDenied: "portal_pending",
    surface: "portal",
    summary: "Read-only run listing for approved helpers and higher."
  },
  {
    access: "approved_helper_or_higher",
    host: "portal.paretoproof.com",
    id: "portal.run-detail",
    path: "/runs/:runId",
    redirectIfDenied: "portal_pending",
    surface: "portal",
    summary: "Run detail page with status, events, and artifacts."
  },
  {
    access: "approved_collaborator_or_higher",
    host: "portal.paretoproof.com",
    id: "portal.launch-run",
    path: "/launch",
    redirectIfDenied: "portal_denied",
    surface: "portal",
    summary: "Run launch flow for collaborators and admins."
  },
  {
    access: "approved_collaborator_or_higher",
    host: "portal.paretoproof.com",
    id: "portal.workers",
    path: "/workers",
    redirectIfDenied: "portal_denied",
    surface: "portal",
    summary: "Worker fleet and queue overview for collaborators and admins."
  },
  {
    access: "admin_only",
    host: "portal.paretoproof.com",
    id: "portal.admin.access-requests",
    path: "/admin/access-requests",
    redirectIfDenied: "portal_denied",
    surface: "portal",
    summary: "Manual contributor approval screen for portal admins."
  },
  {
    access: "admin_only",
    host: "portal.paretoproof.com",
    id: "portal.admin.users",
    path: "/admin/users",
    redirectIfDenied: "portal_denied",
    surface: "portal",
    summary: "Role management and contributor state inspection for admins."
  }
] satisfies AppRouteMatrixEntry[];
