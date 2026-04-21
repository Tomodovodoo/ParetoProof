import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuthenticatedContinuationUrl,
  readAuthenticatedContinuation,
  readAuthenticatedSurfaceRouteFamily,
  sanitizeAuthenticatedRedirectPath,
} from "../src/lib/authenticated-surface.ts";

const runtimeConfig = {
  mathPublicOrigin: "https://math.preview.paretoproof.com",
  portalPublicOrigin: "https://portal.preview.paretoproof.com",
};

test("readAuthenticatedSurfaceRouteFamily distinguishes portal, math, and non-app routes", () => {
  assert.equal(readAuthenticatedSurfaceRouteFamily("/portal"), "portal");
  assert.equal(readAuthenticatedSurfaceRouteFamily("/portal/profile"), "portal");
  assert.equal(readAuthenticatedSurfaceRouteFamily("/math"), "math");
  assert.equal(readAuthenticatedSurfaceRouteFamily("/math/questions/q_123"), "math");
  assert.equal(readAuthenticatedSurfaceRouteFamily("/internal/workers/claim"), null);
});

test("sanitizeAuthenticatedRedirectPath keeps callers inside the requested authenticated surface", () => {
  assert.equal(
    sanitizeAuthenticatedRedirectPath("/launch", "math", runtimeConfig),
    "/launch",
  );
  assert.equal(
    sanitizeAuthenticatedRedirectPath("/profile", "math", runtimeConfig),
    "/",
  );
  assert.equal(
    sanitizeAuthenticatedRedirectPath(
      "https://portal.preview.paretoproof.com/profile",
      "math",
      runtimeConfig,
    ),
    "/",
  );
});

test("readAuthenticatedContinuation gives body values precedence over query values", () => {
  assert.deepEqual(
    readAuthenticatedContinuation(
      {
        body: {
          app: "math",
          redirect: "/launch",
        },
        query: {
          app: "portal",
          redirect: "/profile",
        },
      },
      runtimeConfig,
    ),
    {
      redirectPath: "/launch",
      targetSurface: "math",
    },
  );
});

test("buildAuthenticatedContinuationUrl resolves redirects against the requested surface origin", () => {
  assert.equal(
    buildAuthenticatedContinuationUrl("/launch", "math", runtimeConfig).toString(),
    "https://math.preview.paretoproof.com/launch",
  );
  assert.equal(
    buildAuthenticatedContinuationUrl("/profile", "portal", runtimeConfig).toString(),
    "https://portal.preview.paretoproof.com/profile",
  );
});
