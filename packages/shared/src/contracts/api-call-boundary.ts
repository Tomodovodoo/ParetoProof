import type { ApiCallBoundaryEntry } from "../types/api-call-boundary";

// The current live contract only includes routes that the Fastify API actually registers.
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
  }
] satisfies ApiCallBoundaryEntry[];
