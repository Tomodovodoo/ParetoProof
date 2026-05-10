import type { AppRouteMatrixEntry, AppSurface } from "../types/route-access.js";

function defineAppRouteEntry<TSurface extends AppSurface>(
  entry: AppRouteMatrixEntry<TSurface>
) {
  return entry;
}

export const appRouteAccessMatrix = [
  defineAppRouteEntry({
    access: "public",
    host: "paretoproof.com",
    id: "public.home",
    path: "/",
    redirectIfDenied: "public_home",
    surface: "public_site",
    summary: "Marketing home and public project overview."
  }),
  defineAppRouteEntry({
    access: "public",
    host: "paretoproof.com",
    id: "public.project",
    path: "/project",
    redirectIfDenied: "public_home",
    surface: "public_site",
    summary: "Compact project pack for mission, contributor path, and contact rules."
  }),
  defineAppRouteEntry({
    access: "public",
    host: "paretoproof.com",
    id: "public.benchmarks",
    path: "/benchmarks",
    redirectIfDenied: "public_home",
    surface: "public_site",
    summary: "Public benchmark listing and methodology context."
  }),
  defineAppRouteEntry({
    access: "public",
    host: "paretoproof.com",
    id: "public.benchmark-report",
    path: "/reports/:benchmarkVersionId",
    redirectIfDenied: "public_home",
    surface: "public_site",
    summary: "Published benchmark report and aggregate public results."
  }),
  defineAppRouteEntry({
    access: "portal_authenticated",
    host: "portal.paretoproof.com",
    id: "portal.home",
    path: "/",
    redirectIfDenied: "public_home",
    surface: "portal",
    summary: "Authenticated portal landing page after Cloudflare Access."
  }),
  defineAppRouteEntry({
    access: "access_request_required_only",
    host: "portal.paretoproof.com",
    id: "portal.access-request",
    path: "/access-request",
    redirectIfDenied: "portal_denied",
    surface: "portal",
    summary: "Contributor request screen for authenticated identities that have never been reviewed."
  }),
  defineAppRouteEntry({
    access: "approved_helper_or_higher",
    host: "portal.paretoproof.com",
    id: "portal.profile",
    path: "/profile",
    redirectIfDenied: "portal_pending",
    surface: "portal",
    summary: "Editable contributor profile details and linked Access identities."
  }),
  defineAppRouteEntry({
    access: "pending_only",
    host: "portal.paretoproof.com",
    id: "portal.pending",
    path: "/pending",
    redirectIfDenied: "portal_home",
    surface: "portal",
    summary: "Pending approval holding page after the user is identified."
  }),
  defineAppRouteEntry({
    access: "denied_only",
    host: "portal.paretoproof.com",
    id: "portal.denied",
    path: "/denied",
    redirectIfDenied: "portal_denied",
    surface: "portal",
    summary: "Access denied page for rejected or insufficiently provisioned users."
  }),
  defineAppRouteEntry({
    access: "approved_helper_or_higher",
    host: "portal.paretoproof.com",
    id: "portal.runs",
    path: "/runs",
    redirectIfDenied: "portal_pending",
    surface: "portal",
    summary: "Read-only run listing for approved helpers and higher."
  }),
  defineAppRouteEntry({
    access: "approved_helper_or_higher",
    host: "portal.paretoproof.com",
    id: "portal.run-detail",
    path: "/runs/:runId",
    redirectIfDenied: "portal_pending",
    surface: "portal",
    summary: "Run detail page with status, events, and artifacts."
  }),
  defineAppRouteEntry({
    access: "approved_collaborator_or_higher",
    host: "portal.paretoproof.com",
    id: "portal.launch-run",
    path: "/launch",
    redirectIfDenied: "portal_denied",
    surface: "portal",
    summary: "Run launch flow for collaborators and admins."
  }),
  defineAppRouteEntry({
    access: "approved_collaborator_or_higher",
    host: "portal.paretoproof.com",
    id: "portal.workers",
    path: "/workers",
    redirectIfDenied: "portal_denied",
    surface: "portal",
    summary: "Worker fleet and queue overview for collaborators and admins."
  }),
  defineAppRouteEntry({
    access: "admin_only",
    host: "portal.paretoproof.com",
    id: "portal.admin.access-requests",
    path: "/admin/access-requests",
    redirectIfDenied: "portal_denied",
    surface: "portal",
    summary: "Manual contributor approval screen for portal admins."
  }),
  defineAppRouteEntry({
    access: "admin_only",
    host: "portal.paretoproof.com",
    id: "portal.admin.users",
    path: "/admin/users",
    redirectIfDenied: "portal_denied",
    surface: "portal",
    summary: "Role management and contributor state inspection for admins."
  }),
  defineAppRouteEntry({
    access: "approved_helper_or_higher",
    host: "math.paretoproof.com",
    id: "math.home",
    path: "/",
    redirectIfDenied: "portal_pending",
    surface: "math",
    summary: "Math workflow home for approved contributors."
  }),
  defineAppRouteEntry({
    access: "approved_helper_or_higher",
    host: "math.paretoproof.com",
    id: "math.questions",
    path: "/questions",
    redirectIfDenied: "portal_pending",
    surface: "math",
    summary: "Question workflow index for math review and launch preparation."
  }),
  defineAppRouteEntry({
    access: "approved_helper_or_higher",
    host: "math.paretoproof.com",
    id: "math.question-detail",
    path: "/questions/:questionId",
    redirectIfDenied: "portal_pending",
    surface: "math",
    summary: "Question-specific workflow shell on the dedicated math surface."
  }),
  defineAppRouteEntry({
    access: "approved_helper_or_higher",
    host: "math.paretoproof.com",
    id: "math.submissions",
    path: "/submissions",
    redirectIfDenied: "portal_pending",
    surface: "math",
    summary: "Structured submission workflow placeholder for the math surface."
  }),
  defineAppRouteEntry({
    access: "approved_helper_or_higher",
    host: "math.paretoproof.com",
    id: "math.reviews",
    path: "/reviews",
    redirectIfDenied: "portal_pending",
    surface: "math",
    summary: "Review workflow placeholder for the dedicated math surface."
  }),
  defineAppRouteEntry({
    access: "approved_helper_or_higher",
    host: "math.paretoproof.com",
    id: "math.review-detail",
    path: "/reviews/:reviewId",
    redirectIfDenied: "portal_pending",
    surface: "math",
    summary: "Detailed math review round workspace with assignments, checklist, comments, and source anchors."
  }),
  defineAppRouteEntry({
    access: "approved_helper_or_higher",
    host: "math.paretoproof.com",
    id: "math.launch",
    path: "/launch",
    redirectIfDenied: "portal_pending",
    surface: "math",
    summary: "Question-centric launch entry on the dedicated math surface."
  })
] as const;

export function matchesAppRoutePath(routePath: string, pathname: string) {
  if (routePath === pathname) {
    return true;
  }

  const routeSegments = routePath.split("/").filter(Boolean);
  const pathSegments = pathname.split("/").filter(Boolean);

  if (routeSegments.length !== pathSegments.length) {
    return false;
  }

  return routeSegments.every((segment, index) => {
    if (segment.startsWith(":")) {
      return pathSegments[index].length > 0;
    }

    return segment === pathSegments[index];
  });
}

export function findAppRouteBySurface<TSurface extends AppSurface>(
  surface: TSurface,
  pathname: string
) {
  const matchingEntry = appRouteAccessMatrix.find(
    (entry) => entry.surface === surface && matchesAppRoutePath(entry.path, pathname)
  );

  return (matchingEntry as AppRouteMatrixEntry<TSurface> | undefined) ?? null;
}
