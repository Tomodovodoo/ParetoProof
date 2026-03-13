import { access, constants } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { Problem9AuthMode } from "./problem9-auth.js";

function normalizeOptionalEnvValue(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

const trimmedOptionalStringSchema = z.preprocess(
  normalizeOptionalEnvValue,
  z.string().trim().optional()
);

const workerRawRuntimeEnvSchema = z.object({
  API_BASE_URL: trimmedOptionalStringSchema,
  CF_INTERNAL_API_SERVICE_TOKEN_ID: trimmedOptionalStringSchema,
  CF_INTERNAL_API_SERVICE_TOKEN_SECRET: trimmedOptionalStringSchema,
  CODEX_API_KEY: trimmedOptionalStringSchema,
  CODEX_HOME: trimmedOptionalStringSchema,
  HOME: trimmedOptionalStringSchema,
  R2_ACCESS_KEY_ID: trimmedOptionalStringSchema,
  R2_SECRET_ACCESS_KEY: trimmedOptionalStringSchema,
  USERPROFILE: trimmedOptionalStringSchema,
  WORKER_BOOTSTRAP_TOKEN: trimmedOptionalStringSchema
});

export type WorkerRuntimeMode =
  | {
      authMode: Problem9AuthMode;
      commandFamily: "problem9_attempt";
    }
  | {
      commandFamily: "materializer";
    }
  | {
      commandFamily: "offline_ingest_cli";
    }
  | {
      commandFamily: "trusted_local_devbox";
    }
  | {
      authMode: "machine_api_key" | "machine_oauth";
      commandFamily: "worker_claim_loop";
    };

export type WorkerRuntimeEnv = {
  apiBaseUrl?: string;
  codexApiKey?: string;
  trustedLocalAuthJsonPath?: string;
  trustedLocalCodexHome?: string;
  workerBootstrapToken?: string;
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

function resolveRequiredField(
  fieldName: "API_BASE_URL" | "CODEX_API_KEY" | "WORKER_BOOTSTRAP_TOKEN",
  value: string | undefined
) {
  if (!value) {
    throw new Error(`Invalid worker runtime environment: ${fieldName}: is required`);
  }

  if (fieldName === "API_BASE_URL") {
    try {
      new URL(value);
    } catch {
      throw new Error("Invalid worker runtime environment: API_BASE_URL: must be a valid URL");
    }
  }

  return value;
}

function assertRequiredFields(
  entries: ReadonlyArray<
    readonly [
      fieldName: "API_BASE_URL" | "CODEX_API_KEY" | "WORKER_BOOTSTRAP_TOKEN",
      value: string | undefined
    ]
  >
) {
  const missingFields = entries
    .filter(([, value]) => !value)
    .map(([fieldName]) => `${fieldName}: is required`);

  if (missingFields.length > 0) {
    throw new Error(`Invalid worker runtime environment: ${missingFields.join("; ")}`);
  }
}

function resolveCodexHome(rawEnv: z.output<typeof workerRawRuntimeEnvSchema>) {
  if (rawEnv.CODEX_HOME) {
    return rawEnv.CODEX_HOME;
  }

  if (process.platform === "win32") {
    if (!rawEnv.USERPROFILE) {
      throw new Error(
        "Invalid worker runtime environment: CODEX_HOME: could not be inferred because USERPROFILE is not set"
      );
    }

    return path.join(rawEnv.USERPROFILE, ".codex");
  }

  return path.join(rawEnv.HOME ?? os.homedir(), ".codex");
}

async function resolveTrustedLocalEnv(rawEnv: z.output<typeof workerRawRuntimeEnvSchema>) {
  const trustedLocalCodexHome = resolveCodexHome(rawEnv);
  const trustedLocalAuthJsonPath = path.join(trustedLocalCodexHome, "auth.json");

  try {
    await access(trustedLocalAuthJsonPath, constants.R_OK);
  } catch {
    throw new Error(
      [
        "Invalid worker runtime environment: trusted_local_user requires a readable Codex auth.json.",
        `Expected file at ${trustedLocalAuthJsonPath}.`
      ].join(" ")
    );
  }

  return {
    trustedLocalAuthJsonPath,
    trustedLocalCodexHome
  } satisfies Pick<WorkerRuntimeEnv, "trustedLocalAuthJsonPath" | "trustedLocalCodexHome">;
}

export async function parseWorkerRuntimeEnv(
  mode: WorkerRuntimeMode,
  rawEnv: Partial<Record<string, string | undefined>> = process.env
): Promise<WorkerRuntimeEnv> {
  const parsed = workerRawRuntimeEnvSchema.safeParse(rawEnv);

  if (!parsed.success) {
    throw new Error(
      `Invalid worker runtime environment: ${formatWorkerRuntimeEnvIssues(parsed.error.issues)}`
    );
  }

  switch (mode.commandFamily) {
    case "materializer":
      return {};
    case "problem9_attempt":
      switch (mode.authMode) {
        case "local_stub":
          return {};
        case "machine_api_key":
          return {
            codexApiKey: resolveRequiredField("CODEX_API_KEY", parsed.data.CODEX_API_KEY)
          };
        case "machine_oauth":
          return {};
        case "trusted_local_user":
          return resolveTrustedLocalEnv(parsed.data);
      }
    case "trusted_local_devbox":
      return resolveTrustedLocalEnv(parsed.data);
    case "worker_claim_loop":
      assertRequiredFields([
        ["API_BASE_URL", parsed.data.API_BASE_URL],
        ["WORKER_BOOTSTRAP_TOKEN", parsed.data.WORKER_BOOTSTRAP_TOKEN],
        ...(mode.authMode === "machine_api_key"
          ? [["CODEX_API_KEY", parsed.data.CODEX_API_KEY] as const]
          : [])
      ]);

      return {
        apiBaseUrl: resolveRequiredField("API_BASE_URL", parsed.data.API_BASE_URL),
        codexApiKey:
          mode.authMode === "machine_api_key"
            ? resolveRequiredField("CODEX_API_KEY", parsed.data.CODEX_API_KEY)
            : undefined,
        workerBootstrapToken: resolveRequiredField(
          "WORKER_BOOTSTRAP_TOKEN",
          parsed.data.WORKER_BOOTSTRAP_TOKEN
        )
      };
    case "offline_ingest_cli":
      return {
        apiBaseUrl: resolveRequiredField("API_BASE_URL", parsed.data.API_BASE_URL)
      };
  }
}
