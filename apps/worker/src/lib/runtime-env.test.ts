import assert from "node:assert/strict";
import test from "node:test";

import {
  parseHostedClaimLoopRuntimeEnv,
  parseOfflineIngestRuntimeEnv,
  validateLocalSingleRunRuntime,
  validateTrustedLocalDevboxRuntime
} from "./runtime-env.js";

test("local single-run runtime allows local_stub without runtime secrets", async () => {
  const preflight = await validateLocalSingleRunRuntime({
    authMode: "local_stub",
    rawEnv: {}
  });

  assert.deepEqual(preflight, {
    authMode: "local_stub"
  });
});

test("local single-run runtime requires CODEX_API_KEY for machine_api_key mode", async () => {
  await assert.rejects(
    () =>
      validateLocalSingleRunRuntime({
        authMode: "machine_api_key",
        rawEnv: {}
      }),
    /Invalid worker runtime environment for local_single_run: CODEX_API_KEY: is required/
  );
});

test("local single-run runtime surfaces trusted-local preflight failures explicitly", async () => {
  await assert.rejects(
    () =>
      validateLocalSingleRunRuntime({
        authMode: "trusted_local_user",
        verifyTrustedLocalUser: async () => {
          throw new Error("Trusted-local Codex auth.json is missing or unreadable.");
        }
      }),
    /Trusted-local Codex auth\.json is missing or unreadable\./
  );
});

test("trusted-local devbox runtime reuses the trusted-local preflight contract", async () => {
  const preflight = await validateTrustedLocalDevboxRuntime({
    verifyTrustedLocalUser: async () => ({
      authJsonPath: "/tmp/auth.json",
      authMode: "trusted_local_user",
      codexHome: "/tmp/codex-home"
    })
  });

  assert.deepEqual(preflight, {
    authJsonPath: "/tmp/auth.json",
    authMode: "trusted_local_user",
    codexHome: "/tmp/codex-home"
  });
});

test("hosted claim-loop runtime requires API_BASE_URL and WORKER_BOOTSTRAP_TOKEN", () => {
  assert.throws(
    () =>
      parseHostedClaimLoopRuntimeEnv({
        API_BASE_URL: "   "
      }),
    /Invalid worker runtime environment for hosted_claim_loop: API_BASE_URL: is required; WORKER_BOOTSTRAP_TOKEN: is required/
  );
});

test("hosted claim-loop runtime accepts the documented hosted worker env pair", () => {
  assert.deepEqual(
    parseHostedClaimLoopRuntimeEnv({
      API_BASE_URL: "https://api.paretoproof.com",
      WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
    }),
    {
      apiBaseUrl: "https://api.paretoproof.com",
      workerBootstrapToken: "bootstrap-token"
    }
  );
});

test("offline ingest runtime currently requires API_BASE_URL", () => {
  assert.throws(
    () => parseOfflineIngestRuntimeEnv({}),
    /Invalid worker runtime environment for offline_ingest: API_BASE_URL: is required/
  );
});
