import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerHealthRoute } from "../src/routes/health.ts";

test("GET /health returns 200 when readiness succeeds", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerHealthRoute(app, {
    checkReadiness: async () => {}
  });

  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    service: "api"
  });
});

test("GET /health returns 503 when readiness fails", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerHealthRoute(app, {
    checkReadiness: async () => {
      throw new Error("database_unreachable");
    }
  });

  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    error: "service_unavailable",
    ok: false,
    service: "api"
  });
});
