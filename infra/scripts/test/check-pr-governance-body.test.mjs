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

test("validatePrGovernanceBody rejects invalid linked-issue references", () => {
  const invalidBody = readFileSync(validBodyPath, "utf8").replace("- Closes #1021", "- Closes #abc");

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, invalidBody),
    /must contain a real issue reference/
  );
});

test("validatePrGovernanceBody rejects a non-bulleted Closes placeholder even if a no-issue line is also present", () => {
  const invalidBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

Closes #
No issue applies.

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, invalidBody),
    /placeholder "Closes #"/
  );
});

test("validatePrGovernanceBody rejects a lowercase closes placeholder even if a no-issue line is also present", () => {
  const invalidBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

closes #
No issue applies.

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, invalidBody),
    /placeholder "Closes #"/
  );
});

test("validatePrGovernanceBody accepts non-bulleted linked-issue references", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace("- Closes #1021", "Closes #1021");

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts starred linked-issue references", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace("- Closes #1021", "* Closes #1021");

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts ordered-list linked-issue references", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace("- Closes #1021", "1. Closes #1021");

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts explicit non-bulleted no-issue declarations", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace("- Closes #1021", "No issue.");

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts explicit no-issue declarations with bullet and explanation", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    "- Closes #1021",
    "* No issue applies because this is a docs-only sync."
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts explicit no-issue declarations with other explanatory phrasing", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    "- Closes #1021",
    "No linked issue applies for this docs-only sync."
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts explicit no-issue declarations with to-this-change phrasing", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    "- Closes #1021",
    "No issue applies to this change."
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts intentionally-no-issue-applies phrasing", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    "- Closes #1021",
    "Intentionally no issue applies."
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts ordinary explicit no-issue phrasing", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    "- Closes #1021",
    "No issue applies here."
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts there-is-intentionally-no-issue phrasing", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    "- Closes #1021",
    "There is intentionally no issue."
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts ordered-list explicit no-issue declarations", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    "- Closes #1021",
    "1. No issue applies."
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody rejects bare not-applicable linked-issues declarations", () => {
  const invalidBody = readFileSync(validBodyPath, "utf8").replace("- Closes #1021", "Not applicable.");

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, invalidBody),
    /must contain a real issue reference/
  );
});

test("validatePrGovernanceBody rejects numeric hashtags that are not issue linkage", () => {
  const invalidBody = readFileSync(validBodyPath, "utf8").replace(
    "- Closes #1021",
    "- Build log shard #123 exceeded the previous timeout threshold."
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, invalidBody),
    /must contain a real issue reference/
  );
});

test("validatePrGovernanceBody rejects governance sections with checked boxes but no real note", () => {
  const weakBody = readFileSync(validBodyPath, "utf8")
    .replace(
      /## Security and cost review[\s\S]*?## Rollout and rollback/,
      `## Security and cost review

- [x] No new auth, CSRF, secret-handling, or data-exposure risk was introduced without mitigation or a linked follow-up issue
- [x] For security-sensitive changes, the threat boundary and mitigation are described below
- [x] Cost or rate-limit impact is described below when relevant
- later

## Rollout and rollback`
    )
    .replace(
      /## Rollout and rollback[\s\S]*?## Notes/,
      `## Rollout and rollback

- [x] Rollout plan is described or marked not applicable
- [x] Rollback plan is described or marked not applicable
- note

## Notes`
    );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /brief explanatory note|unchecked checklist items/
  );
});

test("validatePrGovernanceBody rejects ordered-list checklists without a real rollout note", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Rollout and rollback[\s\S]*?## Notes/,
    `## Rollout and rollback

1. [x] Rollout plan is described or marked not applicable
2. [x] Rollback plan is described or marked not applicable

## Notes`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /brief explanatory note|not-applicable statement/
  );
});

test("validatePrGovernanceBody rejects no-space checklist items without a real rollout note", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Rollout and rollback[\s\S]*?## Notes/,
    `## Rollout and rollback

*[x] Rollout plan is described or marked not applicable
*[x] Rollback plan is described or marked not applicable

## Notes`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /brief explanatory note|not-applicable statement/
  );
});

test("validatePrGovernanceBody rejects sections that keep the template not-applicable hint", () => {
  const weakBody = readFileSync(validBodyPath, "utf8")
    .replace(
      /## Security and cost review[\s\S]*?## Rollout and rollback/,
      `## Security and cost review

- [x] No new auth, CSRF, secret-handling, or data-exposure risk was introduced without mitigation or a linked follow-up issue
- [x] For security-sensitive changes, the threat boundary and mitigation are described below
- [x] Cost or rate-limit impact is described below when relevant
- Replace the checklist-only default with checked items and a brief note or not applicable; CI rejects untouched default sections here.

## Rollout and rollback`
    )
    .replace(
      /## Rollout and rollback[\s\S]*?## Notes/,
      `## Rollout and rollback

- [x] Rollout plan is described or marked not applicable
- [x] Rollback plan is described or marked not applicable
- Replace the checklist-only default with checked items and a brief note or not applicable; CI rejects untouched default sections here.

## Notes`
    );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /brief explanatory note|not-applicable statement/
  );
});

test("validatePrGovernanceBody accepts real narrative notes that begin with Replace", () => {
  const validBody = readFileSync(validBodyPath, "utf8")
    .replace(
      "- Threat boundary: merge-time governance only; no new runtime secrets or auth flows are introduced.",
      "- Replace the legacy secret reference with the repository secret reference during rollout."
    )
    .replace(
      "- Rollback: revert the governance-check change set.",
      "- Replace the staged workflow pin override with the checked-in production pin during rollback."
    );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody rejects linked-issues sections that keep only the template no-issue guidance", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

- Use literal markdown such as \`Closes #123\` or \`Related: #456\`; do not leave the placeholder blank and do not paste escaped \\n text.
- If there is intentionally no issue, say so explicitly here.
- CI rejects untouched placeholder text in this section.

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must contain a real issue reference/
  );
});

test("validatePrGovernanceBody rejects verification sections without concrete evidence", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "```text\nok\n```"
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody accepts bunx command evidence", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "```text\nbunx playwright install --with-deps chromium\n```"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts linked workflow-run evidence", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "https://github.com/Tomodovodoo/ParetoProof/actions/runs/123456789"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody rejects plain workflow-run text without a run identifier", () => {
  const invalidBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "Workflow run 123456 succeeded for this change."
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, invalidBody),
    /must include concrete evidence/
  );
});

test("check-pr-governance-body CLI accepts --body-file fixtures", () => {
  const result = runCli("infra/scripts/check-pr-governance-body.mjs", ["--body-file", validBodyPath]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PR governance body check passed/);
});
