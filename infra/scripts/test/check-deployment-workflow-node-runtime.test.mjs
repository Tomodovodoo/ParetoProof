import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DeploymentWorkflowPolicyError,
  assertPagesDeployWorkflowPolicy,
  runCli,
  validateDeploymentWorkflowNodeRuntimePolicy
} from "../check-deployment-workflow-node-runtime.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const fixturesRoot = resolve(
  fileURLToPath(new URL("../fixtures/deployment-workflows", import.meta.url))
);

function readFixture(name) {
  return readFileSync(resolve(fixturesRoot, name), "utf8");
}

function assertPolicyFailure(contents, expectedMessage) {
  assert.throws(
    () => assertPagesDeployWorkflowPolicy(contents, "fixture.yml"),
    (error) => {
      assert.equal(error instanceof DeploymentWorkflowPolicyError, true);
      assert.match(error.message, expectedMessage);
      return true;
    }
  );
}

test("checked-in deployment workflows satisfy the runtime and Pages source policy", () => {
  assert.doesNotThrow(() => validateDeploymentWorkflowNodeRuntimePolicy(repoRoot));
});

test("safe Pages deployment fixture passes the policy guard", () => {
  assert.doesNotThrow(() =>
    assertPagesDeployWorkflowPolicy(readFixture("deploy-pages-safe.yml"), "safe.yml")
  );
});

test("unguarded manual Pages dispatch cannot publish as main", () => {
  assertPolicyFailure(
    readFixture("deploy-pages-manual-unsafe.yml"),
    /must not expose workflow_dispatch while deploying with --branch=main/u
  );
});

test("Pages deploy workflow must only push from main", () => {
  assertPolicyFailure(
    readFixture("deploy-pages-safe.yml").replace("- main", ["- main", "      - staging"].join("\n")),
    /push trigger must be restricted to main only/u
  );
});

test("Pages deploy workflow must keep the production environment", () => {
  assertPolicyFailure(
    readFixture("deploy-pages-safe.yml").replace("environment: production", "environment: staging"),
    /environment: production/u
  );
});

test("Pages deploy workflow must explicitly deploy the Cloudflare Pages main branch", () => {
  assertPolicyFailure(
    readFixture("deploy-pages-safe.yml").replace("--branch=main", "--branch=preview"),
    /must deploy exactly one Cloudflare Pages branch, main/u
  );
});

test("Pages deploy workflow must keep Cloudflare credentials secret-backed", () => {
  assertPolicyFailure(
    readFixture("deploy-pages-safe.yml").replace(
      "CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}",
      "CLOUDFLARE_API_TOKEN: unsafe-inline-token"
    ),
    /CLOUDFLARE_API_TOKEN/u
  );
});

test("Pages deploy workflow must keep the checkout action pinned", () => {
  assertPolicyFailure(
    readFixture("deploy-pages-safe.yml").replace(
      "actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0",
      "actions/checkout@v4"
    ),
    /actions\/checkout/u
  );
});

test("Pages deploy workflow must not reintroduce the Wrangler JavaScript action", () => {
  assertPolicyFailure(
    `${readFixture("deploy-pages-safe.yml")}\n      - uses: cloudflare/wrangler-action@v3\n`,
    /cloudflare\/wrangler-action@/u
  );
});

test("CLI wrapper returns a failure code and useful error text for invalid repo roots", () => {
  const messages = [];
  const status = runCli(["--repo-root", "/path/that/does/not/exist"], {
    log: (message) => messages.push(message),
    error: (message) => messages.push(message)
  });

  assert.equal(status, 1);
  assert.match(messages.join("\n"), /Deployment workflow Node runtime check failed:/u);
});
