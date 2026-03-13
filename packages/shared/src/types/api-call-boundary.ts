export type ApiCallBoundaryMode =
  | "browser_direct"
  | "browser_navigation"
  | "portal_server_mediated"
  | "internal_service_only";

export type ApiCallCredential =
  | "none"
  | "cloudflare_access_jwt"
  | "cloudflare_service_token"
  | "worker_bootstrap_token"
  | "worker_job_token";

export type ApiCallOrigin =
  | "public_browser"
  | "portal_browser"
  | "portal_server"
  | "worker_service"
  | "admin_service";

export type ApiCallBoundaryEntry = {
  endpointId: string;
  credential: ApiCallCredential;
  mode: ApiCallBoundaryMode;
  origin: ApiCallOrigin;
  rationale: string;
};
