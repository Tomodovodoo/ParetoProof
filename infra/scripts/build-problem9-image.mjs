#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const TARGET_IMAGE_TAGS = new Map([
  ["problem9-execution", "paretoproof-problem9-execution:local"],
  ["problem9-devbox", "paretoproof-problem9-devbox:local"],
  ["paretoproof-worker", "paretoproof-worker:local"],
]);

const usage = `Usage: node infra/scripts/build-problem9-image.mjs --target <problem9-execution|problem9-devbox|paretoproof-worker> [options]

Options:
  --tag <image:tag>     Override the default canonical local tag for the selected target.
  --dry-run             Print the docker command without executing it.
  --push                Push instead of load.
  --help                Show this help output.
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const args = process.argv.slice(2);
let target = null;
let tag = null;
let dryRun = false;
let push = false;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];

  if (arg === "--target") {
    target = args[index + 1] ?? null;
    index += 1;
    continue;
  }

  if (arg === "--tag") {
    tag = args[index + 1] ?? null;
    index += 1;
    continue;
  }

  if (arg === "--dry-run") {
    dryRun = true;
    continue;
  }

  if (arg === "--push") {
    push = true;
    continue;
  }

  if (arg === "--help") {
    console.log(usage);
    process.exit(0);
  }

  fail(`Unknown argument: ${arg}\n\n${usage}`);
}

if (!target) {
  fail(`Missing required --target argument.\n\n${usage}`);
}

if (!TARGET_IMAGE_TAGS.has(target)) {
  fail(`Unsupported target "${target}". Expected one of: ${Array.from(TARGET_IMAGE_TAGS.keys()).join(", ")}.`);
}

const resolvedTag = tag ?? TARGET_IMAGE_TAGS.get(target);
const loadOrPushFlag = push ? "--push" : "--load";
const command = [
  "docker",
  "buildx",
  "build",
  "--file",
  "apps/worker/Dockerfile",
  "--target",
  target,
  "--tag",
  resolvedTag,
  loadOrPushFlag,
  ".",
];

if (dryRun) {
  console.log(command.join(" "));
  process.exit(0);
}

console.log(`Building ${target} as ${resolvedTag}`);
const result = spawnSync(command[0], command.slice(1), {
  stdio: "inherit",
});

if (result.error) {
  fail(`Failed to start docker buildx: ${result.error.message}`);
}

process.exit(result.status ?? 1);
