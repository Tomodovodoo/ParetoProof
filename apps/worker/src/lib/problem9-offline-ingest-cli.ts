import path from "node:path";
import {
  Problem9OfflineIngestCliError,
  runProblem9OfflineIngest
} from "./problem9-offline-ingest.js";

export async function runProblem9OfflineIngestCli(args: string[]): Promise<void> {
  if (args.includes("--help")) {
    console.error(
      "Usage: tsx src/index.ts ingest-problem9-run-bundle --bundle-root <directory> --access-jwt <token>"
    );
    return;
  }

  const getRequiredValue = (flag: string): string => {
    const index = args.findIndex((argument) => argument === flag);

    if (index === -1 || !args[index + 1]) {
      throw new Error(`Missing required ${flag} <value> argument.`);
    }

    return args[index + 1];
  };

  const getOptionalValue = (flag: string): string | undefined => {
    const index = args.findIndex((argument) => argument === flag);
    return index === -1 || !args[index + 1] ? undefined : args[index + 1];
  };

  const unresolvedApiBaseUrl = process.env.API_BASE_URL ?? "";
  const unresolvedBundleRoot = getOptionalValue("--bundle-root");

  try {
    const result = await runProblem9OfflineIngest({
      accessJwt: getRequiredValue("--access-jwt"),
      bundleRoot: path.resolve(getRequiredValue("--bundle-root"))
    });

    console.log(JSON.stringify(result, null, 2));

    if (result.status === "rejected") {
      process.exitCode = 1;
    }
  } catch (error) {
    if (error instanceof Problem9OfflineIngestCliError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);

    throw new Problem9OfflineIngestCliError({
      bundleRoot: unresolvedBundleRoot ? path.resolve(unresolvedBundleRoot) : "",
      endpoint: "",
      error: "offline_ingest_setup_error",
      kind: "setup_error",
      issues: [
        {
          message
        }
      ],
      stage: "setup_error",
      status: "rejected"
    });
  }
}
