import path from "node:path";
import { type Problem9HostedAuthMode } from "@paretoproof/shared";
import { readWorkerCliFlagValue } from "./cli-contract.js";
import { runWorkerClaimLoop } from "./worker-claim-loop.js";

export async function runWorkerClaimLoopCli(args: string[]): Promise<void> {
  if (args.includes("--help")) {
    console.error(
      [
        "Usage: tsx src/index.ts run-worker-claim-loop --worker-id <id> --worker-pool <pool> --worker-version <version> --workspace-root <directory> --output-root <directory>",
        "       [--auth-mode machine_api_key] [--worker-runtime modal|local_docker] [--provider-model <model>] [--max-jobs <count>] [--once]"
      ].join("\n")
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

  const maxJobs = getOptionalValue("--max-jobs");
  const result = await runWorkerClaimLoop({
    authMode: (getOptionalValue("--auth-mode") ?? "machine_api_key") as Problem9HostedAuthMode,
    maxJobs: maxJobs ? Number.parseInt(maxJobs, 10) : null,
    once: args.includes("--once"),
    outputRoot: path.resolve(getRequiredValue("--output-root")),
    providerModel: getOptionalValue("--provider-model"),
    workerId: getRequiredValue("--worker-id"),
    workerPool: getRequiredValue("--worker-pool"),
    workerRuntime: (getOptionalValue("--worker-runtime") ?? "modal") as
      | "local_docker"
      | "modal",
    workerVersion: getRequiredValue("--worker-version"),
    workspaceRoot: path.resolve(getRequiredValue("--workspace-root"))
  });

  console.log(JSON.stringify(result, null, 2));
}
