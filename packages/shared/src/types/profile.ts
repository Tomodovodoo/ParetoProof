export type PortalIdentityProvider =
  | "cloudflare_google"
  | "cloudflare_github"
  | "cloudflare_one_time_pin";

export type PortalLinkableIdentityProvider =
  | "cloudflare_google"
  | "cloudflare_github";

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

export type PortalProfileLinkIntent = {
  expiresAt: string;
  provider: PortalLinkableIdentityProvider;
  startUrl: string;
};
