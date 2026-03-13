#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const TARGET_CONFIG = {
  "problem9-execution": {
    defaultTag: "local/paretoproof-problem9-execution:local",
  },
  "problem9-devbox": {
    defaultTag: "local/paretoproof-problem9-devbox:local",
  },
  "paretoproof-worker": {
    defaultTag: "local/paretoproof-worker:local",
  },
};

const argv = process.argv.slice(2);
const hasFlag = (flag) => argv.includes(flag);
const readOption = (flag) => {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return argv[index + 1];
};

const target = readOption("--target");
if (!target || !(target in TARGET_CONFIG)) {
  console.error(
    `Missing or invalid --target. Expected one of: ${Object.keys(TARGET_CONFIG).join(", ")}.`,
  );
  process.exit(1);
}

const tag = readOption("--tag") ?? TARGET_CONFIG[target].defaultTag;
const dockerfile = readOption("--file") ?? "apps/worker/Dockerfile";
const context = readOption("--context") ?? ".";
const platform = readOption("--platform");
const printOnly = hasFlag("--print-only");
const buildArgs = [
  "buildx",
  "build",
  "--file",
  dockerfile,
  "--target",
  target,
  "--tag",
  tag,
  "--load",
];

if (platform) {
  buildArgs.push("--platform", platform);
}

buildArgs.push(context);

if (printOnly) {
  console.log(`docker ${buildArgs.join(" ")}`);
  console.log(`Target: ${target}`);
  console.log(`Tag: ${tag}`);
  process.exit(0);
}

const tempRoot = mkdtempSync(path.join(os.tmpdir(), "paretoproof-problem9-image-"));
const iidFile = path.join(tempRoot, `${target}.iid`);
buildArgs.splice(buildArgs.indexOf("--load"), 0, "--iidfile", iidFile);

const buildResult = spawnSync("docker", buildArgs, {
  encoding: "utf8",
  stdio: "inherit",
});

if (buildResult.status !== 0) {
  rmSync(tempRoot, { force: true, recursive: true });
  process.exit(buildResult.status ?? 1);
}

const imageId = readFileSync(iidFile, "utf8").trim();
rmSync(tempRoot, { force: true, recursive: true });

console.log(`Built target: ${target}`);
console.log(`Image tag: ${tag}`);
console.log(`Image id: ${imageId}`);
