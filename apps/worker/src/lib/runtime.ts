import { access, constants, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { Problem9AuthMode } from "./problem9-auth.js";
import {
  linuxMountInfoListsMountPoint,
  trustedLocalCodexContainerAuthJsonPath,
  trustedLocalCodexContainerHome
} from "./trusted-local-codex.js";

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
  PARETOPROOF_RUNTIME_CONTEXT: z.enum(["container", "host"]).optional(),
  R2_ACCESS_KEY_ID: trimmedOptionalStringSchema,
  R2_SECRET_ACCESS_KEY: trimmedOptionalStringSchema,
  USERPROFILE: trimmedOptionalStringSchema,
  WORKER_BOOTSTRAP_TOKEN: trimmedOptionalStringSchema
});

type TrustedLocalRuntimeContext = "container" | "host";

type WorkerRuntimeInspection = {
  readLinuxMountInfo?: () => Promise<string | null>;
  runtimeContext?: TrustedLocalRuntimeContext;
};

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

async function resolveTrustedLocalEnv(
  rawEnv: z.output<typeof workerRawRuntimeEnvSchema>,
  inspection: WorkerRuntimeInspection
) {
  if ((await resolveTrustedLocalRuntimeContext(rawEnv, inspection)) === "container") {
    return resolveTrustedLocalContainerEnv(rawEnv, inspection);
  }

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

async function resolveTrustedLocalContainerEnv(
  rawEnv: z.output<typeof workerRawRuntimeEnvSchema>,
  inspection: WorkerRuntimeInspection
) {
  const trustedLocalCodexHome = resolveCodexHome(rawEnv);

  if (trustedLocalCodexHome !== trustedLocalCodexContainerHome) {
    throw new Error(
      [
        "Invalid worker runtime environment: trusted_local_user inside a container is supported only through the trusted-local devbox auth mount.",
        `Expected CODEX_HOME=${trustedLocalCodexContainerHome}, received ${trustedLocalCodexHome}.`
      ].join(" ")
    );
  }

  const mountInfo = await (inspection.readLinuxMountInfo?.() ?? readLinuxMountInfo());

  if (
    mountInfo === null ||
    !linuxMountInfoListsMountPoint(mountInfo, trustedLocalCodexContainerAuthJsonPath)
  ) {
    throw new Error(
      [
        "Invalid worker runtime environment: trusted_local_user inside a container requires a mounted auth.json, not a baked or copied file.",
        `Expected a mount entry for ${trustedLocalCodexContainerAuthJsonPath}.`
      ].join(" ")
    );
  }

  try {
    await access(trustedLocalCodexContainerAuthJsonPath, constants.R_OK);
  } catch {
    throw new Error(
      [
        "Invalid worker runtime environment: trusted_local_user requires a readable Codex auth.json.",
        `Expected file at ${trustedLocalCodexContainerAuthJsonPath}.`
      ].join(" ")
    );
  }

  return {
    trustedLocalAuthJsonPath: trustedLocalCodexContainerAuthJsonPath,
    trustedLocalCodexHome: trustedLocalCodexContainerHome
  } satisfies Pick<WorkerRuntimeEnv, "trustedLocalAuthJsonPath" | "trustedLocalCodexHome">;
}

async function resolveTrustedLocalRuntimeContext(
  rawEnv: z.output<typeof workerRawRuntimeEnvSchema>,
  inspection: WorkerRuntimeInspection
): Promise<TrustedLocalRuntimeContext> {
  if (inspection.runtimeContext) {
    return inspection.runtimeContext;
  }

  if (rawEnv.PARETOPROOF_RUNTIME_CONTEXT) {
    return rawEnv.PARETOPROOF_RUNTIME_CONTEXT;
  }

  return (await isContainerizedRuntime()) ? "container" : "host";
}

async function isContainerizedRuntime(): Promise<boolean> {
  if (process.platform === "win32") {
    return false;
  }

  if (
    typeof process.env.container === "string" ||
    typeof process.env.KUBERNETES_SERVICE_HOST === "string"
  ) {
    return true;
  }

  for (const markerPath of ["/.dockerenv", "/run/.containerenv"]) {
    try {
      await access(markerPath, constants.F_OK);
      return true;
    } catch {}
  }

  for (const cgroupPath of ["/proc/1/cgroup", "/proc/self/cgroup"]) {
    try {
      const cgroupText = await readFile(cgroupPath, "utf8");

      if (/(docker|containerd|kubepods|podman|libpod)/iu.test(cgroupText)) {
        return true;
      }
    } catch {}
  }

  return false;
}

async function readLinuxMountInfo(): Promise<string | null> {
  if (process.platform === "win32") {
    return null;
  }

  try {
    return await readFile("/proc/self/mountinfo", "utf8");
  } catch {
    return null;
  }
}

export async function parseWorkerRuntimeEnv(
  mode: WorkerRuntimeMode,
  rawEnv: Partial<Record<string, string | undefined>> = process.env,
  inspection: WorkerRuntimeInspection = {}
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
          return resolveTrustedLocalEnv(parsed.data, inspection);
      }
    case "trusted_local_devbox":
      if ((await resolveTrustedLocalRuntimeContext(parsed.data, inspection)) === "container") {
        throw new Error(
          "Invalid worker runtime environment: trusted_local_devbox must start on the host, not from inside a containerized or image-baked worker environment."
        );
      }

      return resolveTrustedLocalEnv(parsed.data, inspection);
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
