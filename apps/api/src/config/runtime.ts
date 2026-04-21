import { isIP } from "node:net";
import {
  hostedWorkerPoolEnvironmentSchema,
  type HostedWorkerPoolEnvironment,
} from "@paretoproof/shared";
import { getPublicSuffix } from "tldts";
import { z } from "zod";

function normalizeOptionalEnvValue(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

const trimmedOptionalStringSchema = z.preprocess(
  normalizeOptionalEnvValue,
  z.string().trim().optional(),
);

const requiredTrimmedStringSchema = z
  .string()
  .trim()
  .min(1, "must not be empty");

const portSchema = z.preprocess(
  normalizeOptionalEnvValue,
  z.coerce
    .number()
    .int("must be an integer")
    .min(0, "must be at least 0")
    .max(65535, "must be at most 65535")
    .optional(),
);

const optionalBooleanStringSchema = z.preprocess(
  normalizeOptionalEnvValue,
  z.enum(["true", "false"]).optional(),
);

function normalizeConfiguredOrigin(value: string, context: z.RefinementCtx) {
  let parsedOrigin: URL;

  try {
    parsedOrigin = new URL(value);
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "must be a valid http or https origin",
    });
    return z.NEVER;
  }

  if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "must use http or https",
    });
    return z.NEVER;
  }

  if (
    parsedOrigin.username.length > 0 ||
    parsedOrigin.password.length > 0 ||
    parsedOrigin.pathname !== "/" ||
    parsedOrigin.search.length > 0 ||
    parsedOrigin.hash.length > 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "must be an origin without path, search, or hash",
    });
    return z.NEVER;
  }

  return parsedOrigin.origin;
}

const trimmedOptionalOriginSchema = z.preprocess(
  normalizeOptionalEnvValue,
  z
    .string()
    .trim()
    .transform((value, context) => normalizeConfiguredOrigin(value, context))
    .optional(),
);

const trimmedOptionalOriginListSchema = z.preprocess(
  normalizeOptionalEnvValue,
  z
    .string()
    .trim()
    .transform((value, context) => {
      const normalizedOrigins: string[] = [];

      for (const rawOrigin of value.split(",")) {
        const trimmedOrigin = rawOrigin.trim();

        if (!trimmedOrigin) {
          continue;
        }

        const normalizedOrigin = normalizeConfiguredOrigin(
          trimmedOrigin,
          context,
        );

        if (normalizedOrigin === z.NEVER) {
          return z.NEVER;
        }

        normalizedOrigins.push(normalizedOrigin);
      }

      return [...new Set(normalizedOrigins)];
    })
    .optional(),
);

function normalizeConfiguredCookieDomain(
  value: string,
  context: z.RefinementCtx,
) {
  const normalizedDomain = value.trim().replace(/^\.+/, "").toLowerCase();

  if (
    normalizedDomain.length === 0 ||
    normalizedDomain.includes("/") ||
    normalizedDomain.includes(":") ||
    normalizedDomain.includes(" ")
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "must be a bare cookie domain without scheme, port, or path",
    });
    return z.NEVER;
  }

  if (!normalizedDomain.includes(".") || isIP(normalizedDomain) !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "must be a hostname suffix, not localhost or an IP address",
    });
    return z.NEVER;
  }

  if (
    getPublicSuffix(normalizedDomain, { allowPrivateDomains: true }) ===
    normalizedDomain
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "must not be a public suffix cookie domain",
    });
    return z.NEVER;
  }

  return `.${normalizedDomain}`;
}

const trimmedOptionalCookieDomainSchema = z.preprocess(
  normalizeOptionalEnvValue,
  z
    .string()
    .trim()
    .transform((value, context) =>
      normalizeConfiguredCookieDomain(value, context),
    )
    .optional(),
);

export const defaultApiPortalPublicOrigin = "https://portal.paretoproof.com";
export const defaultApiAuthPublicOrigin = "https://auth.paretoproof.com";
export const defaultApiMathPublicOrigin = "https://math.paretoproof.com";

function buildBrandedAuthOrigin(
  authPublicOrigin: string,
  providerPrefix: "github" | "google",
) {
  const authUrl = new URL(authPublicOrigin);
  authUrl.hostname = `${providerPrefix}.${authUrl.hostname}`;
  return authUrl.origin;
}

export function deriveDefaultBrandedAuthOrigins(authPublicOrigin: string) {
  return [
    authPublicOrigin,
    buildBrandedAuthOrigin(authPublicOrigin, "github"),
    buildBrandedAuthOrigin(authPublicOrigin, "google"),
  ];
}

function deriveAccessCookieDomain(origins: string[]) {
  const hostnames = [
    ...new Set(origins.map((origin) => new URL(origin).hostname.toLowerCase())),
  ];

  if (
    hostnames.length === 0 ||
    hostnames.some(
      (hostname) => hostname === "localhost" || isIP(hostname) !== 0,
    )
  ) {
    return undefined;
  }

  const splitHostnames = hostnames.map((hostname) => hostname.split("."));
  const shortestLength = Math.min(
    ...splitHostnames.map((labels) => labels.length),
  );
  const sharedLabels: string[] = [];

  for (let offset = 1; offset <= shortestLength; offset += 1) {
    const label = splitHostnames[0]?.at(-offset);

    if (
      !label ||
      splitHostnames.some((labels) => labels.at(-offset) !== label)
    ) {
      break;
    }

    sharedLabels.unshift(label);
  }

  if (sharedLabels.length < 2) {
    return undefined;
  }

  const candidateDomain = sharedLabels.join(".");

  if (
    getPublicSuffix(candidateDomain, { allowPrivateDomains: true }) ===
    candidateDomain
  ) {
    return undefined;
  }

  return `.${candidateDomain}`;
}

function deriveAccessCookieSecure(origins: string[]) {
  return origins.every((origin) => new URL(origin).protocol === "https:");
}

export type ApiOriginRuntimeConfig = {
  accessCookieDomain?: string;
  accessCookieSecure: boolean;
  authPublicOrigin: string;
  brandedAuthOrigins: string[];
  corsAllowLocalhost: boolean;
  mathPublicOrigin: string;
  portalPublicOrigin: string;
};

export function resolveApiOriginRuntimeConfig(
  config?: Partial<ApiOriginRuntimeConfig>,
): ApiOriginRuntimeConfig {
  const usesExplicitMathPublicOrigin = config?.mathPublicOrigin !== undefined;
  const authPublicOrigin =
    config?.authPublicOrigin ?? defaultApiAuthPublicOrigin;
  const mathPublicOrigin =
    config?.mathPublicOrigin ?? defaultApiMathPublicOrigin;
  const portalPublicOrigin =
    config?.portalPublicOrigin ?? defaultApiPortalPublicOrigin;
  const brandedAuthOrigins = [
    ...new Set(
      [
        authPublicOrigin,
        ...(config?.brandedAuthOrigins ??
          deriveDefaultBrandedAuthOrigins(authPublicOrigin)),
      ]
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  ];
  const cookieOrigins = [
    portalPublicOrigin,
    ...brandedAuthOrigins,
    ...(usesExplicitMathPublicOrigin ? [mathPublicOrigin] : []),
  ];

  return {
    accessCookieDomain:
      config?.accessCookieDomain ?? deriveAccessCookieDomain(cookieOrigins),
    accessCookieSecure:
      config?.accessCookieSecure ?? deriveAccessCookieSecure(cookieOrigins),
    authPublicOrigin,
    brandedAuthOrigins,
    corsAllowLocalhost: config?.corsAllowLocalhost ?? false,
    mathPublicOrigin,
    portalPublicOrigin,
  };
}

const rawApiRuntimeEnvSchema = z
  .object({
    ACCESS_PROVIDER_STATE_SECRET: requiredTrimmedStringSchema,
    ACCESS_COOKIE_DOMAIN: trimmedOptionalCookieDomainSchema,
    ACCESS_COOKIE_SECURE: optionalBooleanStringSchema,
    AUTH_PUBLIC_ORIGIN: trimmedOptionalOriginSchema,
    BRANDED_AUTH_ORIGINS: trimmedOptionalOriginListSchema,
    CF_ACCESS_AUD: trimmedOptionalStringSchema,
    CF_ACCESS_BRANDED_AUDS: requiredTrimmedStringSchema,
    CF_ACCESS_INTERNAL_AUD: trimmedOptionalStringSchema,
    CF_ACCESS_PORTAL_AUD: trimmedOptionalStringSchema,
    CF_ACCESS_TEAM_DOMAIN: requiredTrimmedStringSchema,
    CORS_ALLOWED_ORIGINS: trimmedOptionalStringSchema,
    CORS_ALLOW_LOCALHOST: optionalBooleanStringSchema,
    DATABASE_URL: requiredTrimmedStringSchema,
    HOST: trimmedOptionalStringSchema,
    HOSTED_WORKER_POOL_ENVIRONMENT: z.preprocess(
      normalizeOptionalEnvValue,
      hostedWorkerPoolEnvironmentSchema.optional(),
    ),
    MATH_PUBLIC_ORIGIN: trimmedOptionalOriginSchema,
    NODE_ENV: trimmedOptionalStringSchema,
    PORT: portSchema,
    PORTAL_PUBLIC_ORIGIN: trimmedOptionalOriginSchema,
    PORTAL_SESSION_SECRET: trimmedOptionalStringSchema,
    WORKER_BOOTSTRAP_TOKEN: requiredTrimmedStringSchema,
  })
  .superRefine((env, context) => {
    if (!(env.CF_ACCESS_PORTAL_AUD ?? env.CF_ACCESS_AUD)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "CF_ACCESS_PORTAL_AUD or CF_ACCESS_AUD is required",
        path: ["CF_ACCESS_PORTAL_AUD"],
      });
    }
  });

export type ApiRuntimeEnv = {
  accessProviderStateSecret: string;
  accessCookieDomain?: string;
  accessCookieSecure: boolean;
  authPublicOrigin: string;
  brandedAccessAudiences: string[];
  brandedAuthOrigins: string[];
  corsAllowedOrigins: string[];
  corsAllowLocalhost: boolean;
  databaseUrl: string;
  host: string;
  hostedWorkerPoolEnvironment?: HostedWorkerPoolEnvironment;
  internalAccessAudience: string;
  mathPublicOrigin: string;
  nodeEnv?: string;
  port: number;
  portalAccessAudience: string;
  portalPublicOrigin: string;
  portalSessionSecret: string;
  teamDomain: string;
  workerBootstrapToken: string;
};

function formatApiRuntimeEnvIssues(issues: z.ZodIssue[]) {
  return issues
    .map((issue) => {
      const field = issue.path[0];
      const message =
        issue.message === "Required" ? "is required" : issue.message;

      if (typeof field !== "string") {
        return message;
      }

      return `${field}: ${message}`;
    })
    .join("; ");
}

function normalizeCorsAllowedOrigins(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function normalizeAccessAudienceList(value: string | undefined) {
  if (!value) {
    return [];
  }

  return [
    ...new Set(
      value
        .split(",")
        .map((audience) => audience.trim())
        .filter((audience) => audience.length > 0),
    ),
  ];
}

export function parseApiRuntimeEnv(
  rawEnv: Partial<Record<string, string | undefined>> = process.env,
): ApiRuntimeEnv {
  const parsed = rawApiRuntimeEnvSchema.safeParse(rawEnv);

  if (!parsed.success) {
    throw new Error(
      `Invalid API runtime environment: ${formatApiRuntimeEnvIssues(parsed.error.issues)}`,
    );
  }

  const {
    ACCESS_PROVIDER_STATE_SECRET,
    ACCESS_COOKIE_DOMAIN,
    ACCESS_COOKIE_SECURE,
    AUTH_PUBLIC_ORIGIN,
    BRANDED_AUTH_ORIGINS,
    CF_ACCESS_AUD,
    CF_ACCESS_BRANDED_AUDS,
    CF_ACCESS_INTERNAL_AUD,
    CF_ACCESS_PORTAL_AUD,
    CF_ACCESS_TEAM_DOMAIN,
    CORS_ALLOWED_ORIGINS,
    CORS_ALLOW_LOCALHOST,
    DATABASE_URL,
    HOST,
    HOSTED_WORKER_POOL_ENVIRONMENT,
    MATH_PUBLIC_ORIGIN,
    NODE_ENV,
    PORT,
    PORTAL_PUBLIC_ORIGIN,
    PORTAL_SESSION_SECRET,
    WORKER_BOOTSTRAP_TOKEN,
  } = parsed.data;

  const portalAccessAudience = CF_ACCESS_PORTAL_AUD ?? CF_ACCESS_AUD!;
  const originRuntimeConfig = resolveApiOriginRuntimeConfig({
    accessCookieDomain: ACCESS_COOKIE_DOMAIN,
    accessCookieSecure:
      ACCESS_COOKIE_SECURE === undefined
        ? undefined
        : ACCESS_COOKIE_SECURE === "true",
    authPublicOrigin: AUTH_PUBLIC_ORIGIN,
    brandedAuthOrigins: BRANDED_AUTH_ORIGINS,
    corsAllowLocalhost: CORS_ALLOW_LOCALHOST === "true",
    mathPublicOrigin: MATH_PUBLIC_ORIGIN,
    portalPublicOrigin: PORTAL_PUBLIC_ORIGIN,
  });

  return {
    accessProviderStateSecret: ACCESS_PROVIDER_STATE_SECRET,
    accessCookieDomain: originRuntimeConfig.accessCookieDomain,
    accessCookieSecure: originRuntimeConfig.accessCookieSecure,
    authPublicOrigin: originRuntimeConfig.authPublicOrigin,
    brandedAccessAudiences: normalizeAccessAudienceList(CF_ACCESS_BRANDED_AUDS),
    brandedAuthOrigins: originRuntimeConfig.brandedAuthOrigins,
    corsAllowedOrigins: normalizeCorsAllowedOrigins(CORS_ALLOWED_ORIGINS),
    corsAllowLocalhost: originRuntimeConfig.corsAllowLocalhost,
    databaseUrl: DATABASE_URL,
    host: HOST ?? "0.0.0.0",
    ...(HOSTED_WORKER_POOL_ENVIRONMENT
      ? {
          hostedWorkerPoolEnvironment: HOSTED_WORKER_POOL_ENVIRONMENT,
        }
      : {}),
    internalAccessAudience: CF_ACCESS_INTERNAL_AUD ?? portalAccessAudience,
    mathPublicOrigin: originRuntimeConfig.mathPublicOrigin,
    nodeEnv: NODE_ENV,
    port: PORT === undefined ? 3000 : Number(PORT),
    portalAccessAudience,
    portalPublicOrigin: originRuntimeConfig.portalPublicOrigin,
    portalSessionSecret: PORTAL_SESSION_SECRET ?? ACCESS_PROVIDER_STATE_SECRET,
    teamDomain: CF_ACCESS_TEAM_DOMAIN,
    workerBootstrapToken: WORKER_BOOTSTRAP_TOKEN,
  };
}

export function assertApiRuntimeEnv() {
  parseApiRuntimeEnv();
}
