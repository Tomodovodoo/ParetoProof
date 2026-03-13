import { z } from "zod";

function normalizeOptionalEnvValue(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

const trimmedOptionalStringSchema = z
  .preprocess(normalizeOptionalEnvValue, z.string().trim().optional());

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
    .optional()
);

const optionalBooleanStringSchema = z.preprocess(
  normalizeOptionalEnvValue,
  z.enum(["true", "false"]).optional()
);

const rawApiRuntimeEnvSchema = z
  .object({
    ACCESS_PROVIDER_STATE_SECRET: requiredTrimmedStringSchema,
    CF_ACCESS_AUD: trimmedOptionalStringSchema,
    CF_ACCESS_INTERNAL_AUD: trimmedOptionalStringSchema,
    CF_ACCESS_PORTAL_AUD: trimmedOptionalStringSchema,
    CF_ACCESS_TEAM_DOMAIN: requiredTrimmedStringSchema,
    CORS_ALLOWED_ORIGINS: trimmedOptionalStringSchema,
    CORS_ALLOW_LOCALHOST: optionalBooleanStringSchema,
    DATABASE_URL: requiredTrimmedStringSchema,
    HOST: trimmedOptionalStringSchema,
    NODE_ENV: trimmedOptionalStringSchema,
    PORT: portSchema,
    WORKER_BOOTSTRAP_TOKEN: requiredTrimmedStringSchema
  })
  .superRefine((env, context) => {
    if (!(env.CF_ACCESS_PORTAL_AUD ?? env.CF_ACCESS_AUD)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "CF_ACCESS_PORTAL_AUD or CF_ACCESS_AUD is required",
        path: ["CF_ACCESS_PORTAL_AUD"]
      });
    }
  });

export type ApiRuntimeEnv = {
  accessProviderStateSecret: string;
  corsAllowedOrigins: string[];
  corsAllowLocalhost: boolean;
  databaseUrl: string;
  host: string;
  internalAccessAudience: string;
  nodeEnv?: string;
  port: number;
  portalAccessAudience: string;
  teamDomain: string;
  workerBootstrapToken: string;
};

function formatApiRuntimeEnvIssues(issues: z.ZodIssue[]) {
  return issues
    .map((issue) => {
      const field = issue.path[0];
      const message = issue.message === "Required" ? "is required" : issue.message;

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

export function parseApiRuntimeEnv(
  rawEnv: Partial<Record<string, string | undefined>> = process.env
): ApiRuntimeEnv {
  const parsed = rawApiRuntimeEnvSchema.safeParse(rawEnv);

  if (!parsed.success) {
    throw new Error(
      `Invalid API runtime environment: ${formatApiRuntimeEnvIssues(parsed.error.issues)}`
    );
  }

  const {
    ACCESS_PROVIDER_STATE_SECRET,
    CF_ACCESS_AUD,
    CF_ACCESS_INTERNAL_AUD,
    CF_ACCESS_PORTAL_AUD,
    CF_ACCESS_TEAM_DOMAIN,
    CORS_ALLOWED_ORIGINS,
    CORS_ALLOW_LOCALHOST,
    DATABASE_URL,
    HOST,
    NODE_ENV,
    PORT,
    WORKER_BOOTSTRAP_TOKEN
  } = parsed.data;

  const portalAccessAudience = CF_ACCESS_PORTAL_AUD ?? CF_ACCESS_AUD!;

  return {
    accessProviderStateSecret: ACCESS_PROVIDER_STATE_SECRET,
    corsAllowedOrigins: normalizeCorsAllowedOrigins(CORS_ALLOWED_ORIGINS),
    corsAllowLocalhost: CORS_ALLOW_LOCALHOST === "true",
    databaseUrl: DATABASE_URL,
    host: HOST ?? "0.0.0.0",
    internalAccessAudience: CF_ACCESS_INTERNAL_AUD ?? portalAccessAudience,
    nodeEnv: NODE_ENV,
    port: PORT === undefined ? 3000 : Number(PORT),
    portalAccessAudience,
    teamDomain: CF_ACCESS_TEAM_DOMAIN,
    workerBootstrapToken: WORKER_BOOTSTRAP_TOKEN
  };
}

export function assertApiRuntimeEnv() {
  parseApiRuntimeEnv();
}
