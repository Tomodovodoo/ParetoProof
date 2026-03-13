#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const REQUIRED_SECRETS = ["WORKER_BOOTSTRAP_TOKEN"];
const DEFAULT_DOTENV_PATH = "apps/worker/.env";
const DEFAULT_WORKER_ENVIRONMENT = "dev";
const ALLOWED_WORKER_ENVIRONMENTS = new Set(["dev", "staging", "production"]);
const PLACEHOLDER_VALUES = new Set(["replace-with-local-worker-bootstrap-token"]);

const argv = process.argv.slice(2);
const hasFlag = (flag) => argv.includes(flag);
const readOption = (flag) => {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return argv[index + 1];
};

const apply = hasFlag("--apply");
const dotenvPath = readOption("--dotenv") ?? DEFAULT_DOTENV_PATH;
const environment = readOption("--env") ?? process.env.MODAL_ENVIRONMENT ?? "main";
const workerEnvironment = readOption("--worker-environment") ?? DEFAULT_WORKER_ENVIRONMENT;
const secretName = readOption("--secret-name") ?? `paretoproof-worker-${workerEnvironment}`;

if (!ALLOWED_WORKER_ENVIRONMENTS.has(workerEnvironment)) {
  console.error(
    `Invalid --worker-environment value: ${workerEnvironment}. Expected one of: ${Array.from(ALLOWED_WORKER_ENVIRONMENTS).join(", ")}.`
  );
  process.exit(1);
}

const parseDotenv = (source) => {
  const parsed = {};

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
};

const fileValues = existsSync(dotenvPath) ? parseDotenv(readFileSync(dotenvPath, "utf8")) : {};
const resolvedValues = {
  ...fileValues,
  ...Object.fromEntries(REQUIRED_SECRETS.map((name) => [name, process.env[name]]).filter(([, value]) => Boolean(value))),
};

const missing = REQUIRED_SECRETS.filter((name) => !resolvedValues[name]);
if (missing.length > 0) {
  console.error("Missing required worker secret values.");
  console.error(`Checked process environment and ${dotenvPath}.`);
  for (const name of missing) {
    console.error(`- ${name}`);
  }
  console.error(
    "Provide the values in a local worker .env file or as process environment variables, then re-run with --apply."
  );
  process.exit(1);
}

const placeholders = REQUIRED_SECRETS.filter((name) => PLACEHOLDER_VALUES.has(resolvedValues[name]));
if (placeholders.length > 0) {
  console.error("Refusing to sync placeholder worker secret values.");
  console.error(`Checked process environment and ${dotenvPath}.`);
  for (const name of placeholders) {
    console.error(`- ${name}`);
  }
  console.error("Replace the example placeholder with a real secret value before re-running with --apply.");
  process.exit(1);
}

const runModal = (args) => {
  const result = spawnSync("modal", args, {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || "(no output)";
    throw new Error(`Modal command failed: ${detail}`);
  }

  return result.stdout;
};

const keyValues = REQUIRED_SECRETS.map((name) => `${name}=${resolvedValues[name]}`);

if (apply) {
  runModal(["secret", "create", secretName, "--env", environment, "--force", ...keyValues]);
  console.log(`Set Modal secret ${secretName} in environment ${environment}.`);
} else {
  console.log(`Would set Modal secret ${secretName} in environment ${environment}.`);
}

console.log(`Secret keys: ${REQUIRED_SECRETS.join(", ")}`);
console.log(`Worker environment: ${workerEnvironment}`);
console.log(`Source dotenv path: ${dotenvPath}`);

if (!apply) {
  console.log("Dry run complete. Re-run with --apply to create or update the Modal secret.");
}
