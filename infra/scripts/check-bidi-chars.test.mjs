import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { formatOffender, scanTrackedFiles } from "./check-bidi-chars.mjs";

const fixturesRoot = resolve(fileURLToPath(new URL("./fixtures/check-bidi-chars", import.meta.url)));
const allowedFixtures = JSON.parse(readFileSync(resolve(fixturesRoot, "allowed.json"), "utf8"));
const disallowedFixtures = JSON.parse(readFileSync(resolve(fixturesRoot, "disallowed.json"), "utf8"));
const scriptPath = fileURLToPath(new URL("./check-bidi-chars.mjs", import.meta.url));

function materializeFixtureContent(fixture) {
  if ("text" in fixture) {
    return fixture.text;
  }

  return fixture.codePoints
    .map((codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 16)))
    .join("");
}

function createTempRepo(fixtures) {
  const repoRoot = mkdtempSync(resolve(tmpdir(), "paretoproof-bidi-"));

  try {
    execFileSync("git", ["init", "--initial-branch=main"], { cwd: repoRoot, stdio: "ignore" });

    for (const fixture of fixtures) {
      const absolutePath = resolve(repoRoot, fixture.path);
      mkdirSync(dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, materializeFixtureContent(fixture), "utf8");
    }

    execFileSync("git", ["add", "."], { cwd: repoRoot, stdio: "ignore" });
    return repoRoot;
  } catch (error) {
    rmSync(repoRoot, { force: true, recursive: true });
    throw error;
  }
}

function disposeTempRepo(repoRoot) {
  rmSync(repoRoot, { force: true, recursive: true });
}

test("scanTrackedFiles ignores visible text, tabs, and CRLF fixtures", () => {
  const repoRoot = createTempRepo(allowedFixtures);

  try {
    assert.deepEqual(scanTrackedFiles(repoRoot), []);
  } finally {
    disposeTempRepo(repoRoot);
  }
});

test("scanTrackedFiles reports hidden format and control characters from fixtures", () => {
  const repoRoot = createTempRepo(disallowedFixtures);

  try {
    const offenders = scanTrackedFiles(repoRoot).map((offender) => ({
      path: offender.path,
      lineNumber: offender.lineNumber,
      formatted: formatOffender(offender)
    })).sort((left, right) => left.path.localeCompare(right.path));

    assert.deepEqual(
      offenders,
      disallowedFixtures.map((fixture) => ({
        path: fixture.path,
        lineNumber: 1,
        formatted: `${fixture.path}:1 (${fixture.expectedCodePoints.join(", ")})`
      })).sort((left, right) => left.path.localeCompare(right.path))
    );
  } finally {
    disposeTempRepo(repoRoot);
  }
});

test("CLI exits nonzero for a tracked file with GitHub warning-class hidden Unicode", () => {
  const repoRoot = createTempRepo([disallowedFixtures[0]]);

  try {
    const result = spawnSync(process.execPath, [scriptPath, "--repo-root", repoRoot], {
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Disallowed hidden or bidirectional Unicode control characters found:/u);
    assert.match(result.stderr, /apps\/web\/src\/forbidden-zws\.ts:1 \(U\+200B\)/u);
  } finally {
    disposeTempRepo(repoRoot);
  }
});
