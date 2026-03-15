import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseWorkerRuntimeEnv } from "../src/lib/runtime.ts";
import {
  trustedLocalAuthMountMarkerEnvName,
  trustedLocalAuthMountMarkerValue
} from "../src/lib/trusted-local-auth-contract.ts";

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

test("parseWorkerRuntimeEnv rejects malformed trusted-local auth json", async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-runtime-malformed-"));

  await mkdir(codexHome, { recursive: true });
  await writeFile(path.join(codexHome, "auth.json"), "{not-json", "utf8");

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
    /trusted_local_user requires auth\.json to contain valid JSON/
  );
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

test("parseWorkerRuntimeEnv rejects trusted-local mount markers for hosted claim loops", async () => {
  await assert.rejects(
    () =>
      parseWorkerRuntimeEnv(
        {
          authMode: "machine_api_key",
          commandFamily: "worker_claim_loop"
        },
        {
          API_BASE_URL: "https://api.paretoproof.com",
          CODEX_API_KEY: "worker-api-key",
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token",
          [trustedLocalAuthMountMarkerEnvName]: trustedLocalAuthMountMarkerValue
        }
      ),
    /trusted-local auth mounts are not allowed for worker_claim_loop/
  );
});

test("parseWorkerRuntimeEnv requires API base URL for offline ingest", async () => {
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
