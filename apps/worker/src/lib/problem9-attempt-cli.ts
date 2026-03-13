import path from "node:path";
import { runProblem9Attempt } from "./problem9-attempt.js";

export async function runProblem9AttemptCli(args: string[]): Promise<void> {
  if (args.includes("--help")) {
    console.error(
      "Usage: tsx src/index.ts run-problem9-attempt --benchmark-package-root <directory> --prompt-package-root <directory> --workspace <directory> --output <directory> [--provider-family <family>] [--auth-mode <mode>] [--provider-model <model>] [--model-snapshot-id <id>] [--stub-scenario exact_canonical|compile_failure]"
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

  const result = await runProblem9Attempt({
    authMode: getOptionalValue("--auth-mode") as
      | "trusted_local_user"
      | "machine_api_key"
      | "machine_oauth"
      | "local_stub"
      | undefined,
    benchmarkPackageRoot: path.resolve(getRequiredValue("--benchmark-package-root")),
    modelSnapshotId: getOptionalValue("--model-snapshot-id"),
    outputRoot: path.resolve(getRequiredValue("--output")),
    promptPackageRoot: path.resolve(getRequiredValue("--prompt-package-root")),
    providerFamily: getOptionalValue("--provider-family") as
      | "openai"
      | "anthropic"
      | "google"
      | "aristotle"
      | "axle"
      | "custom"
      | undefined,
    providerModel: getOptionalValue("--provider-model"),
    stubScenario: (getOptionalValue("--stub-scenario") ?? "exact_canonical") as
      | "compile_failure"
      | "exact_canonical",
    workspaceRoot: path.resolve(getRequiredValue("--workspace"))
  });

  console.log(JSON.stringify(result, null, 2));
}
