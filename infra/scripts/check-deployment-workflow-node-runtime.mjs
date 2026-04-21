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
const pullRequestTrustedGovernanceWorkflowPath = ".github/workflows/pull-request-trusted-governance.yml";
const infraReadmePath = "infra/README.md";
const packageJsonPath = "package.json";
const setupBunActionPin = "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6";

const requiredDeployPaths = [
  "apps/web/**",
  "packages/shared/**",
  "package.json",
  "bun.lock",
  "tsconfig.base.json",
  ".github/workflows/deploy-pages.yml"
];

const requiredWorkerPublishPaths = [
  "apps/worker/**",
  "benchmarks/firstproof/problem9/**",
  "packages/shared/**",
  "package.json",
  "bun.lock",
  "tsconfig.base.json",
  ".github/workflows/publish-worker-image.yml"
];

const approvedDeployRunSteps = new Map([
  ["Install dependencies", "bun install --frozen-lockfile"],
  ["Build shared package", "bun run build:shared"],
  ["Build web app", "bun run build:web"],
  ["Deploy to Cloudflare Pages", "bunx wrangler pages deploy dist --project-name=paretoproof-web --branch=main"]
]);

const approvedWorkerPublishRunSteps = new Map([
  [
    "Build execution rootfs for toolchain verification",
    "docker buildx build --file apps/worker/Dockerfile --target problem9-execution --output type=local,dest=.tmp/problem9-execution-rootfs --cache-from type=gha,scope=problem9-execution ."
  ],
  [
    "Verify execution image toolchains",
    "node infra/scripts/verify-problem9-image-toolchains.mjs --target problem9-execution --rootfs .tmp/problem9-execution-rootfs"
  ],
  [
    "Record published image digests",
    [
      "{",
      "  echo \"# Problem 9 publish result\"",
      "  echo",
      "  echo \"## ${{ env.EXECUTION_IMAGE }}\"",
      "  echo",
      "  echo \"Tags:\"",
      "  echo \"${{ steps.execution_metadata.outputs.tags }}\"",
      "  echo",
      "  echo \"Digest: \\`${{ steps.build_execution.outputs.digest }}\\`\"",
      "  echo",
      "  echo",
      "  echo \"## ${{ env.WORKER_IMAGE }}\"",
      "  echo",
      "  echo \"Tags:\"",
      "  echo \"${{ steps.worker_metadata.outputs.tags }}\"",
      "  echo",
      "  echo \"Digest: \\`${{ steps.build_worker.outputs.digest }}\\`\"",
      "} | tee problem9-image-digests.md >> \"$GITHUB_STEP_SUMMARY\""
    ].join("\n")
  ]
]);

const approvedDevboxPublishRunSteps = new Map([
  [
    "Build devbox image for toolchain verification",
    "docker buildx build --progress plain --file apps/worker/Dockerfile --target problem9-devbox --tag paretoproof-problem9-devbox:verify --load --cache-from type=gha,scope=problem9-execution --cache-from type=gha,scope=problem9-devbox ."
  ],
  [
    "Verify devbox image toolchains",
    "node infra/scripts/verify-problem9-image-toolchains.mjs --target problem9-devbox --image paretoproof-problem9-devbox:verify"
  ],
  [
    "Record published image digest",
    [
      "{",
      "  echo \"# Problem 9 devbox publish result\"",
      "  echo",
      "  echo \"## ${{ env.DEVBOX_IMAGE }}\"",
      "  echo",
      "  echo \"Tags:\"",
      "  echo \"${{ steps.devbox_metadata.outputs.tags }}\"",
      "  echo",
      "  echo \"Digest: \\`${{ steps.build_devbox.outputs.digest }}\\`\"",
      "} | tee problem9-devbox-image-digest.md >> \"$GITHUB_STEP_SUMMARY\""
    ].join("\n")
  ]
]);

const approvedDeployActionContracts = new Map([
  [
    "Check out repository",
    {
      uses: "actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8",
      id: "",
      with: {}
    }
  ],
  [
    "Set up Bun",
    {
      uses: setupBunActionPin,
      id: "",
      with: {
        "bun-version": "1.3.10"
      }
    }
  ]
]);

const approvedPrCiPrefixActionContracts = new Map([
  [
    "Check out repository",
    {
      uses: "actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8",
      id: "",
      with: {}
    }
  ],
  [
    "Set up Bun",
    {
      uses: setupBunActionPin,
      id: "",
      with: {
        "bun-version": "1.3.10"
      }
    }
  ]
]);

const approvedPrCiPrefixRunSteps = new Map([
  ["Install dependencies", "bun install --frozen-lockfile"],
  ["Check PR governance body", "node infra/scripts/check-pr-governance-body.mjs"],
  ["Check for hidden Unicode control characters", "node infra/scripts/check-bidi-chars.mjs"],
  ["Test hidden Unicode guard fixtures", "node --test infra/scripts/check-bidi-chars.test.mjs"],
  ["Check runtime env examples", "node infra/scripts/check-runtime-env-examples.mjs"],
  ["Check trusted-local auth boundaries", "node infra/scripts/check-trusted-local-boundaries.mjs"],
  ["Check Problem 9 image policy", "node infra/scripts/check-problem9-image-policy.mjs"],
  ["Check harness registry seed", "node infra/scripts/check-harness-registry-seed.mjs"],
  [
    "Check Problem 9 package cohesion",
    "node infra/scripts/check-problem9-package-cohesion.mjs && node --test infra/scripts/test/problem9-package-cohesion.test.mjs"
  ],
  ["Check deployment workflow Node runtimes", "node infra/scripts/check-deployment-workflow-node-runtime.mjs"],
  ["Check main-branch promotion gate policy", "node infra/scripts/check-main-branch-promotion-gate.mjs"]
]);

const approvedPrCiPrefixStepOrder = [
  "Check out repository",
  "Set up Bun",
  "Install dependencies",
  "Check PR governance body",
  "Check for hidden Unicode control characters",
  "Test hidden Unicode guard fixtures",
  "Check runtime env examples",
  "Check trusted-local auth boundaries",
  "Check Problem 9 image policy",
  "Check harness registry seed",
  "Check Problem 9 package cohesion",
  "Check deployment workflow Node runtimes",
  "Check main-branch promotion gate policy"
];

const approvedTrustedGovernanceActionContracts = new Map([
  [
    "Check out trusted base",
    {
      uses: "actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8",
      id: "",
      with: {}
    }
  ],
  [
    "Set up Bun",
    {
      uses: setupBunActionPin,
      id: "",
      with: {
        "bun-version": "1.3.10"
      }
    }
  ]
]);

const approvedTrustedGovernanceRunSteps = new Map([
  ["Install trusted dependencies", "bun install --frozen-lockfile"],
  [
    "Materialize candidate governance snapshot",
    [
      "set -euo pipefail",
      'candidate_root="$RUNNER_TEMP/pull-request-trusted-governance-candidate"',
      'candidate_sha="${{ github.event.pull_request.head.sha }}"',
      'pr_ref="refs/remotes/origin/pull/${{ github.event.pull_request.number }}/head"',
      'rm -rf "$candidate_root"',
      'mkdir -p "$candidate_root"',
      'git fetch --no-tags --depth=1 origin "+refs/pull/${{ github.event.pull_request.number }}/head:$pr_ref"',
      'if [ "$(git rev-parse "$pr_ref")" != "$candidate_sha" ]; then',
      '  echo "Trusted governance snapshot head drifted from the event payload." >&2',
      "  exit 1",
      "fi",
      "while IFS= read -r relative_path; do",
      '  mkdir -p "$candidate_root/$(dirname "$relative_path")"',
      '  git show "$candidate_sha:$relative_path" > "$candidate_root/$relative_path"',
      "done <<'EOF'",
      ".github/PULL_REQUEST_TEMPLATE.md",
      ".github/CODEOWNERS",
      ".github/workflows/deploy-pages.yml",
      ".github/workflows/publish-problem9-devbox-image.yml",
      ".github/workflows/publish-worker-image.yml",
      ".github/workflows/pull-request-ci.yml",
      ".github/workflows/pull-request-trusted-governance.yml",
      "docs/project-management.md",
      "docs/runtime-env-mode-checklists.md",
      "docs/runtime.md",
      "infra/README.md",
      "package.json",
      "EOF",
      'echo "CANDIDATE_REPO_ROOT=$candidate_root" >> "$GITHUB_ENV"'
    ].join("\n")
  ],
  [
    "Check PR governance body",
    'node infra/scripts/check-pr-governance-body.mjs --repo-root "$CANDIDATE_REPO_ROOT" --event-json "$GITHUB_EVENT_PATH"'
  ],
  [
    "Check deployment workflow Node runtimes",
    'node infra/scripts/check-deployment-workflow-node-runtime.mjs --repo-root "$CANDIDATE_REPO_ROOT"'
  ],
  [
    "Check main-branch promotion gate policy",
    'node infra/scripts/check-main-branch-promotion-gate.mjs --repo-root "$CANDIDATE_REPO_ROOT"'
  ]
]);

const approvedTrustedGovernanceStepOrder = [
  "Check out trusted base",
  "Set up Bun",
  "Install trusted dependencies",
  "Materialize candidate governance snapshot",
  "Check PR governance body",
  "Check deployment workflow Node runtimes",
  "Check main-branch promotion gate policy"
];

const approvedWorkerPublishActionContracts = new Map([
  [
    "Check out repository",
    {
      uses: "actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8",
      id: "",
      with: {}
    }
  ],
  [
    "Set up Docker Buildx",
    {
      uses: "docker/setup-buildx-action@4d04d5d9486b7bd6fa91e7baf45bbb4f8b9deedd",
      id: "",
      with: {}
    }
  ],
  [
    "Log in to GitHub Container Registry",
    {
      uses: "docker/login-action@b45d80f862d83dbcd57f89517bcf500b2ab88fb2",
      id: "",
      with: {
        registry: "ghcr.io",
        username: "${{ github.actor }}",
        password: "${{ secrets.GITHUB_TOKEN }}"
      }
    }
  ],
  [
    "Generate execution image metadata",
    {
      uses: "docker/metadata-action@030e881283bb7a6894de51c315a6bfe6a94e05cf",
      id: "execution_metadata",
      with: {
        images: "${{ env.EXECUTION_IMAGE }}",
        tags: "type=raw,value=main,enable={{is_default_branch}}\ntype=sha,prefix=sha-"
      }
    }
  ],
  [
    "Generate worker image metadata",
    {
      uses: "docker/metadata-action@030e881283bb7a6894de51c315a6bfe6a94e05cf",
      id: "worker_metadata",
      with: {
        images: "${{ env.WORKER_IMAGE }}",
        tags: "type=raw,value=main,enable={{is_default_branch}}\ntype=sha,prefix=sha-"
      }
    }
  ],
  [
    "Build and publish Problem 9 execution image",
    {
      uses: "docker/build-push-action@d08e5c354a6adb9ed34480a06d141179aa583294",
      id: "build_execution",
      with: {
        context: ".",
        file: "apps/worker/Dockerfile",
        target: "problem9-execution",
        push: "true",
        tags: "${{ steps.execution_metadata.outputs.tags }}",
        labels: "${{ steps.execution_metadata.outputs.labels }}",
        "cache-from": "type=gha,scope=problem9-execution",
        "cache-to": "type=gha,scope=problem9-execution,mode=max"
      }
    }
  ],
  [
    "Build and publish worker image",
    {
      uses: "docker/build-push-action@d08e5c354a6adb9ed34480a06d141179aa583294",
      id: "build_worker",
      with: {
        context: ".",
        file: "apps/worker/Dockerfile",
        target: "paretoproof-worker",
        push: "true",
        tags: "${{ steps.worker_metadata.outputs.tags }}",
        labels: "${{ steps.worker_metadata.outputs.labels }}",
        "cache-from": "type=gha,scope=problem9-execution\ntype=gha,scope=paretoproof-worker",
        "cache-to": "type=gha,scope=paretoproof-worker,mode=max"
      }
    }
  ],
  [
    "Upload image digest artifact",
    {
      uses: "actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f",
      id: "",
      with: {
        name: "problem9-image-digests",
        path: "problem9-image-digests.md"
      }
    }
  ]
]);

const approvedDevboxPublishActionContracts = new Map([
  [
    "Check out repository",
    {
      uses: "actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8",
      id: "",
      with: {}
    }
  ],
  [
    "Set up Docker Buildx",
    {
      uses: "docker/setup-buildx-action@4d04d5d9486b7bd6fa91e7baf45bbb4f8b9deedd",
      id: "",
      with: {}
    }
  ],
  [
    "Log in to GitHub Container Registry",
    {
      uses: "docker/login-action@b45d80f862d83dbcd57f89517bcf500b2ab88fb2",
      id: "",
      with: {
        registry: "ghcr.io",
        username: "${{ github.actor }}",
        password: "${{ secrets.GITHUB_TOKEN }}"
      }
    }
  ],
  [
    "Generate devbox image metadata",
    {
      uses: "docker/metadata-action@030e881283bb7a6894de51c315a6bfe6a94e05cf",
      id: "devbox_metadata",
      with: {
        images: "${{ env.DEVBOX_IMAGE }}",
        tags: "type=raw,value=main,enable={{is_default_branch}}\ntype=sha,prefix=sha-"
      }
    }
  ],
  [
    "Build and publish devbox image",
    {
      uses: "docker/build-push-action@d08e5c354a6adb9ed34480a06d141179aa583294",
      id: "build_devbox",
      with: {
        context: ".",
        file: "apps/worker/Dockerfile",
        target: "problem9-devbox",
        push: "true",
        tags: "${{ steps.devbox_metadata.outputs.tags }}",
        labels: "${{ steps.devbox_metadata.outputs.labels }}",
        "cache-from": "type=gha,scope=problem9-execution\ntype=gha,scope=problem9-devbox",
        "cache-to": "type=gha,scope=problem9-devbox,mode=max"
      }
    }
  ],
  [
    "Upload image digest artifact",
    {
      uses: "actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f",
      id: "",
      with: {
        name: "problem9-devbox-image-digest",
        path: "problem9-devbox-image-digest.md"
      }
    }
  ]
]);

export function validateDeploymentWorkflowNodeRuntime(repoRoot) {
  const deployPagesWorkflow = readWorkflow(repoRoot, deployPagesWorkflowPath);
  const publishWorkerWorkflow = readWorkflow(repoRoot, publishWorkerWorkflowPath);
  const publishDevboxWorkflow = readWorkflow(repoRoot, publishDevboxWorkflowPath);
  const pullRequestCiWorkflow = readWorkflow(repoRoot, pullRequestCiWorkflowPath);
  const pullRequestTrustedGovernanceWorkflow = readWorkflow(repoRoot, pullRequestTrustedGovernanceWorkflowPath);
  const infraReadme = readRepoText(repoRoot, infraReadmePath);
  const packageJson = readRepoJson(repoRoot, packageJsonPath);

  if (deployPagesWorkflow.name !== "Deploy Pages") {
    throw new Error(`${deployPagesWorkflowPath} must keep workflow name "Deploy Pages"`);
  }
  assertWorkflowTriggerMap(deployPagesWorkflow, deployPagesWorkflowPath);
  const deployTriggers = normalizeWorkflowTriggers(deployPagesWorkflow);
  assertExactWorkflowPermissions(
    deployPagesWorkflow,
    {
      contents: "read"
    },
    deployPagesWorkflowPath
  );
  assertExactWorkflowKeys(deployPagesWorkflow, ["name", "on", "permissions", "env", "jobs"], deployPagesWorkflowPath);
  if (
    deployTriggers.size !== 2 ||
    !deployTriggers.has("push") ||
    !deployTriggers.has("workflow_dispatch")
  ) {
    throw new Error(`${deployPagesWorkflowPath} must declare only push and workflow_dispatch triggers`);
  }
  assertExactTriggerConfigKeys(
    getWorkflowTriggerConfig(deployPagesWorkflow, "workflow_dispatch"),
    [],
    `${deployPagesWorkflowPath} workflow_dispatch`
  );

  const deployPushConfig = getWorkflowTriggerConfig(deployPagesWorkflow, "push");
  assertExactTriggerConfigKeys(deployPushConfig, ["branches", "paths"], `${deployPagesWorkflowPath} push trigger`);
  assertStringListEntries(deployPushConfig?.branches, `${deployPagesWorkflowPath} push branches`);
  const deployBranches = normalizeStringList(deployPushConfig?.branches);
  if (deployBranches.length !== 1 || deployBranches[0] !== "main") {
    throw new Error(`${deployPagesWorkflowPath} push trigger must protect only branch "main"`);
  }

  assertStringListEntries(deployPushConfig?.paths, `${deployPagesWorkflowPath} push paths`);
  const deployPaths = normalizeStringList(deployPushConfig?.paths);
  if (deployPaths.some((pathPattern) => pathPattern.startsWith("!"))) {
    throw new Error(`${deployPagesWorkflowPath} push trigger must not include negated path patterns`);
  }
  assertExactStringSet(deployPaths, requiredDeployPaths, `${deployPagesWorkflowPath} push trigger`, "watched path");

  if (getWorkflowEnvValue(deployPagesWorkflow, "FORCE_JAVASCRIPT_ACTIONS_TO_NODE24") !== "true") {
    throw new Error(`${deployPagesWorkflowPath} must set FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`);
  }
  assertExactWorkflowEnv(
    deployPagesWorkflow,
    {
      FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"
    },
    deployPagesWorkflowPath
  );

  const deployJobIds = Object.keys(deployPagesWorkflow.jobs ?? {});
  if (deployJobIds.length !== 1 || deployJobIds[0] !== "deploy") {
    throw new Error(`${deployPagesWorkflowPath} must define only the "deploy" job`);
  }

  const deployJob = getWorkflowJob(deployPagesWorkflow, "deploy", deployPagesWorkflowPath);
  assertNoJobPermissions(deployJob, deployPagesWorkflowPath, "deploy");
  assertExactJobKeys(deployJob, ["runs-on", "environment", "concurrency", "steps"], deployPagesWorkflowPath, "deploy");
  if (deployJob["runs-on"] !== "ubuntu-latest") {
    throw new Error(`${deployPagesWorkflowPath} deploy job must run on ubuntu-latest`);
  }
  if (deployJob.environment !== "production") {
    throw new Error(`${deployPagesWorkflowPath} deploy job must target environment "production"`);
  }
  assertExactObjectKeys(deployJob.concurrency, ["group", "cancel-in-progress"], `${deployPagesWorkflowPath} deploy concurrency`);

  if (deployJob.concurrency?.group !== "pages-production-deploy") {
    throw new Error(`${deployPagesWorkflowPath} deploy job must use concurrency group "pages-production-deploy"`);
  }
  if (deployJob.concurrency?.["cancel-in-progress"] !== true) {
    throw new Error(`${deployPagesWorkflowPath} deploy job must keep cancel-in-progress=true`);
  }

  for (const [stepName, contract] of approvedDeployActionContracts) {
    const step = requireStep(deployJob, stepName, deployPagesWorkflowPath);
    assertExactActionContract(step, contract, deployPagesWorkflowPath, stepName);
  }

  const deployStep = requireStep(deployJob, "Deploy to Cloudflare Pages", deployPagesWorkflowPath);
  for (const [stepName, expectedRun] of approvedDeployRunSteps) {
    const step = requireStep(deployJob, stepName, deployPagesWorkflowPath);
    if (getStepRun(step) !== expectedRun) {
      throw new Error(`${deployPagesWorkflowPath} step "${stepName}" must keep the approved command body`);
    }
  }
  if (getStepWorkingDirectory(deployStep) !== "apps/web") {
    throw new Error(`${deployPagesWorkflowPath} deploy step must run from apps/web`);
  }
  assertExactStepEnv(
    deployStep,
    {
      CLOUDFLARE_API_TOKEN: "${{ secrets.CLOUDFLARE_API_TOKEN }}",
      CLOUDFLARE_ACCOUNT_ID: "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}"
    },
    deployPagesWorkflowPath,
    "Deploy to Cloudflare Pages"
  );

  const seenDeployStepNames = new Set();
  for (const step of deployJob.steps ?? []) {
    const stepUses = getStepUses(step);
    const stepRun = getStepRun(step);
    assertExcludesAll(stepUses, ["cloudflare/wrangler-action@", "actions/checkout@v4"], `${deployPagesWorkflowPath} workflow`);

    const stepName = step?.name;
    if (!stepName) {
      throw new Error(`${deployPagesWorkflowPath} contains a step without a name`);
    }

    if (seenDeployStepNames.has(stepName)) {
      throw new Error(`${deployPagesWorkflowPath} step "${stepName}" must not appear more than once`);
    }

    seenDeployStepNames.add(stepName);

    if (stepUses) {
      const contract = approvedDeployActionContracts.get(stepName);
      if (!contract) {
        throw new Error(
          `${deployPagesWorkflowPath} step "${stepName}" is not an approved pinned deploy action`
        );
      }
      assertExactActionContract(step, contract, deployPagesWorkflowPath, stepName);
      continue;
    }

    if (stepRun) {
      if (!approvedDeployRunSteps.has(stepName)) {
        throw new Error(`${deployPagesWorkflowPath} step "${stepName}" is not an approved deploy run step`);
      }
      assertExactStepKeys(
        step,
        stepName === "Deploy to Cloudflare Pages"
          ? ["name", "working-directory", "env", "run"]
          : ["name", "run"],
        deployPagesWorkflowPath,
        stepName
      );
      if (approvedDeployRunSteps.get(stepName) !== stepRun) {
        throw new Error(`${deployPagesWorkflowPath} step "${stepName}" must keep the approved command body`);
      }
      continue;
    }

    throw new Error(`${deployPagesWorkflowPath} step "${stepName}" must declare either uses or run`);
  }

  assertExactStepOrder(
    deployJob,
    [
      "Check out repository",
      "Set up Bun",
      "Install dependencies",
      "Build shared package",
      "Build web app",
      "Deploy to Cloudflare Pages"
    ],
    deployPagesWorkflowPath
  );

  for (const [workflowPath, workflow, expectedGroup] of [
    [publishWorkerWorkflowPath, publishWorkerWorkflow, "worker-image-publish"],
    [publishDevboxWorkflowPath, publishDevboxWorkflow, "problem9-devbox-image-publish"]
  ]) {
    const expectedWorkflowName =
      workflowPath === publishWorkerWorkflowPath
        ? "Publish Problem 9 Execution and Worker Images"
        : "Publish Problem 9 Devbox Image";
    if (workflow.name !== expectedWorkflowName) {
      throw new Error(`${workflowPath} must keep workflow name "${expectedWorkflowName}"`);
    }
    assertWorkflowTriggerMap(workflow, workflowPath);
    assertExactWorkflowKeys(workflow, ["name", "on", "permissions", "env", "jobs"], workflowPath);
    const workflowTriggers = normalizeWorkflowTriggers(workflow);
    if (workflowPath === publishDevboxWorkflowPath) {
      if (workflowTriggers.size !== 1 || !workflowTriggers.has("workflow_dispatch")) {
        throw new Error(`${workflowPath} must remain a workflow_dispatch-only publish workflow`);
      }
    } else if (
      workflowTriggers.size !== 2 ||
      !workflowTriggers.has("push") ||
      !workflowTriggers.has("workflow_dispatch")
    ) {
      throw new Error(`${workflowPath} must support only push and workflow_dispatch publishes`);
    }
    assertExactTriggerConfigKeys(
      getWorkflowTriggerConfig(workflow, "workflow_dispatch"),
      [],
      `${workflowPath} workflow_dispatch`
    );

    if (workflowPath === publishWorkerWorkflowPath) {
      const pushConfig = getWorkflowTriggerConfig(workflow, "push");
      assertExactTriggerConfigKeys(pushConfig, ["branches", "paths"], `${workflowPath} push trigger`);
      assertStringListEntries(pushConfig?.branches, `${workflowPath} push branches`);
      const pushBranches = normalizeStringList(pushConfig?.branches);
      if (pushBranches.length !== 1 || pushBranches[0] !== "main") {
        throw new Error(`${workflowPath} push trigger must protect only branch "main"`);
      }

      assertStringListEntries(pushConfig?.paths, `${workflowPath} push paths`);
      const pushPaths = normalizeStringList(pushConfig?.paths);
      if (pushPaths.some((pathPattern) => pathPattern.startsWith("!"))) {
        throw new Error(`${workflowPath} push trigger must not include negated path patterns`);
      }
      assertExactStringSet(pushPaths, requiredWorkerPublishPaths, `${workflowPath} push trigger`, "watched path");
    }

    if (getWorkflowEnvValue(workflow, "FORCE_JAVASCRIPT_ACTIONS_TO_NODE24") !== "true") {
      throw new Error(`${workflowPath} must set FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`);
    }
    assertExactWorkflowEnv(
      workflow,
      workflowPath === publishWorkerWorkflowPath
        ? {
            FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true",
            EXECUTION_IMAGE: "ghcr.io/${{ github.repository_owner }}/paretoproof-problem9-execution",
            WORKER_IMAGE: "ghcr.io/${{ github.repository_owner }}/paretoproof-worker"
          }
        : {
            FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true",
            DEVBOX_IMAGE: "ghcr.io/${{ github.repository_owner }}/paretoproof-problem9-devbox"
          },
      workflowPath
    );
    assertExactWorkflowPermissions(
      workflow,
      {
        contents: "read",
        packages: "write"
      },
      workflowPath
    );

    const publishJobIds = Object.keys(workflow.jobs ?? {});
    if (publishJobIds.length !== 1 || publishJobIds[0] !== "publish") {
      throw new Error(`${workflowPath} must define only the "publish" job`);
    }

    const publishJob = getWorkflowJob(workflow, "publish", workflowPath);
    assertNoJobPermissions(publishJob, workflowPath, "publish");
    assertExactJobKeys(publishJob, ["runs-on", "environment", "concurrency", "steps"], workflowPath, "publish");
    if (publishJob["runs-on"] !== "ubuntu-latest") {
      throw new Error(`${workflowPath} publish job must run on ubuntu-latest`);
    }
    if (publishJob.environment !== "production") {
      throw new Error(`${workflowPath} publish job must target environment "production"`);
    }
    assertExactObjectKeys(publishJob.concurrency, ["group", "cancel-in-progress"], `${workflowPath} publish concurrency`);

    if (publishJob.concurrency?.group !== expectedGroup) {
      throw new Error(`${workflowPath} publish job must use concurrency group "${expectedGroup}"`);
    }
    if (publishJob.concurrency?.["cancel-in-progress"] !== true) {
      throw new Error(`${workflowPath} publish job must keep cancel-in-progress=true`);
    }

    let expectedActionContracts = new Map();
    let expectedRunSteps = new Map();

    if (workflowPath === publishWorkerWorkflowPath) {
      expectedActionContracts = approvedWorkerPublishActionContracts;
      expectedRunSteps = approvedWorkerPublishRunSteps;
    }

    if (workflowPath === publishDevboxWorkflowPath) {
      expectedActionContracts = approvedDevboxPublishActionContracts;
      expectedRunSteps = approvedDevboxPublishRunSteps;
    }

    for (const [stepName, contract] of expectedActionContracts) {
      const step = requireStep(publishJob, stepName, workflowPath);
      assertExactActionContract(step, contract, workflowPath, stepName);
    }

    for (const [stepName, expectedRun] of expectedRunSteps) {
      const step = requireStep(publishJob, stepName, workflowPath);
      if (getStepRun(step) !== expectedRun) {
        throw new Error(`${workflowPath} step "${stepName}" must keep the approved command body`);
      }
    }

    const seenApprovedPublishStepNames = new Set();
    for (const step of publishJob.steps ?? []) {
      const stepUses = getStepUses(step);
      const stepRun = getStepRun(step);
      const stepName = step?.name;
      if (!stepName) {
        throw new Error(`${workflowPath} contains a step without a name`);
      }

      if (seenApprovedPublishStepNames.has(stepName)) {
        throw new Error(`${workflowPath} step "${stepName}" must not appear more than once`);
      }

      seenApprovedPublishStepNames.add(stepName);

      if (stepUses) {
        const contract = expectedActionContracts.get(stepName);
        if (!contract) {
          throw new Error(`${workflowPath} step "${stepName}" is not an approved pinned publish action`);
        }
        assertExactActionContract(step, contract, workflowPath, stepName);
        continue;
      }

      if (stepRun) {
        if (!expectedRunSteps.has(stepName)) {
          throw new Error(`${workflowPath} step "${stepName}" is not an approved publish run step`);
        }
        assertExactStepKeys(step, ["name", "run"], workflowPath, stepName);
        if (expectedRunSteps.get(stepName) !== stepRun) {
          throw new Error(`${workflowPath} step "${stepName}" must keep the approved command body`);
        }
        continue;
      }

      throw new Error(
        `${workflowPath} step "${stepName}" must declare either uses or run`
      );
    }

    assertExactStepOrder(
      publishJob,
      workflowPath === publishWorkerWorkflowPath
        ? [
            "Check out repository",
            "Set up Docker Buildx",
            "Log in to GitHub Container Registry",
            "Generate execution image metadata",
            "Generate worker image metadata",
            "Build execution rootfs for toolchain verification",
            "Verify execution image toolchains",
            "Build and publish Problem 9 execution image",
            "Build and publish worker image",
            "Record published image digests",
            "Upload image digest artifact"
          ]
        : [
            "Check out repository",
            "Set up Docker Buildx",
            "Log in to GitHub Container Registry",
            "Generate devbox image metadata",
            "Build devbox image for toolchain verification",
            "Verify devbox image toolchains",
            "Build and publish devbox image",
            "Record published image digest",
            "Upload image digest artifact"
          ],
      workflowPath
    );
  }

  assertWorkflowTriggerMap(pullRequestCiWorkflow, pullRequestCiWorkflowPath);
  if (pullRequestCiWorkflow.name !== "Pull Request CI") {
    throw new Error(`${pullRequestCiWorkflowPath} must keep workflow name "Pull Request CI"`);
  }
  assertExactWorkflowPermissions(
    pullRequestCiWorkflow,
    {
      contents: "read"
    },
    pullRequestCiWorkflowPath
  );
  assertExactWorkflowKeys(pullRequestCiWorkflow, ["name", "on", "permissions", "jobs"], pullRequestCiWorkflowPath);
  const prCiTriggers = normalizeWorkflowTriggers(pullRequestCiWorkflow);
  if (prCiTriggers.size !== 1 || !prCiTriggers.has("pull_request")) {
    throw new Error(`${pullRequestCiWorkflowPath} must remain a pull_request-only workflow`);
  }
  const prCiTriggerConfig = getWorkflowTriggerConfig(pullRequestCiWorkflow, "pull_request");
  assertExactTriggerConfigKeys(
    prCiTriggerConfig,
    ["branches", "types"],
    `${pullRequestCiWorkflowPath} pull_request trigger`
  );
  assertStringListEntries(prCiTriggerConfig?.branches, `${pullRequestCiWorkflowPath} pull_request branches`);
  assertExactStringSet(
    normalizeStringList(prCiTriggerConfig?.branches),
    ["main"],
    `${pullRequestCiWorkflowPath} pull_request trigger`,
    "branch"
  );
  assertStringListEntries(prCiTriggerConfig?.types, `${pullRequestCiWorkflowPath} pull_request types`);
  assertExactStringSet(
    normalizeStringList(prCiTriggerConfig?.types),
    ["opened", "reopened", "synchronize", "edited", "ready_for_review"],
    `${pullRequestCiWorkflowPath} pull_request trigger`,
    "event type"
  );

  const prCiJob = getWorkflowJob(pullRequestCiWorkflow, "ci", pullRequestCiWorkflowPath);
  const prCiJobIds = Object.keys(pullRequestCiWorkflow.jobs ?? {});
  if (prCiJobIds.length !== 1 || prCiJobIds[0] !== "ci") {
    throw new Error(`${pullRequestCiWorkflowPath} must define only the "ci" job`);
  }
  assertNoJobPermissions(prCiJob, pullRequestCiWorkflowPath, "ci");
  assertExactJobKeys(prCiJob, ["runs-on", "concurrency", "steps"], pullRequestCiWorkflowPath, "ci");
  if (prCiJob["runs-on"] !== "ubuntu-latest") {
    throw new Error(`${pullRequestCiWorkflowPath} ci job must run on ubuntu-latest`);
  }
  assertExactObjectKeys(prCiJob.concurrency, ["group", "cancel-in-progress"], `${pullRequestCiWorkflowPath} ci concurrency`);
  if (prCiJob.concurrency?.group !== "pull-request-ci-${{ github.event.pull_request.number }}") {
    throw new Error(
      `${pullRequestCiWorkflowPath} ci job must use concurrency group "pull-request-ci-\${{ github.event.pull_request.number }}"`
    );
  }
  if (prCiJob.concurrency?.["cancel-in-progress"] !== true) {
    throw new Error(`${pullRequestCiWorkflowPath} ci job must keep cancel-in-progress=true`);
  }
  assertExactStepPrefixOrder(
    prCiJob,
    approvedPrCiPrefixStepOrder,
    pullRequestCiWorkflowPath,
    'pre-runtime-check ci'
  );
  for (const [stepName, contract] of approvedPrCiPrefixActionContracts) {
    const step = requireStep(prCiJob, stepName, pullRequestCiWorkflowPath);
    assertExactActionContract(step, contract, pullRequestCiWorkflowPath, stepName);
  }
  for (const [stepName, expectedRun] of approvedPrCiPrefixRunSteps) {
    const step = requireStep(prCiJob, stepName, pullRequestCiWorkflowPath);
    assertExactStepKeys(step, ["name", "run"], pullRequestCiWorkflowPath, stepName);
    if (getStepRun(step)?.trim() !== expectedRun) {
      throw new Error(`${pullRequestCiWorkflowPath} step "${stepName}" must keep the approved command body`);
    }
  }
  const prCiStep = requireStep(prCiJob, "Check deployment workflow Node runtimes", pullRequestCiWorkflowPath);
  assertExactStepKeys(
    prCiStep,
    ["name", "run"],
    pullRequestCiWorkflowPath,
    'Check deployment workflow Node runtimes'
  );
  if (getStepRun(prCiStep)?.trim() !== "node infra/scripts/check-deployment-workflow-node-runtime.mjs") {
    throw new Error(
      `${pullRequestCiWorkflowPath} step "Check deployment workflow Node runtimes" must execute node infra/scripts/check-deployment-workflow-node-runtime.mjs`
    );
  }

  assertWorkflowTriggerMap(pullRequestTrustedGovernanceWorkflow, pullRequestTrustedGovernanceWorkflowPath);
  if (pullRequestTrustedGovernanceWorkflow.name !== "Pull Request Trusted Governance") {
    throw new Error(
      `${pullRequestTrustedGovernanceWorkflowPath} must keep workflow name "Pull Request Trusted Governance"`
    );
  }
  assertExactWorkflowPermissions(
    pullRequestTrustedGovernanceWorkflow,
    {
      contents: "read"
    },
    pullRequestTrustedGovernanceWorkflowPath
  );
  assertExactWorkflowKeys(
    pullRequestTrustedGovernanceWorkflow,
    ["name", "on", "permissions", "jobs"],
    pullRequestTrustedGovernanceWorkflowPath
  );
  const trustedGovernanceTriggers = normalizeWorkflowTriggers(pullRequestTrustedGovernanceWorkflow);
  if (trustedGovernanceTriggers.size !== 1 || !trustedGovernanceTriggers.has("pull_request_target")) {
    throw new Error(`${pullRequestTrustedGovernanceWorkflowPath} must remain a pull_request_target-only workflow`);
  }
  const trustedGovernanceTriggerConfig = getWorkflowTriggerConfig(
    pullRequestTrustedGovernanceWorkflow,
    "pull_request_target"
  );
  assertExactTriggerConfigKeys(
    trustedGovernanceTriggerConfig,
    ["branches", "types"],
    `${pullRequestTrustedGovernanceWorkflowPath} pull_request_target trigger`
  );
  assertStringListEntries(
    trustedGovernanceTriggerConfig?.branches,
    `${pullRequestTrustedGovernanceWorkflowPath} pull_request_target branches`
  );
  assertExactStringSet(
    normalizeStringList(trustedGovernanceTriggerConfig?.branches),
    ["main"],
    `${pullRequestTrustedGovernanceWorkflowPath} pull_request_target trigger`,
    "branch"
  );
  assertStringListEntries(
    trustedGovernanceTriggerConfig?.types,
    `${pullRequestTrustedGovernanceWorkflowPath} pull_request_target types`
  );
  assertExactStringSet(
    normalizeStringList(trustedGovernanceTriggerConfig?.types),
    ["opened", "reopened", "synchronize", "edited", "ready_for_review"],
    `${pullRequestTrustedGovernanceWorkflowPath} pull_request_target trigger`,
    "event type"
  );

  const trustedGovernanceJob = getWorkflowJob(
    pullRequestTrustedGovernanceWorkflow,
    "governance",
    pullRequestTrustedGovernanceWorkflowPath
  );
  const trustedGovernanceJobIds = Object.keys(pullRequestTrustedGovernanceWorkflow.jobs ?? {});
  if (trustedGovernanceJobIds.length !== 1 || trustedGovernanceJobIds[0] !== "governance") {
    throw new Error(`${pullRequestTrustedGovernanceWorkflowPath} must define only the "governance" job`);
  }
  assertNoJobPermissions(trustedGovernanceJob, pullRequestTrustedGovernanceWorkflowPath, "governance");
  assertExactJobKeys(
    trustedGovernanceJob,
    ["runs-on", "concurrency", "steps"],
    pullRequestTrustedGovernanceWorkflowPath,
    "governance"
  );
  if (trustedGovernanceJob["runs-on"] !== "ubuntu-latest") {
    throw new Error(`${pullRequestTrustedGovernanceWorkflowPath} governance job must run on ubuntu-latest`);
  }
  assertExactObjectKeys(
    trustedGovernanceJob.concurrency,
    ["group", "cancel-in-progress"],
    `${pullRequestTrustedGovernanceWorkflowPath} governance concurrency`
  );
  if (trustedGovernanceJob.concurrency?.group !== "pull-request-trusted-governance-${{ github.event.pull_request.number }}") {
    throw new Error(
      `${pullRequestTrustedGovernanceWorkflowPath} governance job must use concurrency group "pull-request-trusted-governance-\${{ github.event.pull_request.number }}"`
    );
  }
  if (trustedGovernanceJob.concurrency?.["cancel-in-progress"] !== true) {
    throw new Error(`${pullRequestTrustedGovernanceWorkflowPath} governance job must keep cancel-in-progress=true`);
  }

  for (const [stepName, contract] of approvedTrustedGovernanceActionContracts) {
    const step = requireStep(trustedGovernanceJob, stepName, pullRequestTrustedGovernanceWorkflowPath);
    assertExactActionContract(step, contract, pullRequestTrustedGovernanceWorkflowPath, stepName);
  }
  for (const [stepName, expectedRun] of approvedTrustedGovernanceRunSteps) {
    const step = requireStep(trustedGovernanceJob, stepName, pullRequestTrustedGovernanceWorkflowPath);
    assertExactStepKeys(step, ["name", "run"], pullRequestTrustedGovernanceWorkflowPath, stepName);
    if (getStepRun(step)?.trim() !== expectedRun) {
      throw new Error(
        `${pullRequestTrustedGovernanceWorkflowPath} step "${stepName}" must keep the approved command body`
      );
    }
  }
  assertExactStepOrder(
    trustedGovernanceJob,
    approvedTrustedGovernanceStepOrder,
    pullRequestTrustedGovernanceWorkflowPath
  );

  assertIncludesAll(
    infraReadme,
    [
      "check-deployment-workflow-node-runtime.mjs",
      "trigger, environment, and Node 24-compatible action/runtime shape",
      "workflow-level metadata",
      "intentionally freezes the deploy/publish workflow contract",
      "pre-runtime-check step prefix",
      "PR-CI trigger/runtime-check contract",
      "Pull Request Trusted Governance",
      "pull_request_target",
      "trusted workflow-governance gate",
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

function assertExactStringSet(actualValues, expectedValues, description, itemLabel) {
  const actual = [...actualValues];
  const expected = [...expectedValues];
  const missingValue = expected.find((value) => !actual.includes(value));
  if (missingValue) {
    throw new Error(`${description} is missing ${itemLabel} "${missingValue}"`);
  }

  if (
    actual.some((value) => !expected.includes(value)) ||
    actual.length !== expected.length
  ) {
    throw new Error(`${description} must match approved ${itemLabel}s exactly`);
  }
}

function assertExactWorkflowKeys(workflow, expectedKeys, workflowPath) {
  const actualKeys = Object.keys(workflow ?? {}).sort();
  const normalizedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== normalizedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== normalizedExpectedKeys[index])
  ) {
    throw new Error(`${workflowPath} must keep the approved workflow keys`);
  }
}

function assertExactTriggerConfigKeys(triggerConfig, expectedKeys, description) {
  if (
    triggerConfig !== undefined &&
    triggerConfig !== null &&
    (typeof triggerConfig !== "object" || Array.isArray(triggerConfig))
  ) {
    throw new Error(`${description} must keep the approved trigger filters`);
  }

  const actualKeys =
    triggerConfig && typeof triggerConfig === "object" && !Array.isArray(triggerConfig)
      ? Object.keys(triggerConfig).sort()
      : [];
  const normalizedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== normalizedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== normalizedExpectedKeys[index])
  ) {
    throw new Error(`${description} must keep the approved trigger filters`);
  }
}

function assertWorkflowTriggerMap(workflow, workflowPath) {
  const rawTriggers = workflow.on ?? workflow["on"];
  if (!rawTriggers || typeof rawTriggers !== "object" || Array.isArray(rawTriggers)) {
    throw new Error(`${workflowPath} must keep the approved trigger map`);
  }
}

function assertStringListEntries(value, description) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${description} must contain only string entries`);
  }
}

function assertNoJobPermissions(job, workflowPath, jobName) {
  if (Object.prototype.hasOwnProperty.call(job ?? {}, "permissions")) {
    throw new Error(`${workflowPath} job "${jobName}" must not declare job-level permissions`);
  }
}

function assertExactJobKeys(job, expectedKeys, workflowPath, jobName) {
  const actualKeys = Object.keys(job ?? {}).sort();
  const normalizedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== normalizedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== normalizedExpectedKeys[index])
  ) {
    throw new Error(`${workflowPath} job "${jobName}" must keep the approved job keys`);
  }
}

function assertExactObjectKeys(value, expectedKeys, description) {
  const actualKeys =
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.keys(value).sort()
      : [];
  const normalizedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== normalizedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== normalizedExpectedKeys[index])
  ) {
    throw new Error(`${description} must keep the approved keys`);
  }
}

function getStepId(step) {
  return typeof step?.id === "string" ? step.id : "";
}

function listStepWithKeys(step) {
  if (!step?.with || typeof step.with !== "object" || Array.isArray(step.with)) {
    return [];
  }

  return Object.keys(step.with).sort();
}

function listStepEnvKeys(step) {
  if (!step?.env || typeof step.env !== "object" || Array.isArray(step.env)) {
    return [];
  }

  return Object.keys(step.env).sort();
}

function assertExactStepKeys(step, expectedKeys, workflowPath, stepName) {
  const actualStepKeys = Object.keys(step ?? {}).sort();
  const normalizedExpectedStepKeys = [...expectedKeys].sort();
  if (
    actualStepKeys.length !== normalizedExpectedStepKeys.length ||
    actualStepKeys.some((key, index) => key !== normalizedExpectedStepKeys[index])
  ) {
    throw new Error(`${workflowPath} step "${stepName}" must keep the approved step keys`);
  }
}

function assertExactStepOrder(job, expectedStepNames, workflowPath) {
  const actualStepNames = Array.isArray(job?.steps) ? job.steps.map((step) => step?.name ?? "") : [];
  if (
    actualStepNames.length !== expectedStepNames.length ||
    actualStepNames.some((stepName, index) => stepName !== expectedStepNames[index])
  ) {
    throw new Error(`${workflowPath} must keep the approved step order`);
  }
}

function assertExactStepPrefixOrder(job, expectedStepNames, workflowPath, description) {
  const actualStepNames = Array.isArray(job?.steps) ? job.steps.map((step) => step?.name ?? "") : [];
  if (actualStepNames.length < expectedStepNames.length) {
    throw new Error(`${workflowPath} must keep the approved ${description} step order`);
  }

  const actualPrefix = actualStepNames.slice(0, expectedStepNames.length);
  if (actualPrefix.some((stepName, index) => stepName !== expectedStepNames[index])) {
    throw new Error(`${workflowPath} must keep the approved ${description} step order`);
  }
}

function assertExactActionContract(step, contract, workflowPath, stepName) {
  const expectedStepKeys = ["name", "uses"];
  if (contract.id) {
    expectedStepKeys.push("id");
  }
  if (Object.keys(contract.with).length > 0) {
    expectedStepKeys.push("with");
  }
  assertExactStepKeys(step, expectedStepKeys, workflowPath, stepName);

  if (getStepUses(step) !== contract.uses) {
    throw new Error(`${workflowPath} step "${stepName}" must use ${contract.uses}`);
  }

  if (getStepId(step) !== contract.id) {
    throw new Error(`${workflowPath} step "${stepName}" must keep id "${contract.id || "<none>"}"`);
  }

  const expectedWithKeys = Object.keys(contract.with).sort();
  const actualWithKeys = listStepWithKeys(step);
  if (
    actualWithKeys.length !== expectedWithKeys.length ||
    actualWithKeys.some((key, index) => key !== expectedWithKeys[index])
  ) {
    throw new Error(`${workflowPath} step "${stepName}" must keep the approved with: inputs`);
  }

  for (const [key, expectedValue] of Object.entries(contract.with)) {
    if (getStepWithValue(step, key) !== expectedValue) {
      throw new Error(`${workflowPath} step "${stepName}" must keep with.${key}=${expectedValue}`);
    }
  }
}

function assertExactStepEnv(step, expectedEnv, workflowPath, stepName) {
  const expectedEnvKeys = Object.keys(expectedEnv).sort();
  const actualEnvKeys = listStepEnvKeys(step);
  if (
    actualEnvKeys.length !== expectedEnvKeys.length ||
    actualEnvKeys.some((key, index) => key !== expectedEnvKeys[index])
  ) {
    throw new Error(`${workflowPath} step "${stepName}" must keep the approved env map`);
  }

  for (const [key, expectedValue] of Object.entries(expectedEnv)) {
    if (getStepEnvValue(step, key) !== expectedValue) {
      throw new Error(`${workflowPath} step "${stepName}" env.${key} must be ${expectedValue}`);
    }
  }
}

function assertExactWorkflowPermissions(workflow, expectedPermissions, workflowPath) {
  const actualPermissions =
    workflow?.permissions && typeof workflow.permissions === "object" && !Array.isArray(workflow.permissions)
      ? workflow.permissions
      : {};
  const actualKeys = Object.keys(actualPermissions).sort();
  const expectedKeys = Object.keys(expectedPermissions).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(`${workflowPath} must keep the approved workflow permissions`);
  }

  for (const [key, expectedValue] of Object.entries(expectedPermissions)) {
    if (actualPermissions[key] !== expectedValue) {
      throw new Error(`${workflowPath} permissions.${key} must be ${expectedValue}`);
    }
  }
}

function assertExactWorkflowEnv(workflow, expectedEnv, workflowPath) {
  const actualEnv =
    workflow?.env && typeof workflow.env === "object" && !Array.isArray(workflow.env)
      ? workflow.env
      : {};
  const actualKeys = Object.keys(actualEnv).sort();
  const expectedKeys = Object.keys(expectedEnv).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(`${workflowPath} must keep the approved workflow env`);
  }

  for (const [key, expectedValue] of Object.entries(expectedEnv)) {
    if (getWorkflowEnvValue(workflow, key) !== expectedValue) {
      throw new Error(`${workflowPath} env.${key} must be ${expectedValue}`);
    }
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
