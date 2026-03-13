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

  const result = await runProblem9OfflineIngest({
    accessJwt: getRequiredValue("--access-jwt"),
    bundleRoot: path.resolve(getRequiredValue("--bundle-root"))
  });

  console.log(JSON.stringify(result, null, 2));

  if (result.status === "rejected") {
    process.exitCode = 1;
  }
}
