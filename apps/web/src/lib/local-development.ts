export const paretoProofBrandedHosts = [
  "paretoproof.com",
  "auth.paretoproof.com",
  "github.auth.paretoproof.com",
  "google.auth.paretoproof.com",
  "portal.paretoproof.com"
] as const;

type LocationLike = {
  hostname: string;
  port?: string;
  protocol?: string;
};

export function isLocalDevelopmentLocation({
  hostname,
  port = "",
  protocol = ""
}: LocationLike) {
  const normalizedHostname = hostname.toLowerCase();

  if (
    normalizedHostname === "localhost" ||
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname === "::1" ||
    normalizedHostname.endsWith(".localhost")
  ) {
    return true;
  }

  return (
    protocol === "http:" &&
    port !== "" &&
    paretoProofBrandedHosts.includes(
      normalizedHostname as (typeof paretoProofBrandedHosts)[number]
    )
  );
}
