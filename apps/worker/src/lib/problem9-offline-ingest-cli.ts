import path from "node:path";
import { rejectedOfflineIngestExitCode } from "./cli-contract.js";
import { runProblem9OfflineIngest } from "./problem9-offline-ingest.js";

export async function runProblem9OfflineIngestCli(args: string[]): Promise<void> {
  if (args.includes("--help")) {
    console.error(
      "Usage: tsx src/index.ts ingest-problem9-run-bundle --bundle-root <directory> --access-jwt <token>"
    );
    return;
  }

  const getRequiredValue = (flag: "--access-jwt" | "--bundle-root"): string => {
    const index = args.findIndex((argument) => argument === flag);

    if (index === -1 || !args[index + 1]) {
      throw new Error(`Missing required ${flag} <value> argument.`);
    }

    return args[index + 1];
  };

  const parsedOptions = (() => {
    try {
      return {
        accessJwt: getRequiredValue("--access-jwt"),
        bundleRoot: path.resolve(getRequiredValue("--bundle-root"))
      };
    } catch (error) {
      return {
        bundleRoot: null,
        endpoint: null,
        error: "offline_ingest_setup_failure",
        issues: [
          {
            message: error instanceof Error ? error.message : String(error),
            path:
              error instanceof Error && error.message.includes("--access-jwt")
                ? "--access-jwt"
                : "--bundle-root"
          }
        ],
        stage: "setup_failure",
        status: "rejected" as const
      };
    }
  })();

  if (parsedOptions.status === "rejected") {
    console.error(JSON.stringify(parsedOptions, null, 2));
    process.exitCode = rejectedOfflineIngestExitCode(parsedOptions.stage);
    return;
  }

  const result = await runProblem9OfflineIngest({
    accessJwt: parsedOptions.accessJwt,
    bundleRoot: parsedOptions.bundleRoot
  });

  if (result.status === "rejected") {
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = rejectedOfflineIngestExitCode(result.stage);
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}
