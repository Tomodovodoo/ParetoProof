import path from "node:path";
import { ingestProblem9RunBundle } from "./problem9-offline-ingest.js";
import { parseWorkerRuntimeEnv } from "./runtime.js";

export async function runProblem9OfflineIngestCli(args: string[]): Promise<void> {
  if (args.includes("--help")) {
    console.error(
      [
        "Usage: tsx src/index.ts ingest-problem9-run-bundle --bundle-root <directory> --access-jwt <token>",
        "       [--api-base-url <url>]"
      ].join("\n")
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

  const runtimeEnv = await parseWorkerRuntimeEnv(
    {
      commandFamily: "offline_ingest_cli"
    },
    {
      ...process.env,
      API_BASE_URL: getOptionalValue("--api-base-url") ?? process.env.API_BASE_URL
    }
  );

  const result = await ingestProblem9RunBundle({
    accessJwt: getRequiredValue("--access-jwt"),
    apiBaseUrl: runtimeEnv.apiBaseUrl ?? "",
    bundleRoot: path.resolve(getRequiredValue("--bundle-root"))
  });

  console.log(JSON.stringify(result, null, 2));
}
