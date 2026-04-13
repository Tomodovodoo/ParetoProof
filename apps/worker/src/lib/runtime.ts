import { access, constants, readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type Problem9HostedAuthMode,
  type Problem9LocalAuthMode
} from "@paretoproof/shared";
import { z } from "zod";
import {
  trustedLocalAuthMountMarkerEnvName,
  trustedLocalAuthMountMarkerValue,
  trustedLocalCodexContainerAuthJsonPath,
  trustedLocalCodexContainerHome
} from "./trusted-local-auth-contract.js";
import { assertHostedClaimLoopStartupEnv } from "./hosted-network-policy.js";

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
const sha256Pattern = /^[a-f0-9]{64}$/i;

const workerRawRuntimeEnvSchema = z.object({
  ALL_PROXY: trimmedOptionalStringSchema,
  API_BASE_URL: trimmedOptionalStringSchema,
  CF_INTERNAL_API_SERVICE_TOKEN_ID: trimmedOptionalStringSchema,
  CF_INTERNAL_API_SERVICE_TOKEN_SECRET: trimmedOptionalStringSchema,
  CODEX_API_KEY: trimmedOptionalStringSchema,
  CODEX_HOME: trimmedOptionalStringSchema,
  HOME: trimmedOptionalStringSchema,
  HTTPS_PROXY: trimmedOptionalStringSchema,
  HTTP_PROXY: trimmedOptionalStringSchema,
  NO_PROXY: trimmedOptionalStringSchema,
  OPENAI_API_BASE: trimmedOptionalStringSchema,
  OPENAI_API_BASE_URL: trimmedOptionalStringSchema,
  OPENAI_BASE_URL: trimmedOptionalStringSchema,
  PARETOPROOF_DEVBOX_IMAGE_DIGEST: trimmedOptionalStringSchema,
  [trustedLocalAuthMountMarkerEnvName]: trimmedOptionalStringSchema,
  PARETOPROOF_WORKER_IMAGE_DIGEST: trimmedOptionalStringSchema,
  R2_ACCESS_KEY_ID: trimmedOptionalStringSchema,
  R2_SECRET_ACCESS_KEY: trimmedOptionalStringSchema,
  USERPROFILE: trimmedOptionalStringSchema,
  WORKER_BOOTSTRAP_TOKEN: trimmedOptionalStringSchema,
  all_proxy: trimmedOptionalStringSchema,
  http_proxy: trimmedOptionalStringSchema,
  https_proxy: trimmedOptionalStringSchema,
  no_proxy: trimmedOptionalStringSchema
});

export type WorkerRuntimeMode =
  | {
      authMode: Problem9LocalAuthMode;
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
      authMode: Problem9HostedAuthMode;
      commandFamily: "worker_claim_loop";
    };

export type WorkerRuntimeEnv = {
  apiBaseUrl?: string;
  codexApiKey?: string;
  devboxImageDigest?: string;
  hostedWorkerImageDigest?: string;
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

function resolveOptionalDigest(
  fieldName: "PARETOPROOF_DEVBOX_IMAGE_DIGEST" | "PARETOPROOF_WORKER_IMAGE_DIGEST",
  value: string | undefined
) {
  if (!value) {
    return undefined;
  }

  if (!sha256Pattern.test(value)) {
    throw new Error(
      `Invalid worker runtime environment: ${fieldName}: must be a sha256 hex digest`
    );
  }

  return value.toLowerCase();
}

function resolveRequiredDigest(
  fieldName: "PARETOPROOF_WORKER_IMAGE_DIGEST",
  value: string | undefined
) {
  const digest = resolveOptionalDigest(fieldName, value);

  if (!digest) {
    throw new Error(`Invalid worker runtime environment: ${fieldName}: is required`);
  }

  return digest;
}

function buildOptionalDevboxRuntimeEnv(rawEnv: z.output<typeof workerRawRuntimeEnvSchema>) {
  const devboxImageDigest = resolveOptionalDigest(
    "PARETOPROOF_DEVBOX_IMAGE_DIGEST",
    rawEnv.PARETOPROOF_DEVBOX_IMAGE_DIGEST
  );

  return devboxImageDigest ? { devboxImageDigest } : {};
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

function getTrustedLocalAuthMountMarker(rawEnv: z.output<typeof workerRawRuntimeEnvSchema>) {
  return rawEnv[trustedLocalAuthMountMarkerEnvName];
}

function hasTrustedLocalContainerMount(
  rawEnv: z.output<typeof workerRawRuntimeEnvSchema>
) {
  return (
    getTrustedLocalAuthMountMarker(rawEnv) !== undefined ||
    rawEnv.CODEX_HOME === trustedLocalCodexContainerHome
  );
}

function rejectTrustedLocalContainerMount(
  rawEnv: z.output<typeof workerRawRuntimeEnvSchema>,
  commandFamily: WorkerRuntimeMode["commandFamily"]
) {
  if (!hasTrustedLocalContainerMount(rawEnv)) {
    return;
  }

  throw new Error(
    [
      `Invalid worker runtime environment: ${trustedLocalAuthMountMarkerEnvName}: trusted-local auth mounts are not allowed for ${commandFamily}.`,
      `Use machine auth for ${commandFamily}; only trusted_local_user and trusted_local_devbox may use ${trustedLocalCodexContainerAuthJsonPath}.`
    ].join(" ")
  );
}

async function validateTrustedLocalAuthJson(authJsonPath: string) {
  const authJsonStats = await stat(authJsonPath).catch(() => null);

  if (!authJsonStats?.isFile()) {
    throw new Error(
      [
        "Invalid worker runtime environment: trusted_local_user requires a readable Codex auth.json.",
        `Expected file at ${authJsonPath}.`
      ].join(" ")
    );
  }

  let parsedAuthJson: unknown;

  try {
    parsedAuthJson = JSON.parse(await readFile(authJsonPath, "utf8"));
  } catch {
    throw new Error(
      [
        "Invalid worker runtime environment: trusted_local_user requires auth.json to contain valid JSON.",
        `Checked file at ${authJsonPath}.`
      ].join(" ")
    );
  }

  if (
    typeof parsedAuthJson !== "object" ||
    parsedAuthJson === null ||
    Array.isArray(parsedAuthJson)
  ) {
    throw new Error(
      [
        "Invalid worker runtime environment: trusted_local_user requires auth.json to contain a JSON object.",
        `Checked file at ${authJsonPath}.`
      ].join(" ")
    );
  }
}

async function validateTrustedLocalContainerMount(
  rawEnv: z.output<typeof workerRawRuntimeEnvSchema>,
  trustedLocalCodexHome: string,
  trustedLocalAuthJsonPath: string
) {
  const mountMarker = getTrustedLocalAuthMountMarker(rawEnv);

  if (mountMarker === undefined && rawEnv.CODEX_HOME !== trustedLocalCodexContainerHome) {
    return;
  }

  if (mountMarker !== trustedLocalAuthMountMarkerValue) {
    throw new Error(
      [
        `Invalid worker runtime environment: ${trustedLocalAuthMountMarkerEnvName}: expected ${trustedLocalAuthMountMarkerValue}.`,
        "Trusted-local devbox runs must use the repo-owned read-only auth.json mount contract."
      ].join(" ")
    );
  }

  if (rawEnv.CODEX_HOME !== trustedLocalCodexContainerHome) {
    throw new Error(
      [
        `Invalid worker runtime environment: CODEX_HOME: expected ${trustedLocalCodexContainerHome}.`,
        "Trusted-local devbox runs must mount auth.json at the canonical in-container path."
      ].join(" ")
    );
  }

  if (trustedLocalAuthJsonPath !== trustedLocalCodexContainerAuthJsonPath) {
    throw new Error(
      [
        "Invalid worker runtime environment: trusted_local_user requires the canonical in-container auth.json path.",
        `Expected file at ${trustedLocalCodexContainerAuthJsonPath}.`
      ].join(" ")
    );
  }

  const codexHomeEntries = await readdir(trustedLocalCodexHome);
  if (codexHomeEntries.length !== 1 || codexHomeEntries[0] !== "auth.json") {
    throw new Error(
      [
        "Invalid worker runtime environment: trusted_local_user requires a single-file auth.json mount.",
        `Expected ${trustedLocalCodexHome} to contain only auth.json.`
      ].join(" ")
    );
  }
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

  await validateTrustedLocalAuthJson(trustedLocalAuthJsonPath);
  await validateTrustedLocalContainerMount(
    rawEnv,
    trustedLocalCodexHome,
    trustedLocalAuthJsonPath
  );

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
      rejectTrustedLocalContainerMount(parsed.data, mode.commandFamily);
      return {};
    case "problem9_attempt":
      switch (mode.authMode) {
        case "local_stub":
          rejectTrustedLocalContainerMount(parsed.data, mode.commandFamily);
          return buildOptionalDevboxRuntimeEnv(parsed.data);
        case "machine_api_key":
          rejectTrustedLocalContainerMount(parsed.data, mode.commandFamily);
          return {
            codexApiKey: resolveRequiredField("CODEX_API_KEY", parsed.data.CODEX_API_KEY),
            ...buildOptionalDevboxRuntimeEnv(parsed.data)
          };
        case "trusted_local_user":
          return {
            ...(await resolveTrustedLocalEnv(parsed.data)),
            ...buildOptionalDevboxRuntimeEnv(parsed.data)
          };
      }
    case "trusted_local_devbox":
      return {
        ...(await resolveTrustedLocalEnv(parsed.data)),
        ...buildOptionalDevboxRuntimeEnv(parsed.data)
      };
    case "worker_claim_loop":
      rejectTrustedLocalContainerMount(parsed.data, mode.commandFamily);
      assertRequiredFields([
        ["API_BASE_URL", parsed.data.API_BASE_URL],
        ["WORKER_BOOTSTRAP_TOKEN", parsed.data.WORKER_BOOTSTRAP_TOKEN],
        ...(mode.authMode === "machine_api_key"
          ? [["CODEX_API_KEY", parsed.data.CODEX_API_KEY] as const]
          : [])
      ]);
      try {
        assertHostedClaimLoopStartupEnv(parsed.data);
      } catch (error) {
        throw new Error(
          `Invalid worker runtime environment: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      return {
        apiBaseUrl: resolveRequiredField("API_BASE_URL", parsed.data.API_BASE_URL),
        codexApiKey:
          mode.authMode === "machine_api_key"
            ? resolveRequiredField("CODEX_API_KEY", parsed.data.CODEX_API_KEY)
            : undefined,
        hostedWorkerImageDigest: resolveRequiredDigest(
          "PARETOPROOF_WORKER_IMAGE_DIGEST",
          parsed.data.PARETOPROOF_WORKER_IMAGE_DIGEST
        ),
        workerBootstrapToken: resolveRequiredField(
          "WORKER_BOOTSTRAP_TOKEN",
          parsed.data.WORKER_BOOTSTRAP_TOKEN
        )
      };
    case "offline_ingest_cli":
      rejectTrustedLocalContainerMount(parsed.data, mode.commandFamily);
      return {
        apiBaseUrl: resolveRequiredField("API_BASE_URL", parsed.data.API_BASE_URL)
      };
  }
}
