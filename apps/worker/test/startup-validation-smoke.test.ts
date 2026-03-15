import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(workerRoot, "../..");

test("worker materializer startup stays env-free", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-startup-"));

  try {
    const outputRoot = path.join(tempRoot, "package-output");
    const result = runWorkerCli(["materialize-problem9-package", "--output", outputRoot], {});

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"outputRoot":/u);
    const payload = JSON.parse(result.stdout) as { outputRoot: string };
    const manifest = await readFile(path.join(payload.outputRoot, "benchmark-package.json"), "utf8");

    assert.match(manifest, /"packageId": "firstproof\/Problem9"/u);
    assert.equal(result.stderr, "");
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("worker hosted claim loop fails fast when startup env is missing", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-startup-"));

  try {
    const result = runWorkerCli(
      [
        "run-worker-claim-loop",
        "--worker-id",
        "worker-smoke-1",
        "--worker-pool",
        "modal-dev",
        "--worker-version",
        "worker-smoke-1",
        "--workspace-root",
        path.join(tempRoot, "workspace"),
        "--output-root",
        path.join(tempRoot, "output"),
        "--once"
      ],
      {}
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid worker runtime environment:/u);
    assert.match(result.stderr, /API_BASE_URL: is required/u);
    assert.match(result.stderr, /WORKER_BOOTSTRAP_TOKEN: is required/u);
    assert.match(result.stderr, /CODEX_API_KEY: is required/u);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("trusted-local launcher validation fails fast when auth.json is missing", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-startup-"));

  try {
    const codexHome = path.join(tempRoot, ".codex");
    await mkdir(codexHome, { recursive: true });

    const result = runTrustedLocalLauncher(
      ["--image", "paretoproof-problem9-devbox:local", "--preflight-only", "--validate-only"],
      {
        CODEX_HOME: codexHome
      }
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /trusted_local_user requires a readable Codex auth\.json/u);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("trusted-local launcher validation passes without contacting Docker", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-startup-"));

  try {
    const codexHome = path.join(tempRoot, ".codex");
    const fakeBin = path.join(tempRoot, "fake-bin");
    await mkdir(codexHome, { recursive: true });
    await mkdir(fakeBin, { recursive: true });
    await writeFile(path.join(codexHome, "auth.json"), "{}", "utf8");
    await writeFile(
      path.join(fakeBin, "codex.cmd"),
      "@echo off\r\nif \"%1\"==\"login\" if \"%2\"==\"status\" exit /b 0\r\nexit /b 1\r\n",
      "utf8"
    );

    const result = runTrustedLocalLauncher(
      ["--image", "paretoproof-problem9-devbox:local", "--preflight-only", "--validate-only"],
      {
        CODEX_HOME: codexHome,
        PATH: `${fakeBin};${process.env.PATH ?? ""}`
      }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"status": "trusted_local_validation_passed"/u);
    assert.match(result.stdout, /"image": "paretoproof-problem9-devbox:local"/u);
    assert.doesNotMatch(result.stderr, /docker run exited/u);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

function runWorkerCli(
  args: string[],
  envOverrides: Record<string, string>
): { status: number | null; stderr: string; stdout: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/index.ts", ...args], {
    cwd: workerRoot,
    encoding: "utf8",
    env: buildWorkerTestEnv(envOverrides)
  });

  return {
    status: result.status,
    stderr: result.stderr.trim(),
    stdout: result.stdout.trim()
  };
}

function runTrustedLocalLauncher(
  args: string[],
  envOverrides: Record<string, string>
): { status: number | null; stderr: string; stdout: string } {
  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, "infra", "scripts", "run-problem9-trusted-local-attempt.mjs"), ...args],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: buildWorkerTestEnv(envOverrides)
    }
  );

  return {
    status: result.status,
    stderr: result.stderr.trim(),
    stdout: result.stdout.trim()
  };
}

function buildWorkerTestEnv(envOverrides: Record<string, string>): NodeJS.ProcessEnv {
  const env = { ...process.env };

  for (const key of [
    "API_BASE_URL",
    "CODEX_API_KEY",
    "CODEX_HOME",
    "HOME",
    "USERPROFILE",
    "WORKER_BOOTSTRAP_TOKEN"
  ]) {
    delete env[key];
  }

  return {
    ...env,
    ...envOverrides
  };
}
