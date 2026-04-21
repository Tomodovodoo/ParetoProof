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
const codeownersPath = ".github/CODEOWNERS";
const prCiWorkflowPath = ".github/workflows/pull-request-ci.yml";
const trustedGovernanceWorkflowPath = ".github/workflows/pull-request-trusted-governance.yml";
const publishWorkerWorkflowPath = ".github/workflows/publish-worker-image.yml";
const publishDevboxWorkflowPath = ".github/workflows/publish-problem9-devbox-image.yml";
const packageJsonPath = "package.json";

const requiredPrCiSteps = [
  {
    name: "Build Problem 9 execution image smoke target",
    run: "node infra/scripts/build-problem9-image.mjs --target problem9-execution --tag paretoproof-problem9-execution:pr-smoke"
  },
  {
    name: "Verify Problem 9 execution image smoke target",
    run: "node infra/scripts/verify-problem9-image-toolchains.mjs --target problem9-execution --image paretoproof-problem9-execution:pr-smoke"
  },
  {
    name: "Build Problem 9 devbox image smoke target",
    run: "node infra/scripts/build-problem9-image.mjs --target problem9-devbox --tag paretoproof-problem9-devbox:pr-smoke"
  },
  {
    name: "Verify Problem 9 devbox image smoke target",
    run: "node infra/scripts/verify-problem9-image-toolchains.mjs --target problem9-devbox --image paretoproof-problem9-devbox:pr-smoke"
  },
  {
    name: "Run deterministic Problem 9 verifier smoke",
    run: "bun run test:worker:verifier-smoke"
  },
  {
    name: "Run deterministic Problem 9 local-stub attempt smoke",
    run: "node infra/scripts/run-problem9-attempt-smoke.mjs --image paretoproof-problem9-devbox:pr-smoke"
  },
  {
    name: "Check runtime env examples",
    run: "node infra/scripts/check-runtime-env-examples.mjs"
  },
  {
    name: "Check trusted-local auth boundaries",
    run: "node infra/scripts/check-trusted-local-boundaries.mjs"
  },
  {
    name: "Test API auth handoff routes",
    run: "bun run test:api"
  },
  {
    name: "Test web auth relay functions",
    run: "bun --cwd apps/web test:functions"
  },
  {
    name: "Smoke startup validation across runtime surfaces",
    run: "bun run test:startup-validation"
  }
];

const requiredGovernanceSteps = [
  {
    name: "Check PR governance body",
    run: "node infra/scripts/check-pr-governance-body.mjs"
  },
  {
    name: "Check main-branch promotion gate policy",
    run: "node infra/scripts/check-main-branch-promotion-gate.mjs"
  },
  {
    name: "Test governance guard fixtures",
    run: "bun run test:governance-guards"
  }
];

const requiredTrustedGovernanceSteps = [
  {
    name: "Check PR governance body",
    run: 'node infra/scripts/check-pr-governance-body.mjs --repo-root "$CANDIDATE_REPO_ROOT" --event-json "$GITHUB_EVENT_PATH"'
  },
  {
    name: "Check deployment workflow Node runtimes",
    run: 'node infra/scripts/check-deployment-workflow-node-runtime.mjs --repo-root "$CANDIDATE_REPO_ROOT"'
  },
  {
    name: "Check main-branch promotion gate policy",
    run: 'node infra/scripts/check-main-branch-promotion-gate.mjs --repo-root "$CANDIDATE_REPO_ROOT"'
  }
];

const requiredTrustedGovernanceCodeownerPaths = [
  "/.github/PULL_REQUEST_TEMPLATE.md",
  "/.github/CODEOWNERS",
  "/.github/workflows/deploy-pages.yml",
  "/.github/workflows/publish-problem9-devbox-image.yml",
  "/.github/workflows/publish-worker-image.yml",
  "/.github/workflows/pull-request-ci.yml",
  "/.github/workflows/pull-request-trusted-governance.yml",
  "/docs/project-management.md",
  "/docs/runtime-env-mode-checklists.md",
  "/docs/runtime.md",
  "/infra/README.md",
  "/infra/scripts/check-deployment-workflow-node-runtime.mjs",
  "/infra/scripts/check-main-branch-promotion-gate.mjs",
  "/infra/scripts/check-pr-governance-body.mjs",
  "/infra/scripts/lib/workflow-utils.mjs"
];

export function validateMainBranchPromotionGate(repoRoot) {
  const runtimeDoc = readRepoText(repoRoot, runtimeDocPath);
  const checklistDoc = readRepoText(repoRoot, checklistDocPath);
  const projectManagementDoc = readRepoText(repoRoot, projectManagementDocPath);
  const codeowners = readRepoText(repoRoot, codeownersPath);
  const prCiWorkflow = readWorkflow(repoRoot, prCiWorkflowPath);
  const trustedGovernanceWorkflow = readWorkflow(repoRoot, trustedGovernanceWorkflowPath);
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
    assertExactNamedRunStep(ciJob, requiredStep, prCiWorkflowPath);

    if (!runtimeDoc.includes(requiredStep.name)) {
      throw new Error(`${runtimeDocPath} must reference promotion-evidence step "${requiredStep.name}"`);
    }

    if (!checklistDoc.includes(requiredStep.name)) {
      throw new Error(`${checklistDocPath} must reference promotion-evidence step "${requiredStep.name}"`);
    }
  }

  for (const requiredStep of requiredGovernanceSteps) {
    assertExactNamedRunStep(ciJob, requiredStep, prCiWorkflowPath);
  }

  const trustedGovernanceTriggers = normalizeWorkflowTriggers(trustedGovernanceWorkflow);
  if (!trustedGovernanceTriggers.has("pull_request_target")) {
    throw new Error(`${trustedGovernanceWorkflowPath} must trigger on pull_request_target`);
  }

  const governanceJob = getWorkflowJob(trustedGovernanceWorkflow, "governance", trustedGovernanceWorkflowPath);
  for (const requiredStep of requiredTrustedGovernanceSteps) {
    assertExactNamedRunStep(governanceJob, requiredStep, trustedGovernanceWorkflowPath);
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
    [
      "Pull Request CI / ci",
      "Pull Request Trusted Governance / governance",
      "problem9-image-digests",
      "problem9-devbox-image-digest"
    ],
    runtimeDocPath
  );
  assertIncludesAll(
    checklistDoc,
    [
      "Pull Request CI / ci",
      "Pull Request Trusted Governance / governance",
      "same head",
      "sample promotion path",
      "final head",
      "problem9-image-digests",
      "problem9-devbox-image-digest"
    ],
    checklistDocPath
  );
  assertIncludesAll(
    projectManagementDoc,
    [
      "[runtime.md](./runtime.md)",
      "`Pull Request CI` workflow",
      "`Pull Request Trusted Governance` workflow",
      "exact PR head that will merge",
      "same head",
      "pre-merge PR smoke gate",
      "workflow-governance gate",
      "CODEOWNERS"
    ],
    projectManagementDocPath
  );
  for (const protectedPath of requiredTrustedGovernanceCodeownerPaths) {
    const owners = getEffectiveCodeowners(codeowners, protectedPath);
    if (owners.length !== 1 || owners[0] !== "@Tomodovodoo") {
      throw new Error(`${codeownersPath} must keep @Tomodovodoo as the sole effective owner for "${protectedPath}"`);
    }
  }

  const packageScript = packageJson.scripts?.["check:main-branch-promotion-gate"];
  if (packageScript !== "node infra/scripts/check-main-branch-promotion-gate.mjs") {
    throw new Error(`${packageJsonPath} is missing script check:main-branch-promotion-gate`);
  }

  if (!getJobSteps(ciJob).length) {
    throw new Error(`${prCiWorkflowPath} ci job must declare steps`);
  }
}

function getEffectiveCodeowners(codeownersText, protectedPath) {
  const normalizedProtectedPath = protectedPath.replace(/\\/g, "/");
  let effectiveOwners = [];

  for (const rawLine of codeownersText.split(/\r?\n/)) {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const tokens = trimmedLine.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      continue;
    }

    const pattern = tokens[0];
    const owners = [];
    for (const token of tokens.slice(1)) {
      if (token.startsWith("#")) {
        break;
      }

      owners.push(token);
    }
    if (!matchesCodeownersPattern(pattern, normalizedProtectedPath)) {
      continue;
    }

    effectiveOwners = owners;
  }

  return effectiveOwners;
}

function assertExactNamedRunStep(job, requiredStep, workflowPath) {
  const step = requireStep(job, requiredStep.name, workflowPath);
  const stepKeys = Object.keys(step ?? {}).sort();
  if (stepKeys.length !== 2 || stepKeys[0] !== "name" || stepKeys[1] !== "run") {
    throw new Error(`${workflowPath} step "${requiredStep.name}" must keep the approved step keys`);
  }

  if (getStepRun(step)?.trim() !== requiredStep.run) {
    throw new Error(`${workflowPath} step "${requiredStep.name}" must keep the approved command body`);
  }

  return step;
}

function matchesCodeownersPattern(pattern, protectedPath) {
  let normalizedPattern = pattern.trim().replace(/\\/g, "/");
  if (!normalizedPattern) {
    return false;
  }

  const supportsDirectoryCoverage = normalizedPattern.endsWith("/") || !/[?*[]/.test(normalizedPattern);
  if (normalizedPattern.endsWith("/")) {
    normalizedPattern += "**";
  }

  const anchored = normalizedPattern.startsWith("/");
  const patternBody = anchored ? normalizedPattern.slice(1) : normalizedPattern;
  const prefix = anchored ? "^/" : "^(?:|.*/)";

  let regexBody = "";
  for (let index = 0; index < patternBody.length; index += 1) {
    const char = patternBody[index];
    const nextChar = patternBody[index + 1];
    if (char === "*" && nextChar === "*") {
      regexBody += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      regexBody += "[^/]*";
      continue;
    }

    if (char === "?") {
      regexBody += "[^/]";
      continue;
    }

    regexBody += escapeRegExp(char);
  }

  const matcher = new RegExp(`${prefix}${regexBody}$`);
  if (matcher.test(protectedPath)) {
    return true;
  }

  if (!supportsDirectoryCoverage) {
    return false;
  }

  return getAncestorDirectories(protectedPath).some((ancestorPath) => matcher.test(ancestorPath));
}

function getAncestorDirectories(pathname) {
  const segments = pathname.split("/").filter(Boolean);
  const ancestors = [];
  let currentPath = "";
  for (const segment of segments.slice(0, -1)) {
    currentPath += `/${segment}`;
    ancestors.push(currentPath);
  }

  return ancestors;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
