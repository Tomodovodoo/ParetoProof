import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { parseApiRuntimeEnv } from "../../apps/api/src/config/runtime.ts";
import { buildServer } from "../../apps/api/src/server/build-server.ts";
import { parseWebRuntimeEnv } from "../../apps/web/src/lib/runtime-env.ts";
import { parseWorkerRuntimeEnv } from "../../apps/worker/src/lib/runtime.ts";

const startupSmokeExecutionImage =
  process.env.PARETOPROOF_STARTUP_SMOKE_EXECUTION_IMAGE ??
  "paretoproof-problem9-execution:pr-smoke";
const skipDockerStartupSmoke = (() => {
  const rawValue = process.env.PARETOPROOF_STARTUP_SMOKE_SKIP_DOCKER?.trim().toLowerCase();
  return rawValue === "1" || rawValue === "true";
})();

await runLane("web startup smoke", async () => {
  await expectPass("web startup accepts an omitted VITE_API_BASE_URL", () => {
    assert.deepEqual(parseWebRuntimeEnv({}), {});
  });

  await expectFailure(
    "web startup rejects malformed VITE_API_BASE_URL values",
    () => parseWebRuntimeEnv({ VITE_API_BASE_URL: "not-a-url" }),
    /VITE_API_BASE_URL: must be a valid URL/
  );
});

await runLane("API startup smoke", async () => {
  await expectPass("API startup accepts the documented local runtime contract", () => {
    assert.equal(
      parseApiRuntimeEnv({
        ACCESS_PROVIDER_STATE_SECRET: "state-secret",
        CF_ACCESS_BRANDED_AUDS: "github-audience,google-audience",
        CF_ACCESS_PORTAL_AUD: "portal-audience",
        CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
        DATABASE_URL: "postgres://localhost:5432/paretoproof",
        WORKER_BOOTSTRAP_TOKEN: "worker-bootstrap-token"
      }).portalAccessAudience,
      "portal-audience"
    );
  });

  await expectPass(
    "API startup uses the parsed runtime contract for boot and readiness without reparsing process.env",
    async () => {
      const originalEnv = {
        ACCESS_PROVIDER_STATE_SECRET: process.env.ACCESS_PROVIDER_STATE_SECRET,
        CF_ACCESS_BRANDED_AUDS: process.env.CF_ACCESS_BRANDED_AUDS,
        CF_ACCESS_PORTAL_AUD: process.env.CF_ACCESS_PORTAL_AUD,
        CF_ACCESS_TEAM_DOMAIN: process.env.CF_ACCESS_TEAM_DOMAIN
      };

      process.env.ACCESS_PROVIDER_STATE_SECRET = "wrong-secret";
      process.env.CF_ACCESS_BRANDED_AUDS = "wrong-branded-audience";
      process.env.CF_ACCESS_PORTAL_AUD = "wrong-portal-audience";
      process.env.CF_ACCESS_TEAM_DOMAIN = "wrong-team.example";

      const app = await buildServer(
        parseApiRuntimeEnv({
          ACCESS_PROVIDER_STATE_SECRET: "state-secret",
          CF_ACCESS_BRANDED_AUDS: "github-audience,google-audience",
          CF_ACCESS_PORTAL_AUD: "portal-audience",
          CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
          DATABASE_URL: "postgres://localhost:5432/paretoproof",
          WORKER_BOOTSTRAP_TOKEN: "worker-bootstrap-token"
        }),
        {
          checkReadiness: async () => {},
          createDbClient: () => ({}) as never
        }
      );

      try {
        const response = await app.inject({
          method: "GET",
          url: "/health"
        });

        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.json(), {
          ok: true,
          service: "api"
        });
      } finally {
        Object.assign(process.env, originalEnv);
        await app.close();
      }
    }
  );

  await expectFailure(
    "API startup rejects missing required worker bootstrap auth",
    () =>
      parseApiRuntimeEnv({
        ACCESS_PROVIDER_STATE_SECRET: "state-secret",
        CF_ACCESS_PORTAL_AUD: "portal-audience",
        CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
        DATABASE_URL: "postgres://localhost:5432/paretoproof"
      }),
    /CF_ACCESS_BRANDED_AUDS: is required; WORKER_BOOTSTRAP_TOKEN: is required|WORKER_BOOTSTRAP_TOKEN: is required; CF_ACCESS_BRANDED_AUDS: is required/
  );
});

await runLane("worker runtime smoke", async () => {
  await expectPass("worker local_stub startup keeps hosted env vars optional", async () => {
    assert.deepEqual(
      await parseWorkerRuntimeEnv(
        {
          authMode: "local_stub",
          commandFamily: "problem9_attempt"
        },
        {}
      ),
      {}
    );
  });

  await expectFailure(
    "worker machine_api_key startup rejects a missing CODEX_API_KEY",
    () =>
      parseWorkerRuntimeEnv(
        {
          authMode: "machine_api_key",
          commandFamily: "problem9_attempt"
        },
        {}
      ),
    /CODEX_API_KEY: is required/
  );
});

if (skipDockerStartupSmoke) {
  console.log("SKIP local Docker worker startup smoke lane because PARETOPROOF_STARTUP_SMOKE_SKIP_DOCKER is set.");
} else {
  await runLane("local Docker worker startup smoke", async () => {
    expectCommandPass(
      "local Docker worker startup accepts the hosted claim-loop runtime contract",
      [
        "run",
        "--rm",
        "--pull",
        "never",
        "--env",
        "API_BASE_URL=https://api.paretoproof.com",
        "--env",
        "WORKER_BOOTSTRAP_TOKEN=worker-bootstrap-token",
        "--env",
        "CODEX_API_KEY=worker-api-key",
        "--env",
        `PARETOPROOF_WORKER_IMAGE_DIGEST=${"9".repeat(64)}`,
        "--env",
        "PARETOPROOF_STARTUP_VALIDATION_ONLY=1",
        startupSmokeExecutionImage,
        "node",
        "apps/worker/dist/index.js",
        "run-worker-claim-loop",
        "--worker-id",
        "startup-smoke-worker",
        "--worker-pool",
        "startup-smoke",
        "--worker-version",
        "startup-smoke-v1",
        "--workspace-root",
        "/tmp/worker-workspace",
        "--output-root",
        "/tmp/worker-output",
        "--once"
      ],
      /"stoppedReason": "idle_once"/
    );

    expectCommandFailure(
      "local Docker worker startup rejects a missing WORKER_BOOTSTRAP_TOKEN",
      [
        "run",
        "--rm",
        "--pull",
        "never",
        "--env",
        "API_BASE_URL=https://api.paretoproof.com",
        "--env",
        "CODEX_API_KEY=worker-api-key",
        "--env",
        "PARETOPROOF_STARTUP_VALIDATION_ONLY=1",
        startupSmokeExecutionImage,
        "node",
        "apps/worker/dist/index.js",
        "run-worker-claim-loop",
        "--worker-id",
        "startup-smoke-worker",
        "--worker-pool",
        "startup-smoke",
        "--worker-version",
        "startup-smoke-v1",
        "--workspace-root",
        "/tmp/worker-workspace",
        "--output-root",
        "/tmp/worker-output",
        "--once"
      ],
      /Validation error: Invalid worker runtime environment: WORKER_BOOTSTRAP_TOKEN: is required/
    );

    expectCommandFailure(
      "local Docker worker startup rejects a missing hosted worker image digest",
      [
        "run",
        "--rm",
        "--pull",
        "never",
        "--env",
        "API_BASE_URL=https://api.paretoproof.com",
        "--env",
        "WORKER_BOOTSTRAP_TOKEN=worker-bootstrap-token",
        "--env",
        "CODEX_API_KEY=worker-api-key",
        "--env",
        "PARETOPROOF_STARTUP_VALIDATION_ONLY=1",
        startupSmokeExecutionImage,
        "node",
        "apps/worker/dist/index.js",
        "run-worker-claim-loop",
        "--worker-id",
        "startup-smoke-worker",
        "--worker-pool",
        "startup-smoke",
        "--worker-version",
        "startup-smoke-v1",
        "--workspace-root",
        "/tmp/worker-workspace",
        "--output-root",
        "/tmp/worker-output",
        "--once"
      ],
      /Validation error: Invalid worker runtime environment: PARETOPROOF_WORKER_IMAGE_DIGEST: is required/
    );

    expectCommandFailure(
      "local Docker worker startup rejects a hosted provider-base override env",
      [
        "run",
        "--rm",
        "--pull",
        "never",
        "--env",
        "API_BASE_URL=https://api.paretoproof.com",
        "--env",
        "WORKER_BOOTSTRAP_TOKEN=worker-bootstrap-token",
        "--env",
        "CODEX_API_KEY=worker-api-key",
        "--env",
        `PARETOPROOF_WORKER_IMAGE_DIGEST=${"9".repeat(64)}`,
        "--env",
        "OPENAI_BASE_URL=https://evil.example.test",
        "--env",
        "PARETOPROOF_STARTUP_VALIDATION_ONLY=1",
        startupSmokeExecutionImage,
        "node",
        "apps/worker/dist/index.js",
        "run-worker-claim-loop",
        "--worker-id",
        "startup-smoke-worker",
        "--worker-pool",
        "startup-smoke",
        "--worker-version",
        "startup-smoke-v1",
        "--workspace-root",
        "/tmp/worker-workspace",
        "--output-root",
        "/tmp/worker-output",
        "--once"
      ],
      /Validation error: Invalid worker runtime environment: Hosted network policy blocked worker startup: forbidden env override\(s\) OPENAI_BASE_URL\./
    );
  });
}

console.log(
  skipDockerStartupSmoke
    ? "Startup validation smoke lanes passed for web, API, and worker; the local Docker lane was skipped by a local override."
    : "Startup validation smoke lanes passed for web, API, worker, and local Docker."
);

async function runLane(name: string, runner: () => Promise<void>) {
  console.log(`START lane ${name}`);
  await runner();
  console.log(`PASS lane ${name}`);
}

async function expectPass(name: string, assertion: () => Promise<void> | void) {
  await assertion();
  console.log(`PASS ${name}`);
}

async function expectFailure(
  name: string,
  assertion: () => Promise<unknown> | unknown,
  expectedMessage: RegExp
) {
  await assert.rejects(async () => await assertion(), expectedMessage);
  console.log(`PASS ${name}`);
}

function expectCommandPass(name: string, commandArgs: string[], stdoutPattern: RegExp) {
  const result = spawnSync(resolveDockerCommand(), commandArgs, {
    encoding: "utf8",
    timeout: 120000,
    windowsHide: true
  });

  if (result.error) {
    throw new Error(`Startup smoke "${name}" failed before completion: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(
      `Startup smoke "${name}" failed unexpectedly.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  assert.match(result.stdout, stdoutPattern);
  console.log(`PASS ${name}`);
}

function expectCommandFailure(name: string, commandArgs: string[], stderrPattern: RegExp) {
  const result = spawnSync(resolveDockerCommand(), commandArgs, {
    encoding: "utf8",
    timeout: 120000,
    windowsHide: true
  });

  if (result.error) {
    throw new Error(`Startup smoke "${name}" failed before completion: ${result.error.message}`);
  }

  if (result.status === 0) {
    throw new Error(`Startup smoke "${name}" unexpectedly passed.\nstdout:\n${result.stdout}`);
  }

  assert.match(result.stderr, stderrPattern);
  console.log(`PASS ${name}`);
}

function resolveDockerCommand() {
  return process.platform === "win32" ? "docker.exe" : "docker";
}
