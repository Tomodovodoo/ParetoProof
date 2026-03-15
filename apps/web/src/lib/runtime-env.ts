function normalizeOptionalEnvValue(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function trimTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

export type WebRuntimeEnv = {
  apiBaseUrl?: string;
};

export function parseWebRuntimeEnv(
  rawEnv: {
    VITE_API_BASE_URL?: unknown;
  } = import.meta.env as {
    VITE_API_BASE_URL?: unknown;
  }
): WebRuntimeEnv {
  const configuredBaseUrl = normalizeOptionalEnvValue(rawEnv.VITE_API_BASE_URL);

  if (!configuredBaseUrl) {
    return {};
  }

  let parsedBaseUrl: URL;

  try {
    parsedBaseUrl = new URL(configuredBaseUrl);
  } catch {
    throw new Error("Invalid web runtime environment: VITE_API_BASE_URL: must be a valid URL");
  }

  if (parsedBaseUrl.protocol !== "http:" && parsedBaseUrl.protocol !== "https:") {
    throw new Error(
      "Invalid web runtime environment: VITE_API_BASE_URL: must use http or https"
    );
  }

  return {
    apiBaseUrl: trimTrailingSlash(parsedBaseUrl.toString())
  };
}

export function readWebRuntimeEnv() {
  return parseWebRuntimeEnv(import.meta.env as { VITE_API_BASE_URL?: unknown });
}
