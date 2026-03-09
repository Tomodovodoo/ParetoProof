export type ApiAudience = "public" | "portal" | "internal";

export type ApiAccessLevel =
  | "anonymous"
  | "authenticated_access_identity"
  | "pending_or_approved"
  | "approved_helper_or_higher"
  | "approved_collaborator_or_higher"
  | "admin_only"
  | "service_token";

export type ApiEndpointCatalogEntry = {
  access: ApiAccessLevel;
  audience: ApiAudience;
  id: string;
  method: "GET" | "PATCH" | "POST";
  path: string;
  purpose: string;
};
