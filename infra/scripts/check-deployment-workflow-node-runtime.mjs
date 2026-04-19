import {
  assertExcludesAll,
  assertIncludesAll,
  getJobEnvironmentName,
  getStepEnvValue,
  getStepRun,
  getStepUses,
  getStepWithValue,
  getStepWorkingDirectory,
  getWorkflowEnvValue,
  getWorkflowJob,
  getWorkflowTriggerConfig,
  isDirectExecution,
  normalizeStringList,
  normalizeWorkflowTriggers,
  parseCommonCliOptions,
  readRepoJson,
  readRepoText,
  readWorkflow,
  requireStep
} from "./lib/workflow-utils.mjs";

const deployPagesWorkflowPath = ".github/workflows/deploy-pages.yml";
const publishWorkerWorkflowPath = ".github/workflows/publish-worker-image.yml";
const publishDevboxWorkflowPath = ".github/workflows/publish-problem9-devbox-image.yml";
const pullRequestCiWorkflowPath = ".github/workflows/pull-request-ci.yml";
const infraReadmePath = "infra/README.md";
const packageJsonPath = "package.json";

const requiredDeployPaths = [
  "apps/web/**",
  "packages/shared/**",
  "package.json",
  "bun.lock",
  "tsconfig.base.json",
  ".github/workflows/deploy-pages.yml"
];

export function validateDeploymentWorkflowNodeRuntime(repoRoot) {
  const deployPagesWorkflow = readWorkflow(repoRoot, deployPagesWorkflowPath);
  const publishWorkerWorkflow = readWorkflow(repoRoot, publishWorkerWorkflowPath);
  const publishDevboxWorkflow = readWorkflow(repoRoot, publishDevboxWorkflowPath);
  const pullRequestCiWorkflow = readWorkflow(repoRoot, pullRequestCiWorkflowPath);
  const infraReadme = readRepoText(repoRoot, infraReadmePath);
  const packageJson = readRepoJson(repoRoot, packageJsonPath);

  const deployTriggers = normalizeWorkflowTriggers(deployPagesWorkflow);
  if (!deployTriggers.has("push") || !deployTriggers.has("workflow_dispatch")) {
    throw new Error(`${deployPagesWorkflowPath} must declare push and workflow_dispatch triggers`);
  }

  const deployPushConfig = getWorkflowTriggerConfig(deployPagesWorkflow, "push");
  const deployBranches = normalizeStringList(deployPushConfig?.branches);
  if (!deployBranches.includes("main")) {
    throw new Error(`${deployPagesWorkflowPath} push trigger must protect branch "main"`);
  }

  const deployPaths = normalizeStringList(deployPushConfig?.paths);
  for (const requiredPath of requiredDeployPaths) {
    if (!deployPaths.includes(requiredPath)) {
      throw new Error(`${deployPagesWorkflowPath} push trigger is missing watched path "${requiredPath}"`);
    }
  }

  if (getWorkflowEnvValue(deployPagesWorkflow, "FORCE_JAVASCRIPT_ACTIONS_TO_NODE24") !== "true") {
    throw new Error(`${deployPagesWorkflowPath} must set FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`);
  }

  const deployJob = getWorkflowJob(deployPagesWorkflow, "deploy", deployPagesWorkflowPath);
  if (getJobEnvironmentName(deployJob) !== "production") {
    throw new Error(`${deployPagesWorkflowPath} deploy job must target environment "production"`);
  }

  if (deployJob.concurrency?.group !== "pages-production-deploy") {
    throw new Error(`${deployPagesWorkflowPath} deploy job must use concurrency group "pages-production-deploy"`);
  }

  const checkoutStep = requireStep(deployJob, "Check out repository", deployPagesWorkflowPath);
  if (getStepUses(checkoutStep) !== "actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8") {
    throw new Error(`${deployPagesWorkflowPath} must pin the checkout action to v5.0.0`);
  }

  const installDependenciesStep = requireStep(deployJob, "Install dependencies", deployPagesWorkflowPath);
  assertIncludesAll(getStepRun(installDependenciesStep), ["bun install --frozen-lockfile"], `${deployPagesWorkflowPath} step "Install dependencies"`);

  const buildSharedStep = requireStep(deployJob, "Build shared package", deployPagesWorkflowPath);
  assertIncludesAll(getStepRun(buildSharedStep), ["bun run build:shared"], `${deployPagesWorkflowPath} step "Build shared package"`);

  const buildWebStep = requireStep(deployJob, "Build web app", deployPagesWorkflowPath);
  assertIncludesAll(getStepRun(buildWebStep), ["bun run build:web"], `${deployPagesWorkflowPath} step "Build web app"`);

  const deployStep = requireStep(deployJob, "Deploy to Cloudflare Pages", deployPagesWorkflowPath);
  assertIncludesAll(
    getStepRun(deployStep),
    ["bunx wrangler pages deploy dist", "--project-name=paretoproof-web", "--branch=main"],
    `${deployPagesWorkflowPath} step "Deploy to Cloudflare Pages"`
  );
  if (getStepWorkingDirectory(deployStep) !== "apps/web") {
    throw new Error(`${deployPagesWorkflowPath} deploy step must run from apps/web`);
  }
  if (getStepEnvValue(deployStep, "CLOUDFLARE_API_TOKEN") !== "${{ secrets.CLOUDFLARE_API_TOKEN }}") {
    throw new Error(`${deployPagesWorkflowPath} deploy step must source CLOUDFLARE_API_TOKEN from secrets`);
  }
  if (getStepEnvValue(deployStep, "CLOUDFLARE_ACCOUNT_ID") !== "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}") {
    throw new Error(`${deployPagesWorkflowPath} deploy step must source CLOUDFLARE_ACCOUNT_ID from secrets`);
  }

  for (const step of deployJob.steps ?? []) {
    assertExcludesAll(getStepUses(step), ["cloudflare/wrangler-action@", "actions/checkout@v4"], `${deployPagesWorkflowPath} workflow`);
  }

  for (const [workflowPath, workflow, expectedGroup] of [
    [publishWorkerWorkflowPath, publishWorkerWorkflow, "worker-image-publish"],
    [publishDevboxWorkflowPath, publishDevboxWorkflow, "problem9-devbox-image-publish"]
  ]) {
    if (getWorkflowEnvValue(workflow, "FORCE_JAVASCRIPT_ACTIONS_TO_NODE24") !== "true") {
      throw new Error(`${workflowPath} must set FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`);
    }

    const publishJob = getWorkflowJob(workflow, "publish", workflowPath);
    if (getJobEnvironmentName(publishJob) !== "production") {
      throw new Error(`${workflowPath} publish job must target environment "production"`);
    }

    if (publishJob.concurrency?.group !== expectedGroup) {
      throw new Error(`${workflowPath} publish job must use concurrency group "${expectedGroup}"`);
    }

    const expectedActions = {
      "Check out repository": "actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8",
      "Set up Docker Buildx": "docker/setup-buildx-action@4d04d5d9486b7bd6fa91e7baf45bbb4f8b9deedd",
      "Log in to GitHub Container Registry": "docker/login-action@b45d80f862d83dbcd57f89517bcf500b2ab88fb2",
      "Upload image digest artifact": "actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f"
    };

    for (const [stepName, expectedAction] of Object.entries(expectedActions)) {
      const step = requireStep(publishJob, stepName, workflowPath);
      if (getStepUses(step) !== expectedAction) {
        throw new Error(`${workflowPath} step "${stepName}" must use ${expectedAction}`);
      }
    }
  }

  const prCiJob = getWorkflowJob(pullRequestCiWorkflow, "ci", pullRequestCiWorkflowPath);
  const prCiStep = requireStep(prCiJob, "Check deployment workflow Node runtimes", pullRequestCiWorkflowPath);
  assertIncludesAll(
    getStepRun(prCiStep),
    ["node infra/scripts/check-deployment-workflow-node-runtime.mjs"],
    `${pullRequestCiWorkflowPath} step "Check deployment workflow Node runtimes"`
  );

  assertIncludesAll(
    infraReadme,
    [
      "check-deployment-workflow-node-runtime.mjs",
      "trigger, environment, and Node 24-compatible action/runtime shape",
      "local `bunx wrangler` deploy step"
    ],
    infraReadmePath
  );

  if (
    packageJson.scripts?.["check:deployment-workflow-node-runtime"] !==
    "node infra/scripts/check-deployment-workflow-node-runtime.mjs"
  ) {
    throw new Error(`${packageJsonPath} is missing script check:deployment-workflow-node-runtime`);
  }
}

function main() {
  try {
    const { repoRoot } = parseCommonCliOptions(import.meta.url);
    validateDeploymentWorkflowNodeRuntime(repoRoot);
    console.log("Deployment workflows match the approved trigger, runtime, and action shape.");
  } catch (error) {
    console.error(`Deployment workflow Node runtime check failed: ${error.message}`);
    process.exit(1);
  }
}

if (isDirectExecution(import.meta.url)) {
  main();
}
