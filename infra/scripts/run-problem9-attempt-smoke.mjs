#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const usage = `Usage: node infra/scripts/run-problem9-attempt-smoke.mjs [options]

Options:
  --image <image-ref>  Docker image to use for the smoke run. Default: paretoproof-problem9-devbox:local
  --help               Show this help output.
`;

const containerHomeRoot = "/smoke/container-home";
const containerCacheRoot = `${containerHomeRoot}/.cache`;
const containerTmpRoot = `${containerHomeRoot}/tmp`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    image: "paretoproof-problem9-devbox:local",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help") {
      console.log(usage);
      process.exit(0);
    }

    if (arg === "--image") {
      options.image = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    fail(`Unknown argument: ${arg}\n\n${usage}`);
  }

  if (!options.image) {
    fail(`Missing required image value.\n\n${usage}`);
  }

  return options;
}

function runWorkerCommand(image, hostRoot, args) {
  const dockerArgs = [
    "run",
    "--rm",
    "--workdir",
    "/app",
    "--volume",
    `${hostRoot}:/smoke`,
    "--env",
    `HOME=${containerHomeRoot}`,
    "--env",
    `XDG_CACHE_HOME=${containerCacheRoot}`,
    "--env",
    `TMPDIR=${containerTmpRoot}`,
  ];

  const command = buildContainerCommand(args);
  const result = spawnSync(
    "docker",
    [...dockerArgs, "--entrypoint", "sh", image, "-lc", command],
    {
      encoding: "utf8",
    }
  );

  if (result.error) {
    fail(`Failed to start docker for Problem 9 attempt smoke: ${result.error.message}`);
  }

  if ((result.status ?? 1) !== 0) {
    fail(
      `Problem 9 attempt smoke command failed.\nCommand: ${args.join(" ")}\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`
    );
  }

  return JSON.parse(result.stdout ?? "{}");
}

function buildContainerCommand(args) {
  const workerCommand = ["node", "/app/apps/worker/dist/index.js", ...args]
    .map(shellQuote)
    .join(" ");

  if (typeof process.getuid === "function" && typeof process.getgid === "function") {
    const owner = `${process.getuid()}:${process.getgid()}`;
    return `status=0; ${workerCommand} || status=$?; chown -R ${shellQuote(owner)} /smoke 2>/dev/null || true; exit "$status"`;
  }

  return workerCommand;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function containerPath(...segments) {
  return path.posix.join("/smoke", ...segments);
}

function hostPath(root, ...segments) {
  return path.join(root, ...segments);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-attempt-smoke-"));

  try {
    console.log(`Running Problem 9 attempt smoke in ${options.image}`);
    await Promise.all([
      mkdir(hostPath(tempRoot, "container-home"), { recursive: true }),
      mkdir(hostPath(tempRoot, "container-home", ".cache"), { recursive: true }),
      mkdir(hostPath(tempRoot, "container-home", "tmp"), { recursive: true }),
    ]);

    const packagePayload = runWorkerCommand(options.image, tempRoot, [
      "materialize-problem9-package",
      "--output",
      containerPath("benchmark-package"),
    ]);
    const benchmarkPackageRoot = packagePayload.outputRoot;

    runWorkerCommand(options.image, tempRoot, [
      "materialize-problem9-prompt-package",
      "--output",
      containerPath("prompt-package"),
      "--benchmark-package-root",
      benchmarkPackageRoot,
      "--run-id",
      "run-smoke-001",
      "--attempt-id",
      "attempt-smoke-001",
      "--lane-id",
      "lean422_exact",
      "--run-mode",
      "bounded_agentic_attempt",
      "--tool-profile",
      "workspace_edit_limited",
      "--provider-family",
      "openai",
      "--auth-mode",
      "local_stub",
      "--model-config-id",
      "local_stub/problem9_fixture.v1",
      "--harness-revision",
      "smoke-harness-rev",
    ]);

    const promptPackageRoot = containerPath("prompt-package");
    const passPayload = runWorkerCommand(options.image, tempRoot, [
      "run-problem9-attempt",
      "--benchmark-package-root",
      benchmarkPackageRoot,
      "--prompt-package-root",
      promptPackageRoot,
      "--workspace",
      containerPath("attempt-pass-workspace"),
      "--output",
      containerPath("attempt-pass-output"),
      "--auth-mode",
      "local_stub",
      "--stub-scenario",
      "exact_canonical",
    ]);

    assert.equal(passPayload.result, "pass", `Expected pass payload to pass, received: ${JSON.stringify(passPayload)}`);
    assert.equal(
      passPayload.stopReason,
      "verification_passed",
      `Expected pass payload stopReason to be verification_passed, received: ${JSON.stringify(passPayload)}`
    );

    const passVerdict = JSON.parse(
      await readFile(hostPath(tempRoot, "attempt-pass-output", "problem9-run-bundle", "verification", "verdict.json"), "utf8")
    );
    assert.equal(passVerdict.result, "pass");
    assert.equal(passVerdict.semanticEquality, "matched");
    assert.equal(passVerdict.axiomCheck, "passed");

    const failPayload = runWorkerCommand(options.image, tempRoot, [
      "run-problem9-attempt",
      "--benchmark-package-root",
      benchmarkPackageRoot,
      "--prompt-package-root",
      promptPackageRoot,
      "--workspace",
      containerPath("attempt-fail-workspace"),
      "--output",
      containerPath("attempt-fail-output"),
      "--auth-mode",
      "local_stub",
      "--stub-scenario",
      "compile_failure",
    ]);

    assert.equal(failPayload.result, "fail", `Expected fail payload to fail, received: ${JSON.stringify(failPayload)}`);
    assert.equal(
      failPayload.stopReason,
      "compile_failed",
      `Expected fail payload stopReason to be compile_failed, received: ${JSON.stringify(failPayload)}`
    );

    const failVerdict = JSON.parse(
      await readFile(hostPath(tempRoot, "attempt-fail-output", "problem9-run-bundle", "verification", "verdict.json"), "utf8")
    );
    assert.equal(failVerdict.result, "fail");
    assert.equal(failVerdict.diagnosticGate, "failed");
    assert.equal(failVerdict.semanticEquality, "not_evaluated");
    assert.equal(failVerdict.primaryFailure.failureCode, "compile_failed");

    console.log(
      JSON.stringify(
        {
          image: options.image,
          pass: {
            result: passPayload.result,
            stopReason: passPayload.stopReason,
          },
          fail: {
            result: failPayload.result,
            stopReason: failPayload.stopReason,
          },
        },
        null,
        2
      )
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
