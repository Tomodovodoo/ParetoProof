import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseWorkerRuntimeEnv } from "../src/lib/runtime.ts";

test("parseWorkerRuntimeEnv keeps materializer mode env-free", async () => {
  const runtimeEnv = await parseWorkerRuntimeEnv(
    {
      commandFamily: "materializer"
    },
    {
      API_BASE_URL: "not-a-url"
    }
  );

  assert.deepEqual(runtimeEnv, {});
});

test("parseWorkerRuntimeEnv keeps local stub attempts env-free", async () => {
  const runtimeEnv = await parseWorkerRuntimeEnv(
    {
      authMode: "local_stub",
      commandFamily: "problem9_attempt"
    },
    {}
  );

  assert.deepEqual(runtimeEnv, {});
});

test("parseWorkerRuntimeEnv requires CODEX_API_KEY for machine_api_key attempts", async () => {
  await assert.rejects(
    () =>
      parseWorkerRuntimeEnv({
        authMode: "machine_api_key",
        commandFamily: "problem9_attempt"
      }),
    /CODEX_API_KEY: is required/
  );

  const runtimeEnv = await parseWorkerRuntimeEnv(
    {
      authMode: "machine_api_key",
      commandFamily: "problem9_attempt"
    },
    {
      CODEX_API_KEY: "worker-api-key"
    }
  );

  assert.equal(runtimeEnv.codexApiKey, "worker-api-key");
});

test("parseWorkerRuntimeEnv requires readable trusted-local auth for trusted_local_user", async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-runtime-"));

  await assert.rejects(
    () =>
      parseWorkerRuntimeEnv(
        {
          authMode: "trusted_local_user",
          commandFamily: "problem9_attempt"
        },
        {
          CODEX_HOME: codexHome
        }
      ),
    /trusted_local_user requires a readable Codex auth\.json/
  );

  await mkdir(codexHome, { recursive: true });
  await writeFile(path.join(codexHome, "auth.json"), "{}", "utf8");

  const runtimeEnv = await parseWorkerRuntimeEnv(
    {
      authMode: "trusted_local_user",
      commandFamily: "problem9_attempt"
    },
    {
      CODEX_HOME: codexHome
    }
  );

  assert.equal(runtimeEnv.trustedLocalCodexHome, codexHome);
  assert.equal(runtimeEnv.trustedLocalAuthJsonPath, path.join(codexHome, "auth.json"));
});

test("parseWorkerRuntimeEnv requires hosted worker env for future claim-loop machine auth", async () => {
  await assert.rejects(
    () =>
      parseWorkerRuntimeEnv(
        {
          authMode: "machine_api_key",
          commandFamily: "worker_claim_loop"
        },
        {
          API_BASE_URL: "https://api.paretoproof.com"
        }
      ),
    /WORKER_BOOTSTRAP_TOKEN: is required/
  );

  const runtimeEnv = await parseWorkerRuntimeEnv(
    {
      authMode: "machine_api_key",
      commandFamily: "worker_claim_loop"
    },
    {
      API_BASE_URL: "https://api.paretoproof.com",
      CODEX_API_KEY: "worker-api-key",
      WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
    }
  );

  assert.deepEqual(runtimeEnv, {
    apiBaseUrl: "https://api.paretoproof.com",
    codexApiKey: "worker-api-key",
    workerBootstrapToken: "bootstrap-token"
  });
});

test("parseWorkerRuntimeEnv requires only API_BASE_URL for offline ingest CLI auth", async () => {
  await assert.rejects(
    () =>
      parseWorkerRuntimeEnv(
        {
          commandFamily: "offline_ingest_cli"
        },
        {}
      ),
    /API_BASE_URL: is required/
  );

  const runtimeEnv = await parseWorkerRuntimeEnv(
    {
      commandFamily: "offline_ingest_cli"
    },
    {
      API_BASE_URL: "https://api.paretoproof.com"
    }
  );

  assert.deepEqual(runtimeEnv, {
    apiBaseUrl: "https://api.paretoproof.com"
  });
});
