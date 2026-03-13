import { spawn } from "node:child_process";
import { access, constants, mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const canonicalCodexHome = "/run/paretoproof/codex-home";
const canonicalAuthJsonPath = `${canonicalCodexHome}/auth.json`;
const defaultImage = "paretoproof-problem9-devbox:local";
const benchmarkContainerRoot = "/work/benchmark-package";
const promptContainerRoot = "/work/prompt-package";
const workspaceContainerRoot = "/work/workspace";
const outputContainerRoot = "/work/output";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const hostCodexHome = resolveCodexHome();
  const hostAuthJsonPath = path.join(hostCodexHome, "auth.json");

  await assertReadableFile(
    hostAuthJsonPath,
    "Trusted-local host auth.json is missing or unreadable."
  );

  await assertCodexLoginStatus(hostCodexHome, hostAuthJsonPath);
  await runContainerPreflight(options.image, hostAuthJsonPath);

  if (options.preflightOnly) {
    console.log(
      JSON.stringify(
        {
          authJsonPath: canonicalAuthJsonPath,
          codexHome: canonicalCodexHome,
          image: options.image,
          mode: "trusted_local_user",
          preflight: "ok"
        },
        null,
        2
      )
    );
    return;
  }

  const benchmarkPackageArgument = requireValue(
    options.benchmarkPackageRoot,
    "--benchmark-package-root"
  );
  const promptPackageArgument = requireValue(options.promptPackageRoot, "--prompt-package-root");
  const workspaceArgument = requireValue(options.workspaceRoot, "--workspace");
  const outputArgument = requireValue(options.outputRoot, "--output");
  const providerModel = requireValue(options.providerModel, "--provider-model");
  const benchmarkPackageRoot = await assertDirectory(
    path.resolve(benchmarkPackageArgument),
    "Benchmark package root"
  );
  const promptPackageRoot = await assertDirectory(
    path.resolve(promptPackageArgument),
    "Prompt package root"
  );
  const workspaceRoot = path.resolve(workspaceArgument);
  const outputRoot = path.resolve(outputArgument);

  await mkdir(workspaceRoot, { recursive: true });
  await mkdir(outputRoot, { recursive: true });

  const attemptArgs = [
    "run",
    "--rm",
    "--mount",
    buildBindMount(hostAuthJsonPath, canonicalAuthJsonPath, true),
    "--mount",
    buildBindMount(benchmarkPackageRoot, benchmarkContainerRoot, true),
    "--mount",
    buildBindMount(promptPackageRoot, promptContainerRoot, true),
    "--mount",
    buildBindMount(workspaceRoot, workspaceContainerRoot, false),
    "--mount",
    buildBindMount(outputRoot, outputContainerRoot, false),
    "--env",
    `CODEX_HOME=${canonicalCodexHome}`,
    options.image,
    "node",
    "apps/worker/dist/index.js",
    "run-problem9-attempt",
    "--benchmark-package-root",
    benchmarkContainerRoot,
    "--prompt-package-root",
    promptContainerRoot,
    "--workspace",
    workspaceContainerRoot,
    "--output",
    outputContainerRoot,
    "--provider-family",
    "openai",
    "--auth-mode",
    "trusted_local_user",
    "--provider-model",
    providerModel
  ];

  if (options.modelSnapshotId) {
    attemptArgs.push("--model-snapshot-id", options.modelSnapshotId);
  }

  const execution = await runCommand("docker", attemptArgs, {
    cwd: process.cwd(),
    env: process.env
  });

  if (execution.exitCode !== 0) {
    throw new Error(execution.stderr || execution.stdout || "Trusted-local attempt launch failed.");
  }

  if (execution.stdout.trim()) {
    process.stdout.write(execution.stdout.trimEnd());
    process.stdout.write("\n");
  }
}

function parseArgs(args) {
  const hasFlag = (flag) => args.includes(flag);
  const getOptionalValue = (flag) => {
    const index = args.findIndex((argument) => argument === flag);
    return index === -1 || !args[index + 1] ? undefined : args[index + 1];
  };
  const getRequiredValue = (flag) => {
    const value = getOptionalValue(flag);

    if (!value) {
      throw new Error(`Missing required ${flag} <value> argument.`);
    }

    return value;
  };

  if (hasFlag("--help")) {
    console.error(
      [
        "Usage:",
        "  node infra/scripts/run-problem9-trusted-local-attempt.mjs --preflight-only [--image <image>]",
        "  node infra/scripts/run-problem9-trusted-local-attempt.mjs --benchmark-package-root <directory> --prompt-package-root <directory> --workspace <directory> --output <directory> --provider-model <model> [--model-snapshot-id <id>] [--image <image>]"
      ].join("\n")
    );
    process.exit(0);
  }

  return {
    benchmarkPackageRoot: getOptionalValue("--benchmark-package-root"),
    image: getOptionalValue("--image") ?? defaultImage,
    modelSnapshotId: getOptionalValue("--model-snapshot-id"),
    outputRoot: getOptionalValue("--output"),
    preflightOnly: hasFlag("--preflight-only"),
    promptPackageRoot: getOptionalValue("--prompt-package-root"),
    providerModel: getOptionalValue("--provider-model"),
    workspaceRoot: getOptionalValue("--workspace")
  };
}

function resolveCodexHome() {
  if (process.env.CODEX_HOME) {
    return process.env.CODEX_HOME;
  }

  if (process.platform === "win32") {
    const userProfile = process.env.USERPROFILE;

    if (!userProfile) {
      throw new Error("Could not resolve USERPROFILE for trusted-local Codex auth.");
    }

    return path.join(userProfile, ".codex");
  }

  return path.join(os.homedir(), ".codex");
}

async function runContainerPreflight(image, hostAuthJsonPath) {
  const preflight = await runCommand(
    "docker",
    [
      "run",
      "--rm",
      "--mount",
      buildBindMount(hostAuthJsonPath, canonicalAuthJsonPath, true),
      "--env",
      `CODEX_HOME=${canonicalCodexHome}`,
      image,
      "node",
      "apps/worker/dist/index.js",
      "preflight-problem9-auth",
      "--auth-mode",
      "trusted_local_user",
      "--expect-codex-home",
      canonicalCodexHome
    ],
    {
      cwd: process.cwd(),
      env: process.env
    }
  );

  if (preflight.exitCode !== 0) {
    throw new Error(
      [
        "Trusted-local in-container auth preflight failed.",
        preflight.stderr || preflight.stdout || "docker run preflight failed."
      ].join(" ")
    );
  }
}

function buildBindMount(sourcePath, targetPath, readOnly) {
  return `type=bind,src=${sourcePath},dst=${targetPath}${readOnly ? ",readonly" : ""}`;
}

function requireValue(value, flag) {
  if (!value) {
    throw new Error(`Missing required ${flag} <value> argument.`);
  }

  return value;
}

async function assertDirectory(directoryPath, label) {
  const stats = await stat(directoryPath).catch(() => null);

  if (!stats || !stats.isDirectory()) {
    throw new Error(`${label} must be an existing directory: ${directoryPath}`);
  }

  return directoryPath;
}

async function assertReadableFile(filePath, failureMessage) {
  try {
    await access(filePath, constants.R_OK);
  } catch {
    throw new Error(`${failureMessage} Expected readable file at ${filePath}.`);
  }
}

async function assertCodexLoginStatus(codexHome, authJsonPath) {
  const codexInvocation = resolveCodexInvocation(["login", "status"]);
  const result = await runCommand(codexInvocation.command, codexInvocation.args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CODEX_HOME: codexHome
    }
  });

  if (result.exitCode !== 0) {
    throw new Error(
      [
        "Trusted-local host auth preflight failed.",
        `Checked auth file: ${authJsonPath}`,
        result.stderr || result.stdout || "codex login status failed."
      ].join(" ")
    );
  }
}

function resolveCodexInvocation(args) {
  if (process.platform !== "win32") {
    return {
      args,
      command: "codex"
    };
  }

  if (!process.env.APPDATA) {
    return {
      args,
      command: "codex"
    };
  }

  return {
    args: [
      path.join(process.env.APPDATA, "npm", "node_modules", "@openai", "codex", "bin", "codex.js"),
      ...args
    ],
    command: process.execPath
  };
}

async function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stderr: stderr.trim(),
        stdout: stdout.trim()
      });
    });
  });
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
