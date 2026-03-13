import assert from "node:assert/strict";
import test from "node:test";
import { parseApiRuntimeEnv } from "../src/config/runtime.ts";

test("parseApiRuntimeEnv accepts the documented local API runtime contract", () => {
  const runtimeEnv = parseApiRuntimeEnv({
    ACCESS_PROVIDER_STATE_SECRET: "state-secret",
    CF_ACCESS_PORTAL_AUD: "portal-audience",
    CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
    DATABASE_URL: "postgres://localhost:5432/paretoproof"
  });

  assert.deepEqual(runtimeEnv, {
    accessProviderStateSecret: "state-secret",
    corsAllowedOrigins: [],
    corsAllowLocalhost: false,
    databaseUrl: "postgres://localhost:5432/paretoproof",
    host: "0.0.0.0",
    internalAccessAudience: "portal-audience",
    nodeEnv: undefined,
    port: 3000,
    portalAccessAudience: "portal-audience",
    teamDomain: "paretoproof.cloudflareaccess.com"
  });
});

test("parseApiRuntimeEnv accepts hosted-like API config with optional overrides", () => {
  const runtimeEnv = parseApiRuntimeEnv({
    ACCESS_PROVIDER_STATE_SECRET: "state-secret",
    CF_ACCESS_AUD: "legacy-audience",
    CF_ACCESS_INTERNAL_AUD: "internal-audience",
    CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
    CORS_ALLOWED_ORIGINS: "https://staging.paretoproof.com, https://admin.paretoproof.com ",
    CORS_ALLOW_LOCALHOST: "true",
    DATABASE_URL: "postgres://railway.internal:5432/paretoproof",
    HOST: "127.0.0.1",
    NODE_ENV: "production",
    PORT: "4310"
  });

  assert.deepEqual(runtimeEnv, {
    accessProviderStateSecret: "state-secret",
    corsAllowedOrigins: [
      "https://staging.paretoproof.com",
      "https://admin.paretoproof.com"
    ],
    corsAllowLocalhost: true,
    databaseUrl: "postgres://railway.internal:5432/paretoproof",
    host: "127.0.0.1",
    internalAccessAudience: "internal-audience",
    nodeEnv: "production",
    port: 4310,
    portalAccessAudience: "legacy-audience",
    teamDomain: "paretoproof.cloudflareaccess.com"
  });
});

test("parseApiRuntimeEnv rejects runtimes without a portal access audience", () => {
  assert.throws(
    () =>
      parseApiRuntimeEnv({
        ACCESS_PROVIDER_STATE_SECRET: "state-secret",
        CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
        DATABASE_URL: "postgres://localhost:5432/paretoproof"
      }),
    /CF_ACCESS_PORTAL_AUD: CF_ACCESS_PORTAL_AUD or CF_ACCESS_AUD is required/
  );
});

test("parseApiRuntimeEnv reports omitted required variables explicitly", () => {
  assert.throws(
    () =>
      parseApiRuntimeEnv({
        CF_ACCESS_PORTAL_AUD: "portal-audience",
        CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
        DATABASE_URL: "postgres://localhost:5432/paretoproof"
      }),
    /ACCESS_PROVIDER_STATE_SECRET: is required/
  );
});

test("parseApiRuntimeEnv rejects missing and malformed values with explicit field names", () => {
  assert.throws(
    () =>
      parseApiRuntimeEnv({
        ACCESS_PROVIDER_STATE_SECRET: "   ",
        CF_ACCESS_PORTAL_AUD: "portal-audience",
        CF_ACCESS_TEAM_DOMAIN: "",
        CORS_ALLOW_LOCALHOST: "maybe",
        DATABASE_URL: "",
        PORT: "70000"
      }),
    /ACCESS_PROVIDER_STATE_SECRET: must not be empty; CF_ACCESS_TEAM_DOMAIN: must not be empty; CORS_ALLOW_LOCALHOST: Invalid enum value\..*DATABASE_URL: must not be empty; PORT: must be at most 65535/
  );
});
