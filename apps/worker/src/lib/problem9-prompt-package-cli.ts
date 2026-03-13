import path from "node:path";
import {
  getDefaultProblem9PromptPackageOptions,
  materializeProblem9PromptPackage
} from "./problem9-prompt-package.js";
import { parseWorkerRuntimeEnv } from "./runtime.js";

export async function runProblem9PromptPackageCli(args: string[]): Promise<void> {
  if (args.includes("--help")) {
    console.error(
      "Usage: tsx src/index.ts materialize-problem9-prompt-package --output <directory> --benchmark-package-root <directory> --run-id <id> --attempt-id <id> --lane-id <id> --run-mode <mode> --tool-profile <profile> --provider-family <family> --auth-mode <mode> --model-config-id <id> --harness-revision <revision>"
    );
    return;
  }

  await parseWorkerRuntimeEnv({
    commandFamily: "materializer"
  });

  const getRequiredValue = (flag: string): string => {
    const index = args.findIndex((argument) => argument === flag);

    if (index === -1 || !args[index + 1]) {
      throw new Error(`Missing required ${flag} <value> argument.`);
    }

    return args[index + 1];
  };

  const getOptionalValue = (flag: string): string | null => {
    const index = args.findIndex((argument) => argument === flag);
    return index === -1 || !args[index + 1] ? null : args[index + 1];
  };

  const defaults = getDefaultProblem9PromptPackageOptions();
  const result = await materializeProblem9PromptPackage({
    attemptId: getRequiredValue("--attempt-id"),
    authMode: getRequiredValue("--auth-mode") as
      | "trusted_local_user"
      | "machine_api_key"
      | "machine_oauth"
      | "local_stub",
    benchmarkPackageRoot: path.resolve(getRequiredValue("--benchmark-package-root")),
    harnessRevision: getRequiredValue("--harness-revision"),
    jobId: getOptionalValue("--job-id"),
    laneId: getRequiredValue("--lane-id"),
    modelConfigId: getRequiredValue("--model-config-id"),
    outputRoot: path.resolve(getRequiredValue("--output")),
    passKCount: getOptionalValue("--pass-k-count")
      ? Number(getOptionalValue("--pass-k-count"))
      : null,
    passKIndex: getOptionalValue("--pass-k-index")
      ? Number(getOptionalValue("--pass-k-index"))
      : null,
    promptLayerVersions: defaults.promptLayerVersions,
    promptProtocolVersion: defaults.promptProtocolVersion,
    providerFamily: getRequiredValue("--provider-family") as
      | "openai"
      | "anthropic"
      | "google"
      | "aristotle"
      | "axle"
      | "custom",
    runId: getRequiredValue("--run-id"),
    runMode: getRequiredValue("--run-mode") as
      | "single_pass_probe"
      | "pass_k_probe"
      | "bounded_agentic_attempt",
    toolProfile: getRequiredValue("--tool-profile") as
      | "no_tools"
      | "lean_mcp_readonly"
      | "workspace_edit_limited"
  });

  console.log(
    JSON.stringify(
      {
        outputRoot: result.outputRoot,
        promptPackageDigest: result.promptPackageDigest
      },
      null,
      2
    )
  );
}
