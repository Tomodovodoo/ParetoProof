#!/usr/bin/env node

import {
  assertIncludesAll,
  getJobEnvironmentName,
  getWorkflowTriggerConfig,
  getStepRun,
  getStepUses,
  getStepWithValue,
  getWorkflowEnvValue,
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

const manifestPath = "infra/docker/problem9-image-policy.json";
const policyDocPath = "infra/problem9-image-policy.md";
const workerReadmePath = "apps/worker/README.md";
const infraReadmePath = "infra/README.md";
const packageJsonPath = "package.json";
const prCiWorkflowPath = ".github/workflows/pull-request-ci.yml";
const publishWorkerWorkflowPath = ".github/workflows/publish-worker-image.yml";
const publishDevboxWorkflowPath = ".github/workflows/publish-problem9-devbox-image.yml";
const requiredWorkerPublishPaths = [
  "apps/worker/**",
  "benchmarks/firstproof/problem9/**",
  "packages/shared/**",
  "package.json",
  "bun.lock",
  "tsconfig.base.json",
  ".github/workflows/publish-worker-image.yml"
];

function assertMetadataTags(step, workflowPath) {
  const tags = getStepWithValue(step, "tags");
  assertIncludesAll(tags, ["type=raw,value=main", "type=sha,prefix=sha-"], `${workflowPath} metadata tags`);
}

export function validateProblem9ImagePolicy(repoRoot) {
  const manifest = readRepoJson(repoRoot, manifestPath);
  const policyDoc = readRepoText(repoRoot, policyDocPath);
  const workerReadme = readRepoText(repoRoot, workerReadmePath);
  const infraReadme = readRepoText(repoRoot, infraReadmePath);
  const packageJson = readRepoJson(repoRoot, packageJsonPath);
  const prCiWorkflow = readWorkflow(repoRoot, prCiWorkflowPath);

  if (manifest.mutableTag !== "main") {
    throw new Error(`expected mutableTag to be "main" but found "${manifest.mutableTag}"`);
  }

  if (manifest.immutableTagPrefix !== "sha-") {
    throw new Error(`expected immutableTagPrefix to be "sha-" but found "${manifest.immutableTagPrefix}"`);
  }

  const uniqueTargets = new Set();
  const uniquePublishedImages = new Set();
  const workflowCache = new Map();

  for (const image of manifest.images) {
    if (uniqueTargets.has(image.target)) {
      throw new Error(`duplicate target "${image.target}" in ${manifestPath}`);
    }

    if (uniquePublishedImages.has(image.publishedImage)) {
      throw new Error(`duplicate published image "${image.publishedImage}" in ${manifestPath}`);
    }

    uniqueTargets.add(image.target);
    uniquePublishedImages.add(image.publishedImage);

    if (!workflowCache.has(image.publishedByWorkflow)) {
      workflowCache.set(image.publishedByWorkflow, readWorkflow(repoRoot, image.publishedByWorkflow));
    }

    const workflow = workflowCache.get(image.publishedByWorkflow);
    const publishJob = getWorkflowJob(workflow, "publish", image.publishedByWorkflow);

    if (getJobEnvironmentName(publishJob) !== "production") {
      throw new Error(`${image.publishedByWorkflow} publish job must target environment "production"`);
    }

    const workflowTriggers = normalizeWorkflowTriggers(workflow);
    if (image.target === "problem9-devbox") {
      if (!workflowTriggers.has("workflow_dispatch") || workflowTriggers.has("push")) {
        throw new Error(`${image.publishedByWorkflow} must remain a workflow_dispatch-only publish workflow`);
      }
    } else if (!workflowTriggers.has("push") || !workflowTriggers.has("workflow_dispatch")) {
      throw new Error(`${image.publishedByWorkflow} must support both push and workflow_dispatch publishes`);
    }

    if (image.publishedByWorkflow === publishWorkerWorkflowPath) {
      const pushConfig = getWorkflowTriggerConfig(workflow, "push");
      const pushBranches = normalizeStringList(pushConfig?.branches);
      if (!pushBranches.includes("main")) {
        throw new Error(`${image.publishedByWorkflow} push trigger must protect branch "main"`);
      }

      const pushPaths = normalizeStringList(pushConfig?.paths);
      for (const requiredPath of requiredWorkerPublishPaths) {
        if (!pushPaths.includes(requiredPath)) {
          throw new Error(`${image.publishedByWorkflow} push trigger is missing watched path "${requiredPath}"`);
        }
      }
    }

    const buildScript = packageJson.scripts?.[image.localBuildScript];
    if (!buildScript) {
      throw new Error(`package.json is missing script ${image.localBuildScript}`);
    }

    if (!buildScript.includes(`--target ${image.target}`)) {
      throw new Error(`package.json script ${image.localBuildScript} does not target ${image.target}`);
    }

    for (const snippet of [
      image.target,
      image.localTag,
      image.publishedImage.replace("${{ github.repository_owner }}", "<repository-owner>"),
      image.localBuildScript,
      image.publishedByWorkflow
    ]) {
      if (!policyDoc.includes(snippet)) {
        throw new Error(`${policyDocPath} is missing required image-policy identifier "${snippet}"`);
      }
    }

    for (const snippet of [image.target, image.localTag]) {
      if (!workerReadme.includes(snippet)) {
        throw new Error(`${workerReadmePath} is missing required image identifier "${snippet}"`);
      }
    }

    if (image.target === "problem9-execution") {
      const metadataStep = requireStep(publishJob, "Generate execution image metadata", image.publishedByWorkflow);
      if (getStepUses(metadataStep) !== "docker/metadata-action@030e881283bb7a6894de51c315a6bfe6a94e05cf") {
        throw new Error(`${image.publishedByWorkflow} must pin the execution metadata step to docker/metadata-action v6`);
      }
      if (getWorkflowEnvValue(workflow, "EXECUTION_IMAGE") !== image.publishedImage) {
        throw new Error(`${image.publishedByWorkflow} EXECUTION_IMAGE env must match ${image.publishedImage}`);
      }
      if (getStepWithValue(metadataStep, "images") !== "${{ env.EXECUTION_IMAGE }}") {
        throw new Error(`${image.publishedByWorkflow} execution metadata step must read from env.EXECUTION_IMAGE`);
      }
      assertMetadataTags(metadataStep, image.publishedByWorkflow);

      const buildVerificationStep = requireStep(publishJob, "Build execution rootfs for toolchain verification", image.publishedByWorkflow);
      assertIncludesAll(
        getStepRun(buildVerificationStep),
        ["--target problem9-execution", "--output type=local,dest=.tmp/problem9-execution-rootfs"],
        `${image.publishedByWorkflow} step "Build execution rootfs for toolchain verification"`
      );

      const verifyStep = requireStep(publishJob, "Verify execution image toolchains", image.publishedByWorkflow);
      assertIncludesAll(
        getStepRun(verifyStep),
        ["--target problem9-execution", "--rootfs .tmp/problem9-execution-rootfs"],
        `${image.publishedByWorkflow} step "Verify execution image toolchains"`
      );

      const publishStep = requireStep(publishJob, "Build and publish Problem 9 execution image", image.publishedByWorkflow);
      if (getStepUses(publishStep) !== "docker/build-push-action@d08e5c354a6adb9ed34480a06d141179aa583294") {
        throw new Error(`${image.publishedByWorkflow} must pin the execution publish step to docker/build-push-action v7`);
      }
      if (getStepWithValue(publishStep, "target") !== image.target) {
        throw new Error(`${image.publishedByWorkflow} execution publish step must target ${image.target}`);
      }
    }

    if (image.target === "paretoproof-worker") {
      const metadataStep = requireStep(publishJob, "Generate worker image metadata", image.publishedByWorkflow);
      if (getWorkflowEnvValue(workflow, "WORKER_IMAGE") !== image.publishedImage) {
        throw new Error(`${image.publishedByWorkflow} WORKER_IMAGE env must match ${image.publishedImage}`);
      }
      if (getStepWithValue(metadataStep, "images") !== "${{ env.WORKER_IMAGE }}") {
        throw new Error(`${image.publishedByWorkflow} worker metadata step must read from env.WORKER_IMAGE`);
      }
      assertMetadataTags(metadataStep, image.publishedByWorkflow);

      const publishStep = requireStep(publishJob, "Build and publish worker image", image.publishedByWorkflow);
      if (getStepWithValue(publishStep, "target") !== image.target) {
        throw new Error(`${image.publishedByWorkflow} worker publish step must target ${image.target}`);
      }
    }

    if (image.target === "problem9-devbox") {
      const metadataStep = requireStep(publishJob, "Generate devbox image metadata", image.publishedByWorkflow);
      if (getWorkflowEnvValue(workflow, "DEVBOX_IMAGE") !== image.publishedImage) {
        throw new Error(`${image.publishedByWorkflow} DEVBOX_IMAGE env must match ${image.publishedImage}`);
      }
      if (getStepWithValue(metadataStep, "images") !== "${{ env.DEVBOX_IMAGE }}") {
        throw new Error(`${image.publishedByWorkflow} devbox metadata step must read from env.DEVBOX_IMAGE`);
      }
      assertMetadataTags(metadataStep, image.publishedByWorkflow);

      const buildVerificationStep = requireStep(publishJob, "Build devbox image for toolchain verification", image.publishedByWorkflow);
      assertIncludesAll(
        getStepRun(buildVerificationStep),
        ["--target problem9-devbox", "--tag paretoproof-problem9-devbox:verify", "--load"],
        `${image.publishedByWorkflow} step "Build devbox image for toolchain verification"`
      );

      const verifyStep = requireStep(publishJob, "Verify devbox image toolchains", image.publishedByWorkflow);
      assertIncludesAll(
        getStepRun(verifyStep),
        ["--target problem9-devbox", "--image paretoproof-problem9-devbox:verify"],
        `${image.publishedByWorkflow} step "Verify devbox image toolchains"`
      );

      const publishStep = requireStep(publishJob, "Build and publish devbox image", image.publishedByWorkflow);
      if (getStepWithValue(publishStep, "target") !== image.target) {
        throw new Error(`${image.publishedByWorkflow} devbox publish step must target ${image.target}`);
      }
    }
  }

  if (!/`main`\s+is the only mutable publish tag/i.test(policyDoc)) {
    throw new Error(`${policyDocPath} must document the mutable main tag rule`);
  }

  if (!/`sha-<git sha>`\s+tags are immutable provenance tags/i.test(policyDoc)) {
    throw new Error(`${policyDocPath} must document the immutable sha tag rule`);
  }

  if (!workerReadme.includes("../../infra/problem9-image-policy.md")) {
    throw new Error(`${workerReadmePath} must link to the image policy document`);
  }

  assertIncludesAll(
    infraReadme,
    ["check-problem9-image-policy.mjs", "problem9-image-policy.json", "publish workflow structure", "artifact uploads"],
    infraReadmePath
  );

  const prCiJob = getWorkflowJob(prCiWorkflow, "ci", prCiWorkflowPath);
  const requiredPrCiSteps = [
    {
      name: "Build Problem 9 execution image smoke target",
      runSnippets: ["--target problem9-execution", "--tag paretoproof-problem9-execution:pr-smoke"]
    },
    {
      name: "Build Problem 9 devbox image smoke target",
      runSnippets: ["--target problem9-devbox", "--tag paretoproof-problem9-devbox:pr-smoke"]
    },
    {
      name: "Verify Problem 9 execution image smoke target",
      runSnippets: ["--target problem9-execution", "--image paretoproof-problem9-execution:pr-smoke"]
    },
    {
      name: "Verify Problem 9 devbox image smoke target",
      runSnippets: ["--target problem9-devbox", "--image paretoproof-problem9-devbox:pr-smoke"]
    }
  ];

  for (const requiredStep of requiredPrCiSteps) {
    const step = requireStep(prCiJob, requiredStep.name, prCiWorkflowPath);
    assertIncludesAll(getStepRun(step), requiredStep.runSnippets, `${prCiWorkflowPath} step "${requiredStep.name}"`);
  }

  if (!listUploadArtifactNames(getWorkflowJob(readWorkflow(repoRoot, publishWorkerWorkflowPath), "publish", publishWorkerWorkflowPath)).includes("problem9-image-digests")) {
    throw new Error(`${publishWorkerWorkflowPath} must upload the problem9-image-digests artifact`);
  }

  if (!listUploadArtifactNames(getWorkflowJob(readWorkflow(repoRoot, publishDevboxWorkflowPath), "publish", publishDevboxWorkflowPath)).includes("problem9-devbox-image-digest")) {
    throw new Error(`${publishDevboxWorkflowPath} must upload the problem9-devbox-image-digest artifact`);
  }

  assertIncludesAll(
    policyDoc,
    ["Pull-request CI is the authoritative pre-merge image smoke gate", "verifies an exported `problem9-execution` rootfs", "verifies a loaded `paretoproof-problem9-devbox:verify` image"],
    policyDocPath
  );
}

function main() {
  try {
    const { repoRoot } = parseCommonCliOptions(import.meta.url);
    validateProblem9ImagePolicy(repoRoot);
    console.log("Problem 9 image policy check passed.");
  } catch (error) {
    console.error(`Problem 9 image policy check failed: ${error.message}`);
    process.exit(1);
  }
}

if (isDirectExecution(import.meta.url)) {
  main();
}
