export function hasExpectedCanonicalModules(actual, expected) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    return false;
  }

  const actualEntries = Object.entries(actual).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey)
  );
  const expectedEntries = Object.entries(expected).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey)
  );

  return (
    actualEntries.length === expectedEntries.length &&
    actualEntries.every(([actualKey, actualValue], index) => {
      const [expectedKey, expectedValue] = expectedEntries[index];
      return actualKey === expectedKey && actualValue === expectedValue;
    })
  );
}

const requiredAxiomSafetyNarrativeFragments = [
  "statement.lean intentionally exports axiom problem9 as the stable theorem header.",
  "the checked-in axiom is not accepted as benchmark proof evidence.",
  "the runtime keeps the checked-in benchmark package read-only and writes model output only to firstproof/problem9/candidate.lean.",
  "importing firstproof.problem9.gold is invalid.",
  "passing runs must match the canonical theorem target and clear the no-axioms check for firstproof.problem9.problem9."
];

function normalizeNarrativeText(text) {
  return text
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractMarkdownSection(text, heading) {
  if (typeof text !== "string" || typeof heading !== "string") {
    return null;
  }

  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const headingIndex = lines.findIndex((line) => line.trim() === heading);

  if (headingIndex === -1) {
    return null;
  }

  const sectionLines = [];

  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const currentLine = lines[index];

    if (currentLine?.startsWith("## ")) {
      break;
    }

    sectionLines.push(currentLine ?? "");
  }

  return sectionLines;
}

export function hasExpectedAxiomSafetyNarrative(text, heading) {
  const sectionLines = extractMarkdownSection(text, heading);

  if (!sectionLines) {
    return false;
  }

  const contentLines = sectionLines.map((line) => line.trim()).filter((line) => line.length > 0);
  const bulletLines = [];
  let currentBullet = null;

  for (const line of contentLines) {
    if (line.startsWith("- ")) {
      if (currentBullet !== null) {
        bulletLines.push(normalizeNarrativeText(currentBullet));
      }

      currentBullet = line.slice(2);
      continue;
    }

    if (currentBullet === null) {
      return false;
    }

    currentBullet = `${currentBullet} ${line}`;
  }

  if (currentBullet !== null) {
    bulletLines.push(normalizeNarrativeText(currentBullet));
  }

  if (bulletLines.length !== requiredAxiomSafetyNarrativeFragments.length) {
    return false;
  }

  return (
    requiredAxiomSafetyNarrativeFragments.every(
      (fragment, index) => bulletLines[index] === fragment
    )
  );
}
