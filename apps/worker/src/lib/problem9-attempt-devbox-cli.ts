import { access, constants, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  preflightProblem9AuthMode,
  trustedLocalCodexContainerAuthJsonPath,
  trustedLocalCodexContainerHome
} from "./problem9-auth.js";

const benchmarkPackageContainerRoot = "/workdir/input/benchmark-package";
const promptPackageContainerRoot = "/workdir/input/prompt-package";
const workspaceParentContainerRoot = "/workdir/mounts/workspace-parent";
const outputParentContainerRoot = "/workdir/mounts/output-parent";

type DevboxWrapperOptions = {
  benchmarkPackageRoot?: string;
  image: string;
  modelSnapshotId?: string;
  outputRoot?: string;
  preflightOnly: boolean;
  printDockerCommand: boolean;
  promptPackageRoot?: string;
  providerFamily?: "openai";
  providerModel?: string;
  workspaceRoot?: string;
};

export async function runProblem9AttemptInDevboxCli(args: string[]): Promise<void> {
  const options = parseDevboxWrapperOptions(args);
  const authPreflight = await preflightProblem9AuthMode("trusted_local_user");

  if (authPreflight.authMode !== "trusted_local_user") {
    throw new Error("Trusted-local devbox wrapper resolved a non-trusted auth mode unexpectedly.");
  }

  const benchmarkPackageRoot = options.preflightOnly
    ? null
    : await requireReadableDirectory(
        options.benchmarkPackageRoot,
        "Benchmark package root"
      );
  const promptPackageRoot = options.preflightOnly
    ? null
    : await requireReadableDirectory(
        options.promptPackageRoot,
        "Prompt package root"
      );
  const workspaceRoot = options.preflightOnly
    ? null
    : await prepareWritableTarget(options.workspaceRoot, "Workspace root");
  const outputRoot = options.preflightOnly
    ? null
    : await prepareWritableTarget(options.outputRoot, "Output root");

  if (!options.preflightOnly && !options.providerModel) {
    throw new Error(
      "Trusted-local devbox runs require --provider-model so the inner attempt can call codex exec explicitly."
    );
  }

  if (benchmarkPackageRoot && workspaceRoot) {
    assertNoHostPathOverlap(
      benchmarkPackageRoot,
      workspaceRoot,
      "Benchmark package root",
      "Workspace root"
    );
  }

  if (promptPackageRoot && workspaceRoot) {
    assertNoHostPathOverlap(
      promptPackageRoot,
      workspaceRoot,
      "Prompt package root",
      "Workspace root"
    );
  }

  if (benchmarkPackageRoot && outputRoot) {
    assertNoHostPathOverlap(
      benchmarkPackageRoot,
      outputRoot,
      "Benchmark package root",
      "Output root"
    );
  }

  if (promptPackageRoot && outputRoot) {
    assertNoHostPathOverlap(
      promptPackageRoot,
      outputRoot,
      "Prompt package root",
      "Output root"
    );
  }

  if (workspaceRoot && outputRoot) {
    assertNoHostPathOverlap(workspaceRoot, outputRoot, "Workspace root", "Output root");
  }

  const workspaceContainerRoot = workspaceRoot
    ? path.posix.join(workspaceParentContainerRoot, path.basename(workspaceRoot))
    : null;
  const outputContainerRoot = outputRoot
    ? path.posix.join(outputParentContainerRoot, path.basename(outputRoot))
    : null;
  const shellCommands = buildContainerShellCommands({
    benchmarkPackageContainerRoot,
    modelSnapshotId: options.modelSnapshotId,
    outputContainerRoot,
    preflightOnly: options.preflightOnly,
    promptPackageContainerRoot,
    providerFamily: options.providerFamily ?? "openai",
    providerModel: options.providerModel,
    workspaceContainerRoot
  });
  const dockerArgs = [
    "run",
    "--rm",
    "--entrypoint",
    "sh",
    "--workdir",
    "/app",
    "--env",
    `CODEX_HOME=${trustedLocalCodexContainerHome}`,
    "--mount",
    buildBindMountArg(authPreflight.authJsonPath, trustedLocalCodexContainerAuthJsonPath, true)
  ];

  if (benchmarkPackageRoot) {
    dockerArgs.push(
      "--mount",
      buildBindMountArg(benchmarkPackageRoot, benchmarkPackageContainerRoot, true)
    );
  }

  if (promptPackageRoot) {
    dockerArgs.push(
      "--mount",
      buildBindMountArg(promptPackageRoot, promptPackageContainerRoot, true)
    );
  }

  if (workspaceRoot) {
    dockerArgs.push(
      "--mount",
      buildBindMountArg(path.dirname(workspaceRoot), workspaceParentContainerRoot, false)
    );
  }

  if (outputRoot) {
    dockerArgs.push(
      "--mount",
      buildBindMountArg(path.dirname(outputRoot), outputParentContainerRoot, false)
    );
  }

  dockerArgs.push(options.image, "-lc", shellCommands.join(" && "));

  if (options.printDockerCommand) {
    console.error(formatDockerCommand(dockerArgs));
  }

  await runDockerCommand(dockerArgs);

  if (options.preflightOnly) {
    console.log(
      JSON.stringify(
        {
          authJsonPath: authPreflight.authJsonPath,
          containerAuthJsonPath: trustedLocalCodexContainerAuthJsonPath,
          containerCodexHome: trustedLocalCodexContainerHome,
          image: options.image,
          status: "trusted_local_preflight_passed"
        },
        null,
        2
      )
    );
  }
}

function parseDevboxWrapperOptions(args: string[]): DevboxWrapperOptions {
  const getRequiredValue = (flag: string): string => {
    const value = getOptionalValue(flag);

    if (!value) {
      throw new Error(`Missing required ${flag} <value> argument.`);
    }

    return value;
  };
  const getOptionalValue = (flag: string): string | undefined => {
    const index = args.findIndex((argument) => argument === flag);
    return index === -1 || !args[index + 1] ? undefined : args[index + 1];
  };
  const hasFlag = (flag: string): boolean => args.includes(flag);
  const preflightOnly = hasFlag("--preflight-only");
  const providerFamily = getOptionalValue("--provider-family");

  if (providerFamily && providerFamily !== "openai") {
    throw new Error(
      `Trusted-local devbox runs currently support only provider-family openai, received ${providerFamily}.`
    );
  }

  return {
    benchmarkPackageRoot: getOptionalValue("--benchmark-package-root"),
    image: getRequiredValue("--image"),
    modelSnapshotId: getOptionalValue("--model-snapshot-id"),
    outputRoot: getOptionalValue("--output"),
    preflightOnly,
    printDockerCommand: hasFlag("--print-docker-command"),
    promptPackageRoot: getOptionalValue("--prompt-package-root"),
    providerFamily: providerFamily as "openai" | undefined,
    providerModel: getOptionalValue("--provider-model"),
    workspaceRoot: getOptionalValue("--workspace")
  };
}

function buildContainerShellCommands(options: {
  benchmarkPackageContainerRoot: string;
  modelSnapshotId?: string;
  outputContainerRoot: string | null;
  preflightOnly: boolean;
  promptPackageContainerRoot: string;
  providerFamily: "openai";
  providerModel?: string;
  workspaceContainerRoot: string | null;
}): string[] {
  const commands = [
    "set -eu",
    `test "$CODEX_HOME" = ${shellQuote(trustedLocalCodexContainerHome)}`,
    `test -r ${shellQuote(trustedLocalCodexContainerAuthJsonPath)}`,
    "codex login status"
  ];

  if (options.preflightOnly) {
    return commands;
  }

  const workerArgs = [
    "node",
    "apps/worker/dist/index.js",
    "run-problem9-attempt",
    "--benchmark-package-root",
    options.benchmarkPackageContainerRoot,
    "--prompt-package-root",
    options.promptPackageContainerRoot,
    "--workspace",
    options.workspaceContainerRoot!,
    "--output",
    options.outputContainerRoot!,
    "--provider-family",
    options.providerFamily,
    "--auth-mode",
    "trusted_local_user"
  ];

  if (options.providerModel) {
    workerArgs.push("--provider-model", options.providerModel);
  }

  if (options.modelSnapshotId) {
    workerArgs.push("--model-snapshot-id", options.modelSnapshotId);
  }

  commands.push(workerArgs.map((argument) => shellQuote(argument)).join(" "));

  return commands;
}

function buildBindMountArg(sourcePath: string, targetPath: string, readOnly: boolean): string {
  return `type=bind,src=${sourcePath},dst=${targetPath}${readOnly ? ",readonly" : ""}`;
}

function formatDockerCommand(args: string[]): string {
  const command = process.platform === "win32" ? "docker.exe" : "docker";

  return [command, ...args]
    .map((argument) =>
      process.platform === "win32" ? windowsDebugQuote(argument) : shellQuote(argument)
    )
    .join(" ");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function windowsDebugQuote(value: string): string {
  if (!/[\s"]/u.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

async function requireReadableDirectory(
  rawDirectoryPath: string | undefined,
  label: string
): Promise<string> {
  if (!rawDirectoryPath) {
    throw new Error(`Missing required ${label} argument.`);
  }
  const directoryPath = path.resolve(rawDirectoryPath);

  const stats = await stat(directoryPath).catch(() => null);

  if (!stats?.isDirectory()) {
    throw new Error(`${label} must be an existing directory: ${directoryPath}`);
  }

  await access(directoryPath, constants.R_OK);

  return directoryPath;
}

async function prepareWritableTarget(
  rawTargetPath: string | undefined,
  label: string
): Promise<string> {
  if (!rawTargetPath) {
    throw new Error(`Missing required ${label} argument.`);
  }
  const targetPath = path.resolve(rawTargetPath);

  assertNotFilesystemRoot(targetPath, label);
  const parentPath = path.dirname(targetPath);

  if (parentPath === path.parse(targetPath).root) {
    throw new Error(
      `${label} may not be a top-level directory because the trusted-local wrapper would need to mount the filesystem root read-write. Choose a dedicated nested directory instead.`
    );
  }

  await mkdir(parentPath, { recursive: true });

  return targetPath;
}

function assertNotFilesystemRoot(targetPath: string, label: string): void {
  if (targetPath === path.parse(targetPath).root) {
    throw new Error(`${label} must not be a filesystem root: ${targetPath}`);
  }
}

function assertNoHostPathOverlap(
  firstPath: string,
  secondPath: string,
  firstLabel: string,
  secondLabel: string
): void {
  const normalizedFirstPath = normalizeHostPath(firstPath);
  const normalizedSecondPath = normalizeHostPath(secondPath);

  if (
    normalizedFirstPath === normalizedSecondPath ||
    normalizedFirstPath.startsWith(`${normalizedSecondPath}${path.sep}`) ||
    normalizedSecondPath.startsWith(`${normalizedFirstPath}${path.sep}`)
  ) {
    throw new Error(
      `${firstLabel} overlaps ${secondLabel} on the host filesystem. Choose disjoint directories before launching the trusted-local wrapper.`
    );
  }
}

function normalizeHostPath(targetPath: string): string {
  const normalizedPath = path.normalize(targetPath);
  return process.platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
}

async function runDockerCommand(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.platform === "win32" ? "docker.exe" : "docker", args, {
      stdio: "inherit",
      windowsHide: true
    });

    child.once("error", reject);
    child.once("close", (exitCode) => {
      if ((exitCode ?? 1) === 0) {
        resolve();
        return;
      }

      reject(new Error(`docker run exited with code ${exitCode ?? 1}.`));
    });
  });
}
