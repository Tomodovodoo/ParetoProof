import type { PortalIdentityProvider } from "@paretoproof/shared";

export type BootstrapOwnerIdentityProvider = Extract<
  PortalIdentityProvider,
  "cloudflare_github" | "cloudflare_google"
>;

export function parseBootstrapOwnerIdentityProvider(
  value: string | undefined
): BootstrapOwnerIdentityProvider {
  if (value === "cloudflare_github" || value === "cloudflare_google") {
    return value;
  }

  throw new Error(
    "OWNER_IDENTITY_PROVIDER must be set to cloudflare_github or cloudflare_google when bootstrapping the owner admin user."
  );
}

export type CloudflareAccessUserCandidate = {
  email: string;
  id: string;
  uid: string;
};

export type CloudflareLastSeenIdentity = {
  idpType: string | null;
  userUuid: string | null;
};

export function mapCloudflareIdpTypeToPortalIdentityProvider(
  idpType: string | undefined | null
) {
  const normalizedIdpType = idpType?.trim().toLowerCase() ?? null;

  if (normalizedIdpType === "github") {
    return "cloudflare_github";
  }

  if (normalizedIdpType === "google") {
    return "cloudflare_google";
  }

  if (normalizedIdpType === "onetimepin") {
    return "cloudflare_one_time_pin";
  }

  return null;
}

export function selectBootstrapOwnerAccessUser(
  candidates: CloudflareAccessUserCandidate[],
  ownerEmail: string,
  ownerIdentityProvider: BootstrapOwnerIdentityProvider,
  lastSeenIdentityByUserId: ReadonlyMap<string, CloudflareLastSeenIdentity>
) {
  const normalizedOwnerEmail = ownerEmail.trim().toLowerCase();
  const matchingCandidates = candidates.filter(({ email, id }) => {
    if (email.trim().toLowerCase() !== normalizedOwnerEmail) {
      return false;
    }

    const lastSeenIdentity = lastSeenIdentityByUserId.get(id);

    return (
      Boolean(lastSeenIdentity?.userUuid) &&
      mapCloudflareIdpTypeToPortalIdentityProvider(lastSeenIdentity?.idpType) ===
        ownerIdentityProvider
    );
  });

  if (matchingCandidates.length === 0) {
    throw new Error(
      `No Cloudflare Access user last seen via ${ownerIdentityProvider} was found for ${normalizedOwnerEmail}. Sign into the protected portal with that provider before bootstrapping.`
    );
  }

  if (matchingCandidates.length > 1) {
    throw new Error(
      `Multiple Cloudflare Access users last seen via ${ownerIdentityProvider} matched ${normalizedOwnerEmail}. Resolve the ambiguity before bootstrapping.`
    );
  }

  const [selectedUser] = matchingCandidates;
  const selectedLastSeenIdentity = selectedUser
    ? lastSeenIdentityByUserId.get(selectedUser.id)
    : null;

  if (!selectedUser || !selectedLastSeenIdentity?.userUuid) {
    throw new Error("The selected Cloudflare Access user could not be resolved.");
  }

  return {
    email: normalizedOwnerEmail,
    uid: selectedLastSeenIdentity.userUuid
  };
}
