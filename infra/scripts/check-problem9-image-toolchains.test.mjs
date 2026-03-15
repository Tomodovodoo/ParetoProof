import test from "node:test";
import assert from "node:assert/strict";

import {
  getTargetChecks,
  mergeExpectedVersions,
  readDeclaredVersionsFromText,
  validateCommandResult,
} from "./check-problem9-image-toolchains.mjs";

const dockerfileFixture = `
ARG BUN_IMAGE=oven/bun:1.3.10
ARG CODEX_CLI_VERSION=0.114.0
ARG LEAN_LSP_MCP_VERSION=0.24.0
ARG LEAN422_TOOLCHAIN=leanprover/lean4:v4.22.0
ARG LEAN424_TOOLCHAIN=leanprover/lean4:v4.24.0
`;

const packageJsonFixture = JSON.stringify({
  packageManager: "bun@1.3.10",
});

test("readDeclaredVersionsFromText resolves the Dockerfile and package-manager versions", () => {
  assert.deepEqual(readDeclaredVersionsFromText(dockerfileFixture, packageJsonFixture), {
    bunVersion: "1.3.10",
    codexCliVersion: "0.114.0",
    lean422Toolchain: "leanprover/lean4:v4.22.0",
    lean424Toolchain: "leanprover/lean4:v4.24.0",
    leanLspMcpVersion: "0.24.0",
  });
});

test("readDeclaredVersionsFromText rejects a Bun version drift", () => {
  assert.throws(
    () =>
      readDeclaredVersionsFromText(
        dockerfileFixture.replace("oven/bun:1.3.10", "oven/bun:1.3.9"),
        packageJsonFixture
      ),
    /Dockerfile Bun image version 1\.3\.9 does not match packageManager bun@1\.3\.10/
  );
});

test("problem9-devbox checks include the declared toolchain versions", () => {
  const checks = getTargetChecks("problem9-devbox", mergeExpectedVersions(readDeclaredVersionsFromText(dockerfileFixture, packageJsonFixture), {}));
  const codexCheck = checks.find((check) => check.description.includes("Codex CLI version"));
  const leanLspCheck = checks.find((check) => check.description.includes("lean-lsp-mcp version"));

  assert.ok(codexCheck);
  assert.deepEqual(codexCheck.expectStdoutIncludes, ["0.114.0"]);
  assert.ok(leanLspCheck);
  assert.deepEqual(leanLspCheck.expectStdoutIncludes, ["Version: 0.24.0"]);
});

test("validateCommandResult fails on a synthetic Codex version mismatch", () => {
  const checks = getTargetChecks("problem9-devbox", mergeExpectedVersions(readDeclaredVersionsFromText(dockerfileFixture, packageJsonFixture), {}));
  const codexCheck = checks.find((check) => check.description.includes("Codex CLI version"));

  assert.ok(codexCheck);
  assert.throws(
    () =>
      validateCommandResult(codexCheck, {
        status: 0,
        stdout: "0.113.0\n",
        stderr: "",
      }),
    /expected stdout to include "0\.114\.0"/
  );
});
