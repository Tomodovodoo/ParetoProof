import path from "node:path";
import { materializeProblem9Package } from "./problem9-package.js";

export async function runProblem9PackageCli(args: string[]): Promise<void> {
  const outputArgumentIndex = args.findIndex((argument) => argument === "--output");

  if (outputArgumentIndex === -1 || !args[outputArgumentIndex + 1]) {
    throw new Error(
      "Missing required --output <directory> argument for materialize-problem9-package."
    );
  }

  const outputRoot = path.resolve(args[outputArgumentIndex + 1]);
  const result = await materializeProblem9Package({ outputRoot });

  console.log(
    JSON.stringify(
      {
        outputRoot: result.outputRoot,
        packageDigest: result.packageDigest,
        packageId: result.packageId,
        packageVersion: result.packageVersion
      },
      null,
      2
    )
  );
}
