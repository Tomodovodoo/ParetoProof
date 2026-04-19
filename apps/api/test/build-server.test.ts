import assert from "node:assert/strict";
import test from "node:test";
import { parseApiRuntimeEnv } from "../src/config/runtime.ts";
import {
  buildServer,
  isAllowedCorsOrigin,
  readBrandedAuthOrigins,
  readCorsRoutePath,
  readAllowedCorsOrigins,
  readTrustedMutationOrigins,
} from "../src/server/build-server.ts";

test("readAllowedCorsOrigins excludes branded auth hosts from the API CORS allowlist", () => {
  const origins = readAllowedCorsOrigins({
    authPublicOrigin: "https://auth.preview.paretoproof.com",
    brandedAuthOrigins: [
      "https://auth.preview.paretoproof.com",
      "https://github.auth.preview.paretoproof.com",
      "https://google.auth.preview.paretoproof.com",
    ],
    corsAllowedOrigins: [
      "https://portal.preview.paretoproof.com",
      "https://github.auth.preview.paretoproof.com",
    ],
    mathPublicOrigin: "https://math.preview.paretoproof.com",
    portalPublicOrigin: "https://portal.preview.paretoproof.com",
  } as never);

  assert.deepEqual(origins, [
    "https://portal.preview.paretoproof.com",
    "https://math.preview.paretoproof.com",
  ]);
  assert.equal(origins.includes("https://auth.preview.paretoproof.com"), false);
  assert.equal(
    origins.includes("https://github.auth.preview.paretoproof.com"),
    false,
  );
  assert.equal(
    origins.includes("https://google.auth.preview.paretoproof.com"),
    false,
  );
});

test("readAllowedCorsOrigins keeps the portal origin when auth and portal share one origin", () => {
  const origins = readAllowedCorsOrigins({
    authPublicOrigin: "https://portal.preview.paretoproof.com",
    brandedAuthOrigins: ["https://portal.preview.paretoproof.com"],
    corsAllowedOrigins: [],
    mathPublicOrigin: "https://math.preview.paretoproof.com",
    portalPublicOrigin: "https://portal.preview.paretoproof.com",
  } as never);

  assert.deepEqual(origins, [
    "https://portal.preview.paretoproof.com",
    "https://math.preview.paretoproof.com",
  ]);
});

test("readAllowedCorsOrigins excludes the default production math host when preview portal/auth origins are overridden without an explicit math override", () => {
  const runtimeEnv = parseApiRuntimeEnv({
    ACCESS_PROVIDER_STATE_SECRET: "state-secret",
    AUTH_PUBLIC_ORIGIN: "https://auth.preview.paretoproof.com",
    CF_ACCESS_BRANDED_AUDS: "github-audience,google-audience",
    CF_ACCESS_PORTAL_AUD: "portal-audience",
    CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
    DATABASE_URL: "postgres://localhost:5432/paretoproof",
    PORTAL_PUBLIC_ORIGIN: "https://portal.preview.paretoproof.com",
    WORKER_BOOTSTRAP_TOKEN: "worker-bootstrap-token",
  });

  assert.deepEqual(readAllowedCorsOrigins(runtimeEnv), [
    "https://portal.preview.paretoproof.com",
  ]);
  assert.equal(
    readAllowedCorsOrigins(runtimeEnv).includes("https://math.paretoproof.com"),
    false,
  );
});

test("readTrustedMutationOrigins keeps portal and math mutation allowlists scoped to their own surfaces", () => {
  const origins = readTrustedMutationOrigins({
    authPublicOrigin: "https://auth.preview.paretoproof.com",
    brandedAuthOrigins: [
      "https://auth.preview.paretoproof.com",
      "https://github.auth.preview.paretoproof.com",
      "https://google.auth.preview.paretoproof.com",
    ],
    corsAllowedOrigins: [
      "https://portal.preview.paretoproof.com",
      "https://math.preview.paretoproof.com",
      "https://portal-canary.preview.paretoproof.com",
      "https://github.auth.preview.paretoproof.com",
    ],
    mathPublicOrigin: "https://math.preview.paretoproof.com",
    portalPublicOrigin: "https://portal.preview.paretoproof.com",
  } as never);

  assert.deepEqual(origins, {
    math: ["https://math.preview.paretoproof.com"],
    portal: [
      "https://portal.preview.paretoproof.com",
      "https://portal-canary.preview.paretoproof.com",
    ],
  });
  assert.equal(origins.portal.includes("https://math.preview.paretoproof.com"), false);
  assert.equal(
    origins.portal.includes("https://github.auth.preview.paretoproof.com"),
    false,
  );
});

test("readBrandedAuthOrigins excludes the portal origin when auth and portal share one origin", () => {
  const origins = readBrandedAuthOrigins({
    brandedAuthOrigins: [
      "https://portal.preview.paretoproof.com",
      "https://github.auth.preview.paretoproof.com",
    ],
    portalPublicOrigin: "https://portal.preview.paretoproof.com",
  } as never);

  assert.deepEqual(origins, ["https://github.auth.preview.paretoproof.com"]);
});

test("readCorsRoutePath falls back to the raw request URL for Fastify preflights", () => {
  assert.equal(
    readCorsRoutePath(
      "*",
      "/portal/session/finalize/submit?redirect=%2Fprofile",
    ),
    "/portal/session/finalize/submit",
  );
  assert.equal(
    readCorsRoutePath("/portal/profile", "/portal/profile?tab=settings"),
    "/portal/profile",
  );
});

test("isAllowedCorsOrigin keeps branded finalize callers scoped to finalize-submit POST and OPTIONS only", () => {
  const allowedOrigins = ["https://portal.preview.paretoproof.com"];
  const brandedAuthOrigins = [
    "https://auth.preview.paretoproof.com",
    "https://github.auth.preview.paretoproof.com",
    "https://google.auth.preview.paretoproof.com",
  ];

  assert.equal(
    isAllowedCorsOrigin({
      allowLocalhostCors: false,
      allowedOrigins,
      brandedAuthOrigins,
      method: "POST",
      origin: "https://github.auth.preview.paretoproof.com",
      routePath: "/portal/session/finalize/submit",
    }),
    true,
  );
  assert.equal(
    isAllowedCorsOrigin({
      allowLocalhostCors: false,
      allowedOrigins,
      brandedAuthOrigins,
      method: "OPTIONS",
      origin: "https://github.auth.preview.paretoproof.com",
      routePath: readCorsRoutePath(
        "*",
        "/portal/session/finalize/submit?redirect=%2Fprofile",
      ),
    }),
    true,
  );
  assert.equal(
    isAllowedCorsOrigin({
      allowLocalhostCors: false,
      allowedOrigins,
      brandedAuthOrigins,
      method: "POST",
      origin: "https://github.auth.preview.paretoproof.com",
      routePath: "/portal/profile",
    }),
    false,
  );
  assert.equal(
    isAllowedCorsOrigin({
      allowLocalhostCors: false,
      allowedOrigins,
      brandedAuthOrigins,
      method: "OPTIONS",
      origin: "https://github.auth.preview.paretoproof.com",
      routePath: "/portal/profile",
    }),
    false,
  );
  assert.equal(
    isAllowedCorsOrigin({
      allowLocalhostCors: true,
      allowedOrigins,
      brandedAuthOrigins,
      method: "POST",
      origin: "http://github.auth.preview.paretoproof.com:4371",
      routePath: "/portal/session/finalize/submit",
    }),
    true,
  );
  assert.equal(
    isAllowedCorsOrigin({
      allowLocalhostCors: true,
      allowedOrigins,
      brandedAuthOrigins,
      method: "OPTIONS",
      origin: "http://github.auth.preview.paretoproof.com:4371",
      routePath: "/portal/session/finalize/submit",
    }),
    true,
  );
  assert.equal(
    isAllowedCorsOrigin({
      allowLocalhostCors: false,
      allowedOrigins,
      brandedAuthOrigins,
      method: "POST",
      origin: "http://github.auth.preview.paretoproof.com:4371",
      routePath: "/portal/session/finalize/submit",
    }),
    false,
  );
});

test("buildServer keeps the parsed runtime contract authoritative during boot and health checks", async (t) => {
  const originalEnv = {
    ACCESS_PROVIDER_STATE_SECRET: process.env.ACCESS_PROVIDER_STATE_SECRET,
    CF_ACCESS_BRANDED_AUDS: process.env.CF_ACCESS_BRANDED_AUDS,
    CF_ACCESS_PORTAL_AUD: process.env.CF_ACCESS_PORTAL_AUD,
    CF_ACCESS_TEAM_DOMAIN: process.env.CF_ACCESS_TEAM_DOMAIN,
  };

  process.env.ACCESS_PROVIDER_STATE_SECRET = "wrong-secret";
  process.env.CF_ACCESS_BRANDED_AUDS = "wrong-branded-audience";
  process.env.CF_ACCESS_PORTAL_AUD = "wrong-portal-audience";
  process.env.CF_ACCESS_TEAM_DOMAIN = "wrong-team.example";

  let readinessChecks = 0;
  const app = await buildServer(
    parseApiRuntimeEnv({
      ACCESS_PROVIDER_STATE_SECRET: "runtime-secret",
      AUTH_PUBLIC_ORIGIN: "https://auth.preview.paretoproof.com",
      CF_ACCESS_BRANDED_AUDS: "github-audience,google-audience",
      CF_ACCESS_PORTAL_AUD: "portal-audience",
      CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
      DATABASE_URL: "postgres://localhost:5432/paretoproof",
      MATH_PUBLIC_ORIGIN: "https://math.preview.paretoproof.com",
      PORTAL_PUBLIC_ORIGIN: "https://portal.preview.paretoproof.com",
      WORKER_BOOTSTRAP_TOKEN: "worker-bootstrap-token",
    }),
    {
      createDbClient: () =>
        ({
          execute: async () => {
            readinessChecks += 1;
          },
        }) as never,
    },
  );

  t.after(async () => {
    Object.assign(process.env, originalEnv);
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    service: "api",
  });
  assert.equal(readinessChecks, 1);
});

test("buildServer maps default DB readiness failures to 503 health responses", async (t) => {
  const app = await buildServer(
    parseApiRuntimeEnv({
      ACCESS_PROVIDER_STATE_SECRET: "runtime-secret",
      AUTH_PUBLIC_ORIGIN: "https://auth.preview.paretoproof.com",
      CF_ACCESS_BRANDED_AUDS: "github-audience,google-audience",
      CF_ACCESS_PORTAL_AUD: "portal-audience",
      CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
      DATABASE_URL: "postgres://localhost:5432/paretoproof",
      MATH_PUBLIC_ORIGIN: "https://math.preview.paretoproof.com",
      PORTAL_PUBLIC_ORIGIN: "https://portal.preview.paretoproof.com",
      WORKER_BOOTSTRAP_TOKEN: "worker-bootstrap-token",
    }),
    {
      createDbClient: () =>
        ({
          execute: async () => {
            throw new Error("database_unreachable");
          },
        }) as never,
    },
  );

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    error: "service_unavailable",
    ok: false,
    service: "api",
  });
});
