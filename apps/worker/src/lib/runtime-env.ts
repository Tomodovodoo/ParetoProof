import { z } from "zod";
import {
  preflightProblem9AuthMode,
  type Problem9AuthPreflight,
  type Problem9AuthMode
} from "./problem9-auth.js";

const normalizeOptionalEnvValue = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
};

const requiredTrimmedStringSchema = z.preprocess(
  normalizeOptionalEnvValue,
  z.string().trim().min(1, "must not be empty")
);

const machineApiKeyEnvSchema = z.object({
  CODEX_API_KEY: requiredTrimmedStringSchema
});

const hostedClaimLoopEnvSchema = z.object({
  API_BASE_URL: requiredTrimmedStringSchema,
  WORKER_BOOTSTRAP_TOKEN: requiredTrimmedStringSchema
});

const offlineIngestEnvSchema = z.object({
  API_BASE_URL: requiredTrimmedStringSchema
});

export type WorkerHostedClaimLoopRuntimeEnv = {
  apiBaseUrl: string;
  workerBootstrapToken: string;
};

export type WorkerOfflineIngestRuntimeEnv = {
  apiBaseUrl: string;
};

function formatWorkerRuntimeEnvIssues(issues: z.ZodIssue[]) {
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

function throwInvalidWorkerRuntimeEnv(commandFamily: string, issues: z.ZodIssue[]): never {
  throw new Error(
    `Invalid worker runtime environment for ${commandFamily}: ${formatWorkerRuntimeEnvIssues(issues)}`
  );
}

function defaultTrustedLocalProbe() {
  return preflightProblem9AuthMode("trusted_local_user").then((preflight) => {
    if (preflight.authMode !== "trusted_local_user") {
      throw new Error("Trusted-local runtime validation resolved a non-trusted auth mode.");
    }

    return preflight;
  });
}

export async function validateLocalSingleRunRuntime(options: {
  authMode: Problem9AuthMode;
  rawEnv?: Partial<Record<string, string | undefined>>;
  verifyTrustedLocalUser?: () => Promise<Extract<Problem9AuthPreflight, { authMode: "trusted_local_user" }>>;
}): Promise<Problem9AuthPreflight> {
  switch (options.authMode) {
    case "trusted_local_user":
      return (options.verifyTrustedLocalUser ?? defaultTrustedLocalProbe)();
    case "machine_api_key": {
      const parsed = machineApiKeyEnvSchema.safeParse(options.rawEnv ?? process.env);

      if (!parsed.success) {
        throwInvalidWorkerRuntimeEnv("local_single_run", parsed.error.issues);
      }

      return {
        authMode: "machine_api_key",
        envKeyName: "CODEX_API_KEY"
      };
    }
    case "local_stub":
      return {
        authMode: "local_stub"
      };
    case "machine_oauth":
      throw new Error("Auth mode machine_oauth is not implemented for run-problem9-attempt.");
  }
}

export async function validateTrustedLocalDevboxRuntime(options?: {
  verifyTrustedLocalUser?: () => Promise<Extract<Problem9AuthPreflight, { authMode: "trusted_local_user" }>>;
}): Promise<Extract<Problem9AuthPreflight, { authMode: "trusted_local_user" }>> {
  return (options?.verifyTrustedLocalUser ?? defaultTrustedLocalProbe)();
}

export function parseHostedClaimLoopRuntimeEnv(
  rawEnv: Partial<Record<string, string | undefined>> = process.env
): WorkerHostedClaimLoopRuntimeEnv {
  const parsed = hostedClaimLoopEnvSchema.safeParse(rawEnv);

  if (!parsed.success) {
    throwInvalidWorkerRuntimeEnv("hosted_claim_loop", parsed.error.issues);
  }

  return {
    apiBaseUrl: parsed.data.API_BASE_URL,
    workerBootstrapToken: parsed.data.WORKER_BOOTSTRAP_TOKEN
  };
}

export function parseOfflineIngestRuntimeEnv(
  rawEnv: Partial<Record<string, string | undefined>> = process.env
): WorkerOfflineIngestRuntimeEnv {
  const parsed = offlineIngestEnvSchema.safeParse(rawEnv);

  if (!parsed.success) {
    throwInvalidWorkerRuntimeEnv("offline_ingest", parsed.error.issues);
  }

  return {
    apiBaseUrl: parsed.data.API_BASE_URL
  };
}
