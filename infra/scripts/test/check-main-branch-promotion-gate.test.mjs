import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
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
  ".github/CODEOWNERS",
  ".github/workflows/pull-request-ci.yml",
  ".github/workflows/pull-request-trusted-governance.yml",
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
      /Check PR governance body".*approved command body/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateMainBranchPromotionGate rejects wrapped promotion smoke commands", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      "run: bun run test:worker:verifier-smoke",
      "run: echo bun run test:worker:verifier-smoke"
    );

    assert.throws(
      () => validateMainBranchPromotionGate(tempRoot),
      /Run deterministic Problem 9 verifier smoke".*approved command body/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateMainBranchPromotionGate rejects PR CI workflows that omit the promotion-gate validator step", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      "      - name: Check main-branch promotion gate policy\n        run: node infra/scripts/check-main-branch-promotion-gate.mjs\n",
      ""
    );

    assert.throws(
      () => validateMainBranchPromotionGate(tempRoot),
      /Check main-branch promotion gate policy/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateMainBranchPromotionGate rejects a missing trusted-governance runtime-check command", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-trusted-governance.yml",
      'node infra/scripts/check-deployment-workflow-node-runtime.mjs --repo-root "$CANDIDATE_REPO_ROOT"',
      'node infra/scripts/check-pr-governance-body.mjs --repo-root "$CANDIDATE_REPO_ROOT" --event-json "$GITHUB_EVENT_PATH"'
    );

    assert.throws(
      () => validateMainBranchPromotionGate(tempRoot),
      /Check deployment workflow Node runtimes".*approved command body/
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

test("validateMainBranchPromotionGate rejects checklist docs that drop the final-head governance wording", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      "docs/runtime-env-mode-checklists.md",
      "on the same head",
      "for the same pull request"
    );

    assert.throws(
      () => validateMainBranchPromotionGate(tempRoot),
      /runtime-env-mode-checklists\.md.*same head/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateMainBranchPromotionGate rejects missing CODEOWNERS coverage for trusted governance files", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/CODEOWNERS",
      "/infra/scripts/check-deployment-workflow-node-runtime.mjs @Tomodovodoo\n",
      ""
    );

    assert.throws(
      () => validateMainBranchPromotionGate(tempRoot),
      /CODEOWNERS.*check-deployment-workflow-node-runtime\.mjs/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateMainBranchPromotionGate accepts semantically equivalent wildcard CODEOWNERS coverage", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    writeFileSync(
      resolve(tempRoot, ".github/CODEOWNERS"),
      [
        "/.github/** @Tomodovodoo",
        "/docs/** @Tomodovodoo",
        "/infra/README.md @Tomodovodoo",
        "/infra/scripts/** @Tomodovodoo"
      ].join("\n"),
      "utf8"
    );

    assert.doesNotThrow(() => validateMainBranchPromotionGate(tempRoot));
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateMainBranchPromotionGate accepts plain directory CODEOWNERS coverage", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    writeFileSync(
      resolve(tempRoot, ".github/CODEOWNERS"),
      [
        "/.github @Tomodovodoo",
        "/docs @Tomodovodoo",
        "/infra/README.md @Tomodovodoo",
        "/infra/scripts @Tomodovodoo"
      ].join("\n"),
      "utf8"
    );

    assert.doesNotThrow(() => validateMainBranchPromotionGate(tempRoot));
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateMainBranchPromotionGate rejects a later CODEOWNERS override that removes the effective owner", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    const codeownersFilePath = resolve(tempRoot, ".github/CODEOWNERS");
    const codeowners = readFileSync(codeownersFilePath, "utf8");
    writeFileSync(codeownersFilePath, `${codeowners}\n* @attacker\n`, "utf8");

    assert.throws(
      () => validateMainBranchPromotionGate(tempRoot),
      /CODEOWNERS.*effective owner/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateMainBranchPromotionGate rejects additive CODEOWNERS ownership on protected paths", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/CODEOWNERS",
      "/.github/PULL_REQUEST_TEMPLATE.md @Tomodovodoo",
      "/.github/PULL_REQUEST_TEMPLATE.md @Tomodovodoo @attacker"
    );

    assert.throws(
      () => validateMainBranchPromotionGate(tempRoot),
      /CODEOWNERS.*sole effective owner/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateMainBranchPromotionGate rejects additive CODEOWNERS email ownership on protected paths", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/CODEOWNERS",
      "/.github/PULL_REQUEST_TEMPLATE.md @Tomodovodoo",
      "/.github/PULL_REQUEST_TEMPLATE.md @Tomodovodoo attacker@example.com"
    );

    assert.throws(
      () => validateMainBranchPromotionGate(tempRoot),
      /CODEOWNERS.*sole effective owner/
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
