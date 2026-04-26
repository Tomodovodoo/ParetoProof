import type { PortalRole } from "./portal-navigation.js";

export type PortalIdentityProvider =
  | "cloudflare_google"
  | "cloudflare_github"
  | "cloudflare_one_time_pin";

export type PortalLinkableIdentityProvider =
  | "cloudflare_google"
  | "cloudflare_github";

export type PortalAccessStatus = "approved" | "pending" | "denied";

export type PortalAccessDeniedReason =
  | "access_request_required"
  | "identity_recovery_required"
  | "rejected_or_withdrawn"
  | "unknown_identity";

export type PortalMeAccess =
  | {
      email: string;
      role: PortalRole;
      status: "approved";
    }
  | {
      email: string | null;
      status: "pending";
    }
  | {
      email: string | null;
      reason: PortalAccessDeniedReason;
      status: "denied";
    };

export type PortalProfileIdentity = {
  createdAt: string;
  current: boolean;
  id: string;
  lastSeenAt: string;
  provider: PortalIdentityProvider;
  providerEmail: string | null;
};

export type PortalProfile = {
  createdAt: string | null;
  displayName: string | null;
  email: string | null;
  identities: PortalProfileIdentity[];
  linkedUserId: string | null;
  updatedAt: string | null;
};

export type PortalProfileUpdateInput = {
  displayName: string | null;
};

export type PortalProfileLinkIntentInput = {
  provider: PortalLinkableIdentityProvider;
  redirectPath?: string | null;
};

export type PortalSessionRedirectInput = {
  redirect?: string | null;
};

export type PortalMeResponse = {
  access: PortalMeAccess;
  identity: {
    provider: PortalIdentityProvider | null;
  } | null;
};

export type PortalProfileLinkIntent = {
  expiresAt: string;
  provider: PortalLinkableIdentityProvider;
  startUrl: string;
};

export type PortalSessionFinalizeResponse = {
  redirectTo: string;
};
