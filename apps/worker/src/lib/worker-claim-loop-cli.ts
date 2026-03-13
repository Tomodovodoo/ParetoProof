import path from "node:path";
import {
  buildWorkerClaimLoopDefaults,
  runWorkerClaimLoop
} from "./worker-claim-loop.js";

type HostedAuthMode = "machine_api_key" | "machine_oauth";
type WorkerRuntime = "local_docker" | "modal";
type ProviderFamily =
  | "openai"
  | "anthropic"
  | "google"
  | "aristotle"
  | "axle"
  | "custom";

export async function runWorkerClaimLoopCli(args: string[]): Promise<void> {
  if (args.includes("--help")) {
    console.error(
      [
        "Usage: tsx src/index.ts run-worker-claim-loop [--once] [--auth-mode machine_api_key|machine_oauth] [--provider-family <family>] [--provider-model <model>] [--worker-id <id>] [--worker-pool <pool>] [--worker-runtime modal|local_docker] [--worker-version <version>] [--base-working-root <directory>] [--harness-revision <revision>]",
        "",
        "The hosted loop always enforces machine-auth-only execution. It rejects trusted_local_user and local_stub."
      ].join("\n")
    );
    return;
  }

  const defaults = buildWorkerClaimLoopDefaults();
  const getOptionalValue = (flag: string): string | undefined => {
    const index = args.findIndex((argument) => argument === flag);
    return index === -1 || !args[index + 1] ? undefined : args[index + 1];
  };

  const authModeValue = (getOptionalValue("--auth-mode") ?? "machine_api_key") as HostedAuthMode;

  if (authModeValue !== "machine_api_key" && authModeValue !== "machine_oauth") {
    throw new Error(
      "run-worker-claim-loop supports only --auth-mode machine_api_key|machine_oauth."
    );
  }

  const result = await runWorkerClaimLoop({
    authMode: authModeValue,
    baseWorkingRoot: path.resolve(
      getOptionalValue("--base-working-root") ?? defaults.baseWorkingRoot
    ),
    harnessRevision: getOptionalValue("--harness-revision"),
    once: args.includes("--once"),
    providerFamily: getOptionalValue("--provider-family") as ProviderFamily | undefined,
    providerModel: getOptionalValue("--provider-model"),
    workerId: getOptionalValue("--worker-id") ?? defaults.workerId,
    workerPool: getOptionalValue("--worker-pool") ?? defaults.workerPool,
    workerRuntime: (getOptionalValue("--worker-runtime") ?? defaults.workerRuntime) as WorkerRuntime,
    workerVersion: getOptionalValue("--worker-version") ?? defaults.workerVersion
  });

  console.log(JSON.stringify(result, null, 2));
}
