import { z } from "zod";

export const apiCallBoundaryModeSchema = z.enum([
  "browser_direct",
  "portal_server_mediated",
  "internal_service_only"
]);

export const apiCallCredentialSchema = z.enum([
  "none",
  "cloudflare_access_jwt",
  "cloudflare_service_token"
]);

export const apiCallOriginSchema = z.enum([
  "public_browser",
  "portal_browser",
  "portal_server",
  "worker_service",
  "admin_service"
]);

export const apiCallBoundaryEntrySchema = z.object({
  endpointId: z.string(),
  credential: apiCallCredentialSchema,
  mode: apiCallBoundaryModeSchema,
  origin: apiCallOriginSchema,
  rationale: z.string()
});
