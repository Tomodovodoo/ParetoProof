import assert from "node:assert/strict";
import test from "node:test";

import { validateDeploymentWorkflowNodeRuntime } from "../check-deployment-workflow-node-runtime.mjs";
import {
  createTempRepo,
  disposeTempRepo,
  replaceInRepoFile,
  repoRoot,
  runCli
} from "./governance-test-helpers.mjs";

const requiredFiles = [
  ".github/workflows/deploy-pages.yml",
  ".github/workflows/publish-worker-image.yml",
  ".github/workflows/publish-problem9-devbox-image.yml",
  ".github/workflows/pull-request-ci.yml",
  "infra/README.md",
  "package.json"
];

test("validateDeploymentWorkflowNodeRuntime accepts the checked-in workflow shape", () => {
  assert.doesNotThrow(() => validateDeploymentWorkflowNodeRuntime(repoRoot));
});

test("validateDeploymentWorkflowNodeRuntime rejects a non-production deploy environment", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      "environment: production",
      "environment: staging"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /deploy job must target environment "production"/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("check-deployment-workflow-node-runtime CLI supports --repo-root", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    const result = runCli("infra/scripts/check-deployment-workflow-node-runtime.mjs", ["--repo-root", tempRoot]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Deployment workflows match the approved trigger, runtime, and action shape/);
  } finally {
    disposeTempRepo(tempRoot);
  }
});
