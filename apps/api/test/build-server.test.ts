import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowedCorsOrigin,
  readAllowedCorsOrigins
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

test("isAllowedCorsOrigin keeps branded finalize callers scoped to POST finalize-submit", () => {
  const allowedOrigins = [
    "https://portal.paretoproof.com"
  ];
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
      origin: "https://github.auth.paretoproof.com",
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
      routePath: "/portal/session/finalize/submit"
    }),
    false
  );
});
