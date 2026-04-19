import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  parseMarkdownSections,
  validatePrGovernanceBody
} from "../check-pr-governance-body.mjs";
import { repoRoot, runCli } from "./governance-test-helpers.mjs";

const fixturesRoot = resolve(repoRoot, "infra/scripts/fixtures/governance");
const validBodyPath = resolve(fixturesRoot, "pr-body-valid.md");
const untouchedBodyPath = resolve(fixturesRoot, "pr-body-untouched.md");

test("parseMarkdownSections reads level-two template sections", () => {
  const sections = parseMarkdownSections(readFileSync(validBodyPath, "utf8"));
  assert.equal(sections.get("Linked issues"), "- Closes #1021");
  assert.ok(sections.has("Verification"));
});

test("validatePrGovernanceBody accepts a filled PR body", () => {
  assert.doesNotThrow(() =>
    validatePrGovernanceBody(repoRoot, readFileSync(validBodyPath, "utf8"))
  );
});

test("validatePrGovernanceBody rejects untouched template defaults", () => {
  assert.throws(
    () => validatePrGovernanceBody(repoRoot, readFileSync(untouchedBodyPath, "utf8")),
    /untouched template default|placeholder/
  );
});

test("check-pr-governance-body CLI accepts --body-file fixtures", () => {
  const result = runCli("infra/scripts/check-pr-governance-body.mjs", ["--body-file", validBodyPath]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PR governance body check passed/);
});
