#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "..", "..");

function readText(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function fail(message) {
  console.error(`Problem 9 image policy check failed: ${message}`);
  process.exit(1);
}

const manifestPath = "infra/docker/problem9-image-policy.json";
const policyDocPath = "infra/problem9-image-policy.md";
const workerReadmePath = "apps/worker/README.md";
const infraReadmePath = "infra/README.md";
const packageJsonPath = "package.json";

const manifest = JSON.parse(readText(manifestPath));
const policyDoc = readText(policyDocPath);
const workerReadme = readText(workerReadmePath);
const infraReadme = readText(infraReadmePath);
const packageJson = JSON.parse(readText(packageJsonPath));

if (manifest.mutableTag !== "main") {
  fail(`expected mutableTag to be "main" but found "${manifest.mutableTag}"`);
}

if (manifest.immutableTagPrefix !== "sha-") {
  fail(`expected immutableTagPrefix to be "sha-" but found "${manifest.immutableTagPrefix}"`);
}

const uniqueTargets = new Set();
const uniquePublishedImages = new Set();
const workflowContents = new Map();

for (const image of manifest.images) {
  if (uniqueTargets.has(image.target)) {
    fail(`duplicate target "${image.target}" in ${manifestPath}`);
  }

  if (uniquePublishedImages.has(image.publishedImage)) {
    fail(`duplicate published image "${image.publishedImage}" in ${manifestPath}`);
  }

  uniqueTargets.add(image.target);
  uniquePublishedImages.add(image.publishedImage);

  const workflowPath = image.publishedByWorkflow;
  if (!workflowContents.has(workflowPath)) {
    workflowContents.set(workflowPath, readText(workflowPath));
  }

  const workflowContent = workflowContents.get(workflowPath);

  if (!workflowContent.includes(image.publishedImage)) {
    fail(`${workflowPath} does not reference published image ${image.publishedImage}`);
  }

  if (!workflowContent.includes(`target: ${image.target}`)) {
    fail(`${workflowPath} does not build docker target ${image.target}`);
  }

  if (!workflowContent.includes("type=raw,value=main")) {
    fail(`${workflowPath} is missing the mutable main tag rule`);
  }

  if (!workflowContent.includes("type=sha,prefix=sha-")) {
    fail(`${workflowPath} is missing the immutable sha tag rule`);
  }

  const buildScript = packageJson.scripts?.[image.localBuildScript];
  if (!buildScript) {
    fail(`package.json is missing script ${image.localBuildScript}`);
  }

  if (!buildScript.includes(`--target ${image.target}`)) {
    fail(`package.json script ${image.localBuildScript} does not target ${image.target}`);
  }

  const requiredPolicySnippets = [
    image.target,
    image.localTag,
    image.publishedImage.replace("${{ github.repository_owner }}", "<repository-owner>"),
    image.localBuildScript,
    image.publishedByWorkflow,
  ];

  for (const snippet of requiredPolicySnippets) {
    if (!policyDoc.includes(snippet)) {
      fail(`${policyDocPath} is missing required snippet "${snippet}"`);
    }
  }

  const requiredWorkerReadmeSnippets = [
    image.target,
    image.localTag,
  ];

  for (const snippet of requiredWorkerReadmeSnippets) {
    if (!workerReadme.includes(snippet)) {
      fail(`${workerReadmePath} is missing required snippet "${snippet}"`);
    }
  }
}

if (!/`main`\s+is the only mutable publish tag/i.test(policyDoc)) {
  fail(`${policyDocPath} must document the mutable main tag rule`);
}

if (!/`sha-<git sha>`\s+tags are immutable provenance tags/i.test(policyDoc)) {
  fail(`${policyDocPath} must document the immutable sha tag rule`);
}

if (!workerReadme.includes("../../infra/problem9-image-policy.md")) {
  fail(`${workerReadmePath} must link to the image policy document`);
}

if (!infraReadme.includes("check-problem9-image-policy.mjs")) {
  fail(`${infraReadmePath} must mention the image policy check script`);
}

if (!infraReadme.includes("problem9-image-policy.json")) {
  fail(`${infraReadmePath} must mention the image policy manifest`);
}

console.log("Problem 9 image policy check passed.");
