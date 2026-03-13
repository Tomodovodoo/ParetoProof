import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const formatCharacterPattern = /\p{Cf}/u;
const controlCharacterPattern = /\p{Cc}/u;
const allowedControlCodePoints = new Set([0x0009, 0x000A, 0x000D]);

function resolveCliRepoRoot(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--repo-root") {
      const repoRootArg = argv[index + 1];

      if (!repoRootArg) {
        throw new Error("Missing value for --repo-root.");
      }

      return resolve(repoRootArg);
    }
  }

  return defaultRepoRoot;
}

export function readTrackedFiles(repoRoot = defaultRepoRoot) {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "buffer"
  });

  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

export function isForbiddenHiddenCodePoint(codePoint) {
  const character = String.fromCodePoint(codePoint);

  if (formatCharacterPattern.test(character)) {
    return true;
  }

  return controlCharacterPattern.test(character) && !allowedControlCodePoints.has(codePoint);
}

function formatCodePoint(codePoint) {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

export function findForbiddenCodePoints(text) {
  const matches = [];

  for (const character of text) {
    const codePoint = character.codePointAt(0);

    if (codePoint !== undefined && isForbiddenHiddenCodePoint(codePoint)) {
      matches.push(codePoint);
    }
  }

  return [...new Set(matches)];
}

export function findHiddenUnicodeLocations(relativePath, repoRoot = defaultRepoRoot) {
  const absolutePath = resolve(repoRoot, relativePath);
  const fileBuffer = readFileSync(absolutePath);

  if (fileBuffer.includes(0)) {
    return [];
  }

  const fileText = fileBuffer.toString("utf8");
  const lines = fileText.split(/\r?\n/u);
  const matches = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const codePoints = findForbiddenCodePoints(lines[lineIndex]);

    if (codePoints.length === 0) {
      continue;
    }

    matches.push({
      path: relativePath,
      lineNumber: lineIndex + 1,
      codePoints
    });
  }

  return matches;
}

export function scanTrackedFiles(repoRoot = defaultRepoRoot) {
  const offenders = [];

  for (const relativePath of readTrackedFiles(repoRoot)) {
    offenders.push(...findHiddenUnicodeLocations(relativePath, repoRoot));
  }

  return offenders;
}

export function formatOffender(offender) {
  return `${offender.path}:${offender.lineNumber} (${offender.codePoints.map(formatCodePoint).join(", ")})`;
}

export function runCli(argv = process.argv.slice(2), io = { log: console.log, error: console.error }) {
  const repoRoot = resolveCliRepoRoot(argv);
  const offenders = scanTrackedFiles(repoRoot);

  if (offenders.length > 0) {
    io.error("Disallowed hidden or bidirectional Unicode control characters found:");

    for (const offender of offenders) {
      io.error(`- ${formatOffender(offender)}`);
    }

    return 1;
  }

  io.log("No disallowed hidden or bidirectional Unicode control characters found in tracked files.");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(runCli());
}
