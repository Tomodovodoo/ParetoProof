import { isIP } from "node:net";
import type { Problem9ProviderFamily } from "@paretoproof/shared";

type WorkerFetch = typeof fetch;

const hostedProxyEnvNames = [
  "ALL_PROXY",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "all_proxy",
  "http_proxy",
  "https_proxy",
  "no_proxy"
] as const;

const hostedProviderOverrideEnvNames: Record<Problem9ProviderFamily, readonly string[]> = {
  openai: ["OPENAI_API_BASE", "OPENAI_API_BASE_URL", "OPENAI_BASE_URL"]
};
const allHostedProviderOverrideEnvNames = [
  ...new Set(Object.values(hostedProviderOverrideEnvNames).flat())
];

const hostedLeanToolForbiddenEnvNames = [
  "API_BASE_URL",
  "CODEX_API_KEY",
  "CODEX_HOME",
  "PARETOPROOF_TRUSTED_LOCAL_AUTH_MOUNT",
  "WORKER_BOOTSTRAP_TOKEN"
] as const;

type HostedControlPlaneOriginOptions = {
  allowLoopback: boolean;
};

export function resolveHostedControlPlaneOrigin(
  apiBaseUrl: string,
  options: HostedControlPlaneOriginOptions
): URL {
  const url = new URL(apiBaseUrl);

  if (url.username || url.password) {
    throw new Error(
      "Hosted network policy blocked API_BASE_URL: credentials in control-plane origins are forbidden."
    );
  }

  if (url.search || url.hash || url.pathname !== "/") {
    throw new Error(
      "Hosted network policy blocked API_BASE_URL: only bare control-plane origins are allowed."
    );
  }

  if (isIpLiteral(url.hostname)) {
    if (isLoopbackIp(url.hostname) && options.allowLoopback && url.protocol === "http:") {
      return url;
    }

    throw new Error(
      `Hosted network policy blocked API_BASE_URL: raw_ip_forbidden (${url.hostname}).`
    );
  }

  if (isLoopbackHostname(url.hostname)) {
    if (options.allowLoopback && url.protocol === "http:") {
      return url;
    }

    throw new Error(
      `Hosted network policy blocked API_BASE_URL: host_not_allowlisted (${url.hostname}).`
    );
  }

  if (url.protocol !== "https:") {
    throw new Error(
      `Hosted network policy blocked API_BASE_URL: HTTPS is required for hosted control-plane origins (${url.protocol}).`
    );
  }

  return url;
}

export function createHostedControlPlaneFetch(
  fetchImpl: WorkerFetch,
  allowedOrigin: URL
): WorkerFetch {
  return async (input, init) => {
    const url = resolveRequestUrl(input);

    if (url.origin !== allowedOrigin.origin) {
      throw new Error(
        `Hosted network policy blocked control-plane request: host_not_allowlisted (${url.origin}).`
      );
    }

    if (!url.pathname.startsWith("/internal/worker/")) {
      throw new Error(
        `Hosted network policy blocked control-plane request: path_outside_policy (${url.pathname}).`
      );
    }

    return fetchImpl(input, init);
  };
}

export function buildHostedProviderCommandEnv(
  env: NodeJS.ProcessEnv,
  providerFamily: Problem9ProviderFamily
): NodeJS.ProcessEnv {
  const forbiddenOverrideNames = [...hostedProxyEnvNames, ...hostedProviderOverrideEnvNames[providerFamily]];
  assertHostedEnvOverridesForbidden(env, forbiddenOverrideNames, "provider execution");

  const sanitizedEnv = { ...env };

  for (const name of forbiddenOverrideNames) {
    delete sanitizedEnv[name];
  }

  return sanitizedEnv;
}

export function buildHostedLeanToolCommandEnv(
  env: NodeJS.ProcessEnv,
  providerFamily: Problem9ProviderFamily
): NodeJS.ProcessEnv {
  const sanitizedEnv = buildHostedProviderCommandEnv(env, providerFamily);

  for (const name of hostedLeanToolForbiddenEnvNames) {
    delete sanitizedEnv[name];
  }

  return sanitizedEnv;
}

export function assertHostedClaimLoopStartupEnv(env: NodeJS.ProcessEnv): void {
  assertHostedEnvOverridesForbidden(
    env,
    [...hostedProxyEnvNames, ...allHostedProviderOverrideEnvNames],
    "worker startup"
  );
}

function resolveRequestUrl(input: URL | RequestInfo): URL {
  if (input instanceof URL) {
    return input;
  }

  if (typeof input === "string") {
    return new URL(input);
  }

  if (input instanceof Request) {
    return new URL(input.url);
  }

  return new URL(String(input));
}

function hasNonEmptyEnvValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function assertHostedEnvOverridesForbidden(
  env: NodeJS.ProcessEnv,
  forbiddenOverrideNames: readonly string[],
  context: string
): void {
  const offendingNames = forbiddenOverrideNames.filter((name) => hasNonEmptyEnvValue(env[name]));

  if (offendingNames.length === 0) {
    return;
  }

  throw new Error(
    `Hosted network policy blocked ${context}: forbidden env override(s) ${offendingNames.join(", ")}.`
  );
}

function isIpLiteral(hostname: string): boolean {
  return isIP(hostname) !== 0;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost");
}

function isLoopbackIp(hostname: string): boolean {
  if (isIP(hostname) === 4) {
    return hostname.startsWith("127.");
  }

  if (isIP(hostname) === 6) {
    const normalized = hostname.toLowerCase();
    return normalized === "::1" || normalized === "0:0:0:0:0:0:0:1";
  }

  return false;
}
