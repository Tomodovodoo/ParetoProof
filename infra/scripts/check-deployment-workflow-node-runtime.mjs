import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDirectory, "..", "..");

const deployPagesWorkflowPath = ".github/workflows/deploy-pages.yml";
const publishWorkerWorkflowPath = ".github/workflows/publish-worker-image.yml";
const publishDevboxWorkflowPath = ".github/workflows/publish-problem9-devbox-image.yml";
const pullRequestCiWorkflowPath = ".github/workflows/pull-request-ci.yml";
const infraReadmePath = "infra/README.md";
const packageJsonPath = "package.json";

export class DeploymentWorkflowPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "DeploymentWorkflowPolicyError";
  }
}

function readText(relativePath, repoRoot = defaultRepoRoot) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function policyError(message) {
  return new DeploymentWorkflowPolicyError(message);
}

function assertCondition(condition, message) {
  if (!condition) {
    throw policyError(message);
  }
}

function assertIncludes(contents, snippets, file) {
  for (const snippet of snippets) {
    assertCondition(
      contents.includes(snippet),
      `${file} is missing required snippet "${snippet}"`
    );
  }
}

function assertExcludes(contents, snippets, file) {
  for (const snippet of snippets) {
    assertCondition(
      !contents.includes(snippet),
      `${file} still includes forbidden snippet "${snippet}"`
    );
  }
}

function splitLines(contents) {
  return contents.split(/\r?\n/u);
}

function indentation(line) {
  const match = line.match(/^ */u);
  return match ? match[0].length : 0;
}

function getBlockLines(lines, key, indent, file) {
  const header = `${key}:`;
  const startIndex = lines.findIndex(
    (line) => indentation(line) === indent && line.trim() === header
  );

  assertCondition(
    startIndex !== -1,
    `${file} is missing ${" ".repeat(indent)}${header}`
  );

  const blockLines = [];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.trim() !== "" && indentation(line) <= indent) {
      break;
    }

    blockLines.push(line);
  }

  return blockLines;
}

function assertBlockLine(blockLines, indent, text, file) {
  assertCondition(
    blockLines.some((line) => indentation(line) === indent && line.trim() === text),
    `${file} is missing ${" ".repeat(indent)}${text}`
  );
}

function readIndentedList(blockLines, key, keyIndent, itemIndent, file) {
  const startIndex = blockLines.findIndex(
    (line) => indentation(line) === keyIndent && line.trim() === `${key}:`
  );

  assertCondition(
    startIndex !== -1,
    `${file} is missing ${" ".repeat(keyIndent)}${key}:`
  );

  const values = [];

  for (let index = startIndex + 1; index < blockLines.length; index += 1) {
    const line = blockLines[index];

    if (line.trim() !== "" && indentation(line) <= keyIndent) {
      break;
    }

    if (indentation(line) === itemIndent && line.trim().startsWith("- ")) {
      values.push(line.trim().slice(2).trim());
    }
  }

  assertCondition(values.length > 0, `${file} ${key} must contain at least one value`);
  return values;
}

export function assertNoUnguardedPagesWorkflowDispatch(
  contents,
  file = deployPagesWorkflowPath
) {
  assertCondition(
    !/^\s*workflow_dispatch\s*:/mu.test(contents),
    `${file} must not expose workflow_dispatch while deploying with --branch=main`
  );
}

export function assertPagesPushTriggerIsMainOnly(contents, file = deployPagesWorkflowPath) {
  const lines = splitLines(contents);
  const onBlock = getBlockLines(lines, "on", 0, file);
  const pushBlock = getBlockLines(onBlock, "push", 2, file);
  const branches = readIndentedList(pushBlock, "branches", 4, 6, file);

  assertCondition(
    branches.length === 1 && branches[0] === "main",
    `${file} push trigger must be restricted to main only`
  );
}

export function assertPagesDeployJobPolicy(contents, file = deployPagesWorkflowPath) {
  const lines = splitLines(contents);
  const permissionsBlock = getBlockLines(lines, "permissions", 0, file);
  const jobsBlock = getBlockLines(lines, "jobs", 0, file);
  const deployBlock = getBlockLines(jobsBlock, "deploy", 2, file);
  const concurrencyBlock = getBlockLines(deployBlock, "concurrency", 4, file);

  assertBlockLine(permissionsBlock, 2, "contents: read", file);
  assertBlockLine(deployBlock, 4, "environment: production", file);
  assertBlockLine(concurrencyBlock, 6, "group: pages-production-deploy", file);
}

export function assertDeployStepStillUsesApprovedWranglerShape(
  contents,
  file = deployPagesWorkflowPath
) {
  assertIncludes(
    contents,
    [
      "FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true",
      "actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0",
      "working-directory: apps/web",
      "bunx wrangler pages deploy dist",
      "--project-name=paretoproof-web",
      "CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}",
      "CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}"
    ],
    file
  );

  assertExcludes(
    contents,
    ["cloudflare/wrangler-action@", "actions/checkout@v4"],
    file
  );

  const branchFlags = Array.from(
    contents.matchAll(/--branch=([^\s]+)/gu),
    (match) => match[1]
  );

  assertCondition(
    branchFlags.length === 1 && branchFlags[0] === "main",
    `${file} must deploy exactly one Cloudflare Pages branch, main`
  );
}

export function assertPagesDeployWorkflowPolicy(contents, file = deployPagesWorkflowPath) {
  assertNoUnguardedPagesWorkflowDispatch(contents, file);
  assertPagesPushTriggerIsMainOnly(contents, file);
  assertPagesDeployJobPolicy(contents, file);
  assertDeployStepStillUsesApprovedWranglerShape(contents, file);
}

export function validateDeploymentWorkflowNodeRuntimePolicy(
  repoRoot = defaultRepoRoot
) {
  const deployPagesWorkflow = readText(deployPagesWorkflowPath, repoRoot);
  const publishWorkerWorkflow = readText(publishWorkerWorkflowPath, repoRoot);
  const publishDevboxWorkflow = readText(publishDevboxWorkflowPath, repoRoot);
  const pullRequestCiWorkflow = readText(pullRequestCiWorkflowPath, repoRoot);
  const infraReadme = readText(infraReadmePath, repoRoot);
  const packageJson = JSON.parse(readText(packageJsonPath, repoRoot));

  assertPagesDeployWorkflowPolicy(deployPagesWorkflow, deployPagesWorkflowPath);

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
      "node infra/scripts/check-deployment-workflow-node-runtime.mjs",
      "Test deployment workflow guard fixtures",
      "node --test infra/scripts/test/check-deployment-workflow-node-runtime.test.mjs"
    ],
    pullRequestCiWorkflowPath
  );

  assertIncludes(
    infraReadme,
    [
      "check-deployment-workflow-node-runtime.mjs",
      "replaces the Node-20-only Wrangler JavaScript action with a local `bunx wrangler` deploy step",
      "pins the active deployment workflows to Node-24-compatible action revisions",
      "enforces the main-only production source invariant for Cloudflare Pages deploys"
    ],
    infraReadmePath
  );

  if (
    packageJson.scripts?.["check:deployment-workflow-node-runtime"] !==
    "node infra/scripts/check-deployment-workflow-node-runtime.mjs"
  ) {
    throw policyError(`${packageJsonPath} is missing script check:deployment-workflow-node-runtime`);
  }
}

function resolveCliRepoRoot(argv) {
  const repoRootIndex = argv.indexOf("--repo-root");

  if (repoRootIndex === -1) {
    return defaultRepoRoot;
  }

  const repoRoot = argv[repoRootIndex + 1];

  if (!repoRoot) {
    throw policyError("--repo-root requires a path argument");
  }

  return path.resolve(repoRoot);
}

export function runCli(
  argv = process.argv.slice(2),
  io = { log: console.log, error: console.error }
) {
  try {
    validateDeploymentWorkflowNodeRuntimePolicy(resolveCliRepoRoot(argv));
    io.log("Deployment workflows satisfy the approved runtime and Pages production source policy.");
    return 0;
  } catch (error) {
    io.error(`Deployment workflow Node runtime check failed: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(runCli());
}
