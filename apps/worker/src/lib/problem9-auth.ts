import { access, constants } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export const trustedLocalCodexContainerHome = "/run/paretoproof/codex-home";
export const trustedLocalCodexContainerAuthJsonPath = `${trustedLocalCodexContainerHome}/auth.json`;

export const problem9AuthModes = [
  "trusted_local_user",
  "machine_api_key",
  "machine_oauth",
  "local_stub"
] as const;

export type Problem9AuthMode = (typeof problem9AuthModes)[number];

export type Problem9AuthPreflight =
  | {
      authJsonPath: string;
      authMode: "trusted_local_user";
      codexHome: string;
    }
  | {
      authMode: "machine_api_key";
      envKeyName: "CODEX_API_KEY";
    }
  | {
      authMode: "local_stub";
    };

export async function preflightProblem9AuthMode(
  authMode: Problem9AuthMode
): Promise<Problem9AuthPreflight> {
  switch (authMode) {
    case "trusted_local_user":
      return preflightTrustedLocalUser();
    case "machine_api_key":
      return preflightMachineApiKey();
    case "local_stub":
      return { authMode };
    case "machine_oauth":
      throw new Error("Auth mode machine_oauth is not implemented for run-problem9-attempt.");
  }
}

async function preflightTrustedLocalUser(): Promise<Problem9AuthPreflight> {
  const codexHome = resolveCodexHome();
  const authJsonPath = path.join(codexHome, "auth.json");

  await assertReadableFile(authJsonPath, "Trusted-local Codex auth.json is missing or unreadable.");

  const loginStatusResult = await runCommand("codex", ["login", "status"], {
    env: {
      ...process.env,
      CODEX_HOME: codexHome
    }
  });

  if (loginStatusResult.exitCode !== 0) {
    throw new Error(
      [
        "Trusted-local Codex auth preflight failed.",
        `Checked auth file: ${authJsonPath}`,
        loginStatusResult.stderr || loginStatusResult.stdout || "codex login status failed."
      ].join(" ")
    );
  }

  return {
    authJsonPath,
    authMode: "trusted_local_user",
    codexHome
  };
}

async function preflightMachineApiKey(): Promise<Problem9AuthPreflight> {
  if (!process.env.CODEX_API_KEY) {
    throw new Error(
      "Auth mode machine_api_key requires CODEX_API_KEY and does not fall back to trusted-local auth."
    );
  }

  return {
    authMode: "machine_api_key",
    envKeyName: "CODEX_API_KEY"
  };
}

function resolveCodexHome(): string {
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

async function assertReadableFile(filePath: string, failureMessage: string): Promise<void> {
  try {
    await access(filePath, constants.R_OK);
  } catch {
    throw new Error(`${failureMessage} Expected readable file at ${filePath}.`);
  }
}

async function runCommand(
  command: string,
  args: string[],
  options: {
    env: NodeJS.ProcessEnv;
  }
): Promise<{
  exitCode: number;
  stderr: string;
  stdout: string;
}> {
  return new Promise((resolve, reject) => {
    const child =
      process.platform === "win32"
        ? spawn(
            options.env.ComSpec ?? "cmd.exe",
            ["/d", "/s", "/c", buildWindowsShellCommand(command, args)],
            {
              env: options.env,
              stdio: ["ignore", "pipe", "pipe"],
              windowsHide: true
            }
          )
        : spawn(command, args, {
            env: options.env,
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true
          });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
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

function buildWindowsShellCommand(command: string, args: string[]): string {
  return [command, ...args].map((argument) => windowsQuote(argument)).join(" ");
}

function windowsQuote(value: string): string {
  if (!/[\s"]/u.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}
