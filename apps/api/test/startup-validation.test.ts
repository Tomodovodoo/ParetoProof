import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("API startup validation passes with only the documented required env", () => {
  const result = runStartupValidation({
    ACCESS_PROVIDER_STATE_SECRET: "state-secret",
    CF_ACCESS_PORTAL_AUD: "portal-audience",
    CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
    DATABASE_URL: "postgres://localhost:5432/paretoproof",
    WORKER_BOOTSTRAP_TOKEN: "worker-bootstrap-token"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"status":"api_startup_validation_passed"/u);
  assert.equal(result.stderr, "");
});

test("API startup validation fails fast when required env is missing", () => {
  const result = runStartupValidation({
    CF_ACCESS_PORTAL_AUD: "portal-audience",
    CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
    DATABASE_URL: "postgres://localhost:5432/paretoproof"
  });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Invalid API runtime environment: .*ACCESS_PROVIDER_STATE_SECRET: is required.*WORKER_BOOTSTRAP_TOKEN: is required|Invalid API runtime environment: .*WORKER_BOOTSTRAP_TOKEN: is required.*ACCESS_PROVIDER_STATE_SECRET: is required/u
  );
});

test("API startup validation rejects malformed env with explicit field names", () => {
  const result = runStartupValidation({
    ACCESS_PROVIDER_STATE_SECRET: "state-secret",
    CF_ACCESS_PORTAL_AUD: "portal-audience",
    CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
    CORS_ALLOW_LOCALHOST: "maybe",
    DATABASE_URL: "postgres://localhost:5432/paretoproof",
    PORT: "70000",
    WORKER_BOOTSTRAP_TOKEN: "worker-bootstrap-token"
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CORS_ALLOW_LOCALHOST: Invalid enum value/u);
  assert.match(result.stderr, /PORT: must be at most 65535/u);
});

function runStartupValidation(
  envOverrides: Record<string, string>
): { status: number | null; stderr: string; stdout: string } {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/startup-validation-smoke.ts"],
    {
      cwd: apiRoot,
      encoding: "utf8",
      env: buildApiTestEnv(envOverrides)
    }
  );

  return {
    status: result.status,
    stderr: result.stderr.trim(),
    stdout: result.stdout.trim()
  };
}

function buildApiTestEnv(envOverrides: Record<string, string>): NodeJS.ProcessEnv {
  const env = { ...process.env };

  for (const key of [
    "ACCESS_PROVIDER_STATE_SECRET",
    "CF_ACCESS_AUD",
    "CF_ACCESS_INTERNAL_AUD",
    "CF_ACCESS_PORTAL_AUD",
    "CF_ACCESS_TEAM_DOMAIN",
    "CORS_ALLOWED_ORIGINS",
    "CORS_ALLOW_LOCALHOST",
    "DATABASE_URL",
    "HOST",
    "NODE_ENV",
    "PORT",
    "WORKER_BOOTSTRAP_TOKEN"
  ]) {
    delete env[key];
  }

  return {
    ...env,
    ...envOverrides
  };
}
