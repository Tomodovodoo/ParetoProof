import fs from "node:fs";
import path from "node:path";
import { hasExpectedCanonicalModules } from "./lib/problem9-package-cohesion.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const benchmarkRoot = path.join(repoRoot, "benchmarks", "firstproof", "problem9");

const benchmarkPackagePath = path.join(benchmarkRoot, "benchmark-package.json");
const lakefilePath = path.join(benchmarkRoot, "lakefile.toml");
const statementPath = path.join(benchmarkRoot, "FirstProof", "Problem9", "Statement.lean");
const goldPath = path.join(benchmarkRoot, "FirstProof", "Problem9", "Gold.lean");

const expectedCanonicalModules = {
  statement: "FirstProof.Problem9.Statement",
  support: "FirstProof.Problem9.Support",
  gold: "FirstProof.Problem9.Gold"
};

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function fail(message) {
  throw new Error(`Problem 9 package cohesion check failed: ${message}`);
}

const benchmarkPackage = JSON.parse(readText(benchmarkPackagePath));
const lakefile = readText(lakefilePath);
const statementSource = readText(statementPath);
const goldSource = readText(goldPath);

if (!hasExpectedCanonicalModules(benchmarkPackage.canonicalModules, expectedCanonicalModules)) {
  fail(
    `canonicalModules must stay aligned with ${JSON.stringify(expectedCanonicalModules)}`
  );
}

const defaultTargetsMatch = lakefile.match(/defaultTargets\s*=\s*\[(?<targets>[^\]]+)\]/);
if (!defaultTargetsMatch?.groups?.targets) {
  fail("lakefile.toml must declare defaultTargets");
}

const defaultTargets = defaultTargetsMatch.groups.targets
  .split(",")
  .map((value) => value.trim().replace(/^"|"$/g, ""));

if (
  defaultTargets.length !== 1 ||
  defaultTargets[0] !== benchmarkPackage.canonicalModules.gold
) {
  fail("lakefile.toml defaultTargets must contain only the canonical gold module");
}

if (
  !/abbrev\s+problem9_target\s*\(n\s*:\s*Nat\)\s*:\s*Prop\s*:=\s*2\s*\*\s*triangular n\s*=\s*n\s*\*\s*Nat\.succ n/.test(
    statementSource
  )
) {
  fail("Statement.lean must define the canonical problem9_target proposition");
}

if (
  !/axiom\s+problem9\s*\(n\s*:\s*Nat\)\s*:\s*2\s*\*\s*triangular n\s*=\s*n\s*\*\s*Nat\.succ n/.test(
    statementSource
  )
) {
  fail("Statement.lean must keep the exported problem9 header on the canonical benchmark proposition");
}

if (!goldSource.includes("import FirstProof.Problem9.Statement")) {
  fail("Gold.lean must import Statement.lean");
}

if (!/theorem\s+problem9_gold\s*\(n\s*:\s*Nat\)\s*:\s*problem9_target n\s*:=\s*by/.test(goldSource)) {
  fail(
    "Gold.lean must prove problem9_target n instead of restating the proposition independently"
  );
}
