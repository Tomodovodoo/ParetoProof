import assert from "node:assert/strict";
import test from "node:test";
import { parseApiRuntimeEnv } from "../src/config/runtime.ts";

test("parseApiRuntimeEnv accepts the documented local API runtime contract", () => {
  const runtimeEnv = parseApiRuntimeEnv({
    ACCESS_PROVIDER_STATE_SECRET: "state-secret",
    CF_ACCESS_BRANDED_AUDS: "github-audience,google-audience",
    CF_ACCESS_PORTAL_AUD: "portal-audience",
    CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
    DATABASE_URL: "postgres://localhost:5432/paretoproof",
    WORKER_BOOTSTRAP_TOKEN: "worker-bootstrap-token",
  });

  assert.deepEqual(runtimeEnv, {
    accessProviderStateSecret: "state-secret",
    accessCookieDomain: ".paretoproof.com",
    accessCookieSecure: true,
    authPublicOrigin: "https://auth.paretoproof.com",
    brandedAccessAudiences: ["github-audience", "google-audience"],
    brandedAuthOrigins: [
      "https://auth.paretoproof.com",
      "https://github.auth.paretoproof.com",
      "https://google.auth.paretoproof.com",
    ],
    corsAllowedOrigins: [],
    corsAllowLocalhost: false,
    databaseUrl: "postgres://localhost:5432/paretoproof",
    host: "0.0.0.0",
    internalAccessAudience: "portal-audience",
    mathPublicOrigin: "https://math.paretoproof.com",
    nodeEnv: undefined,
    port: 3000,
    portalAccessAudience: "portal-audience",
    portalPublicOrigin: "https://portal.paretoproof.com",
    portalSessionSecret: "state-secret",
    teamDomain: "paretoproof.cloudflareaccess.com",
    workerBootstrapToken: "worker-bootstrap-token",
  });
});

test("parseApiRuntimeEnv accepts hosted-like API config with optional overrides", () => {
  const runtimeEnv = parseApiRuntimeEnv({
    ACCESS_PROVIDER_STATE_SECRET: "state-secret",
    ACCESS_COOKIE_DOMAIN: ".preview.paretoproof.com",
    ACCESS_COOKIE_SECURE: "false",
    AUTH_PUBLIC_ORIGIN: "https://auth.preview.paretoproof.com",
    BRANDED_AUTH_ORIGINS:
      "https://auth.preview.paretoproof.com, https://github.auth.preview.paretoproof.com, https://google.auth.preview.paretoproof.com ",
    CF_ACCESS_AUD: "legacy-audience",
    CF_ACCESS_BRANDED_AUDS:
      "github-audience, google-audience , github-audience",
    CF_ACCESS_INTERNAL_AUD: "internal-audience",
    CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
    CORS_ALLOWED_ORIGINS:
      "https://staging.paretoproof.com, https://admin.paretoproof.com ",
    CORS_ALLOW_LOCALHOST: "true",
    DATABASE_URL: "postgres://railway.internal:5432/paretoproof",
    HOST: "127.0.0.1",
    MATH_PUBLIC_ORIGIN: "https://math.preview.paretoproof.com",
    NODE_ENV: "production",
    PORT: "4310",
    PORTAL_PUBLIC_ORIGIN: "https://portal.preview.paretoproof.com",
    PORTAL_SESSION_SECRET: "session-secret",
    WORKER_BOOTSTRAP_TOKEN: "worker-bootstrap-token",
  });

  assert.deepEqual(runtimeEnv, {
    accessProviderStateSecret: "state-secret",
    accessCookieDomain: ".preview.paretoproof.com",
    accessCookieSecure: false,
    authPublicOrigin: "https://auth.preview.paretoproof.com",
    brandedAccessAudiences: ["github-audience", "google-audience"],
    brandedAuthOrigins: [
      "https://auth.preview.paretoproof.com",
      "https://github.auth.preview.paretoproof.com",
      "https://google.auth.preview.paretoproof.com",
    ],
    corsAllowedOrigins: [
      "https://staging.paretoproof.com",
      "https://admin.paretoproof.com",
    ],
    corsAllowLocalhost: true,
    databaseUrl: "postgres://railway.internal:5432/paretoproof",
    host: "127.0.0.1",
    internalAccessAudience: "internal-audience",
    mathPublicOrigin: "https://math.preview.paretoproof.com",
    nodeEnv: "production",
    port: 4310,
    portalAccessAudience: "legacy-audience",
    portalPublicOrigin: "https://portal.preview.paretoproof.com",
    portalSessionSecret: "session-secret",
    teamDomain: "paretoproof.cloudflareaccess.com",
    workerBootstrapToken: "worker-bootstrap-token",
  });
});

test("parseApiRuntimeEnv derives host-only insecure cookie mode from explicit local origins", () => {
  const runtimeEnv = parseApiRuntimeEnv({
    ACCESS_PROVIDER_STATE_SECRET: "state-secret",
    AUTH_PUBLIC_ORIGIN: "http://auth.local.test:8788",
    CF_ACCESS_BRANDED_AUDS: "github-audience,google-audience",
    CF_ACCESS_PORTAL_AUD: "portal-audience",
    CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
    DATABASE_URL: "postgres://localhost:5432/paretoproof",
    MATH_PUBLIC_ORIGIN: "http://localhost:4174",
    PORTAL_PUBLIC_ORIGIN: "http://localhost:4173",
    WORKER_BOOTSTRAP_TOKEN: "worker-bootstrap-token",
  });

  assert.equal(runtimeEnv.accessCookieDomain, undefined);
  assert.equal(runtimeEnv.accessCookieSecure, false);
  assert.deepEqual(runtimeEnv.brandedAuthOrigins, [
    "http://auth.local.test:8788",
    "http://github.auth.local.test:8788",
    "http://google.auth.local.test:8788",
  ]);
});

test("parseApiRuntimeEnv always includes the configured auth origin in branded auth handling", () => {
  const runtimeEnv = parseApiRuntimeEnv({
    ACCESS_PROVIDER_STATE_SECRET: "state-secret",
    AUTH_PUBLIC_ORIGIN: "http://auth.local.test:8788",
    BRANDED_AUTH_ORIGINS:
      "https://github.auth.preview.paretoproof.com, https://google.auth.preview.paretoproof.com",
    CF_ACCESS_BRANDED_AUDS: "github-audience,google-audience",
    CF_ACCESS_PORTAL_AUD: "portal-audience",
    CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
    DATABASE_URL: "postgres://localhost:5432/paretoproof",
    MATH_PUBLIC_ORIGIN: "https://math.preview.paretoproof.com",
    PORTAL_PUBLIC_ORIGIN: "https://portal.preview.paretoproof.com",
    WORKER_BOOTSTRAP_TOKEN: "worker-bootstrap-token",
  });

  assert.deepEqual(runtimeEnv.brandedAuthOrigins, [
    "http://auth.local.test:8788",
    "https://github.auth.preview.paretoproof.com",
    "https://google.auth.preview.paretoproof.com",
  ]);
  assert.equal(runtimeEnv.accessCookieSecure, false);
});

test("parseApiRuntimeEnv avoids deriving cookie domains that are only public suffixes", () => {
  const runtimeEnv = parseApiRuntimeEnv({
    ACCESS_PROVIDER_STATE_SECRET: "state-secret",
    AUTH_PUBLIC_ORIGIN: "https://auth.co.uk",
    CF_ACCESS_BRANDED_AUDS: "github-audience,google-audience",
    CF_ACCESS_PORTAL_AUD: "portal-audience",
    CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
    DATABASE_URL: "postgres://localhost:5432/paretoproof",
    MATH_PUBLIC_ORIGIN: "https://math.co.uk",
    PORTAL_PUBLIC_ORIGIN: "https://portal.co.uk",
    WORKER_BOOTSTRAP_TOKEN: "worker-bootstrap-token",
  });

  assert.equal(runtimeEnv.accessCookieDomain, undefined);
});

test("parseApiRuntimeEnv avoids deriving cookie domains that are private PSL suffixes", () => {
  const runtimeEnv = parseApiRuntimeEnv({
    ACCESS_PROVIDER_STATE_SECRET: "state-secret",
    AUTH_PUBLIC_ORIGIN: "https://auth.github.io",
    CF_ACCESS_BRANDED_AUDS: "github-audience,google-audience",
    CF_ACCESS_PORTAL_AUD: "portal-audience",
    CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
    DATABASE_URL: "postgres://localhost:5432/paretoproof",
    MATH_PUBLIC_ORIGIN: "https://math.github.io",
    PORTAL_PUBLIC_ORIGIN: "https://portal.github.io",
    WORKER_BOOTSTRAP_TOKEN: "worker-bootstrap-token",
  });

  assert.equal(runtimeEnv.accessCookieDomain, undefined);
});

test("parseApiRuntimeEnv rejects explicit cookie domains that are only public suffixes", () => {
  assert.throws(
    () =>
      parseApiRuntimeEnv({
        ACCESS_COOKIE_DOMAIN: ".co.uk",
        ACCESS_PROVIDER_STATE_SECRET: "state-secret",
        CF_ACCESS_BRANDED_AUDS: "github-audience,google-audience",
        CF_ACCESS_PORTAL_AUD: "portal-audience",
        CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
        DATABASE_URL: "postgres://localhost:5432/paretoproof",
        WORKER_BOOTSTRAP_TOKEN: "worker-bootstrap-token",
      }),
    /ACCESS_COOKIE_DOMAIN: must not be a public suffix cookie domain/,
  );
});

test("parseApiRuntimeEnv rejects explicit cookie domains that are private PSL suffixes", () => {
  assert.throws(
    () =>
      parseApiRuntimeEnv({
        ACCESS_COOKIE_DOMAIN: ".github.io",
        ACCESS_PROVIDER_STATE_SECRET: "state-secret",
        CF_ACCESS_BRANDED_AUDS: "github-audience,google-audience",
        CF_ACCESS_PORTAL_AUD: "portal-audience",
        CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
        DATABASE_URL: "postgres://localhost:5432/paretoproof",
        WORKER_BOOTSTRAP_TOKEN: "worker-bootstrap-token",
      }),
    /ACCESS_COOKIE_DOMAIN: must not be a public suffix cookie domain/,
  );
});

test("parseApiRuntimeEnv rejects runtimes without a portal access audience", () => {
  assert.throws(
    () =>
      parseApiRuntimeEnv({
        ACCESS_PROVIDER_STATE_SECRET: "state-secret",
        CF_ACCESS_BRANDED_AUDS: "github-audience,google-audience",
        CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
        DATABASE_URL: "postgres://localhost:5432/paretoproof",
        WORKER_BOOTSTRAP_TOKEN: "worker-bootstrap-token",
      }),
    /CF_ACCESS_PORTAL_AUD: CF_ACCESS_PORTAL_AUD or CF_ACCESS_AUD is required/,
  );
});

test("parseApiRuntimeEnv reports omitted required variables explicitly", () => {
  assert.throws(
    () =>
      parseApiRuntimeEnv({
        CF_ACCESS_PORTAL_AUD: "portal-audience",
        CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
        DATABASE_URL: "postgres://localhost:5432/paretoproof",
      }),
    /ACCESS_PROVIDER_STATE_SECRET: is required; CF_ACCESS_BRANDED_AUDS: is required; WORKER_BOOTSTRAP_TOKEN: is required|ACCESS_PROVIDER_STATE_SECRET: is required; WORKER_BOOTSTRAP_TOKEN: is required; CF_ACCESS_BRANDED_AUDS: is required|CF_ACCESS_BRANDED_AUDS: is required; ACCESS_PROVIDER_STATE_SECRET: is required; WORKER_BOOTSTRAP_TOKEN: is required|CF_ACCESS_BRANDED_AUDS: is required; WORKER_BOOTSTRAP_TOKEN: is required; ACCESS_PROVIDER_STATE_SECRET: is required|WORKER_BOOTSTRAP_TOKEN: is required; ACCESS_PROVIDER_STATE_SECRET: is required; CF_ACCESS_BRANDED_AUDS: is required|WORKER_BOOTSTRAP_TOKEN: is required; CF_ACCESS_BRANDED_AUDS: is required; ACCESS_PROVIDER_STATE_SECRET: is required/,
  );
});

test("parseApiRuntimeEnv rejects missing and malformed values with explicit field names", () => {
  let thrownError: unknown;

  try {
    parseApiRuntimeEnv({
      ACCESS_PROVIDER_STATE_SECRET: "   ",
      ACCESS_COOKIE_DOMAIN: "localhost",
      AUTH_PUBLIC_ORIGIN: "ftp://auth.example.com",
      CF_ACCESS_BRANDED_AUDS: " ",
      CF_ACCESS_PORTAL_AUD: "portal-audience",
      CF_ACCESS_TEAM_DOMAIN: "",
      CORS_ALLOW_LOCALHOST: "maybe",
      DATABASE_URL: "",
      PORT: "70000",
      MATH_PUBLIC_ORIGIN: "https://math.example.com/path",
      PORTAL_PUBLIC_ORIGIN: "https://portal.example.com/path",
      WORKER_BOOTSTRAP_TOKEN: " ",
    });
  } catch (error) {
    thrownError = error;
  }

  assert.ok(thrownError instanceof Error);

  assert.match(
    String(thrownError),
    /ACCESS_PROVIDER_STATE_SECRET: must not be empty/,
  );
  assert.match(
    String(thrownError),
    /ACCESS_COOKIE_DOMAIN: must be a hostname suffix, not localhost or an IP address/,
  );
  assert.match(
    String(thrownError),
    /AUTH_PUBLIC_ORIGIN: must use http or https/,
  );
  assert.match(
    String(thrownError),
    /CF_ACCESS_BRANDED_AUDS: must not be empty/,
  );
  assert.match(String(thrownError), /CF_ACCESS_TEAM_DOMAIN: must not be empty/);
  assert.match(String(thrownError), /CORS_ALLOW_LOCALHOST: Invalid enum value/);
  assert.match(String(thrownError), /DATABASE_URL: must not be empty/);
  assert.match(String(thrownError), /PORT: must be at most 65535/);
  assert.match(
    String(thrownError),
    /MATH_PUBLIC_ORIGIN: must be an origin without path, search, or hash/,
  );
  assert.match(
    String(thrownError),
    /PORTAL_PUBLIC_ORIGIN: must be an origin without path, search, or hash/,
  );
  assert.match(
    String(thrownError),
    /WORKER_BOOTSTRAP_TOKEN: must not be empty/,
  );
});
