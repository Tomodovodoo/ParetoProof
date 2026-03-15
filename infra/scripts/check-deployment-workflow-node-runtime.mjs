import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "..", "..");

function readText(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function fail(message) {
  console.error(`Deployment workflow Node runtime check failed: ${message}`);
  process.exit(1);
}

function assertIncludes(contents, snippets, file) {
  for (const snippet of snippets) {
    if (!contents.includes(snippet)) {
      fail(`${file} is missing required snippet "${snippet}"`);
    }
  }
}

function assertExcludes(contents, snippets, file) {
  for (const snippet of snippets) {
    if (contents.includes(snippet)) {
      fail(`${file} still includes forbidden snippet "${snippet}"`);
    }
  }
}

const deployPagesWorkflowPath = ".github/workflows/deploy-pages.yml";
const publishWorkerWorkflowPath = ".github/workflows/publish-worker-image.yml";
const publishDevboxWorkflowPath = ".github/workflows/publish-problem9-devbox-image.yml";
const pullRequestCiWorkflowPath = ".github/workflows/pull-request-ci.yml";
const infraReadmePath = "infra/README.md";
const packageJsonPath = "package.json";

const deployPagesWorkflow = readText(deployPagesWorkflowPath);
const publishWorkerWorkflow = readText(publishWorkerWorkflowPath);
const publishDevboxWorkflow = readText(publishDevboxWorkflowPath);
const pullRequestCiWorkflow = readText(pullRequestCiWorkflowPath);
const infraReadme = readText(infraReadmePath);
const packageJson = JSON.parse(readText(packageJsonPath));

assertIncludes(
  deployPagesWorkflow,
  [
    "FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true",
    "actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0",
    "working-directory: apps/web",
    "bunx wrangler pages deploy dist",
    "CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}",
    "CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}"
  ],
  deployPagesWorkflowPath
);
assertExcludes(
  deployPagesWorkflow,
  ["cloudflare/wrangler-action@", "actions/checkout@v4"],
  deployPagesWorkflowPath
);

for (const [file, contents] of [
  [publishWorkerWorkflowPath, publishWorkerWorkflow],
  [publishDevboxWorkflowPath, publishDevboxWorkflow]
]) {
  assertIncludes(
    contents,
    [
      "FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true",
      "actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0",
      "docker/setup-buildx-action@4d04d5d9486b7bd6fa91e7baf45bbb4f8b9deedd # v4.0.0",
      "docker/login-action@b45d80f862d83dbcd57f89517bcf500b2ab88fb2 # v4.0.0",
      "docker/metadata-action@030e881283bb7a6894de51c315a6bfe6a94e05cf # v6.0.0",
      "docker/build-push-action@d08e5c354a6adb9ed34480a06d141179aa583294 # v7.0.0",
      "actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f # v7.0.0"
    ],
    file
  );
}

assertIncludes(
  pullRequestCiWorkflow,
  [
    "Check deployment workflow Node runtimes",
    "node infra/scripts/check-deployment-workflow-node-runtime.mjs"
  ],
  pullRequestCiWorkflowPath
);

assertIncludes(
  infraReadme,
  [
    "check-deployment-workflow-node-runtime.mjs",
    "replaces the Node-20-only Wrangler JavaScript action with a local `bunx wrangler` deploy step",
    "pins the active deployment workflows to Node-24-compatible action revisions"
  ],
  infraReadmePath
);

if (
  packageJson.scripts?.["check:deployment-workflow-node-runtime"] !==
  "node infra/scripts/check-deployment-workflow-node-runtime.mjs"
) {
  fail(`${packageJsonPath} is missing script check:deployment-workflow-node-runtime`);
}

console.log("Deployment workflows are pinned to the approved Node 24-compatible action/runtime shape.");
