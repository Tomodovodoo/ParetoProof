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
  console.error(`Harness registry seed check failed: ${message}`);
  process.exit(1);
}

const harnessRegistryPath = "infra/docker/harness-registry.seed.json";
const imagePolicyPath = "infra/docker/problem9-image-policy.json";
const packageJsonPath = "package.json";
const infraReadmePath = "infra/README.md";

const harnessRegistry = JSON.parse(readText(harnessRegistryPath));
const imagePolicy = JSON.parse(readText(imagePolicyPath));
const packageJson = JSON.parse(readText(packageJsonPath));
const infraReadme = readText(infraReadmePath);

if (harnessRegistry.version !== 1) {
  fail(`expected ${harnessRegistryPath} version to be 1 but found "${harnessRegistry.version}"`);
}

if (!Array.isArray(harnessRegistry.items) || harnessRegistry.items.length === 0) {
  fail(`${harnessRegistryPath} must define at least one harness entry`);
}

const imageByTarget = new Map(imagePolicy.images.map((image) => [image.target, image]));
const validSupportStatuses = new Set(["supported", "internal_only", "deprecated", "retired"]);
const validRuntimeClasses = new Set([
  "hosted_worker",
  "trusted_local_devbox",
  "noninteractive_execution",
  "offline_export"
]);
const validImageRoles = new Set(["hosted_worker_image", "execution_image", "devbox_image"]);
const supportedHostedProviderFamilies = new Set(["openai"]);
const supportedHostedAuthModes = new Set(["machine_api_key"]);
const supportedProblem9ProviderFamilies = new Set(["openai"]);
const supportedProblem9RunModes = new Set([
  "single_pass_probe",
  "pass_k_probe",
  "bounded_agentic_attempt"
]);
const supportedProblem9ToolProfiles = new Set([
  "no_tools",
  "lean_mcp_readonly",
  "workspace_edit_limited"
]);
const supportedLocalAuthModes = new Set([
  "trusted_local_user",
  "machine_api_key",
  "local_stub"
]);
const expectedProblem9TargetByRole = new Map([
  ["hosted_worker_image", "paretoproof-worker"],
  ["execution_image", "problem9-execution"],
  ["devbox_image", "problem9-devbox"]
]);
const seenHarnessIds = new Set();

function validateNonEmptyStringArray(entry, fieldName) {
  if (!Array.isArray(entry[fieldName]) || entry[fieldName].length === 0) {
    fail(`harness "${entry.id}" must define non-empty array field "${fieldName}"`);
  }

  for (const value of entry[fieldName]) {
    if (typeof value !== "string" || value.trim().length === 0) {
      fail(`harness "${entry.id}" field "${fieldName}" must contain only non-empty strings`);
    }
  }
}

for (const entry of harnessRegistry.items) {
  if (!entry || typeof entry !== "object") {
    fail("every harness entry must be an object");
  }

  if (typeof entry.id !== "string" || entry.id.trim().length === 0) {
    fail("every harness entry must have a non-empty id");
  }

  if (seenHarnessIds.has(entry.id)) {
    fail(`duplicate harness id "${entry.id}"`);
  }

  seenHarnessIds.add(entry.id);

  if (!validSupportStatuses.has(entry.supportStatus)) {
    fail(`harness "${entry.id}" uses unsupported supportStatus "${entry.supportStatus}"`);
  }

  if (!validRuntimeClasses.has(entry.runtimeClass)) {
    fail(`harness "${entry.id}" uses unsupported runtimeClass "${entry.runtimeClass}"`);
  }

  for (const field of [
    "familyId",
    "label",
    "summary",
    "harnessRevision"
  ]) {
    if (typeof entry[field] !== "string" || entry[field].trim().length === 0) {
      fail(`harness "${entry.id}" is missing required string field "${field}"`);
    }
  }

  for (const field of ["providerFamilies", "authModes", "runModes", "toolProfiles", "benchmarkFamilies"]) {
    validateNonEmptyStringArray(entry, field);
  }

  if (!Array.isArray(entry.imageRefs) || entry.imageRefs.length === 0) {
    fail(`harness "${entry.id}" must define non-empty array field "imageRefs"`);
  }

  const roleSet = new Set();

  for (const imageRef of entry.imageRefs) {
    if (!imageRef || typeof imageRef !== "object") {
      fail(`harness "${entry.id}" contains a non-object imageRef`);
    }

    if (!validImageRoles.has(imageRef.role)) {
      fail(`harness "${entry.id}" uses unsupported image role "${imageRef.role}"`);
    }

    if (roleSet.has(imageRef.role)) {
      fail(`harness "${entry.id}" repeats image role "${imageRef.role}"`);
    }

    roleSet.add(imageRef.role);

    const imagePolicyEntry = imageByTarget.get(imageRef.target);

    if (!imagePolicyEntry) {
      fail(`harness "${entry.id}" references unknown image target "${imageRef.target}"`);
    }

    if (imagePolicyEntry.repository !== imageRef.repository) {
      fail(
        `harness "${entry.id}" repository mismatch for target "${imageRef.target}": expected "${imagePolicyEntry.repository}" but found "${imageRef.repository}"`
      );
    }

    if (imagePolicyEntry.publishedImage !== imageRef.publishedImage) {
      fail(
        `harness "${entry.id}" published image mismatch for target "${imageRef.target}": expected "${imagePolicyEntry.publishedImage}" but found "${imageRef.publishedImage}"`
      );
    }

    if (imagePolicyEntry.publishedByWorkflow !== imageRef.publishedByWorkflow) {
      fail(
        `harness "${entry.id}" workflow mismatch for target "${imageRef.target}": expected "${imagePolicyEntry.publishedByWorkflow}" but found "${imageRef.publishedByWorkflow}"`
      );
    }

    if (imageRef.digestAuthority !== "publish_workflow_artifact") {
      fail(
        `harness "${entry.id}" must use publish_workflow_artifact for target "${imageRef.target}"`
      );
    }

    if (!Array.isArray(imageRef.notes)) {
      fail(`harness "${entry.id}" imageRef "${imageRef.target}" must define a notes array`);
    }

    for (const note of imageRef.notes) {
      if (typeof note !== "string" || note.trim().length === 0) {
        fail(
          `harness "${entry.id}" imageRef "${imageRef.target}" notes must contain only non-empty strings`
        );
      }
    }

    if (entry.familyId === "problem9") {
      const expectedTarget = expectedProblem9TargetByRole.get(imageRef.role);

      if (expectedTarget && imageRef.target !== expectedTarget) {
        fail(
          `problem9 harness "${entry.id}" must map role "${imageRef.role}" to target "${expectedTarget}", not "${imageRef.target}"`
        );
      }
    }
  }

  if (!Array.isArray(entry.notes)) {
    fail(`harness "${entry.id}" must define a notes array`);
  }

  for (const note of entry.notes) {
    if (typeof note !== "string" || note.trim().length === 0) {
      fail(`harness "${entry.id}" notes must contain only non-empty strings`);
    }
  }

  if (entry.runtimeClass === "hosted_worker") {
    if (!roleSet.has("hosted_worker_image")) {
      fail(`hosted harness "${entry.id}" must reference a hosted_worker_image`);
    }

    if (roleSet.has("devbox_image")) {
      fail(`hosted harness "${entry.id}" must not reference a devbox_image`);
    }

    for (const providerFamily of entry.providerFamilies) {
      if (!supportedHostedProviderFamilies.has(providerFamily)) {
        fail(
          `hosted harness "${entry.id}" claims unsupported provider family "${providerFamily}"`
        );
      }
    }

    for (const authMode of entry.authModes) {
      if (!supportedHostedAuthModes.has(authMode)) {
        fail(`hosted harness "${entry.id}" claims unsupported auth mode "${authMode}"`);
      }
    }
  }

  if (entry.runtimeClass === "trusted_local_devbox") {
    if (!roleSet.has("devbox_image")) {
      fail(`trusted-local harness "${entry.id}" must reference a devbox_image`);
    }

    if (roleSet.has("hosted_worker_image")) {
      fail(`trusted-local harness "${entry.id}" must not reference a hosted_worker_image`);
    }

    for (const providerFamily of entry.providerFamilies) {
      if (!supportedProblem9ProviderFamilies.has(providerFamily)) {
        fail(
          `trusted-local harness "${entry.id}" claims unsupported provider family "${providerFamily}"`
        );
      }
    }

    for (const authMode of entry.authModes) {
      if (!supportedLocalAuthModes.has(authMode)) {
        fail(`trusted-local harness "${entry.id}" claims unsupported auth mode "${authMode}"`);
      }
    }
  }

  if (entry.familyId === "problem9") {
    for (const runMode of entry.runModes) {
      if (!supportedProblem9RunModes.has(runMode)) {
        fail(`problem9 harness "${entry.id}" claims unsupported run mode "${runMode}"`);
      }
    }

    for (const toolProfile of entry.toolProfiles) {
      if (!supportedProblem9ToolProfiles.has(toolProfile)) {
        fail(`problem9 harness "${entry.id}" claims unsupported tool profile "${toolProfile}"`);
      }
    }
  }
}

const packageScript = packageJson.scripts?.["check:harness-registry-seed"];

if (packageScript !== "node infra/scripts/check-harness-registry-seed.mjs") {
  fail('package.json must define "check:harness-registry-seed"');
}

if (!infraReadme.includes("check-harness-registry-seed.mjs")) {
  fail(`${infraReadmePath} must mention the harness registry check script`);
}

if (!infraReadme.includes("harness-registry.seed.json")) {
  fail(`${infraReadmePath} must mention the harness registry seed manifest`);
}

console.log("Harness registry seed check passed.");
