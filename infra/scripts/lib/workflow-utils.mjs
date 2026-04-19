import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parse } from "yaml";

export function defaultRepoRoot(importMetaUrl) {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), "..", "..");
}

export function isDirectExecution(importMetaUrl) {
  if (!process.argv[1]) {
    return false;
  }

  return pathToFileURL(path.resolve(process.argv[1])).href === importMetaUrl;
}

export function parseCommonCliOptions(importMetaUrl, argv = process.argv.slice(2)) {
  let repoRoot = defaultRepoRoot(importMetaUrl);
  const remainingArgs = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--repo-root") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--repo-root requires a path");
      }

      repoRoot = path.resolve(value);
      index += 1;
      continue;
    }

    remainingArgs.push(arg);
  }

  return { repoRoot, remainingArgs };
}

export function readRepoText(repoRoot, relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

export function readRepoJson(repoRoot, relativePath) {
  return JSON.parse(readRepoText(repoRoot, relativePath));
}

export function readWorkflow(repoRoot, relativePath) {
  const workflow = parse(readRepoText(repoRoot, relativePath));

  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    throw new Error(`${relativePath} must parse to a workflow object`);
  }

  return workflow;
}

export function normalizeWorkflowTriggers(workflow) {
  const rawTriggers = workflow.on ?? workflow["on"];

  if (typeof rawTriggers === "string") {
    return new Set([rawTriggers]);
  }

  if (Array.isArray(rawTriggers)) {
    return new Set(rawTriggers.filter((value) => typeof value === "string"));
  }

  if (rawTriggers && typeof rawTriggers === "object") {
    return new Set(Object.keys(rawTriggers));
  }

  return new Set();
}

export function getWorkflowTriggerConfig(workflow, triggerName) {
  const rawTriggers = workflow.on ?? workflow["on"];

  if (!rawTriggers) {
    return null;
  }

  if (typeof rawTriggers === "string") {
    return rawTriggers === triggerName ? {} : null;
  }

  if (Array.isArray(rawTriggers)) {
    return rawTriggers.includes(triggerName) ? {} : null;
  }

  if (typeof rawTriggers === "object") {
    return rawTriggers[triggerName] ?? null;
  }

  return null;
}

export function normalizeStringList(value) {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === "string");
  }

  return [];
}

export function getWorkflowJob(workflow, jobId, workflowPath) {
  if (!workflow.jobs || typeof workflow.jobs !== "object" || Array.isArray(workflow.jobs)) {
    throw new Error(`${workflowPath} must define a jobs object`);
  }

  const job = workflow.jobs[jobId];
  if (!job || typeof job !== "object" || Array.isArray(job)) {
    throw new Error(`${workflowPath} is missing job "${jobId}"`);
  }

  return job;
}

export function getWorkflowEnvValue(workflow, key) {
  if (!workflow.env || typeof workflow.env !== "object" || Array.isArray(workflow.env)) {
    return "";
  }

  const value = workflow.env[key];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";
}

export function getJobEnvironmentName(job) {
  if (typeof job.environment === "string") {
    return job.environment;
  }

  if (job.environment && typeof job.environment === "object" && !Array.isArray(job.environment)) {
    return typeof job.environment.name === "string" ? job.environment.name : "";
  }

  return "";
}

export function getJobSteps(job) {
  return Array.isArray(job.steps) ? job.steps : [];
}

export function getStepByName(job, stepName) {
  return getJobSteps(job).find((step) => step?.name === stepName) ?? null;
}

export function requireStep(job, stepName, workflowPath) {
  const step = getStepByName(job, stepName);

  if (!step) {
    throw new Error(`${workflowPath} is missing step "${stepName}"`);
  }

  return step;
}

export function normalizeMultilineText(value) {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";
}

export function getStepRun(step) {
  return normalizeMultilineText(step?.run);
}

export function getStepUses(step) {
  return typeof step?.uses === "string" ? step.uses : "";
}

export function getStepWorkingDirectory(step) {
  return typeof step?.["working-directory"] === "string" ? step["working-directory"] : "";
}

export function getStepWithValue(step, key) {
  if (!step?.with || typeof step.with !== "object" || Array.isArray(step.with)) {
    return "";
  }

  const value = step.with[key];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? normalizeMultilineText(String(value))
    : "";
}

export function getStepEnvValue(step, key) {
  if (!step?.env || typeof step.env !== "object" || Array.isArray(step.env)) {
    return "";
  }

  const value = step.env[key];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? normalizeMultilineText(String(value))
    : "";
}

export function listUploadArtifactNames(job) {
  return getJobSteps(job)
    .filter((step) => getStepUses(step).startsWith("actions/upload-artifact@"))
    .map((step) => getStepWithValue(step, "name"))
    .filter(Boolean);
}

export function assertIncludesAll(text, snippets, description) {
  for (const snippet of snippets) {
    if (!text.includes(snippet)) {
      throw new Error(`${description} is missing required snippet "${snippet}"`);
    }
  }
}

export function assertExcludesAll(text, snippets, description) {
  for (const snippet of snippets) {
    if (text.includes(snippet)) {
      throw new Error(`${description} still includes forbidden snippet "${snippet}"`);
    }
  }
}
