import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  hostedWorkerPoolRegistryCatalogSchema,
  type HostedWorkerPoolRegistryCatalog,
  type HostedWorkerPoolRegistryEntry
} from "@paretoproof/shared";

export type HostedWorkerPoolRegistryService = {
  getCatalog(): Promise<HostedWorkerPoolRegistryCatalog>;
  getWorkerPool(workerPool: string): Promise<HostedWorkerPoolRegistryEntry | null>;
};

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const fallbackRepoRoot = path.resolve(sourceDirectory, "..", "..", "..", "..");

function resolveHostedWorkerPoolRegistrySeedPath() {
  const candidateRoots = [process.cwd(), fallbackRepoRoot];

  for (const candidateRoot of candidateRoots) {
    const candidatePath = path.join(
      candidateRoot,
      "infra",
      "modal",
      "worker-pools.seed.json"
    );

    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error("Unable to resolve infra/modal/worker-pools.seed.json from the current runtime.");
}

function loadHostedWorkerPoolRegistryCatalog(seedPath: string): HostedWorkerPoolRegistryCatalog {
  const parsed = hostedWorkerPoolRegistryCatalogSchema.safeParse(
    JSON.parse(readFileSync(seedPath, "utf8"))
  );

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");

    throw new Error(`Hosted worker pool registry seed is invalid: ${issues}`);
  }

  return parsed.data;
}

export function createHostedWorkerPoolRegistryService(): HostedWorkerPoolRegistryService {
  let cachedCatalog: HostedWorkerPoolRegistryCatalog | null = null;
  let cachedSeedPath: string | null = null;
  let workerPoolIndex: Map<string, HostedWorkerPoolRegistryEntry> | null = null;

  async function getCatalog() {
    if (!cachedCatalog) {
      cachedSeedPath ??= resolveHostedWorkerPoolRegistrySeedPath();
      cachedCatalog = loadHostedWorkerPoolRegistryCatalog(cachedSeedPath);
    }

    if (!workerPoolIndex) {
      workerPoolIndex = new Map(
        cachedCatalog.items.map((entry) => [entry.workerPool, entry] as const)
      );
    }

    return cachedCatalog;
  }

  return {
    async getCatalog() {
      return getCatalog();
    },

    async getWorkerPool(workerPool: string) {
      await getCatalog();
      return workerPoolIndex?.get(workerPool) ?? null;
    }
  };
}
