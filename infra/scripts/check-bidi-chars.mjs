import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const bidiPattern = /[\u202A-\u202E\u2066-\u2069]/u;

function readTrackedFiles() {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "buffer"
  });

  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function findBidiLocations(relativePath) {
  const absolutePath = resolve(repoRoot, relativePath);
  const fileBuffer = readFileSync(absolutePath);

  if (fileBuffer.includes(0)) {
    return [];
  }

  const fileText = fileBuffer.toString("utf8");
  const lines = fileText.split(/\r?\n/u);
  const matches = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];

    if (!bidiPattern.test(line)) {
      continue;
    }

    matches.push(`${relativePath}:${lineIndex + 1}`);
  }

  return matches;
}

const offenders = [];

for (const relativePath of readTrackedFiles()) {
  offenders.push(...findBidiLocations(relativePath));
}

if (offenders.length > 0) {
  console.error("Disallowed bidirectional Unicode control characters found:");

  for (const offender of offenders) {
    console.error(`- ${offender}`);
  }

  process.exit(1);
}

console.log("No bidirectional Unicode control characters found in tracked files.");
