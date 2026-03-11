function trimTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

export function getApiBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL;

  if (configuredBaseUrl) {
    return trimTrailingSlash(configuredBaseUrl);
  }

  if (window.location.hostname.endsWith("paretoproof.com")) {
    return "https://api.paretoproof.com";
  }

  const localApiUrl = new URL(window.location.origin);
  localApiUrl.port = "3000";

  return trimTrailingSlash(localApiUrl.origin);
}
