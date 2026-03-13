import path from "node:path";
import { runProblem9OfflineIngest } from "./problem9-offline-ingest.js";

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
  let bundleRoot: string | null = null;

  try {
    bundleRoot = path.resolve(getRequiredValue("--bundle-root"));
    const result = await runProblem9OfflineIngest({
      accessJwt: getRequiredValue("--access-jwt"),
      bundleRoot
    });

    console.log(JSON.stringify(result, null, 2));

    if (result.status === "rejected") {
      process.exitCode = 1;
    }
  } catch (error) {
    if (!isOfflineIngestSetupError(error)) {
      throw error;
    }

    console.log(
      JSON.stringify(
        {
          bundleRoot,
          endpoint: null,
          error: classifyOfflineIngestSetupError(error.message),
          issues: [
            {
              message: error.message
            }
          ],
          stage: "setup_failure",
          status: "rejected"
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  }
}

function isOfflineIngestSetupError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error.message.startsWith("Missing required --") ||
      error.message.startsWith("Invalid worker runtime environment:") ||
      error.message === "Offline ingest runtime did not resolve API_BASE_URL.")
  );
}

function classifyOfflineIngestSetupError(errorMessage: string) {
  if (errorMessage.startsWith("Missing required --")) {
    return "invalid_problem9_offline_ingest_cli_arguments";
  }

  return "invalid_problem9_offline_ingest_runtime_env";
}
