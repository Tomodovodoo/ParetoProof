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

function stripListPrefix(line) {
  return line.trim().replace(/^(?:(?:[-*+]\s*)+|\d+\.\s*)/, "").trim();
}

function normalizeGuidanceLine(line) {
  return stripListPrefix(line).replace(/`/g, "").replace(/\s+/g, " ").trim();
}

function isTemplateGuidanceLine(line) {
  const stripped = normalizeGuidanceLine(line);
  return stripped === "Replace the placeholder with real issue references before opening or merging." ||
    stripped ===
      "Use literal markdown such as Closes #123 or Related: #456; do not leave the placeholder blank and do not paste escaped \\n text." ||
    stripped === "If there is intentionally no issue, say so explicitly here." ||
    stripped === "CI rejects untouched placeholder text in this section." ||
    stripped ===
      "Replace the checklist-only default with checked items and a brief note or not applicable; CI rejects untouched default sections here.";
}

function listMeaningfulLines(body) {
  return normalizeSectionBody(body)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isTemplateGuidanceLine(line));
}

function hasUncheckedChecklist(body) {
  return /(^|\n)\s*(?:(?:[-*+]\s*)|\d+\.\s*)\[[ ]\]/m.test(normalizeSectionBody(body));
}

function hasCheckedChecklist(body) {
  return /(^|\n)\s*(?:(?:[-*+]\s*)|\d+\.\s*)\[[xX]\]/m.test(normalizeSectionBody(body));
}

function hasMeaningfulNarrative(body) {
  const prose = listMeaningfulLines(body)
    .filter((line) => !line.match(/^(?:(?:[-*+])\s*|\d+\.\s*)\[[ xX]\]/))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!prose) {
    return false;
  }

  if (/\b(not applicable|n\/a)\b/i.test(prose)) {
    return true;
  }

  if (prose.length < 16) {
    return false;
  }

  if (/^(note|later|todo|tbd|pending|follow up)$/i.test(prose)) {
    return false;
  }

  return /[a-z]/i.test(prose);
}

function hasLinkedIssueReference(body) {
  return /(^|\n)\s*(?:(?:[-*+]\s*)|\d+\.\s*)?(?:closes|close|fixes|fix|resolves|resolve|related:?)\s+#\d+\b/im.test(
    normalizeSectionBody(body)
  );
}

function hasExplicitNoIssueDeclaration(body) {
  return listMeaningfulLines(body)
    .map((line) => stripListPrefix(line))
    .some((line) => {
      const match = line.match(
        /^(?:no issue(?: applies)?|no linked issue(?: applies)?|intentionally no issue(?: applies)?|there is no issue(?: applies)?|there is intentionally no issue(?: applies)?)(.*)$/i
      );

      if (!match) {
        return false;
      }

      const suffix = match[1].trim();
      return (
        suffix === "" ||
        /^[.;]$/.test(suffix) ||
        /^[(),:;.-]\s*.+$/.test(suffix) ||
        /^(?:because|since|as|for|to|on|in|within|across|through|due to|under|during|here|there|this|that|these|those|where|when)\b.+$/i.test(
          suffix
        )
      );
    });
}

function hasConcreteVerificationEvidence(body) {
  const normalized = normalizeSectionBody(body);
  const codeBlockMatches = [...normalized.matchAll(/```(?:[\w-]+)?\n([\s\S]*?)```/g)];
  const codeBlocks = codeBlockMatches.map((match) => match[1].trim()).filter(Boolean);
  const commandLikeEvidence = codeBlocks.some((block) =>
    block
      .split("\n")
      .map((line) => line.trim())
      .some((line) =>
        /^(?:\$|>|PS>)?\s*(?:bun|bunx|node|npm|npx|pnpm|yarn|gh|docker|python|pytest|uv|cargo|go)\b/i.test(line)
      )
  );
  const workflowLikeEvidence =
    /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/actions\/runs\/\d+/i.test(normalized) ||
    /actions\/runs\/\d+/i.test(normalized) ||
    /job\/\d+/i.test(normalized);
  const artifactLikeEvidence =
    /(?:^|\s)(?:[A-Za-z]:\\|\/|\.\/|\.\.\/)[^\s]+/m.test(normalized) ||
    /\b[\w./-]+\.(?:png|jpg|jpeg|log|txt|md|json|html)\b/i.test(normalized);

  return commandLikeEvidence || workflowLikeEvidence || artifactLikeEvidence;
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
  if (/(^|\n)\s*(?:(?:[-*+]\s*)|\d+\.\s*)?Closes #\s*(\n|$)/im.test(linkedIssues)) {
    throw new Error('PR body section "Linked issues" still contains the placeholder "Closes #"');
  }

  if (!hasLinkedIssueReference(linkedIssues) && !hasExplicitNoIssueDeclaration(linkedIssues)) {
    throw new Error(
      'PR body section "Linked issues" must contain a real issue reference like "#123" or explicitly say no issue applies'
    );
  }

  const verification = bodySections.get("Verification");
  if (verification.includes("# Paste exact commands")) {
    throw new Error('PR body section "Verification" still contains the placeholder command block');
  }

  if (hasUncheckedChecklist(verification)) {
    throw new Error('PR body section "Verification" still contains unchecked checklist items');
  }

  if (!hasCheckedChecklist(verification)) {
    throw new Error('PR body section "Verification" must mark its checklist items as completed');
  }

  if (!hasConcreteVerificationEvidence(verification)) {
    throw new Error(
      'PR body section "Verification" must include concrete evidence such as commands, workflow runs, or artifact paths'
    );
  }

  for (const sectionTitle of ["Security and cost review", "Rollout and rollback"]) {
    const sectionBody = bodySections.get(sectionTitle);

    if (hasUncheckedChecklist(sectionBody)) {
      throw new Error(`PR body section "${sectionTitle}" still contains unchecked checklist items`);
    }

    if (!/\b(?:not applicable|n\/a)\b/i.test(sectionBody) && !hasCheckedChecklist(sectionBody)) {
      throw new Error(
        `PR body section "${sectionTitle}" must either check the checklist items or explicitly state not applicable`
      );
    }

    if (!hasMeaningfulNarrative(sectionBody)) {
      throw new Error(
        `PR body section "${sectionTitle}" must include a brief explanatory note or an explicit not-applicable statement`
      );
    }
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
