import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { repoRoot } from "./governance-test-helpers.mjs";

test("startup-validation-smoke rejects skipping the Docker lane in CI", () => {
  const originalCi = process.env.CI;
  const originalSkipDocker = process.env.PARETOPROOF_STARTUP_SMOKE_SKIP_DOCKER;

  try {
    process.env.CI = "true";
    process.env.PARETOPROOF_STARTUP_SMOKE_SKIP_DOCKER = "1";

    const result = spawnSync(process.execPath, ["infra/scripts/startup-validation-smoke.ts"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env
    });
    const output = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n");
    assert.notEqual(result.status, 0, "startup-validation-smoke unexpectedly passed");
    assert.match(output, /must not be set in CI/i);
  } finally {
    if (originalCi === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = originalCi;
    }

    if (originalSkipDocker === undefined) {
      delete process.env.PARETOPROOF_STARTUP_SMOKE_SKIP_DOCKER;
    } else {
      process.env.PARETOPROOF_STARTUP_SMOKE_SKIP_DOCKER = originalSkipDocker;
    }
  }
});
