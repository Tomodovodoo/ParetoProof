#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "..", "..");
const dockerfilePath = path.join(repoRoot, "apps", "worker", "Dockerfile");
const packageJsonPath = path.join(repoRoot, "package.json");
const imagePolicyPath = path.join(repoRoot, "infra", "docker", "problem9-image-policy.json");
const TOOLCHAIN_OVERRIDE_KEYS = new Set([
  "bunVersion",
  "codexCliVersion",
  "lean422Toolchain",
  "lean424Toolchain",
  "leanLspMcpVersion",
]);
const SUPPORTED_TARGETS = new Set(["problem9-execution", "problem9-devbox", "paretoproof-worker"]);

const usage = `Usage: node infra/scripts/check-problem9-image-toolchains.mjs --target <problem9-execution|problem9-devbox|paretoproof-worker> [options]

Options:
  --build              Build the selected docker target into the inspected image reference first.
  --image <reference>  Inspect an existing local image reference instead of the canonical local tag.
  --set <key=value>    Override one declared version for a synthetic mismatch check. Repeatable.
  --help               Show this help output.
`;

function fail(message) {
  throw new Error(`Problem 9 image toolchain check failed: ${message}`);
}

function readRepoText(filePath) {
  return readFileSync(filePath, "utf8");
}

function extractRequiredMatch(source, pattern, label) {
  const match = source.match(pattern);
  if (!match?.[1]) {
    fail(`could not resolve ${label}`);
  }

  return match[1].trim();
}

export function readDeclaredVersionsFromText(dockerfileText, packageJsonText) {
  const packageJson = JSON.parse(packageJsonText);
  const bunVersion = extractRequiredMatch(packageJson.packageManager ?? "", /^bun@(.+)$/m, "root Bun version");
  const declaredBunVersion = extractRequiredMatch(dockerfileText, /^ARG BUN_IMAGE=.+:(.+)$/m, "Dockerfile Bun image version");

  if (declaredBunVersion !== bunVersion) {
    fail(`Dockerfile Bun image version ${declaredBunVersion} does not match packageManager bun@${bunVersion}`);
  }

  return {
    bunVersion,
    codexCliVersion: extractRequiredMatch(dockerfileText, /^ARG CODEX_CLI_VERSION=(.+)$/m, "Dockerfile Codex CLI version"),
    lean422Toolchain: extractRequiredMatch(dockerfileText, /^ARG LEAN422_TOOLCHAIN=(.+)$/m, "Dockerfile Lean 4.22 toolchain"),
    lean424Toolchain: extractRequiredMatch(dockerfileText, /^ARG LEAN424_TOOLCHAIN=(.+)$/m, "Dockerfile Lean 4.24 toolchain"),
    leanLspMcpVersion: extractRequiredMatch(dockerfileText, /^ARG LEAN_LSP_MCP_VERSION=(.+)$/m, "Dockerfile lean-lsp-mcp version"),
  };
}

function readDeclaredVersions() {
  return readDeclaredVersionsFromText(readRepoText(dockerfilePath), readRepoText(packageJsonPath));
}

function readCanonicalLocalTags() {
  const policy = JSON.parse(readRepoText(imagePolicyPath));
  return new Map(policy.images.map((image) => [image.target, image.localTag]));
}

export function mergeExpectedVersions(declaredVersions, overrides) {
  const merged = { ...declaredVersions };

  for (const [key, value] of Object.entries(overrides)) {
    if (!TOOLCHAIN_OVERRIDE_KEYS.has(key)) {
      fail(`unsupported override key "${key}"`);
    }

    merged[key] = value;
  }

  return merged;
}

function createBaseChecks(expectedVersions) {
  return [
    {
      description: "Lean toolchain registry contains the declared Problem 9 toolchains",
      argv: ["sh", "-lc", "elan toolchain list"],
      expectStdoutIncludes: [expectedVersions.lean422Toolchain, expectedVersions.lean424Toolchain],
    },
    {
      description: "Benchmark package source is present in the image",
      argv: ["sh", "-lc", "test -f /app/benchmarks/firstproof/problem9/benchmark-package.json"],
    },
    {
      description: "Worker CLI help runs from the built dist entrypoint",
      argv: ["node", "/app/apps/worker/dist/index.js", "--help"],
      expectStderrIncludes: ["Usage:"],
    },
  ];
}

export function getTargetChecks(target, expectedVersions) {
  if (!SUPPORTED_TARGETS.has(target)) {
    fail(`unsupported target "${target}"`);
  }

  const baseChecks = createBaseChecks(expectedVersions);
  if (target === "problem9-devbox") {
    return [
      ...baseChecks,
      {
        description: "Bun version matches the declared repo toolchain",
        argv: ["bun", "--version"],
        expectStdoutIncludes: [expectedVersions.bunVersion],
      },
      {
        description: "Codex CLI version matches the declared devbox toolchain",
        argv: ["codex", "--version"],
        expectStdoutIncludes: [expectedVersions.codexCliVersion],
      },
      {
        description: "lean-lsp-mcp version matches the declared devbox toolchain",
        argv: ["python3.11", "-m", "pip", "show", "lean-lsp-mcp"],
        expectStdoutIncludes: [`Version: ${expectedVersions.leanLspMcpVersion}`],
      },
      {
        description: "Trusted-local worker source tree is present for devbox workflows",
        argv: ["sh", "-lc", "test -f /app/apps/worker/src/index.ts"],
      },
    ];
  }

  return baseChecks;
}

function formatCommand(argv) {
  return argv.map((part) => (part.includes(" ") ? `"${part}"` : part)).join(" ");
}

export function validateCommandResult(check, result) {
  if (result.status !== 0) {
    fail(
      `${check.description} failed with exit code ${result.status} while running ${formatCommand(check.argv)}\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`
    );
  }

  for (const expected of check.expectStdoutIncludes ?? []) {
    if (!(result.stdout ?? "").includes(expected)) {
      fail(
        `${check.description} expected stdout to include "${expected}" while running ${formatCommand(check.argv)}\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`
      );
    }
  }

  for (const expected of check.expectStderrIncludes ?? []) {
    if (!(result.stderr ?? "").includes(expected)) {
      fail(
        `${check.description} expected stderr to include "${expected}" while running ${formatCommand(check.argv)}\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`
      );
    }
  }
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.error) {
    fail(`failed to start ${command}: ${result.error.message}`);
  }

  return result;
}

function buildTargetImage(target, imageReference) {
  console.log(`Building ${target} into ${imageReference} for toolchain verification...`);
  const result = runCommand("docker", [
    "buildx",
    "build",
    "--file",
    "apps/worker/Dockerfile",
    "--target",
    target,
    "--tag",
    imageReference,
    "--load",
    ".",
  ]);

  if (result.status !== 0) {
    fail(`docker buildx build failed for ${target}\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`);
  }
}

function inspectImageTarget(target, imageReference, expectedVersions) {
  const checks = getTargetChecks(target, expectedVersions);
  for (const check of checks) {
    console.log(`Checking ${target}: ${check.description}`);
    const result = runCommand("docker", ["run", "--rm", imageReference, ...check.argv]);
    validateCommandResult(check, result);
  }
}

function parseArguments(argv) {
  const parsed = {
    build: false,
    imageReference: null,
    overrides: {},
    target: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--target") {
      parsed.target = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--image") {
      parsed.imageReference = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--set") {
      const pair = argv[index + 1] ?? "";
      index += 1;
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex <= 0) {
        fail(`invalid --set value "${pair}", expected key=value`);
      }

      parsed.overrides[pair.slice(0, separatorIndex)] = pair.slice(separatorIndex + 1);
      continue;
    }

    if (arg === "--build") {
      parsed.build = true;
      continue;
    }

    if (arg === "--help") {
      console.log(usage);
      process.exit(0);
    }

    fail(`unknown argument "${arg}"\n\n${usage}`);
  }

  if (!parsed.target) {
    fail(`missing required --target argument\n\n${usage}`);
  }

  if (!SUPPORTED_TARGETS.has(parsed.target)) {
    fail(`unsupported target "${parsed.target}"\n\n${usage}`);
  }

  return parsed;
}

export function resolveTargetImageReference(target, imageReference) {
  const localTags = readCanonicalLocalTags();
  const resolvedReference = imageReference ?? localTags.get(target);

  if (!resolvedReference) {
    fail(`no canonical local tag found for target "${target}"`);
  }

  return resolvedReference;
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  const imageReference = resolveTargetImageReference(parsed.target, parsed.imageReference);
  const expectedVersions = mergeExpectedVersions(readDeclaredVersions(), parsed.overrides);

  if (parsed.build) {
    buildTargetImage(parsed.target, imageReference);
  }

  inspectImageTarget(parsed.target, imageReference, expectedVersions);
  console.log(`Problem 9 image toolchain check passed for ${parsed.target} (${imageReference}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
