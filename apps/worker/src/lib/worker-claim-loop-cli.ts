import path from "node:path";
import { runWorkerClaimLoop } from "./worker-claim-loop.js";

export async function runWorkerClaimLoopCli(args: string[]): Promise<void> {
  if (args.includes("--help")) {
    console.error(
      [
        "Usage: tsx src/index.ts run-worker-claim-loop --worker-id <id> --worker-pool <pool> --worker-version <version> --workspace-root <directory> --output-root <directory>",
        "       [--auth-mode machine_api_key|machine_oauth] [--worker-runtime modal|local_docker] [--provider-model <model>] [--max-jobs <count>] [--once]"
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

  const maxJobs = getOptionalValue("--max-jobs");
  const result = await runWorkerClaimLoop({
    authMode: (getOptionalValue("--auth-mode") ?? "machine_api_key") as
      | "machine_api_key"
      | "machine_oauth",
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
