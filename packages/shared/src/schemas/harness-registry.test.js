import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { harnessRegistryCatalogSchema } from "./harness-registry.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const harnessRegistrySeedPath = path.join(repoRoot, "infra", "docker", "harness-registry.seed.json");

test("harness registry seed parses as a valid catalog", () => {
  const seed = JSON.parse(readFileSync(harnessRegistrySeedPath, "utf8"));
  const parsed = harnessRegistryCatalogSchema.safeParse(seed);

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.items.length >= 2, true);
});

test("harness registry entries require at least one image reference", () => {
  const seed = JSON.parse(readFileSync(harnessRegistrySeedPath, "utf8"));
  const hostedEntry = JSON.parse(
    JSON.stringify(seed.items.find((entry) => entry.runtimeClass === "hosted_worker"))
  );

  assert.ok(hostedEntry);
  hostedEntry.imageRefs = [];

  const parsed = harnessRegistryCatalogSchema.safeParse({
    ...seed,
    items: seed.items.map((entry) => (entry.id === hostedEntry.id ? hostedEntry : entry))
  });

  assert.equal(parsed.success, false);
});

test("harness registry rejects duplicate harness ids", () => {
  const seed = JSON.parse(readFileSync(harnessRegistrySeedPath, "utf8"));
  const [firstEntry, secondEntry] = seed.items;
  const duplicatedSecondEntry = {
    ...secondEntry,
    id: firstEntry.id
  };

  const parsed = harnessRegistryCatalogSchema.safeParse({
    ...seed,
    items: [firstEntry, duplicatedSecondEntry]
  });

  assert.equal(parsed.success, false);
});

test("harness registry rejects duplicate image roles within one entry", () => {
  const seed = JSON.parse(readFileSync(harnessRegistrySeedPath, "utf8"));
  const hostedEntry = JSON.parse(
    JSON.stringify(seed.items.find((entry) => entry.runtimeClass === "hosted_worker"))
  );

  assert.ok(hostedEntry);
  hostedEntry.imageRefs = [
    hostedEntry.imageRefs[0],
    {
      ...hostedEntry.imageRefs[0],
      target: "problem9-execution"
    }
  ];

  const parsed = harnessRegistryCatalogSchema.safeParse({
    ...seed,
    items: seed.items.map((entry) => (entry.id === hostedEntry.id ? hostedEntry : entry))
  });

  assert.equal(parsed.success, false);
});
