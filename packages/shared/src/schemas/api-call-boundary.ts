import { z } from "zod";
import { apiEndpointIds } from "../contracts/api-catalog.js";

export const apiCallBoundaryModeSchema = z.enum([
  "browser_direct",
  "browser_navigation",
  "portal_server_mediated",
  "internal_service_only"
]);

export const apiCallCredentialSchema = z.enum([
  "none",
  "cloudflare_access_jwt",
  "cloudflare_service_token",
  "worker_bootstrap_token",
  "worker_job_token"
]);

export const apiCallOriginSchema = z.enum([
  "public_browser",
  "portal_browser",
  "portal_server",
  "worker_service",
  "admin_service"
]);

export const apiEndpointIdSchema = z.enum(apiEndpointIds);

export const apiCallBoundaryEntrySchema = z.object({
  endpointId: apiEndpointIdSchema,
  credential: apiCallCredentialSchema,
  mode: apiCallBoundaryModeSchema,
  origin: apiCallOriginSchema,
  rationale: z.string()
});
