import path from "node:path";
import { ingestProblem9RunBundle } from "./problem9-offline-ingest.js";
import { parseWorkerRuntimeEnv } from "./runtime.js";

type CliFailurePayload = {
  bundleRoot?: string;
  endpoint?: string;
  error: string;
  issues?: unknown[];
  message: string;
  stage: "argument_validation" | "auth" | "local_validation" | "request" | "response";
  status: "rejected";
  statusCode?: number;
};

class Problem9OfflineIngestCliError extends Error {
  constructor(readonly payload: CliFailurePayload) {
    super(JSON.stringify(payload, null, 2));
    this.name = "Problem9OfflineIngestCliError";
  }
}

export async function runProblem9OfflineIngestCli(args: string[]): Promise<void> {
  if (args.includes("--help")) {
    console.error(
      "Usage: tsx src/index.ts ingest-problem9-run-bundle --bundle-root <directory> [--api-base-url <url>] [--access-jwt <token>]"
    );
    return;
  }

  try {
    const bundleRoot = path.resolve(getRequiredValue(args, "--bundle-root"));
    const apiBaseUrlOverride = getOptionalValue(args, "--api-base-url");
    const accessJwtOverride = getOptionalValue(args, "--access-jwt");
    const runtimeEnv = await parseWorkerRuntimeEnv(
      {
        commandFamily: "offline_ingest_cli"
      },
      {
        ...process.env,
        API_BASE_URL: apiBaseUrlOverride ?? process.env.API_BASE_URL,
        CF_ACCESS_JWT_ASSERTION: accessJwtOverride ?? process.env.CF_ACCESS_JWT_ASSERTION
      }
    );
    const accessJwtAssertion = accessJwtOverride ?? runtimeEnv.accessJwtAssertion;

    if (!accessJwtAssertion) {
      throw new Problem9OfflineIngestCliError({
        bundleRoot,
        error: "offline_ingest_access_assertion_missing",
        message:
          "Provide a portal-admin Access assertion with --access-jwt <token> or CF_ACCESS_JWT_ASSERTION.",
        stage: "auth",
        status: "rejected"
      });
    }

    const submission = await ingestProblem9RunBundle({
      accessJwtAssertion,
      apiBaseUrl: runtimeEnv.apiBaseUrl!,
      bundleRoot
    });

    console.log(
      JSON.stringify(
        {
          bundleRoot: submission.bundleRoot,
          endpoint: submission.endpoint,
          result: submission.response,
          status: "accepted"
        },
        null,
        2
      )
    );
  } catch (error) {
    if (error instanceof Problem9OfflineIngestCliError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const bundleRoot = getOptionalValue(args, "--bundle-root");

    if (
      error &&
      typeof error === "object" &&
      "responseStatus" in error &&
      typeof error.responseStatus === "number"
    ) {
      throw new Problem9OfflineIngestCliError({
        bundleRoot: bundleRoot ? path.resolve(bundleRoot) : undefined,
        endpoint: getOptionalValue(args, "--api-base-url") ?? process.env.API_BASE_URL,
        error:
          "serverErrorCode" in error && typeof error.serverErrorCode === "string"
            ? error.serverErrorCode
            : "offline_ingest_http_error",
        issues: "issues" in error && Array.isArray(error.issues) ? error.issues : undefined,
        message,
        stage:
          error.responseStatus === 401 || error.responseStatus === 403 ? "auth" : "request",
        status: "rejected",
        statusCode: error.responseStatus
      });
    }

    throw new Problem9OfflineIngestCliError({
      bundleRoot: bundleRoot ? path.resolve(bundleRoot) : undefined,
      error: "offline_ingest_local_validation_failed",
      message,
      stage:
        message.includes("Missing required") || message.includes("Usage:")
          ? "argument_validation"
          : "local_validation",
      status: "rejected"
    });
  }
}

function getRequiredValue(args: string[], flag: string): string {
  const value = getOptionalValue(args, flag);

  if (!value) {
    throw new Problem9OfflineIngestCliError({
      error: "offline_ingest_missing_argument",
      message: `Missing required ${flag} <value> argument.`,
      stage: "argument_validation",
      status: "rejected"
    });
  }

  return value;
}

function getOptionalValue(args: string[], flag: string): string | undefined {
  const index = args.findIndex((argument) => argument === flag);
  return index === -1 || !args[index + 1] ? undefined : args[index + 1];
}
