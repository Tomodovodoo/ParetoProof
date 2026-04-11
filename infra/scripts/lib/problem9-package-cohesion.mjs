import { createHash } from "node:crypto";

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

const expectedProblem9SourceMetadata = {
  laneEvidence: {
    lean422_exact: "lean-toolchain"
  },
  license: {
    file: "LICENSE",
    spdxId: "Apache-2.0"
  },
  provenance: {
    goldModule: "FirstProof/Problem9/Gold.lean",
    humanStatement: "statements/problem.md",
    statementModule: "FirstProof/Problem9/Statement.lean",
    supportModule: "FirstProof/Problem9/Support.lean"
  },
  regressionEvidence: {
    cohesionCheck: "bun run check:problem9-package-cohesion",
    integrityTest: "node --import tsx --test test/problem9-integrity.test.ts"
  }
};

const expectedApacheTwoLicenseDigest =
  "948703bcf1cb4a2dafd21676dd01e40a58fe21bd9b425c000b9070eccb441092";

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

function hasExpectedSectionBullets(text, heading, expectedBullets) {
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

  if (bulletLines.length !== expectedBullets.length) {
    return false;
  }

  return expectedBullets.every((fragment, index) => bulletLines[index] === fragment);
}

export function hasExpectedAxiomSafetyNarrative(text, heading) {
  return hasExpectedSectionBullets(text, heading, requiredAxiomSafetyNarrativeFragments);
}

export function hasExpectedProblem9SourceMetadata(actual) {
  return (
    JSON.stringify(sortJsonValue(actual)) === JSON.stringify(sortJsonValue(expectedProblem9SourceMetadata))
  );
}

export function hasExpectedSupportedLanes(actual) {
  return Array.isArray(actual) && actual.length === 1 && actual[0] === "lean422_exact";
}

export function hasExpectedLanePolicy(actual) {
  return (
    actual &&
    typeof actual === "object" &&
    actual.primaryLane === "lean422_exact" &&
    hasExpectedSupportedLanes(actual.supportedLanes)
  );
}

export function hasApacheTwoLicenseText(text) {
  return sha256Text(normalizeLicenseText(text)) === expectedApacheTwoLicenseDigest;
}

function sortJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortJsonValue(nestedValue)])
    );
  }

  return value;
}

function normalizeLicenseText(text) {
  return text
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function sha256Text(text) {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}
