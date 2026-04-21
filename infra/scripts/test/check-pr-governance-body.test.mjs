import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
const linkedIssuesGuidanceLine =
  "Use literal markdown such as `Closes #123`, `Related: #456`, or a direct GitHub issue link; do not leave the placeholder blank and do not paste escaped \\n text.";

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

test("validatePrGovernanceBody rejects candidate templates that drop required checklist items", () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "paretoproof-governance-template-"));

  try {
    mkdirSync(resolve(tempRoot, ".github"), { recursive: true });

    const reducedTemplate = readFileSync(resolve(repoRoot, ".github/PULL_REQUEST_TEMPLATE.md"), "utf8")
      .replace(/- \[ \] Commands run are listed below\r?\n/, "")
      .replace(/- \[ \] Relevant logs, artifact paths, or screenshots are linked or described\r?\n/, "")
      .replace(/- \[ \] New or changed contracts are wired through implementation, not only documented\r?\n/, "")
      .replace(
        /- \[ \] No new auth, CSRF, secret-handling, or data-exposure risk was introduced without mitigation or a linked follow-up issue\r?\n/,
        ""
      )
      .replace(/- \[ \] For security-sensitive changes, the threat boundary and mitigation are described below\r?\n/, "")
      .replace(/- \[ \] Cost or rate-limit impact is described below when relevant\r?\n/, "")
      .replace(/- \[ \] Rollout plan is described or marked not applicable\r?\n/, "")
      .replace(/- \[ \] Rollback plan is described or marked not applicable\r?\n/, "");

    writeFileSync(resolve(tempRoot, ".github", "PULL_REQUEST_TEMPLATE.md"), reducedTemplate, "utf8");

    const validBody = readFileSync(validBodyPath, "utf8");

    assert.throws(
      () => validatePrGovernanceBody(tempRoot, validBody),
      /PULL_REQUEST_TEMPLATE\.md section "Verification" must keep the required checklist items/
    );
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }
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

test("validatePrGovernanceBody rejects a bolded closes placeholder even if a no-issue line is also present", () => {
  const invalidBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

**Closes #**
No issue applies.

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, invalidBody),
    /placeholder "Closes #"/
  );
});

test("validatePrGovernanceBody rejects a blockquoted closes placeholder even if a no-issue line is also present", () => {
  const invalidBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

> Closes #
No issue applies.

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, invalidBody),
    /placeholder "Closes #"/
  );
});

test("validatePrGovernanceBody rejects an html-entity closes placeholder even if a no-issue line is also present", () => {
  const invalidBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

Closes &#35;
No issue applies.

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, invalidBody),
    /placeholder "Closes #"/
  );
});

test("validatePrGovernanceBody rejects a zero-width closes placeholder even if a no-issue line is also present", () => {
  const invalidBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

Closes #\u200B
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

test("validatePrGovernanceBody accepts bare linked-issue references", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace("- Closes #1021", "#1021");

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts repo-scoped linked-issue references", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    "- Closes #1021",
    "Closes openai/openai#1021"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts repo-scoped markdown-linked issue references", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    "- Closes #1021",
    "[Closes openai/openai#1021](https://github.com/openai/openai/issues/1021)"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts markdown-linked issue references with generic anchor text", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    "- Closes #1021",
    "[tracked issue](https://github.com/openai/openai/issues/1021)"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts bare repo-scoped linked-issue references", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    "- Closes #1021",
    "openai/openai#1021"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts bare issue autolinks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    "- Closes #1021",
    "<https://github.com/openai/openai/issues/1021>"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts bare GitHub issue URLs", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    "- Closes #1021",
    "https://github.com/openai/openai/issues/1021"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts labeled direct GitHub issue URLs", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    "- Closes #1021",
    "Issue: https://github.com/openai/openai/issues/1021"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts labeled markdown direct issue links", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    "- Closes #1021",
    "Tracked in: [issue](https://github.com/openai/openai/issues/1021)"
  );

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

test("validatePrGovernanceBody accepts parenthesized ordered-list linked-issue references", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace("- Closes #1021", "1) Closes #1021");

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts required sections written with setext headings", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    "## Linked issues\n\n- Closes #1021",
    "Linked issues\n-------------\n\n- Closes #1021"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts required sections written with equals-sign setext headings", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    "## Linked issues\n\n- Closes #1021",
    "Linked issues\n=============\n\n- Closes #1021"
  );

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

test("validatePrGovernanceBody accepts parenthesized ordered-list verification checklists", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Verification[\s\S]*?```text/,
    `## Verification

1) [x] Commands run are listed below
2) [x] Relevant logs, artifact paths, or screenshots are linked or described
3) [x] New or changed contracts are wired through implementation, not only documented

\`\`\`text`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts verification checklist items with inline context", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    "- [x] Commands run are listed below",
    "- [x] Commands run are listed below (see logs)"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts verification checklist items wrapped across lines", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    "- [x] New or changed contracts are wired through implementation, not only documented",
    `- [x] New or changed contracts are wired through implementation,
  not only documented`
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

test("validatePrGovernanceBody rejects single-token gibberish security notes", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Security and cost review[\s\S]*?## Rollout and rollback/,
    `## Security and cost review

- [x] No new auth, CSRF, secret-handling, or data-exposure risk was introduced without mitigation or a linked follow-up issue
- [x] For security-sensitive changes, the threat boundary and mitigation are described below
- [x] Cost or rate-limit impact is described below when relevant
- abcdefghijklmnop

## Rollout and rollback`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /brief explanatory note|not-applicable statement/
  );
});

test("validatePrGovernanceBody rejects multi-word filler security notes", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Security and cost review[\s\S]*?## Rollout and rollback/,
    `## Security and cost review

- [x] No new auth, CSRF, secret-handling, or data-exposure risk was introduced without mitigation or a linked follow-up issue
- [x] For security-sensitive changes, the threat boundary and mitigation are described below
- [x] Cost or rate-limit impact is described below when relevant
- lorem ipsum dolor sit amet

## Rollout and rollback`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /brief explanatory note|not-applicable statement/
  );
});

test("validatePrGovernanceBody rejects multi-word filler rollout notes", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Rollout and rollback[\s\S]*?## Notes/,
    `## Rollout and rollback

- [x] Rollout plan is described or marked not applicable
- [x] Rollback plan is described or marked not applicable
- alpha beta gamma delta epsilon

## Notes`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /brief explanatory note|not-applicable statement/
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

test("validatePrGovernanceBody accepts concise labeled security notes", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace("- Cost: not applicable.", "- Cost: none.");

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts indented continuation rollout notes", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Rollout and rollback[\s\S]*?## Notes/,
    `## Rollout and rollback

- [x] Rollout plan is described or marked not applicable
    Merge after CI passes.
- [x] Rollback plan is described or marked not applicable
    Revert this change set if the guard regresses.

## Notes`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts inline security checklist explanations", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Security and cost review[\s\S]*?## Rollout and rollback/,
    `## Security and cost review

- [x] No new auth, CSRF, secret-handling, or data-exposure risk was introduced without mitigation or a linked follow-up issue: no new auth or secret boundary was introduced.
- [x] For security-sensitive changes, the threat boundary and mitigation are described below: merge-time validation only; runtime attack surface is unchanged.
- [x] Cost or rate-limit impact is described below when relevant: no new runtime cost.

## Rollout and rollback`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts inline rollout checklist explanations", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Rollout and rollback[\s\S]*?## Notes/,
    `## Rollout and rollback

- [x] Rollout plan is described or marked not applicable: merge after CI and codex review are green.
- [x] Rollback plan is described or marked not applicable: revert the governance-guard change set if a regression appears.

## Notes`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody rejects bare rollout checklist explanations", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Rollout and rollback[\s\S]*?## Notes/,
    `## Rollout and rollback

- [x] Rollout plan is described or marked not applicable: merge.
- [x] Rollback plan is described or marked not applicable: revert.

## Notes`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /brief explanatory note|not-applicable statement/
  );
});

test("validatePrGovernanceBody rejects bare inline security checklist explanations", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Security and cost review[\s\S]*?## Rollout and rollback/,
    `## Security and cost review

- [x] No new auth, CSRF, secret-handling, or data-exposure risk was introduced without mitigation or a linked follow-up issue: internal.
- [x] For security-sensitive changes, the threat boundary and mitigation are described below: unchanged.
- [x] Cost or rate-limit impact is described below when relevant: manual.

## Rollout and rollback`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /brief explanatory note|not-applicable statement/
  );
});

test("validatePrGovernanceBody rejects verification sections that remove required checklist items", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Verification[\s\S]*?## Security and cost review/,
    `## Verification

- [x] Commands run are listed below

\`\`\`text
bun run test:governance-guards
\`\`\`

## Security and cost review`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /keep and complete the required checklist items/
  );
});

test("validatePrGovernanceBody rejects plain [x] verification text that is not a markdown task list", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Verification[\s\S]*?## Security and cost review/,
    `## Verification

[x] Commands run are listed below
[x] Relevant logs, artifact paths, or screenshots are linked or described
[x] New or changed contracts are wired through implementation, not only documented

\`\`\`text
bun run test:governance-guards
\`\`\`

## Security and cost review`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /keep and complete the required checklist items/
  );
});

test("validatePrGovernanceBody accepts verification sections with unchecked checklist examples inside fenced code blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "```text\nnode infra/scripts/check-pr-governance-body.mjs --body-file infra/scripts/fixtures/governance/pr-body-valid.md\nnode infra/scripts/check-main-branch-promotion-gate.mjs\n```\n\n```md\n- [ ] sample evidence item\n```"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody rejects rollout sections that remove required checklist items without not-applicable", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Rollout and rollback[\s\S]*?## Notes/,
    `## Rollout and rollback

- [x] Rollout plan is described or marked not applicable
- Rollout: merge after CI.

## Notes`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /keep and complete the required checklist items/
  );
});

test("validatePrGovernanceBody rejects rollout sections that remove required checklist items even with a not-applicable note", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Rollout and rollback[\s\S]*?## Notes/,
    `## Rollout and rollback

- [x] Rollout plan is described or marked not applicable
- Rollout: not applicable for this docs-only change.

## Notes`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /keep and complete the required checklist items/
  );
});

test("validatePrGovernanceBody rejects parenthesized ordered-list unchecked rollout items even with a not-applicable note", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Rollout and rollback[\s\S]*?## Notes/,
    `## Rollout and rollback

1) [ ] Rollout plan is described or marked not applicable
2) [ ] Rollback plan is described or marked not applicable
- Rollout: not applicable for this docs-only change.

## Notes`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /unchecked checklist items/
  );
});

test("validatePrGovernanceBody rejects linked-issues sections that keep only the template no-issue guidance", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

- ${linkedIssuesGuidanceLine}
- If there is intentionally no issue, say so explicitly here.
- CI rejects untouched placeholder text in this section.

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must contain a real issue reference/
  );
});

test("validatePrGovernanceBody rejects bolded linked-issues template guidance", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

**${linkedIssuesGuidanceLine}**
**If there is intentionally no issue, say so explicitly here.**
**CI rejects untouched placeholder text in this section.**

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must contain a real issue reference/
  );
});

test("validatePrGovernanceBody rejects blockquoted linked-issues template guidance", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

> ${linkedIssuesGuidanceLine}
> If there is intentionally no issue, say so explicitly here.
> CI rejects untouched placeholder text in this section.

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must contain a real issue reference/
  );
});

test("validatePrGovernanceBody rejects linked-issues references hidden inside inline html", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

<span hidden>Closes #1021</span>

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must contain a real issue reference/
  );
});

test("validatePrGovernanceBody rejects linked-issues references hidden inside multiline inline html", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

<span hidden>
Closes #1021
</span>

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must contain a real issue reference/
  );
});

test("validatePrGovernanceBody rejects linked-issues references hidden by multiline opening tags", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

<span
  hidden
>
Closes #1021
</span>

Still no visible issue reference here.

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must contain a real issue reference/
  );
});

test("validatePrGovernanceBody rejects linked-issues references hidden inside nested inline html of the same tag", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

<span hidden><span>ignored</span>Closes #1021</span>

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must contain a real issue reference/
  );
});

test("validatePrGovernanceBody rejects linked-issues references hidden by inline CSS", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

<span style="display:none">Closes #1021</span>

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must contain a real issue reference/
  );
});

test("validatePrGovernanceBody rejects linked-issues references hidden by zero-opacity inline CSS", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

<span style="opacity:0">Closes #1021</span>

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must contain a real issue reference/
  );
});

test("validatePrGovernanceBody rejects linked-issues markdown links that do not point to a real issue", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

[Closes #1021](https://example.com/not-an-issue)

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must contain a real issue reference/
  );
});

test("validatePrGovernanceBody accepts linked-issues markdown links to a matching GitHub issue", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

Closes [#1021](https://github.com/Tomodovodoo/ParetoProof/issues/1021)

## Verification`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts linked-issues markdown links to a matching repo-relative GitHub issue", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

Closes [#1021](/Tomodovodoo/ParetoProof/issues/1021)

## Verification`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts linked-issues markdown links to a matching relative GitHub issue", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

Closes [#1021](../issues/1021)

## Verification`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts reference-style markdown linked-issue references", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

Closes [#1021][issue]

[issue]: https://github.com/Tomodovodoo/ParetoProof/issues/1021

## Verification`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts titled reference-style markdown linked-issue references", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

Closes [#1021][issue]

[issue]: https://github.com/Tomodovodoo/ParetoProof/issues/1021 "tracker"

## Verification`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts shortcut reference-style linked-issue references", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

[Closes #1021]

[Closes #1021]: https://github.com/Tomodovodoo/ParetoProof/issues/1021

## Verification`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts linked-issue reference definitions outside the section", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification[\s\S]*?## Security and cost review/,
    `## Linked issues

Closes [#1021][issue]

## Verification

- [x] Commands run are listed below
- [x] Relevant logs, artifact paths, or screenshots are linked or described
- [x] New or changed contracts are wired through implementation, not only documented

\`\`\`text
node infra/scripts/check-pr-governance-body.mjs --body-file infra/scripts/fixtures/governance/pr-body-valid.md
node infra/scripts/check-main-branch-promotion-gate.mjs
\`\`\`

[issue]: https://github.com/Tomodovodoo/ParetoProof/issues/1021

## Security and cost review`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts linked-issues html anchors to a matching GitHub issue", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

Closes <a href="https://github.com/Tomodovodoo/ParetoProof/issues/1021">#1021</a>

## Verification`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts linked-issues autolinks to a matching GitHub issue", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

Closes <https://github.com/Tomodovodoo/ParetoProof/issues/1021>

## Verification`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts fully anchored markdown linked-issue references", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

[Closes #1021](https://github.com/Tomodovodoo/ParetoProof/issues/1021)

## Verification`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts fully anchored reference-style markdown linked-issue references", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

[Closes #1021][issue]

[issue]: https://github.com/Tomodovodoo/ParetoProof/issues/1021

## Verification`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts fully anchored html linked-issue references", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

<a href="https://github.com/Tomodovodoo/ParetoProof/issues/1021">Closes #1021</a>

## Verification`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody rejects linked-issues html anchors that do not point to a real issue", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

Closes <a href="https://example.com/not-an-issue">#1021</a>

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must contain a real issue reference/
  );
});

test("validatePrGovernanceBody rejects linked-issues html anchors with unquoted href values that do not point to a real issue", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

Closes <a href=/not-an-issue>#1021</a>

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must contain a real issue reference/
  );
});

test("validatePrGovernanceBody rejects code-formatted linked-issue text", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

\`Closes #1021\`

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must contain a real issue reference/
  );
});

test("validatePrGovernanceBody rejects html code-tag linked-issue text", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

<code>Closes #1021</code>

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must contain a real issue reference/
  );
});

test("validatePrGovernanceBody accepts visible html attributes whose names merely contain hidden", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

<span data-hidden-label="issue">Closes #1021</span>

## Verification`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts visible single-line html block content in linked issues", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

<p>Closes #1021</p>

## Verification`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts visible multiline html block content in linked issues", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

<div>
Closes #1021
</div>

## Verification`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody ignores required-looking headings inside div html blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Notes[\s\S]*$/,
    `## Notes

<div>
## Linked issues
Closes #9999
</div>
`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody rejects linked-issues references hidden inside single-line pre blocks", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

<pre>Closes #1021</pre>

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

test("validatePrGovernanceBody accepts visible markdown command evidence", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "- Exact commands run: bun run test:governance-guards"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts backticked visible markdown command evidence", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "- Exact commands run: `bun run test:governance-guards`"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts visible markdown make and script command evidence", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "- Exact commands run: make governance-checks\n- Follow-up: ./scripts/run-governance-checks.sh --verbose"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts explicit visible bare single-token command evidence", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "- Exact commands run: pytest"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody rejects explicit visible bare tool-name command evidence", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "- Exact commands run: git"
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody rejects labeled repo paths that masquerade as commands run", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "- Exact commands run: ./README.md"
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody rejects descriptive prose that merely mentions a command", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "Summary: docker build is now used by CI."
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody accepts visible standalone command lines with CLI-style arguments", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "node infra/scripts/check-pr-governance-body.mjs --body-file infra/scripts/fixtures/governance/pr-body-valid.md"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts env-prefixed shell verification commands", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "- Exact commands run: CI=1 bun run test:governance-guards"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts env-prefixed PowerShell verification commands", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "- Exact commands run: $env:CI=1; bun run test:governance-guards"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts standard indented verification code blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "    bun run test:governance-guards\n    node infra/scripts/check-pr-governance-body.mjs --body-file infra/scripts/fixtures/governance/pr-body-valid.md"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts standard indented bare single-token verification commands", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "    pytest"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody rejects bare repo filenames as verification evidence", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "package.json"
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody rejects repo-relative source paths as verification evidence", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "infra/README.md"
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody rejects dot-relative repo file paths as verification evidence", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "./README.md"
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody rejects root-relative repo file paths as verification evidence", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "/README.md"
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody accepts linked workflow-run evidence", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "https://github.com/Tomodovodoo/ParetoProof/actions/runs/123456789"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts linked workflow-run evidence inside fenced code blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "```text\nhttps://github.com/Tomodovodoo/ParetoProof/actions/runs/123456789\n```"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts root-relative workflow-run evidence", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "/Tomodovodoo/ParetoProof/actions/runs/123456789"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts relative workflow-run evidence", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "[workflow run](../actions/runs/123456789)"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts workflow-run autolinks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "<https://github.com/Tomodovodoo/ParetoProof/actions/runs/123456789>"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts workflow-run html anchors", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    '<a href="https://github.com/Tomodovodoo/ParetoProof/actions/runs/123456789">workflow run</a>'
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts reference-style workflow-run evidence", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "[run][wf]\n\n[wf]: https://github.com/Tomodovodoo/ParetoProof/actions/runs/123456789"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts reference-style artifact-path evidence", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "[artifact][proof]\n\n[proof]: ./governance-proof.pdf"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts reference-style workflow-run evidence with a document-wide definition", () => {
  const validBody = readFileSync(validBodyPath, "utf8")
    .replace(/```text[\s\S]*?```/, "[run][wf]")
    .replace("- Not applicable.", "- Not applicable.\n\n[wf]: https://github.com/Tomodovodoo/ParetoProof/actions/runs/123456789");

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts reference-style artifact-path evidence with a document-wide definition", () => {
  const validBody = readFileSync(validBodyPath, "utf8")
    .replace(/```text[\s\S]*?```/, "[artifact][proof]")
    .replace("- Not applicable.", "- Not applicable.\n\n[proof]: ./governance-proof.pdf");

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts artifact-path evidence inside indented code blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "    ./.tmp/governance-proof.log"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts pdf artifact-path evidence", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "artifacts/governance-proof.pdf"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts markdown-linked artifact-path evidence", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "[proof](artifacts/governance-proof.pdf)"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts markdown artifact-path evidence", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "artifacts/problem9-image-digests.md"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts nested screenshot artifact-path evidence", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "docs/screenshots/governance-proof.png"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts webp screenshot artifact-path evidence", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "screenshots/governance-proof.webp"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts generic top-level log artifact paths", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "logs/2026-04-21.txt"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts generic top-level artifact paths", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "artifacts/ci-output.txt"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts generic top-level result paths", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "results/run-17.json"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts GitHub-hosted screenshot URLs", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "https://github.com/user-attachments/assets/12345678-1234-1234-1234-1234567890ab"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts explicitly rooted digest artifact paths", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "./problem9-image-digests.md"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts explicitly rooted proof artifact paths", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "./governance-proof.pdf"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts markdown-linked explicitly rooted proof artifact paths", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "[artifact](./governance-proof.pdf)"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody rejects bare root-level digest artifact filenames", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "problem9-image-digests.md"
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody rejects bare proof artifact filenames", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "proof.md"
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody rejects prose-only artifact filename mentions", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "We should upload governance-proof.pdf after this lands."
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody rejects repo filenames that only contain artifact substrings", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "CHANGELOG.md"
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody rejects repo paths whose basenames only look artifact-like", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "docs/proof.md"
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody rejects docs paths that only pass through reports directories", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "docs/reports/overview.md"
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody rejects generic tmp artifact-like paths without artifact-specific filenames", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "./tmp/foo.md"
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody accepts commented placeholder text alongside real verification evidence", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "```text\nnode infra/scripts/check-pr-governance-body.mjs --body-file infra/scripts/fixtures/governance/pr-body-valid.md\nnode infra/scripts/check-main-branch-promotion-gate.mjs\n```\n\n<!-- # Paste exact commands, workflow runs, or artifact paths here -->"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody rejects verification evidence that exists only in reference definitions", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "[run]: https://github.com/Tomodovodoo/ParetoProof/actions/runs/123456789"
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
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

test("validatePrGovernanceBody rejects prose-only actions-run fragments as verification evidence", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "This note mentions actions/runs/123456 in prose only."
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody rejects bare tool-name verification blocks", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "```text\ngit\n```"
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody rejects bare job identifiers as verification evidence", () => {
  const invalidBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "job/123"
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, invalidBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody rejects verification evidence that exists only inside html comments", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "<!-- https://github.com/Tomodovodoo/ParetoProof/actions/runs/123456789 -->"
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody accepts verification evidence inside single-line details blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "<details>bun run test:governance-guards</details>"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody rejects verification evidence hidden inside inline html", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "<span hidden>bun run test:governance-guards</span>"
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody rejects verification evidence hidden inside multiline inline html", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "<span hidden>\npytest\n</span>"
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody rejects verification evidence hidden by inline CSS", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    '<span style="display:none">bun run test:governance-guards</span>'
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody rejects verification evidence hidden by zero-opacity inline CSS", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    '<span style="opacity:0">bun run test:governance-guards</span>'
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody rejects duplicate required headings even if the later copy is filled correctly", () => {
  const invalidBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

Closes #

## Linked issues

- Closes #1021

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, invalidBody),
    /duplicate required section heading "Linked issues"/
  );
});

test("validatePrGovernanceBody rejects semantically equivalent duplicate required headings", () => {
  const invalidBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues ##

Closes #

## Linked issues

- Closes #1021

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, invalidBody),
    /duplicate required section heading "Linked issues"/
  );
});

test("validatePrGovernanceBody rejects duplicate required headings with commonmark indentation", () => {
  const invalidBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `   ## Linked issues

Closes #

## Linked issues

- Closes #1021

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, invalidBody),
    /duplicate required section heading "Linked issues"/
  );
});

test("validatePrGovernanceBody ignores required-looking headings inside fenced code blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Notes[\s\S]*$/,
    `## Notes

\`\`\`md
## Linked issues
Closes #9999
\`\`\`
`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody ignores required-looking headings inside longer nested fences", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Notes[\s\S]*$/,
    `## Notes

\`\`\`\`md
\`\`\`md
## Linked issues
Closes #9999
\`\`\`
\`\`\`\`
`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts nested verification fences under list items", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "- Commands run:\n\n    ```text\n    bun run test:governance-guards\n    ```"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts tilded verification code fences", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "~~~text\nbun run test:governance-guards\n~~~"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody does not treat four-space-indented fences as section delimiters", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Verification[\s\S]*?## Security and cost review/,
    `## Verification

- [x] Commands run are listed below
- [x] Relevant logs, artifact paths, or screenshots are linked or described
- [x] New or changed contracts are wired through implementation, not only documented

    \`\`\`\`
    ## Linked issues
    Closes #9999
    \`\`\`\`

https://github.com/Tomodovodoo/ParetoProof/actions/runs/123456789

## Security and cost review`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody ignores required-looking headings inside html comments", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Notes[\s\S]*$/,
    `## Notes

<!--
## Linked issues
Closes #9999
-->
`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody rejects security notes that exist only inside html comments", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Security and cost review[\s\S]*?## Rollout and rollback/,
    `## Security and cost review

- [x] No new auth, CSRF, secret-handling, or data-exposure risk was introduced without mitigation or a linked follow-up issue
- [x] For security-sensitive changes, the threat boundary and mitigation are described below
- [x] Cost or rate-limit impact is described below when relevant
<!-- Threat boundary: merge-time governance only; no runtime boundary changes. -->

## Rollout and rollback`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /brief explanatory note|not-applicable statement/
  );
});

test("validatePrGovernanceBody accepts security notes inside single-line details blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Security and cost review[\s\S]*?## Rollout and rollback/,
    `## Security and cost review

- [x] No new auth, CSRF, secret-handling, or data-exposure risk was introduced without mitigation or a linked follow-up issue
- [x] For security-sensitive changes, the threat boundary and mitigation are described below
- [x] Cost or rate-limit impact is described below when relevant
<details>Threat boundary: merge-time governance only; no runtime boundary changes.</details>

## Rollout and rollback`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts linked issues inside preformatted single-line details blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

<details><pre>Closes #1021</pre></details>

## Verification`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts linked issues inside multiline details blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

<details>
Closes #1021
</details>

## Verification`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody rejects linked issues hidden inside opaque html within details blocks", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

<details><script>Closes #1021</script></details>

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must contain a real issue reference|explicitly say no issue applies/
  );
});

test("validatePrGovernanceBody accepts verification evidence inside multiline details blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "<details>\nnode infra/scripts/check-pr-governance-body.mjs --body-file infra/scripts/fixtures/governance/pr-body-valid.md\n</details>"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts visible multiline html block content in verification", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "<div>\nnode infra/scripts/check-pr-governance-body.mjs --body-file infra/scripts/fixtures/governance/pr-body-valid.md\n</div>"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts verification evidence inside preformatted multiline details blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "<details>\n<pre>\nnode infra/scripts/check-pr-governance-body.mjs --body-file infra/scripts/fixtures/governance/pr-body-valid.md\n</pre>\n</details>"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody rejects verification evidence hidden inside opaque html within details blocks", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "<details><style>bun run test:governance-guards</style></details>"
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include concrete evidence/
  );
});

test("validatePrGovernanceBody rejects security notes hidden inside multiline inline html", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Security and cost review[\s\S]*?## Rollout and rollback/,
    `## Security and cost review

- [x] No new auth, CSRF, secret-handling, or data-exposure risk was introduced without mitigation or a linked follow-up issue
- [x] For security-sensitive changes, the threat boundary and mitigation are described below
- [x] Cost or rate-limit impact is described below when relevant
<span hidden>
Threat boundary: merge-time governance only; no runtime boundary changes.
</span>

## Rollout and rollback`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /brief explanatory note|not-applicable statement/
  );
});

test("validatePrGovernanceBody rejects security notes hidden by inline CSS", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Security and cost review[\s\S]*?## Rollout and rollback/,
    `## Security and cost review

- [x] No new auth, CSRF, secret-handling, or data-exposure risk was introduced without mitigation or a linked follow-up issue
- [x] For security-sensitive changes, the threat boundary and mitigation are described below
- [x] Cost or rate-limit impact is described below when relevant
<span style="display:none">Threat boundary: merge-time governance only; no runtime boundary changes.</span>

## Rollout and rollback`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /brief explanatory note|not-applicable statement/
  );
});

test("validatePrGovernanceBody rejects security notes hidden by zero-opacity inline CSS", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Security and cost review[\s\S]*?## Rollout and rollback/,
    `## Security and cost review

- [x] No new auth, CSRF, secret-handling, or data-exposure risk was introduced without mitigation or a linked follow-up issue
- [x] For security-sensitive changes, the threat boundary and mitigation are described below
- [x] Cost or rate-limit impact is described below when relevant
<span style="opacity:0">Threat boundary: merge-time governance only; no runtime boundary changes.</span>

## Rollout and rollback`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /brief explanatory note|not-applicable statement/
  );
});

test("validatePrGovernanceBody accepts security sections with unchecked checklist examples inside indented code blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    "- Cost: not applicable.",
    "- Cost: not applicable.\n\n    - [ ] sample security checklist item"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts security notes inside multiline details blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Security and cost review[\s\S]*?## Rollout and rollback/,
    `## Security and cost review

- [x] No new auth, CSRF, secret-handling, or data-exposure risk was introduced without mitigation or a linked follow-up issue
- [x] For security-sensitive changes, the threat boundary and mitigation are described below
- [x] Cost or rate-limit impact is described below when relevant
<details>
Threat boundary: merge-time governance only; no runtime boundary changes.
</details>

## Rollout and rollback`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts visible multiline html block content in security notes", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Security and cost review[\s\S]*?## Rollout and rollback/,
    `## Security and cost review

- [x] No new auth, CSRF, secret-handling, or data-exposure risk was introduced without mitigation or a linked follow-up issue
- [x] For security-sensitive changes, the threat boundary and mitigation are described below
- [x] Cost or rate-limit impact is described below when relevant
<div>
Threat boundary: merge-time governance only; no runtime boundary changes.
</div>

## Rollout and rollback`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts security notes inside preformatted multiline details blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Security and cost review[\s\S]*?## Rollout and rollback/,
    `## Security and cost review

- [x] No new auth, CSRF, secret-handling, or data-exposure risk was introduced without mitigation or a linked follow-up issue
- [x] For security-sensitive changes, the threat boundary and mitigation are described below
- [x] Cost or rate-limit impact is described below when relevant
<details>
<pre>
Threat boundary: merge-time governance only; no runtime boundary changes.
</pre>
</details>

## Rollout and rollback`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody rejects security notes hidden inside opaque html within details blocks", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Security and cost review[\s\S]*?## Rollout and rollback/,
    `## Security and cost review

- [x] No new auth, CSRF, secret-handling, or data-exposure risk was introduced without mitigation or a linked follow-up issue
- [x] For security-sensitive changes, the threat boundary and mitigation are described below
- [x] Cost or rate-limit impact is described below when relevant
<details><iframe>Threat boundary: merge-time governance only; no runtime boundary changes.</iframe></details>

## Rollout and rollback`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /brief explanatory note|not-applicable statement/
  );
});

test("validatePrGovernanceBody rejects security notes that exist only in reference definitions", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Security and cost review[\s\S]*?## Rollout and rollback/,
    `## Security and cost review

- [x] No new auth, CSRF, secret-handling, or data-exposure risk was introduced without mitigation or a linked follow-up issue
- [x] For security-sensitive changes, the threat boundary and mitigation are described below
- [x] Cost or rate-limit impact is described below when relevant
[ghost]: not-applicable-for-this-docs-only-change

## Rollout and rollback`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /must include a brief explanatory note or an explicit not-applicable statement/
  );
});

test("validatePrGovernanceBody rejects path-only security notes", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Security and cost review[\s\S]*?## Rollout and rollback/,
    `## Security and cost review

- [x] No new auth, CSRF, secret-handling, or data-exposure risk was introduced without mitigation or a linked follow-up issue
- [x] For security-sensitive changes, the threat boundary and mitigation are described below
- [x] Cost or rate-limit impact is described below when relevant
./security-review.txt

## Rollout and rollback`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /brief explanatory note|not-applicable statement/
  );
});

test("validatePrGovernanceBody rejects path-only security notes that only contain not-applicable filenames", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Security and cost review[\s\S]*?## Rollout and rollback/,
    `## Security and cost review

- [x] No new auth, CSRF, secret-handling, or data-exposure risk was introduced without mitigation or a linked follow-up issue
- [x] For security-sensitive changes, the threat boundary and mitigation are described below
- [x] Cost or rate-limit impact is described below when relevant
artifacts/not applicable.pdf

## Rollout and rollback`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /brief explanatory note|not-applicable statement/
  );
});

test("validatePrGovernanceBody rejects blockquoted rollout template guidance as narrative", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Rollout and rollback[\s\S]*?## Notes/,
    `## Rollout and rollback

- [x] Rollout plan is described or marked not applicable
- [x] Rollback plan is described or marked not applicable
> Replace the checklist-only default with checked items and a brief note or not applicable; CI rejects untouched default sections here.

## Notes`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /brief explanatory note|not-applicable statement/
  );
});

test("validatePrGovernanceBody rejects path-only pdf rollout notes", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Rollout and rollback[\s\S]*?## Notes/,
    `## Rollout and rollback

- [x] Rollout plan is described or marked not applicable
- [x] Rollback plan is described or marked not applicable
artifacts/rollback-plan.yaml

## Notes`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /brief explanatory note|not-applicable statement/
  );
});

test("validatePrGovernanceBody rejects path-only rollout notes that only contain not-applicable filenames", () => {
  const weakBody = readFileSync(validBodyPath, "utf8").replace(
    /## Rollout and rollback[\s\S]*?## Notes/,
    `## Rollout and rollback

- [x] Rollout plan is described or marked not applicable
- [x] Rollback plan is described or marked not applicable
artifacts/not applicable.pdf

## Notes`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, weakBody),
    /brief explanatory note|not-applicable statement/
  );
});

test("validatePrGovernanceBody ignores required-looking headings inside raw html blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Notes[\s\S]*$/,
    `## Notes

<pre>
## Linked issues
Closes #9999
</pre>
`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody terminates raw html blocks on blank lines before later required headings", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

- Closes #1021

<div>

## Verification`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody ignores required-looking headings inside details blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Notes[\s\S]*$/,
    `## Notes

<details>
## Linked issues
Closes #9999
</details>
`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody ignores required-looking headings inside list-wrapped details blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Notes[\s\S]*$/,
    `## Notes

- <details>
  ## Linked issues
  Closes #9999
  </details>
`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody keeps details blocks opaque across blank lines", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Notes[\s\S]*$/,
    `## Notes

<details>

## Linked issues
Closes #9999

</details>
`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody accepts verification evidence inside list-wrapped single-line details blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /```text[\s\S]*?```/,
    "- <details>bun run test:governance-guards</details>"
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody ignores required-looking headings inside table html blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Notes[\s\S]*$/,
    `## Notes

<table>
## Linked issues
Closes #9999
</table>
`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody still recognizes closing fences after html-looking lines inside code blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Verification[\s\S]*?## Security and cost review/,
    `## Verification

- [x] Commands run are listed below
- [x] Relevant logs, artifact paths, or screenshots are linked or described
- [x] New or changed contracts are wired through implementation, not only documented

\`\`\`text
<details>
## Linked issues
</details>
bun run test:governance-guards
\`\`\`

## Security and cost review`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody still recognizes closing fences after html comment tokens inside code blocks", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Verification[\s\S]*?## Security and cost review/,
    `## Verification

- [x] Commands run are listed below
- [x] Relevant logs, artifact paths, or screenshots are linked or described
- [x] New or changed contracts are wired through implementation, not only documented

\`\`\`text <!--
## Linked issues
bun run test:governance-guards
\`\`\`

## Security and cost review`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody does not treat list items before thematic breaks as setext headings", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Verification[\s\S]*?## Security and cost review/,
    `## Verification

- [x] Commands run are listed below
- [x] Relevant logs, artifact paths, or screenshots are linked or described
- [x] New or changed contracts are wired through implementation, not only documented
---

node infra/scripts/check-pr-governance-body.mjs --body-file infra/scripts/fixtures/governance/pr-body-valid.md

## Security and cost review`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody does not treat hidden underlines as visible setext headings", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Notes[\s\S]*$/,
    `## Notes

Linked issues<span hidden>
-------------
</span>

- harmless trailing note.
`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody does not treat tab-indented lines before thematic breaks as setext headings", () => {
  const validBody = readFileSync(validBodyPath, "utf8").replace(
    /## Notes[\s\S]*$/,
    `## Notes

\tLinked issues
---

- harmless trailing note.
`
  );

  assert.doesNotThrow(() => validatePrGovernanceBody(repoRoot, validBody));
});

test("validatePrGovernanceBody rejects duplicate required headings written with setext syntax", () => {
  const invalidBody = readFileSync(validBodyPath, "utf8").replace(
    /## Linked issues[\s\S]*?## Verification/,
    `## Linked issues

Closes #

Linked issues
-------------

- Closes #1021

## Verification`
  );

  assert.throws(
    () => validatePrGovernanceBody(repoRoot, invalidBody),
    /duplicate required section heading "Linked issues"/
  );
});

test("check-pr-governance-body CLI accepts --body-file fixtures", () => {
  const result = runCli("infra/scripts/check-pr-governance-body.mjs", ["--body-file", validBodyPath]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PR governance body check passed/);
});

test("check-pr-governance-body CLI accepts --event-json fixtures", () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "paretoproof-governance-event-"));
  const eventPath = resolve(tempRoot, "event.json");

  try {
    writeFileSync(
      eventPath,
      JSON.stringify({
        pull_request: {
          body: readFileSync(validBodyPath, "utf8")
        }
      }),
      "utf8"
    );

    const result = runCli("infra/scripts/check-pr-governance-body.mjs", ["--event-json", eventPath]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /PR governance body check passed/);
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }
});
