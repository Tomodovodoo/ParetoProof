import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  harnessRegistryCatalogSchema,
  type HarnessRegistryCatalog
} from "@paretoproof/shared";

export type HarnessRegistryService = {
  getCatalog(): Promise<HarnessRegistryCatalog>;
};

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const fallbackRepoRoot = path.resolve(sourceDirectory, "..", "..", "..", "..");

function resolveHarnessRegistrySeedPath() {
  const candidateRoots = [process.cwd(), fallbackRepoRoot];

  for (const candidateRoot of candidateRoots) {
    const candidatePath = path.join(
      candidateRoot,
      "infra",
      "docker",
      "harness-registry.seed.json"
    );

    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error("Unable to resolve infra/docker/harness-registry.seed.json from the current runtime.");
}

function loadHarnessRegistryCatalog(seedPath: string): HarnessRegistryCatalog {
  const parsed = harnessRegistryCatalogSchema.safeParse(
    JSON.parse(readFileSync(seedPath, "utf8"))
  );

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");

    throw new Error(`Harness registry seed is invalid: ${issues}`);
  }

  return parsed.data;
}

export function createHarnessRegistryService(): HarnessRegistryService {
  const seedPath = resolveHarnessRegistrySeedPath();
  let cachedCatalog: HarnessRegistryCatalog | null = null;

  return {
    async getCatalog() {
      if (!cachedCatalog) {
        cachedCatalog = loadHarnessRegistryCatalog(seedPath);
      }

      return cachedCatalog;
    }
  };
}
