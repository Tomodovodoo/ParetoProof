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
  console.error(`Main-branch promotion gate check failed: ${message}`);
  process.exit(1);
}

const runtimeDocPath = "docs/runtime.md";
const checklistDocPath = "docs/runtime-env-mode-checklists.md";
const projectManagementDocPath = "docs/project-management.md";
const prCiWorkflowPath = ".github/workflows/pull-request-ci.yml";
const publishWorkerWorkflowPath = ".github/workflows/publish-worker-image.yml";
const publishDevboxWorkflowPath = ".github/workflows/publish-problem9-devbox-image.yml";
const packageJsonPath = "package.json";

const runtimeDoc = readText(runtimeDocPath);
const checklistDoc = readText(checklistDocPath);
const projectManagementDoc = readText(projectManagementDocPath);
const prCiWorkflow = readText(prCiWorkflowPath);
const publishWorkerWorkflow = readText(publishWorkerWorkflowPath);
const publishDevboxWorkflow = readText(publishDevboxWorkflowPath);
const packageJson = JSON.parse(readText(packageJsonPath));

const requiredPrCiSteps = [
  "Build Problem 9 execution image smoke target",
  "Verify Problem 9 execution image smoke target",
  "Build Problem 9 devbox image smoke target",
  "Verify Problem 9 devbox image smoke target",
  "Run deterministic Problem 9 verifier smoke",
  "Run deterministic Problem 9 local-stub attempt smoke",
  "Check runtime env examples",
  "Check trusted-local auth boundaries",
  "Test API auth handoff routes",
  "Test web auth relay functions"
];

for (const stepName of requiredPrCiSteps) {
  if (!prCiWorkflow.includes(stepName)) {
    fail(`${prCiWorkflowPath} is missing required PR CI step "${stepName}"`);
  }

  if (!runtimeDoc.includes(stepName)) {
    fail(`${runtimeDocPath} is missing required promotion-evidence step "${stepName}"`);
  }

  if (!checklistDoc.includes(stepName)) {
    fail(`${checklistDocPath} is missing required promotion-evidence step "${stepName}"`);
  }
}

const requiredRuntimeDocSnippets = [
  "Pull Request CI / ci",
  "do not substitute for the named kernel-proof steps",
  "problem9-image-digests",
  "problem9-devbox-image-digest"
];

for (const snippet of requiredRuntimeDocSnippets) {
  if (!runtimeDoc.includes(snippet)) {
    fail(`${runtimeDocPath} is missing required snippet "${snippet}"`);
  }
}

const requiredChecklistSnippets = [
  "sample promotion path",
  "do not sign off main-branch promotion from generic success signals alone",
  "problem9-image-digests",
  "problem9-devbox-image-digest"
];

for (const snippet of requiredChecklistSnippets) {
  if (!checklistDoc.includes(snippet)) {
    fail(`${checklistDocPath} is missing required snippet "${snippet}"`);
  }
}

const requiredProjectManagementSnippets = [
  "a slice is not promotion-ready just because the PR is generally green",
  "the required pre-merge evidence source is the `Pull Request CI` workflow",
  "they do not replace the pre-merge PR smoke gate"
];

for (const snippet of requiredProjectManagementSnippets) {
  if (!projectManagementDoc.includes(snippet)) {
    fail(`${projectManagementDocPath} is missing required snippet "${snippet}"`);
  }
}

if (!publishWorkerWorkflow.includes("problem9-image-digests")) {
  fail(`${publishWorkerWorkflowPath} must upload the problem9-image-digests artifact`);
}

if (!publishDevboxWorkflow.includes("problem9-devbox-image-digest")) {
  fail(`${publishDevboxWorkflowPath} must upload the problem9-devbox-image-digest artifact`);
}

const packageScript = packageJson.scripts?.["check:main-branch-promotion-gate"];
if (packageScript !== "node infra/scripts/check-main-branch-promotion-gate.mjs") {
  fail(`${packageJsonPath} is missing script check:main-branch-promotion-gate`);
}

console.log("Main-branch promotion gate check passed.");
