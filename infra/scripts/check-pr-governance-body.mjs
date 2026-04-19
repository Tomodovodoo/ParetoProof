#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  isDirectExecution,
  parseCommonCliOptions,
  readRepoText
} from "./lib/workflow-utils.mjs";

const requiredSections = [
  "Linked issues",
  "Verification",
  "Security and cost review",
  "Rollout and rollback"
];

export function parseMarkdownSections(markdown) {
  const sections = new Map();
  let currentTitle = null;
  let currentLines = [];

  for (const line of markdown.split(/\r?\n/)) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      if (currentTitle) {
        sections.set(currentTitle, currentLines.join("\n").trim());
      }

      currentTitle = headingMatch[1];
      currentLines = [];
      continue;
    }

    if (currentTitle) {
      currentLines.push(line);
    }
  }

  if (currentTitle) {
    sections.set(currentTitle, currentLines.join("\n").trim());
  }

  return sections;
}

export function normalizeSectionBody(body) {
  return body.replace(/\r\n/g, "\n").trim();
}

function readBodyFromEventFile(eventFilePath) {
  const payload = JSON.parse(readFileSync(eventFilePath, "utf8"));
  const body = payload?.pull_request?.body;

  if (typeof body !== "string") {
    throw new Error(`${eventFilePath} does not contain pull_request.body text`);
  }

  return body;
}

function resolveBodySource(args) {
  let bodyFilePath = "";
  let eventFilePath = process.env.GITHUB_EVENT_PATH ?? "";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--body-file") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--body-file requires a path");
      }

      bodyFilePath = path.resolve(value);
      index += 1;
      continue;
    }

    if (arg === "--event-json") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--event-json requires a path");
      }

      eventFilePath = path.resolve(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument "${arg}"`);
  }

  if (bodyFilePath) {
    return readFileSync(bodyFilePath, "utf8");
  }

  if (eventFilePath) {
    return readBodyFromEventFile(eventFilePath);
  }

  throw new Error(
    "Provide --body-file <path> or --event-json <path>, or run under pull_request CI with GITHUB_EVENT_PATH set."
  );
}

export function validatePrGovernanceBody(repoRoot, bodyMarkdown) {
  const templatePath = ".github/PULL_REQUEST_TEMPLATE.md";
  const templateSections = parseMarkdownSections(readRepoText(repoRoot, templatePath));
  const bodySections = parseMarkdownSections(bodyMarkdown);

  for (const sectionTitle of requiredSections) {
    const templateBody = templateSections.get(sectionTitle);
    if (!templateBody) {
      throw new Error(`${templatePath} is missing required section "${sectionTitle}"`);
    }

    const body = bodySections.get(sectionTitle);
    if (!body) {
      throw new Error(`PR body is missing required section "${sectionTitle}"`);
    }

    if (normalizeSectionBody(body) === normalizeSectionBody(templateBody)) {
      throw new Error(`PR body section "${sectionTitle}" is still the untouched template default`);
    }
  }

  const linkedIssues = bodySections.get("Linked issues");
  if (/(^|\n)-\s*Closes #\s*(\n|$)/m.test(linkedIssues)) {
    throw new Error('PR body section "Linked issues" still contains the placeholder "Closes #"');
  }

  const verification = bodySections.get("Verification");
  if (verification.includes("# Paste exact commands")) {
    throw new Error('PR body section "Verification" still contains the placeholder command block');
  }
}

function main() {
  try {
    const { repoRoot, remainingArgs } = parseCommonCliOptions(import.meta.url);
    const bodyMarkdown = resolveBodySource(remainingArgs);
    validatePrGovernanceBody(repoRoot, bodyMarkdown);
    console.log("PR governance body check passed.");
  } catch (error) {
    console.error(`PR governance body check failed: ${error.message}`);
    process.exit(1);
  }
}

if (isDirectExecution(import.meta.url)) {
  main();
}
