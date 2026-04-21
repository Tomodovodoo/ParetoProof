import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const repoRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));

export function createTempRepo(relativePaths) {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "paretoproof-governance-"));

  for (const relativePath of relativePaths) {
    const sourcePath = resolve(repoRoot, relativePath);
    const destinationPath = resolve(tempRoot, relativePath);
    mkdirSync(dirname(destinationPath), { recursive: true });
    copyFileSync(sourcePath, destinationPath);
  }

  return tempRoot;
}

export function disposeTempRepo(tempRoot) {
  rmSync(tempRoot, { force: true, recursive: true });
}

export function replaceInRepoFile(tempRoot, relativePath, searchValue, replacementValue) {
  const filePath = resolve(tempRoot, relativePath);
  const contents = readFileSync(filePath, "utf8");
  const newline = contents.includes("\r\n") ? "\r\n" : "\n";
  const normalizedSearchValue = searchValue.replace(/\r?\n/g, newline);
  const normalizedReplacementValue = replacementValue.replace(/\r?\n/g, newline);

  if (!contents.includes(normalizedSearchValue)) {
    throw new Error(`${relativePath} does not contain expected text: ${searchValue}`);
  }

  writeFileSync(filePath, contents.replace(normalizedSearchValue, normalizedReplacementValue), "utf8");
}

export function runCli(relativeScriptPath, args = []) {
  return spawnSync("node", [resolve(repoRoot, relativeScriptPath), ...args], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}
