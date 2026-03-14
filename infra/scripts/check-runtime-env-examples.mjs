import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

const checks = [
  {
    file: "apps/api/.env.example",
    markers: [
      "# The authoritative mode split lives in docs/runtime.md.",
      "# App runtime config for local API startup. Required for routine local API development.",
      "# Owner-ops config. Only set these when you are intentionally running owner workflows.",
      "# App runtime config for local Cloudflare Access parity and internal worker auth.",
      "# Optional local runtime overrides. Expand only for deliberate local testing.",
      "# Reserved later-scope runtime placeholders. Keep commented unless a later slice explicitly uses them."
    ],
    variables: [
      { name: "HOST", commented: false },
      { name: "PORT", commented: false },
      { name: "NODE_ENV", commented: false },
      { name: "DATABASE_URL", commented: false },
      { name: "MIGRATION_DATABASE_URL", commented: false },
      { name: "OWNER_EMAIL", commented: false },
      { name: "CF_ACCESS_TEAM_DOMAIN", commented: false },
      { name: "CF_ACCESS_PORTAL_AUD", commented: false },
      { name: "CF_ACCESS_INTERNAL_AUD", commented: false },
      { name: "ACCESS_PROVIDER_STATE_SECRET", commented: false },
      { name: "WORKER_BOOTSTRAP_TOKEN", commented: false },
      { name: "CLOUDFLARE_API_TOKEN", commented: false },
      { name: "CLOUDFLARE_EMAIL", commented: false },
      { name: "CLOUDFLARE_GLOBAL_API_KEY", commented: false },
      { name: "CLOUDFLARE_ACCOUNT_ID", commented: false },
      { name: "CORS_ALLOWED_ORIGINS", commented: false },
      { name: "CORS_ALLOW_LOCALHOST", commented: false },
      { name: "CF_INTERNAL_API_SERVICE_TOKEN_ID", commented: true },
      { name: "CF_INTERNAL_API_SERVICE_TOKEN_SECRET", commented: true },
      { name: "R2_ACCESS_KEY_ID", commented: true },
      { name: "R2_SECRET_ACCESS_KEY", commented: true }
    ]
  },
  {
    file: "apps/web/.env.example",
    markers: [
      "# The authoritative mode split lives in docs/runtime.md.",
      "# Public build-time config. Optional in local development because the app can usually derive the API origin.",
      "# Hosted web runtime note:"
    ],
    variables: [{ name: "VITE_API_BASE_URL", commented: false }],
    forbiddenVariables: ["ACCESS_PROVIDER_STATE_SECRET"]
  },
  {
    file: "apps/worker/.env.example",
    markers: [
      "# The authoritative mode split lives in docs/runtime.md.",
      "# Current local development mode:",
      "# Hosted-parity worker runtime config. Leave commented unless you are running claim-loop style flows.",
      "# Mode-specific hosted provider auth. Trusted-local Codex auth does not belong in this file.",
      "# Reserved later-scope worker runtime variables. Only set these when the specific workflow requires them."
    ],
    variables: [
      { name: "API_BASE_URL", commented: false },
      { name: "WORKER_BOOTSTRAP_TOKEN", commented: true },
      { name: "CODEX_API_KEY", commented: true },
      { name: "CF_INTERNAL_API_SERVICE_TOKEN_ID", commented: true },
      { name: "CF_INTERNAL_API_SERVICE_TOKEN_SECRET", commented: true },
      { name: "R2_ACCESS_KEY_ID", commented: true },
      { name: "R2_SECRET_ACCESS_KEY", commented: true }
    ]
  }
];

const readmeChecks = [
  {
    file: "apps/api/README.md",
    requiredSnippets: [
      "docs/runtime.md",
      "docs/runtime-env-mode-checklists.md",
      "`.env.example`"
    ]
  },
  {
    file: "apps/web/README.md",
    requiredSnippets: [
      "docs/runtime.md",
      "docs/runtime-env-mode-checklists.md",
      "`.env.example`"
    ]
  },
  {
    file: "apps/worker/README.md",
    requiredSnippets: [
      "docs/runtime.md",
      "docs/runtime-env-mode-checklists.md",
      "`.env.example`"
    ]
  }
];

const docsChecks = [
  {
    file: "docs/README.md",
    requiredSnippets: [
      "runtime.md",
      "runtime-env-mode-checklists.md"
    ]
  },
  {
    file: "docs/runtime.md",
    requiredSnippets: ["runtime-env-mode-checklists.md"]
  },
  {
    file: "docs/runtime-env-mode-checklists.md",
    requiredSnippets: [
      "# Runtime Env Mode Checklists",
      "### Local browser build or dev server",
      "### Pages auth-entry runtime",
      "### Local API startup",
      "### Railway API runtime",
      "### API migration mode",
      "### API owner bootstrap mode",
      "### Artifact materializers",
      "### Local Problem 9 attempt with `local_stub`",
      "### Local Problem 9 attempt with `machine_api_key`",
      "### Local Problem 9 attempt with `trusted_local_user`",
      "### Trusted-local devbox wrapper",
      "### Offline ingest CLI",
      "### Hosted claim loop with `machine_api_key`"
    ]
  }
];

function readRepoFile(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function parseEnvEntries(contents) {
  const entries = [];

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    let match = line.match(/^([A-Z0-9_]+)=/);
    if (match) {
      entries.push({ name: match[1], commented: false });
      continue;
    }

    match = line.match(/^#\s*([A-Z0-9_]+)=/);
    if (match) {
      entries.push({ name: match[1], commented: true });
    }
  }

  return entries;
}

function formatEntry(entry) {
  return `${entry.commented ? "#" : ""}${entry.name}`;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

for (const check of checks) {
  const contents = readRepoFile(check.file);
  const entries = parseEnvEntries(contents);
  const actual = entries.map(formatEntry);
  const expected = check.variables.map(formatEntry);

  for (const marker of check.markers) {
    assert(contents.includes(marker), `${check.file} is missing required guidance line: ${marker}`);
  }

  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${check.file} variables drifted.\nExpected: ${expected.join(", ")}\nActual: ${actual.join(", ")}`
  );

  for (const forbiddenVariable of check.forbiddenVariables ?? []) {
    assert(
      !entries.some((entry) => entry.name === forbiddenVariable),
      `${check.file} must not declare ${forbiddenVariable}.`
    );
  }
}

for (const check of readmeChecks) {
  const contents = readRepoFile(check.file);

  for (const requiredSnippet of check.requiredSnippets) {
    assert(
      contents.includes(requiredSnippet),
      `${check.file} must reference ${requiredSnippet}.`
    );
  }
}

for (const check of docsChecks) {
  const contents = readRepoFile(check.file);

  for (const requiredSnippet of check.requiredSnippets) {
    assert(
      contents.includes(requiredSnippet),
      `${check.file} must reference ${requiredSnippet}.`
    );
  }
}

console.log("Runtime env examples and README pointers match the approved contract shape.");
