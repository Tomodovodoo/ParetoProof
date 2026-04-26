import type { WebLocationLike } from "@paretoproof/shared";
import { isLocalDevelopmentLocation } from "./local-development";
import { readWebRuntimeEnv, type WebRuntimeEnv } from "./runtime-env";

function trimTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

type ApiBaseUrlOptions = {
  locationLike?: WebLocationLike;
  runtimeEnv?: WebRuntimeEnv;
};

function buildOriginFromLocationLike(locationLike: WebLocationLike) {
  if (locationLike.origin) {
    return locationLike.origin;
  }

  const protocol = locationLike.protocol || "http:";
  const port = locationLike.port ? `:${locationLike.port}` : "";

  return `${protocol}//${locationLike.hostname}${port}`;
}

export function getApiBaseUrl(options: ApiBaseUrlOptions = {}) {
  const configuredBaseUrl = (options.runtimeEnv ?? readWebRuntimeEnv()).apiBaseUrl;

  if (configuredBaseUrl) {
    return trimTrailingSlash(configuredBaseUrl);
  }

  const locationLike = options.locationLike ?? window.location;

  if (
    !isLocalDevelopmentLocation(locationLike) &&
    locationLike.hostname.endsWith("paretoproof.com")
  ) {
    return "https://api.paretoproof.com";
  }

  const localApiUrl = new URL(buildOriginFromLocationLike(locationLike));
  localApiUrl.port = "3000";

  return trimTrailingSlash(localApiUrl.origin);
}
