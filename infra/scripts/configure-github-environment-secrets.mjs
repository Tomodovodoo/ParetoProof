#!/usr/bin/env node

import process from "node:process";
import { spawnSync } from "node:child_process";

const REQUIRED_SECRETS = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "RAILWAY_API_TOKEN",
  "MODAL_TOKEN_ID",
  "MODAL_TOKEN_SECRET",
];

const argv = process.argv.slice(2);
const hasFlag = (flag) => argv.includes(flag);
const readOption = (flag) => {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
};

const repo = readOption("--repo") ?? process.env.GITHUB_REPOSITORY;
const environmentsOption = readOption("--environments");
const environments = (environmentsOption ?? "staging,production")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const apply = hasFlag("--apply");

if (!repo) {
  console.error("Missing --repo (or GITHUB_REPOSITORY).");
  process.exit(1);
}

if (environments.length === 0) {
  console.error("No environments were provided.");
  process.exit(1);
}

const runGh = (args, input) => {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    stdio: input === undefined ? ["inherit", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
    input,
  });

  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || "(no output)";
    throw new Error(`gh ${args.join(" ")} failed: ${detail}`);
  }

  return result.stdout;
};

const readSecretValue = (environment, name) => {
  const scopedName = `${environment.toUpperCase()}_${name}`;
  return process.env[scopedName] ?? process.env[name];
};

const missing = [];
for (const environment of environments) {
  for (const secret of REQUIRED_SECRETS) {
    if (!readSecretValue(environment, secret)) {
      missing.push(`${environment}:${secret}`);
    }
  }
}

if (missing.length > 0) {
  console.error("Missing required secret values in local environment:");
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  console.error(
    "Provide values as either <ENVIRONMENT>_<SECRET_NAME> (for example PRODUCTION_CLOUDFLARE_API_TOKEN) or the base secret name."
  );
  process.exit(1);
}

for (const environment of environments) {
  if (apply) {
    runGh(["api", "--method", "PUT", `repos/${repo}/environments/${environment}`]);
    console.log(`Ensured environment exists: ${environment}`);
  } else {
    console.log(`Would ensure environment exists: ${environment}`);
  }

  for (const secret of REQUIRED_SECRETS) {
    const value = readSecretValue(environment, secret);
    if (apply) {
      runGh(
        ["secret", "set", secret, "--repo", repo, "--env", environment, "--body", value],
      );
      console.log(`Set ${environment}:${secret}`);
    } else {
      console.log(`Would set ${environment}:${secret}`);
    }
  }
}

if (!apply) {
  console.log("Dry run complete. Re-run with --apply to create environments and set secrets.");
}
