import assert from "node:assert/strict";
import test from "node:test";

import { validateProblem9ImagePolicy } from "../check-problem9-image-policy.mjs";
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
  "infra/docker/problem9-image-policy.json",
  "infra/problem9-image-policy.md",
  "infra/README.md",
  "apps/worker/README.md",
  "package.json"
];

test("validateProblem9ImagePolicy accepts the checked-in image policy", () => {
  assert.doesNotThrow(() => validateProblem9ImagePolicy(repoRoot));
});

test("validateProblem9ImagePolicy rejects publish artifact drift", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      "name: problem9-image-digests",
      "name: broken-image-digests"
    );

    assert.throws(
      () => validateProblem9ImagePolicy(tempRoot),
      /problem9-image-digests artifact/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateProblem9ImagePolicy rejects worker publish path drift", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      '      - "apps/worker/**"\n',
      ""
    );

    assert.throws(
      () => validateProblem9ImagePolicy(tempRoot),
      /push trigger is missing watched path "apps\/worker\/\*\*"/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("check-problem9-image-policy CLI supports --repo-root", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    const result = runCli("infra/scripts/check-problem9-image-policy.mjs", ["--repo-root", tempRoot]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Problem 9 image policy check passed/);
  } finally {
    disposeTempRepo(tempRoot);
  }
});
