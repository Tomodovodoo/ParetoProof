import path from "node:path";
import { type Problem9ProviderFamily } from "@paretoproof/shared";
import { readWorkerCliFlagValue } from "./cli-contract.js";
import { runProblem9Attempt } from "./problem9-attempt.js";
import { parseProblem9AuthMode } from "./problem9-auth.js";

export async function runProblem9AttemptCli(args: string[]): Promise<void> {
  if (args.includes("--help")) {
    console.error(
      "Usage: tsx src/index.ts run-problem9-attempt --benchmark-package-root <directory> --prompt-package-root <directory> --workspace <directory> --output <directory> [--provider-family openai] [--auth-mode trusted_local_user|machine_api_key|local_stub] [--provider-model <model>] [--model-snapshot-id <id>] [--stub-scenario exact_canonical|compile_failure]"
    );
    return;
  }

  const getRequiredValue = (flag: string): string => {
    const { value } = readWorkerCliFlagValue(args, flag);

    if (value === null) {
      throw new Error(`Missing required ${flag} <value> argument.`);
    }

    return value;
  };

  const getOptionalValue = (flag: string): string | undefined => {
    const { present, value } = readWorkerCliFlagValue(args, flag);

    if (!present) {
      return undefined;
    }

    if (value === null) {
      throw new Error(`Missing ${flag} <value> argument.`);
    }

    return value;
  };

  const result = await runProblem9Attempt({
    authMode: parseOptionalAuthMode(getOptionalValue("--auth-mode")),
    benchmarkPackageRoot: path.resolve(getRequiredValue("--benchmark-package-root")),
    modelSnapshotId: getOptionalValue("--model-snapshot-id"),
    outputRoot: path.resolve(getRequiredValue("--output")),
    promptPackageRoot: path.resolve(getRequiredValue("--prompt-package-root")),
    providerFamily: getOptionalValue("--provider-family") as Problem9ProviderFamily | undefined,
    providerModel: getOptionalValue("--provider-model"),
    stubScenario: (getOptionalValue("--stub-scenario") ?? "exact_canonical") as
      | "compile_failure"
      | "exact_canonical",
    workspaceRoot: path.resolve(getRequiredValue("--workspace"))
  });

  console.log(JSON.stringify(result, null, 2));
}

function parseOptionalAuthMode(rawAuthMode: string | undefined) {
  return rawAuthMode ? parseProblem9AuthMode(rawAuthMode) : undefined;
}
