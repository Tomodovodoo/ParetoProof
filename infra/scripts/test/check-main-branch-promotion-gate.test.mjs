import assert from "node:assert/strict";
import test from "node:test";

import { validateMainBranchPromotionGate } from "../check-main-branch-promotion-gate.mjs";
import {
  createTempRepo,
  disposeTempRepo,
  replaceInRepoFile,
  repoRoot,
  runCli
} from "./governance-test-helpers.mjs";

const requiredFiles = [
  ".github/workflows/pull-request-ci.yml",
  ".github/workflows/publish-worker-image.yml",
  ".github/workflows/publish-problem9-devbox-image.yml",
  "docs/runtime.md",
  "docs/runtime-env-mode-checklists.md",
  "docs/project-management.md",
  "package.json"
];

test("validateMainBranchPromotionGate accepts the checked-in repo policy", () => {
  assert.doesNotThrow(() => validateMainBranchPromotionGate(repoRoot));
});

test("validateMainBranchPromotionGate rejects a missing PR governance step command", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      "node infra/scripts/check-pr-governance-body.mjs",
      "node infra/scripts/check-bidi-chars.mjs"
    );

    assert.throws(
      () => validateMainBranchPromotionGate(tempRoot),
      /Check PR governance body".*check-pr-governance-body\.mjs/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateMainBranchPromotionGate rejects a PR workflow that does not rerun on body edits", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      "      - edited",
      "      - labeled"
    );

    assert.throws(
      () => validateMainBranchPromotionGate(tempRoot),
      /pull_request trigger types.*edited/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateMainBranchPromotionGate rejects a workflow that omits startup validation", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      "      - name: Smoke startup validation across runtime surfaces\n        run: bun run test:startup-validation\n",
      ""
    );

    assert.throws(
      () => validateMainBranchPromotionGate(tempRoot),
      /Smoke startup validation across runtime surfaces/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("check-main-branch-promotion-gate CLI supports --repo-root", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    const result = runCli("infra/scripts/check-main-branch-promotion-gate.mjs", ["--repo-root", tempRoot]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Main-branch promotion gate check passed/);
  } finally {
    disposeTempRepo(tempRoot);
  }
});
