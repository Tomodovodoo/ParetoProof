import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowedCorsOrigin,
  readCorsRoutePath,
  readAllowedCorsOrigins,
  readAllowedPublicReportingCorsOrigins
} from "../src/server/build-server.ts";

test("readAllowedCorsOrigins excludes branded auth hosts from the API CORS allowlist", () => {
  const origins = readAllowedCorsOrigins({
    corsAllowedOrigins: [
      "https://portal.preview.paretoproof.com",
      "https://github.auth.paretoproof.com"
    ]
  } as never);

  assert.deepEqual(origins, [
    "https://portal.paretoproof.com",
    "https://portal.preview.paretoproof.com"
  ]);
  assert.equal(origins.includes("https://auth.paretoproof.com"), false);
  assert.equal(origins.includes("https://github.auth.paretoproof.com"), false);
  assert.equal(origins.includes("https://google.auth.paretoproof.com"), false);
});

test("readCorsRoutePath falls back to the raw request URL for Fastify preflights", () => {
  assert.equal(
    readCorsRoutePath("*", "/portal/session/finalize/submit?redirect=%2Fprofile"),
    "/portal/session/finalize/submit"
  );
  assert.equal(
    readCorsRoutePath("/portal/profile", "/portal/profile?tab=settings"),
    "/portal/profile"
  );
});

test("isAllowedCorsOrigin keeps branded finalize callers scoped to finalize-submit POST and OPTIONS only", () => {
  const allowedOrigins = [
    "https://portal.paretoproof.com"
  ];
  const publicReportingOrigins = readAllowedPublicReportingCorsOrigins();
  const brandedAuthOrigins = [
    "https://auth.paretoproof.com",
    "https://github.auth.paretoproof.com",
    "https://google.auth.paretoproof.com"
  ];

  assert.equal(
    isAllowedCorsOrigin({
      allowLocalhostCors: false,
      allowedOrigins,
      brandedAuthOrigins,
      method: "POST",
      origin: "https://github.auth.paretoproof.com",
      publicReportingOrigins,
      routePath: "/portal/session/finalize/submit"
    }),
    true
  );
  assert.equal(
    isAllowedCorsOrigin({
      allowLocalhostCors: false,
      allowedOrigins,
      brandedAuthOrigins,
      method: "OPTIONS",
      origin: "https://github.auth.paretoproof.com",
      publicReportingOrigins,
      routePath: readCorsRoutePath(
        "*",
        "/portal/session/finalize/submit?redirect=%2Fprofile"
      )
    }),
    true
  );
  assert.equal(
    isAllowedCorsOrigin({
      allowLocalhostCors: false,
      allowedOrigins,
      brandedAuthOrigins,
      method: "POST",
      origin: "https://github.auth.paretoproof.com",
      publicReportingOrigins,
      routePath: "/portal/profile"
    }),
    false
  );
  assert.equal(
    isAllowedCorsOrigin({
      allowLocalhostCors: false,
      allowedOrigins,
      brandedAuthOrigins,
      method: "OPTIONS",
      origin: "https://github.auth.paretoproof.com",
      publicReportingOrigins,
      routePath: "/portal/profile"
    }),
    false
  );
  assert.equal(
    isAllowedCorsOrigin({
      allowLocalhostCors: true,
      allowedOrigins,
      brandedAuthOrigins,
      method: "POST",
      origin: "http://github.auth.paretoproof.com:4371",
      publicReportingOrigins,
      routePath: "/portal/session/finalize/submit"
    }),
    true
  );
  assert.equal(
    isAllowedCorsOrigin({
      allowLocalhostCors: true,
      allowedOrigins,
      brandedAuthOrigins,
      method: "OPTIONS",
      origin: "http://github.auth.paretoproof.com:4371",
      publicReportingOrigins,
      routePath: "/portal/session/finalize/submit"
    }),
    true
  );
  assert.equal(
    isAllowedCorsOrigin({
      allowLocalhostCors: false,
      allowedOrigins,
      brandedAuthOrigins,
      method: "POST",
      origin: "http://github.auth.paretoproof.com:4371",
      publicReportingOrigins,
      routePath: "/portal/session/finalize/submit"
    }),
    false
  );
});

test("isAllowedCorsOrigin allows the apex public site only on the public reporting boundary", () => {
  const allowedOrigins = [
    "https://portal.paretoproof.com"
  ];
  const publicReportingOrigins = readAllowedPublicReportingCorsOrigins();

  assert.equal(
    isAllowedCorsOrigin({
      allowLocalhostCors: false,
      allowedOrigins,
      brandedAuthOrigins: [],
      method: "GET",
      origin: "https://paretoproof.com",
      publicReportingOrigins,
      routePath: "/public/reporting/releases"
    }),
    true
  );

  assert.equal(
    isAllowedCorsOrigin({
      allowLocalhostCors: false,
      allowedOrigins,
      brandedAuthOrigins: [],
      method: "GET",
      origin: "https://paretoproof.com",
      publicReportingOrigins,
      routePath: "/portal/profile"
    }),
    false
  );
});
