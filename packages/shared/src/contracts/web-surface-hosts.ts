export type AccessProvider = "github" | "google";

export const productionPublicOrigin = "https://paretoproof.com";
export const productionAuthOrigin = "https://auth.paretoproof.com";
export const productionPortalOrigin = "https://portal.paretoproof.com";
export const productionMathOrigin = "https://math.paretoproof.com";

export const paretoProofBrandedHosts = [
  "paretoproof.com",
  "auth.paretoproof.com",
  "github.auth.paretoproof.com",
  "google.auth.paretoproof.com",
  "math.paretoproof.com",
  "portal.paretoproof.com"
] as const;

export const brandedFinalizeRelayHosts = [
  "auth.paretoproof.com",
  "github.auth.paretoproof.com",
  "google.auth.paretoproof.com"
] as const;

export const productionProviderAuthOrigins: Record<AccessProvider, string> = {
  github: "https://github.auth.paretoproof.com",
  google: "https://google.auth.paretoproof.com"
};
