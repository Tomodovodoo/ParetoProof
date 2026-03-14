import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

const requiredGitignoreSnippets = [".codex/"];
const requiredDockerignoreSnippets = [".codex", ".codex/**"];
const requiredRuntimeDocSnippets = [
  "Do not copy `.codex/auth.json` or other trusted-local auth artifacts into the repository, Docker build contexts, or checked-in worker fixtures.",
  "Local trusted auth stays host-local and enters the devbox only as a read-only `auth.json` mount, never as a copied repo file or baked image layer."
];
const requiredWorkerReadmeSnippets = [
  "mounts only that file read-only at `/run/paretoproof/codex-home/auth.json`",
  "do not copy `.codex/auth.json` into this repository, worker fixtures, or Docker build contexts; trusted-local auth stays host-local and enters the devbox only through the read-only file mount above"
];
const requiredChecklistSnippets = [
  "do not move trusted-local auth into `apps/worker/.env`",
  "this wrapper mounts the auth file into the container read-only"
];
const forbiddenDockerfileSnippets = [
  "COPY . .",
  "COPY . ./",
  "ADD . .",
  "ADD . ./",
  ".codex",
  "auth.json"
];

function readRepoFile(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertContainsAll(contents, snippets, file) {
  for (const snippet of snippets) {
    assert(contents.includes(snippet), `${file} is missing required snippet: ${snippet}`);
  }
}

const gitignore = readRepoFile(".gitignore");
assertContainsAll(gitignore, requiredGitignoreSnippets, ".gitignore");

const dockerignore = readRepoFile(".dockerignore");
assertContainsAll(dockerignore, requiredDockerignoreSnippets, ".dockerignore");

const dockerfile = readRepoFile("apps/worker/Dockerfile");
for (const snippet of forbiddenDockerfileSnippets) {
  assert(
    !dockerfile.includes(snippet),
    `apps/worker/Dockerfile must not include trusted-local packaging drift: ${snippet}`
  );
}

assertContainsAll(readRepoFile("docs/runtime.md"), requiredRuntimeDocSnippets, "docs/runtime.md");
assertContainsAll(
  readRepoFile("apps/worker/README.md"),
  requiredWorkerReadmeSnippets,
  "apps/worker/README.md"
);
assertContainsAll(
  readRepoFile("docs/runtime-env-mode-checklists.md"),
  requiredChecklistSnippets,
  "docs/runtime-env-mode-checklists.md"
);

console.log("Trusted-local auth boundaries are enforced across ignore rules, Docker packaging, and docs.");
