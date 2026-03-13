import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = process.cwd();
const workerSrcDir = join(repoRoot, "apps", "worker", "src");

/**
 * Guardrails:
 * - Worker code must not open inbound HTTP listeners.
 * - Worker code must not import server frameworks for ingress.
 *
 * This is intentionally simple static detection for MVP.
 */
const deniedPatterns = [
  {
    hint: "http.createServer(...)",
    regex: /\bcreateServer\s*\(/g
  },
  {
    hint: "server.listen(...)",
    regex: /\blisten\s*\(/g
  },
  {
    hint: "import fastify",
    regex: /\bfrom\s+["']fastify["']/g
  },
  {
    hint: "import express",
    regex: /\bfrom\s+["']express["']/g
  },
  {
    hint: "import koa",
    regex: /\bfrom\s+["']koa["']/g
  },
  {
    hint: "import hono",
    regex: /\bfrom\s+["']hono["']/g
  },
  {
    hint: "Deno.serve(...)",
    regex: /\bDeno\.serve\s*\(/g
  },
  {
    hint: "Bun.serve(...)",
    regex: /\bBun\.serve\s*\(/g
  }
];

const codeFileRegex = /\.(ts|tsx|js|mjs|cjs)$/i;

function walkFiles(dir) {
  const result = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      result.push(...walkFiles(fullPath));
      continue;
    }
    if (stats.isFile() && codeFileRegex.test(entry)) {
      result.push(fullPath);
    }
  }
  return result;
}

const files = walkFiles(workerSrcDir);
const violations = [];

for (const filePath of files) {
  const source = readFileSync(filePath, "utf8");
  for (const { hint, regex } of deniedPatterns) {
    if (regex.test(source)) {
      violations.push({
        file: relative(repoRoot, filePath).replaceAll("\\", "/"),
        hint
      });
    }
  }
}

if (violations.length > 0) {
  console.error("Worker ingress policy violation(s) detected:");
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.hint}`);
  }
  console.error(
    "Workers must not expose inbound HTTP ingress. Use outbound callbacks to API only."
  );
  process.exit(1);
}

console.log(
  `Worker ingress policy check passed (${files.length} source file(s) scanned).`
);
