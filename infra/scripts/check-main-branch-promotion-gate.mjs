#!/usr/bin/env node

import {
  assertIncludesAll,
  getJobSteps,
  getStepRun,
  getWorkflowJob,
  isDirectExecution,
  listUploadArtifactNames,
  normalizeStringList,
  normalizeWorkflowTriggers,
  parseCommonCliOptions,
  readRepoJson,
  readRepoText,
  readWorkflow,
  requireStep
} from "./lib/workflow-utils.mjs";

const runtimeDocPath = "docs/runtime.md";
const checklistDocPath = "docs/runtime-env-mode-checklists.md";
const projectManagementDocPath = "docs/project-management.md";
const prCiWorkflowPath = ".github/workflows/pull-request-ci.yml";
const publishWorkerWorkflowPath = ".github/workflows/publish-worker-image.yml";
const publishDevboxWorkflowPath = ".github/workflows/publish-problem9-devbox-image.yml";
const packageJsonPath = "package.json";

const requiredPrCiSteps = [
  {
    name: "Build Problem 9 execution image smoke target",
    runSnippets: [
      "node infra/scripts/build-problem9-image.mjs",
      "--target problem9-execution",
      "--tag paretoproof-problem9-execution:pr-smoke"
    ]
  },
  {
    name: "Verify Problem 9 execution image smoke target",
    runSnippets: [
      "node infra/scripts/verify-problem9-image-toolchains.mjs",
      "--target problem9-execution",
      "--image paretoproof-problem9-execution:pr-smoke"
    ]
  },
  {
    name: "Build Problem 9 devbox image smoke target",
    runSnippets: [
      "node infra/scripts/build-problem9-image.mjs",
      "--target problem9-devbox",
      "--tag paretoproof-problem9-devbox:pr-smoke"
    ]
  },
  {
    name: "Verify Problem 9 devbox image smoke target",
    runSnippets: [
      "node infra/scripts/verify-problem9-image-toolchains.mjs",
      "--target problem9-devbox",
      "--image paretoproof-problem9-devbox:pr-smoke"
    ]
  },
  {
    name: "Run deterministic Problem 9 verifier smoke",
    runSnippets: ["bun run test:worker:verifier-smoke"]
  },
  {
    name: "Run deterministic Problem 9 local-stub attempt smoke",
    runSnippets: [
      "node infra/scripts/run-problem9-attempt-smoke.mjs",
      "--image paretoproof-problem9-devbox:pr-smoke"
    ]
  },
  {
    name: "Check runtime env examples",
    runSnippets: ["node infra/scripts/check-runtime-env-examples.mjs"]
  },
  {
    name: "Check trusted-local auth boundaries",
    runSnippets: ["node infra/scripts/check-trusted-local-boundaries.mjs"]
  },
  {
    name: "Test API auth handoff routes",
    runSnippets: ["bun run test:api"]
  },
  {
    name: "Test web auth relay functions",
    runSnippets: ["bun --cwd apps/web test:functions"]
  },
  {
    name: "Smoke startup validation across runtime surfaces",
    runSnippets: ["bun run test:startup-validation"]
  }
];

const requiredGovernanceSteps = [
  {
    name: "Check PR governance body",
    runSnippets: ["node infra/scripts/check-pr-governance-body.mjs"]
  },
  {
    name: "Test governance guard fixtures",
    runSnippets: ["bun run test:governance-guards"]
  }
];

export function validateMainBranchPromotionGate(repoRoot) {
  const runtimeDoc = readRepoText(repoRoot, runtimeDocPath);
  const checklistDoc = readRepoText(repoRoot, checklistDocPath);
  const projectManagementDoc = readRepoText(repoRoot, projectManagementDocPath);
  const prCiWorkflow = readWorkflow(repoRoot, prCiWorkflowPath);
  const publishWorkerWorkflow = readWorkflow(repoRoot, publishWorkerWorkflowPath);
  const publishDevboxWorkflow = readWorkflow(repoRoot, publishDevboxWorkflowPath);
  const packageJson = readRepoJson(repoRoot, packageJsonPath);

  const prTriggers = normalizeWorkflowTriggers(prCiWorkflow);
  if (!prTriggers.has("pull_request")) {
    throw new Error(`${prCiWorkflowPath} must trigger on pull_request`);
  }

  const pullRequestConfig = prCiWorkflow.on?.pull_request ?? prCiWorkflow["on"]?.pull_request;
  const protectedBranches = normalizeStringList(pullRequestConfig?.branches);
  if (!protectedBranches.includes("main")) {
    throw new Error(`${prCiWorkflowPath} pull_request trigger must protect branch "main"`);
  }

  const pullRequestTypes = normalizeStringList(pullRequestConfig?.types);
  assertIncludesAll(
    pullRequestTypes,
    ["opened", "reopened", "synchronize", "edited", "ready_for_review"],
    `${prCiWorkflowPath} pull_request trigger types`
  );

  const ciJob = getWorkflowJob(prCiWorkflow, "ci", prCiWorkflowPath);
  for (const requiredStep of requiredPrCiSteps) {
    const step = requireStep(ciJob, requiredStep.name, prCiWorkflowPath);
    assertIncludesAll(getStepRun(step), requiredStep.runSnippets, `${prCiWorkflowPath} step "${requiredStep.name}"`);

    if (!runtimeDoc.includes(requiredStep.name)) {
      throw new Error(`${runtimeDocPath} must reference promotion-evidence step "${requiredStep.name}"`);
    }

    if (!checklistDoc.includes(requiredStep.name)) {
      throw new Error(`${checklistDocPath} must reference promotion-evidence step "${requiredStep.name}"`);
    }
  }

  for (const requiredStep of requiredGovernanceSteps) {
    const step = requireStep(ciJob, requiredStep.name, prCiWorkflowPath);
    assertIncludesAll(getStepRun(step), requiredStep.runSnippets, `${prCiWorkflowPath} step "${requiredStep.name}"`);
  }

  const workerPublishArtifacts = listUploadArtifactNames(
    getWorkflowJob(publishWorkerWorkflow, "publish", publishWorkerWorkflowPath)
  );
  if (!workerPublishArtifacts.includes("problem9-image-digests")) {
    throw new Error(`${publishWorkerWorkflowPath} must upload the problem9-image-digests artifact`);
  }

  const devboxPublishArtifacts = listUploadArtifactNames(
    getWorkflowJob(publishDevboxWorkflow, "publish", publishDevboxWorkflowPath)
  );
  if (!devboxPublishArtifacts.includes("problem9-devbox-image-digest")) {
    throw new Error(`${publishDevboxWorkflowPath} must upload the problem9-devbox-image-digest artifact`);
  }

  assertIncludesAll(
    runtimeDoc,
    ["Pull Request CI / ci", "problem9-image-digests", "problem9-devbox-image-digest"],
    runtimeDocPath
  );
  assertIncludesAll(
    checklistDoc,
    ["Pull Request CI / ci", "sample promotion path", "problem9-image-digests", "problem9-devbox-image-digest"],
    checklistDocPath
  );
  assertIncludesAll(
    projectManagementDoc,
    ["[runtime.md](./runtime.md)", "`Pull Request CI` workflow", "pre-merge PR smoke gate"],
    projectManagementDocPath
  );

  const packageScript = packageJson.scripts?.["check:main-branch-promotion-gate"];
  if (packageScript !== "node infra/scripts/check-main-branch-promotion-gate.mjs") {
    throw new Error(`${packageJsonPath} is missing script check:main-branch-promotion-gate`);
  }

  if (!getJobSteps(ciJob).length) {
    throw new Error(`${prCiWorkflowPath} ci job must declare steps`);
  }
}

function main() {
  try {
    const { repoRoot } = parseCommonCliOptions(import.meta.url);
    validateMainBranchPromotionGate(repoRoot);
    console.log("Main-branch promotion gate check passed.");
  } catch (error) {
    console.error(`Main-branch promotion gate check failed: ${error.message}`);
    process.exit(1);
  }
}

if (isDirectExecution(import.meta.url)) {
  main();
}
