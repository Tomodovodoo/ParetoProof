import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { hostedWorkerPoolRegistryCatalogSchema } from "./hosted-worker-pool-registry.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const hostedWorkerPoolRegistrySeedPath = path.join(
  repoRoot,
  "infra",
  "modal",
  "worker-pools.seed.json"
);

test("hosted worker pool registry seed parses as a valid catalog", () => {
  const seed = JSON.parse(readFileSync(hostedWorkerPoolRegistrySeedPath, "utf8"));
  const parsed = hostedWorkerPoolRegistryCatalogSchema.safeParse(seed);

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.items.length >= 3, true);
});

test("hosted worker pool registry rejects duplicate worker pool ids", () => {
  const seed = JSON.parse(readFileSync(hostedWorkerPoolRegistrySeedPath, "utf8"));
  const [firstEntry, secondEntry] = seed.items;
  const duplicatedSecondEntry = {
    ...secondEntry,
    workerPool: firstEntry.workerPool
  };

  const parsed = hostedWorkerPoolRegistryCatalogSchema.safeParse({
    ...seed,
    items: [firstEntry, duplicatedSecondEntry]
  });

  assert.equal(parsed.success, false);
});

test("hosted worker pool registry rejects duplicate deployment-target environments", () => {
  const seed = JSON.parse(readFileSync(hostedWorkerPoolRegistrySeedPath, "utf8"));
  const duplicatedEntry = {
    ...seed.items[0],
    deploymentTargets: [
      seed.items[0].deploymentTargets[0],
      {
        ...seed.items[0].deploymentTargets[0],
        modalAppName: `${seed.items[0].deploymentTargets[0].modalAppName}-duplicate`
      }
    ]
  };

  const parsed = hostedWorkerPoolRegistryCatalogSchema.safeParse({
    ...seed,
    items: [duplicatedEntry, ...seed.items.slice(1)]
  });

  assert.equal(parsed.success, false);
});
