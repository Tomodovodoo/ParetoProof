import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, "infra", "scripts", "verify-problem9-image-toolchains.mjs");

function parseDockerfileArgs() {
  const dockerfilePath = path.join(repoRoot, "apps", "worker", "Dockerfile");
  const dockerfileContents = fs.readFileSync(dockerfilePath, "utf8");
  const args = new Map();

  for (const [, name, value] of dockerfileContents.matchAll(/^ARG\s+([A-Z0-9_]+)=(.+)$/gm)) {
    args.set(name, value.trim());
  }

  return args;
}

function normalizeToolchainDirectory(toolchain) {
  return toolchain.replaceAll("/", "--").replaceAll(":", "---");
}

function makeFixtureRootfs() {
  const args = parseDockerfileArgs();
  const rootfs = fs.mkdtempSync(path.join(os.tmpdir(), "problem9-image-rootfs-"));

  fs.mkdirSync(path.join(rootfs, "opt", "elan", "toolchains", normalizeToolchainDirectory(args.get("LEAN422_TOOLCHAIN"))), { recursive: true });
  fs.mkdirSync(path.join(rootfs, "opt", "elan", "toolchains", normalizeToolchainDirectory(args.get("LEAN424_TOOLCHAIN"))), { recursive: true });
  fs.mkdirSync(path.join(rootfs, "usr", "local", "bin"), { recursive: true });
  fs.mkdirSync(path.join(rootfs, "usr", "bin"), { recursive: true });
  fs.mkdirSync(path.join(rootfs, "app", "benchmarks", "firstproof", "problem9"), { recursive: true });
  fs.mkdirSync(path.join(rootfs, "app", "apps", "worker", "dist"), { recursive: true });
  fs.mkdirSync(path.join(rootfs, "app", "packages", "shared", "dist"), { recursive: true });
  fs.mkdirSync(path.join(rootfs, "usr", "lib", "node_modules", "@openai", "codex"), { recursive: true });
  fs.mkdirSync(
    path.join(
      rootfs,
      "opt",
      "lean-lsp-mcp",
      "lib",
      "python3.11",
      "site-packages",
      `lean_lsp_mcp-${args.get("LEAN_LSP_MCP_VERSION")}.dist-info`,
    ),
    { recursive: true },
  );

  fs.writeFileSync(path.join(rootfs, "usr", "local", "bin", "node"), "");
  fs.writeFileSync(path.join(rootfs, "usr", "local", "bin", "bun"), "");
  fs.writeFileSync(path.join(rootfs, "usr", "bin", "python3.11"), "");
  fs.writeFileSync(path.join(rootfs, "app", "benchmarks", "firstproof", "problem9", "benchmark-package.json"), "{}");
  fs.writeFileSync(path.join(rootfs, "app", "apps", "worker", "dist", "index.js"), "");
  fs.writeFileSync(path.join(rootfs, "app", "packages", "shared", "dist", "index.js"), "");
  fs.writeFileSync(
    path.join(rootfs, "usr", "lib", "node_modules", "@openai", "codex", "package.json"),
    JSON.stringify({ version: args.get("CODEX_CLI_VERSION") }),
  );
  fs.writeFileSync(
    path.join(
      rootfs,
      "opt",
      "lean-lsp-mcp",
      "lib",
      "python3.11",
      "site-packages",
      `lean_lsp_mcp-${args.get("LEAN_LSP_MCP_VERSION")}.dist-info`,
      "METADATA",
    ),
    "Name: lean-lsp-mcp",
  );

  return { rootfs, args };
}

function runVerifier(target, rootfs, extraArgs = []) {
  return spawnSync("node", [scriptPath, "--target", target, "--rootfs", rootfs, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

test("verifier accepts a matching problem9-devbox rootfs fixture", () => {
  const { rootfs } = makeFixtureRootfs();
  const result = runVerifier("problem9-devbox", rootfs);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Problem 9 image verification passed for problem9-devbox/);
});

test("verifier fails closed on a synthetic Codex version mismatch", () => {
  const { rootfs } = makeFixtureRootfs();
  const result = runVerifier("problem9-devbox", rootfs, ["--expected-codex-cli-version", "0.0.0"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /expected version 0\.0\.0 but found/);
});
