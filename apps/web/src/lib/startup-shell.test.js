import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildStartupFailureShellMarkup } from "./startup-shell.ts";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const indexHtmlPath = resolve(currentDirectory, "../../index.html");

test("index.html ships a visible startup shell instead of an empty root", () => {
  const html = readFileSync(indexHtmlPath, "utf8");

  assert.match(html, /<main data-startup-shell aria-live="polite">/);
  assert.match(html, /Loading ParetoProof\.\.\./);
  assert.match(html, /Starting the application and checking the current surface\./);
});

test("buildStartupFailureShellMarkup renders an explicit startup failure shell", () => {
  const html = buildStartupFailureShellMarkup(
    new Error("Invalid web runtime environment: VITE_API_BASE_URL")
  );

  assert.match(html, /ParetoProof could not start\./);
  assert.match(
    html,
    /The app could not finish starting\. Refresh and try again\. Invalid web runtime environment: VITE_API_BASE_URL/
  );
  assert.match(html, /data-startup-shell/);
});
