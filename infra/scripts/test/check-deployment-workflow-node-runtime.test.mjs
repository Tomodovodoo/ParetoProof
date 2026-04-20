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

test("validateDeploymentWorkflowNodeRuntime rejects drifted publish metadata-action pins", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      "docker/metadata-action@030e881283bb7a6894de51c315a6bfe6a94e05cf",
      "docker/metadata-action@v5"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /Generate execution image metadata.*docker\/metadata-action@030e881283bb7a6894de51c315a6bfe6a94e05cf/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects drifted worker metadata-action pins", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      `- name: Generate worker image metadata
        id: worker_metadata
        uses: docker/metadata-action@030e881283bb7a6894de51c315a6bfe6a94e05cf`,
      `- name: Generate worker image metadata
        id: worker_metadata
        uses: docker/metadata-action@v5`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /Generate worker image metadata.*docker\/metadata-action@030e881283bb7a6894de51c315a6bfe6a94e05cf/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects drifted devbox metadata-action pins", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-problem9-devbox-image.yml",
      "docker/metadata-action@030e881283bb7a6894de51c315a6bfe6a94e05cf",
      "docker/metadata-action@v5"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /Generate devbox image metadata.*docker\/metadata-action@030e881283bb7a6894de51c315a6bfe6a94e05cf/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects drifted execution build-push-action pins", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      `- name: Build and publish Problem 9 execution image
        id: build_execution
        uses: docker/build-push-action@d08e5c354a6adb9ed34480a06d141179aa583294`,
      `- name: Build and publish Problem 9 execution image
        id: build_execution
        uses: docker/build-push-action@v6`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /Build and publish Problem 9 execution image.*docker\/build-push-action@d08e5c354a6adb9ed34480a06d141179aa583294/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects drifted publish build-push-action pins", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-problem9-devbox-image.yml",
      "docker/build-push-action@d08e5c354a6adb9ed34480a06d141179aa583294",
      "docker/build-push-action@v6"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /Build and publish devbox image.*docker\/build-push-action@d08e5c354a6adb9ed34480a06d141179aa583294/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects drifted worker build-push-action pins", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      `- name: Build and publish worker image
        id: build_worker
        uses: docker/build-push-action@d08e5c354a6adb9ed34480a06d141179aa583294`,
      `- name: Build and publish worker image
        id: build_worker
        uses: docker/build-push-action@v6`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /Build and publish worker image.*docker\/build-push-action@d08e5c354a6adb9ed34480a06d141179aa583294/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects extra unapproved publish build-push steps", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      `      - name: Upload image digest artifact
        uses: actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f # v7.0.0`,
      `      - name: Shadow publish
        uses: docker/build-push-action@v6

      - name: Upload image digest artifact
        uses: actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f # v7.0.0`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /not an approved pinned Docker publish step/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects extra unapproved publish metadata steps", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-problem9-devbox-image.yml",
      `      - name: Build devbox image for toolchain verification
        run: >-`,
      `      - name: Shadow metadata
        uses: docker/metadata-action@v6

      - name: Build devbox image for toolchain verification
        run: >-`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /not an approved pinned Docker publish step/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects mixed-case extra publish actions", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      `      - name: Upload image digest artifact
        uses: actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f # v7.0.0`,
      `      - name: Shadow publish
        uses: Docker/build-push-action@v6

      - name: Upload image digest artifact
        uses: actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f # v7.0.0`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /not an approved pinned Docker publish step/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects duplicate approved-name publish steps", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      `      - name: Upload image digest artifact
        uses: actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f # v7.0.0`,
      `      - name: Build and publish worker image
        id: shadow_worker_publish
        uses: docker/build-push-action@d08e5c354a6adb9ed34480a06d141179aa583294 # v7.0.0
        with:
          context: .
          file: apps/worker/Dockerfile
          target: paretoproof-worker
          push: true
          tags: ghcr.io/example/shadow:latest
          labels: shadow=true

      - name: Upload image digest artifact
        uses: actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f # v7.0.0`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must not appear more than once/
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
