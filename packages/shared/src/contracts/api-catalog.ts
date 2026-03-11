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
      "Finish the Cloudflare Access login handoff on the API audience and return the browser to the static portal host."
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
    id: "admin.access-request.list",
    method: "GET",
    path: "/portal/admin/access-requests",
    purpose: "List recent contributor access requests for manual admin review."
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
  }
] satisfies ApiEndpointCatalogEntry[];
