import path from "node:path";
import { readWorkerCliFlagValue } from "./cli-contract.js";
import { materializeProblem9Package } from "./problem9-package.js";
import { parseWorkerRuntimeEnv } from "./runtime.js";

export async function runProblem9PackageCli(args: string[]): Promise<void> {
  if (args.includes("--help")) {
    console.error("Usage: tsx src/index.ts materialize-problem9-package --output <directory>");
    return;
  }

  await parseWorkerRuntimeEnv({
    commandFamily: "materializer"
  });

  const { value: outputValue } = readWorkerCliFlagValue(args, "--output");

  if (outputValue === null) {
    throw new Error(
      "Missing required --output <directory> argument for materialize-problem9-package."
    );
  }

  const outputRoot = path.resolve(outputValue);
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
