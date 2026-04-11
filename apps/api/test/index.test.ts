import assert from "node:assert/strict";
import test from "node:test";
import { startApiServer } from "../src/index.ts";

test("startApiServer exits when runtime parsing fails before the server is built", async () => {
  const originalConsoleError = console.error;
  const exitCodes: number[] = [];
  const loggedErrors: unknown[] = [];

  console.error = (...args: unknown[]) => {
    loggedErrors.push(args);
  };

  try {
    await startApiServer({
      buildApiServer: async () => {
        throw new Error("build should not run");
      },
      exit(code) {
        exitCodes.push(code);
      },
      parseRuntimeEnv() {
        throw new Error("invalid_runtime_env");
      }
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(exitCodes, [1]);
  assert.equal(loggedErrors.length, 1);
  assert.match(String(loggedErrors[0]?.[0]), /invalid_runtime_env/);
});

test("startApiServer exits when listen fails after the server is built", async () => {
  const exitCodes: number[] = [];
  const loggedErrors: unknown[] = [];

  await startApiServer({
    async buildApiServer() {
      return {
        async listen() {
          throw new Error("listen_failed");
        },
        log: {
          error(error: unknown) {
            loggedErrors.push(error);
          }
        }
      } as never;
    },
    exit(code) {
      exitCodes.push(code);
    },
    parseRuntimeEnv() {
      return {
        accessProviderStateSecret: "state-secret",
        brandedAccessAudiences: ["github-audience", "google-audience"],
        corsAllowedOrigins: [],
        corsAllowLocalhost: false,
        databaseUrl: "postgres://localhost:5432/paretoproof",
        host: "0.0.0.0",
        internalAccessAudience: "portal-audience",
        port: 3000,
        portalAccessAudience: "portal-audience",
        portalSessionSecret: "state-secret",
        teamDomain: "paretoproof.cloudflareaccess.com",
        workerBootstrapToken: "worker-bootstrap-token"
      };
    }
  });

  assert.deepEqual(exitCodes, [1]);
  assert.equal(loggedErrors.length, 1);
  assert.match(String(loggedErrors[0]), /listen_failed/);
});
