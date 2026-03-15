#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "..", "..");
const dockerfilePath = path.join(repoRoot, "apps", "worker", "Dockerfile");
const imagePolicyPath = path.join(repoRoot, "infra", "docker", "problem9-image-policy.json");

const usage = `Usage: node infra/scripts/verify-problem9-image-toolchains.mjs --target <problem9-execution|problem9-devbox> [options]

Options:
  --image <image-ref>                      Override the image reference to inspect.
  --rootfs <directory>                     Verify an exported rootfs directory instead of a runnable image.
  --expected-lean422-toolchain <value>    Override the expected Lean 4.22 toolchain.
  --expected-lean424-toolchain <value>    Override the expected Lean 4.24 toolchain.
  --expected-codex-cli-version <value>    Override the expected Codex CLI version.
  --expected-lean-lsp-mcp-version <value> Override the expected lean-lsp-mcp version.
  --expected-bun-version <value>          Override the expected Bun version.
  --help                                  Show this help output.
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    image: null,
    rootfs: null,
    target: null,
    expectedLean422Toolchain: null,
    expectedLean424Toolchain: null,
    expectedCodexCliVersion: null,
    expectedLeanLspMcpVersion: null,
    expectedBunVersion: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help") {
      console.log(usage);
      process.exit(0);
    }

    if (arg === "--target") {
      options.target = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--image") {
      options.image = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--rootfs") {
      options.rootfs = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--expected-lean422-toolchain") {
      options.expectedLean422Toolchain = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--expected-lean424-toolchain") {
      options.expectedLean424Toolchain = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--expected-codex-cli-version") {
      options.expectedCodexCliVersion = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--expected-lean-lsp-mcp-version") {
      options.expectedLeanLspMcpVersion = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--expected-bun-version") {
      options.expectedBunVersion = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    fail(`Unknown argument: ${arg}\n\n${usage}`);
  }

  if (!options.target) {
    fail(`Missing required --target argument.\n\n${usage}`);
  }

  if (!["problem9-execution", "problem9-devbox"].includes(options.target)) {
    fail(`Unsupported target "${options.target}". Expected one of: problem9-execution, problem9-devbox.`);
  }

  if (options.image && options.rootfs) {
    fail(`Pass either --image or --rootfs, not both.\n\n${usage}`);
  }

  return options;
}

function parseDockerfileArgs(dockerfileContents) {
  const args = new Map();
  const matches = dockerfileContents.matchAll(/^ARG\s+([A-Z0-9_]+)=(.+)$/gm);

  for (const [, name, value] of matches) {
    args.set(name, value.trim());
  }

  return args;
}

function extractTagVersion(imageReference) {
  const tagMatch = imageReference.match(/:([^:@]+)$/);

  if (!tagMatch) {
    fail(`Could not derive a version tag from image reference "${imageReference}".`);
  }

  return tagMatch[1];
}

function extractLeadingMajorVersion(tagValue) {
  const match = tagValue.match(/\d+/);

  if (!match) {
    fail(`Could not derive a major version from tag value "${tagValue}".`);
  }

  return match[0];
}

function extractFirstSemver(text) {
  const match = text.match(/\d+\.\d+\.\d+/);
  return match ? match[0] : null;
}

function normalizeToolchainDirectory(toolchain) {
  return toolchain.replaceAll("/", "--").replaceAll(":", "---");
}

function rootfsPath(basePath, ...segments) {
  return path.join(basePath, ...segments);
}

function verifyRootfsExists(basePath, label, ...segments) {
  const targetPath = rootfsPath(basePath, ...segments);

  if (!existsSync(targetPath)) {
    fail(`${label} expected ${targetPath} to exist.`);
  }

  console.log(`Verified ${label}: ${targetPath}`);
}

function verifyRootfsJsonVersion(basePath, label, relativePath, expectedVersion) {
  const absolutePath = rootfsPath(basePath, ...relativePath);

  if (!existsSync(absolutePath)) {
    fail(`${label} expected ${absolutePath} to exist.`);
  }

  const parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
  if (parsed.version !== expectedVersion) {
    fail(`${label} expected version ${expectedVersion} but found ${parsed.version}.`);
  }

  console.log(`Verified ${label}: ${parsed.version}`);
}

function verifyRootfsPackage(basePath, label, relativePath, expectedVersion = null) {
  const absolutePath = rootfsPath(basePath, ...relativePath);

  if (!existsSync(absolutePath)) {
    fail(`${label} expected ${absolutePath} to exist.`);
  }

  if (expectedVersion === null) {
    console.log(`Verified ${label}: ${absolutePath}`);
    return;
  }

  const parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
  if (parsed.version !== expectedVersion) {
    fail(`${label} expected version ${expectedVersion} but found ${parsed.version}.`);
  }

  console.log(`Verified ${label}: ${parsed.version}`);
}

function runDocker(image, entrypoint, args) {
  const result = spawnSync("docker", ["run", "--rm", "--entrypoint", entrypoint, image, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ?? null,
  };
}

function assertCommandSuccess(result, label) {
  if (result.error) {
    fail(`Failed to start docker for ${label}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(`${label} failed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
}

function verifyShellContains(image, label, script, expectedText) {
  const result = runDocker(image, "sh", ["-lc", script]);
  assertCommandSuccess(result, label);

  if (!result.stdout.includes(expectedText)) {
    fail(`${label} expected to find "${expectedText}" but got:\n${result.stdout}`);
  }

  console.log(`Verified ${label}: ${expectedText}`);
}

function verifyFileExists(image, label, filePath) {
  const result = runDocker(image, "sh", ["-lc", `test -f ${JSON.stringify(filePath)}`]);
  assertCommandSuccess(result, label);
  console.log(`Verified ${label}: ${filePath}`);
}

function verifySemverCommand(image, label, entrypoint, args, expectedVersion) {
  const result = runDocker(image, entrypoint, args);
  assertCommandSuccess(result, label);

  const actualVersion = extractFirstSemver(`${result.stdout}\n${result.stderr}`);
  if (!actualVersion) {
    fail(`${label} did not print a semantic version.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  if (actualVersion !== expectedVersion) {
    fail(`${label} expected version ${expectedVersion} but found ${actualVersion}.`);
  }

  console.log(`Verified ${label}: ${actualVersion}`);
}

function verifyPrefixCommand(image, label, entrypoint, args, expectedPrefix) {
  const result = runDocker(image, entrypoint, args);
  assertCommandSuccess(result, label);

  const output = `${result.stdout}\n${result.stderr}`.trim();
  if (!output.startsWith(expectedPrefix)) {
    fail(`${label} expected output starting with "${expectedPrefix}" but got:\n${output}`);
  }

  console.log(`Verified ${label}: ${output}`);
}

const options = parseArgs(process.argv.slice(2));
const dockerfileArgs = parseDockerfileArgs(readFileSync(dockerfilePath, "utf8"));
const imagePolicy = JSON.parse(readFileSync(imagePolicyPath, "utf8"));
const imagePolicyEntry = imagePolicy.images.find((image) => image.target === options.target);

if (!imagePolicyEntry) {
  fail(`No image policy entry found for target ${options.target}.`);
}

const expectedLean422Toolchain = options.expectedLean422Toolchain ?? dockerfileArgs.get("LEAN422_TOOLCHAIN");
const expectedLean424Toolchain = options.expectedLean424Toolchain ?? dockerfileArgs.get("LEAN424_TOOLCHAIN");
const expectedCodexCliVersion = options.expectedCodexCliVersion ?? dockerfileArgs.get("CODEX_CLI_VERSION");
const expectedLeanLspMcpVersion = options.expectedLeanLspMcpVersion ?? dockerfileArgs.get("LEAN_LSP_MCP_VERSION");
const expectedBunVersion = options.expectedBunVersion ?? extractTagVersion(dockerfileArgs.get("BUN_IMAGE"));
const expectedNodeMajorPrefix = `v${extractLeadingMajorVersion(extractTagVersion(dockerfileArgs.get("NODE_IMAGE")))}.`;
const image = options.image ?? imagePolicyEntry.localTag;

if (options.rootfs) {
  const rootfs = path.resolve(repoRoot, options.rootfs);
  console.log(`Verifying ${options.target} rootfs: ${rootfs}`);

  verifyRootfsExists(rootfs, "Lean 4.22 toolchain", "opt", "elan", "toolchains", normalizeToolchainDirectory(expectedLean422Toolchain));
  verifyRootfsExists(rootfs, "Lean 4.24 toolchain", "opt", "elan", "toolchains", normalizeToolchainDirectory(expectedLean424Toolchain));
  verifyRootfsExists(rootfs, "Lean command", "opt", "elan", "bin", "lean");
  verifyRootfsExists(rootfs, "Node.js runtime", "usr", "local", "bin", "node");
  verifyRootfsExists(rootfs, "benchmark package manifest", "app", "benchmarks", "firstproof", "problem9", "benchmark-package.json");
  verifyRootfsExists(rootfs, "worker runtime entry", "app", "apps", "worker", "dist", "index.js");
  verifyRootfsExists(rootfs, "shared runtime entry", "app", "packages", "shared", "dist", "index.js");
  verifyRootfsPackage(rootfs, "worker runtime workspace link", ["app", "apps", "worker", "node_modules", "@paretoproof", "shared", "package.json"]);
  verifyRootfsPackage(rootfs, "worker runtime zod dependency", ["app", "apps", "worker", "node_modules", "zod", "package.json"], "3.25.76");
  verifyRootfsPackage(rootfs, "shared runtime zod dependency", ["app", "packages", "shared", "node_modules", "zod", "package.json"], "3.25.76");

  if (options.target === "problem9-devbox") {
    verifyRootfsExists(rootfs, "Bun runtime", "usr", "local", "bin", "bun");
    verifyRootfsExists(rootfs, "Codex CLI command", "usr", "local", "bin", "codex");
    verifyRootfsExists(rootfs, "lean-lsp-mcp command", "usr", "local", "bin", "lean-lsp-mcp");
    verifyRootfsExists(rootfs, "Python runtime", "usr", "bin", "python3.11");
    verifyRootfsJsonVersion(
      rootfs,
      "Codex CLI",
      ["usr", "lib", "node_modules", "@openai", "codex", "package.json"],
      expectedCodexCliVersion,
    );
    verifyRootfsExists(
      rootfs,
      "lean-lsp-mcp dist-info",
      "opt",
      "lean-lsp-mcp",
      "lib",
      "python3.11",
      "site-packages",
      `lean_lsp_mcp-${expectedLeanLspMcpVersion}.dist-info`,
      "METADATA",
    );
  }
} else {
  console.log(`Verifying ${options.target} image: ${image}`);

  verifyShellContains(image, "Lean 4.22 toolchain", "elan toolchain list", expectedLean422Toolchain);
  verifyShellContains(image, "Lean 4.24 toolchain", "elan toolchain list", expectedLean424Toolchain);
  verifyShellContains(image, "Lean command", "command -v lean", "/opt/elan/bin/lean");
  verifyPrefixCommand(image, "Node.js runtime", "node", ["--version"], expectedNodeMajorPrefix);
  verifyFileExists(image, "benchmark package manifest", "/app/benchmarks/firstproof/problem9/benchmark-package.json");
  verifyFileExists(image, "worker runtime entry", "/app/apps/worker/dist/index.js");
  verifyFileExists(image, "shared runtime entry", "/app/packages/shared/dist/index.js");
  verifyFileExists(image, "worker runtime workspace link", "/app/apps/worker/node_modules/@paretoproof/shared/package.json");
  verifyFileExists(image, "worker runtime zod dependency", "/app/apps/worker/node_modules/zod/package.json");
  verifyFileExists(image, "shared runtime zod dependency", "/app/packages/shared/node_modules/zod/package.json");

  if (options.target === "problem9-devbox") {
    verifySemverCommand(image, "Bun runtime", "bun", ["--version"], expectedBunVersion);
    verifyShellContains(image, "Codex CLI command", "command -v codex", "/usr/local/bin/codex");
    verifySemverCommand(image, "Codex CLI", "codex", ["--version"], expectedCodexCliVersion);
    verifyShellContains(image, "lean-lsp-mcp command", "command -v lean-lsp-mcp", "/usr/local/bin/lean-lsp-mcp");
    verifySemverCommand(
      image,
      "lean-lsp-mcp package",
      "/opt/lean-lsp-mcp/bin/python",
      ["-c", "import importlib.metadata; print(importlib.metadata.version('lean-lsp-mcp'))"],
      expectedLeanLspMcpVersion,
    );
    verifyPrefixCommand(image, "Python runtime", "python3.11", ["--version"], "Python 3.11");
  }
}

console.log(`Problem 9 image verification passed for ${options.target}.`);
