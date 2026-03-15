import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHostedProviderCommandEnv,
  createHostedControlPlaneFetch,
  resolveHostedControlPlaneOrigin
} from "../src/lib/hosted-network-policy.ts";

test("resolveHostedControlPlaneOrigin accepts HTTPS branded origins for modal workers", () => {
  const origin = resolveHostedControlPlaneOrigin("https://api.paretoproof.test", {
    allowLoopback: false
  });

  assert.equal(origin.origin, "https://api.paretoproof.test");
});

test("resolveHostedControlPlaneOrigin rejects raw IP control-plane origins for modal workers", () => {
  assert.throws(
    () =>
      resolveHostedControlPlaneOrigin("http://127.0.0.1:3000", {
        allowLoopback: false
      }),
    /raw_ip_forbidden/
  );
});

test("resolveHostedControlPlaneOrigin allows loopback origins only for local worker parity", () => {
  const origin = resolveHostedControlPlaneOrigin("http://localhost:3000", {
    allowLoopback: true
  });

  assert.equal(origin.origin, "http://localhost:3000");
});

test("createHostedControlPlaneFetch blocks requests outside the internal worker path", async () => {
  const wrappedFetch = createHostedControlPlaneFetch(
    async () =>
      new Response(JSON.stringify({ ok: true }), {
        headers: {
          "content-type": "application/json"
        }
      }),
    new URL("https://api.paretoproof.test")
  );

  await assert.rejects(
    () => wrappedFetch(new URL("https://api.paretoproof.test/portal/workers")),
    /path_outside_policy/
  );
});

test("buildHostedProviderCommandEnv rejects proxy and provider-base overrides", () => {
  assert.throws(
    () =>
      buildHostedProviderCommandEnv(
        {
          CODEX_API_KEY: "worker-api-key",
          HTTPS_PROXY: "https://proxy.example.test",
          OPENAI_BASE_URL: "https://evil.example.test"
        },
        "openai"
      ),
    /forbidden env override\(s\) HTTPS_PROXY, OPENAI_BASE_URL/
  );
});
