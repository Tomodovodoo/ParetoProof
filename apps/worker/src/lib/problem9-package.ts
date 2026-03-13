import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const sourceManifestSchema = z.object({
  benchmarkFamily: z.literal("firstproof"),
  benchmarkItemId: z.literal("Problem9"),
  canonicalModules: z.object({
    gold: z.string().min(1),
    statement: z.string().min(1),
    support: z.string().min(1)
  }),
  lanePolicy: z.object({
    primaryLane: z.string().min(1),
    supportedLanes: z.array(z.string().min(1)).min(1)
  }),
  materialization: z.object({
    generatedManifestPath: z.literal("benchmark-package.json"),
    packageRoot: z.literal("firstproof/Problem9")
  }),
  packageId: z.literal("firstproof/Problem9"),
  packageVersion: z.string().min(1),
  sourceSchemaVersion: z.string().min(1)
});

const requiredRelativePaths = [
  "benchmark-package.json",
  "README.md",
  "LICENSE",
  "lean-toolchain",
  "lake-manifest.json",
  "lakefile.toml",
  "statements/problem.md",
  "FirstProof/Problem9/Statement.lean",
  "FirstProof/Problem9/Support.lean",
  "FirstProof/Problem9/Gold.lean"
] as const;

const generatedManifestRelativePath = "benchmark-package.json";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../"
);

const problem9SourceRoot = path.join(repoRoot, "benchmarks", "firstproof", "problem9");

type SourceManifest = z.infer<typeof sourceManifestSchema>;

export type MaterializeProblem9PackageOptions = {
  outputRoot: string;
};

export type MaterializedProblem9Package = {
  outputRoot: string;
  packageDigest: string;
  packageId: string;
  packageVersion: string;
};

export async function materializeProblem9Package(
  options: MaterializeProblem9PackageOptions
): Promise<MaterializedProblem9Package> {
  const sourceManifest = await loadSourceManifest();
  await assertExpectedSourceTree();

  const outputRoot = path.resolve(options.outputRoot);
  const materializedPackageRoot = path.join(outputRoot, "firstproof", "Problem9");

  await mkdir(materializedPackageRoot, { recursive: true });

  for (const relativePath of requiredRelativePaths) {
    if (relativePath === generatedManifestRelativePath) {
      continue;
    }

    const sourcePath = path.join(problem9SourceRoot, relativePath);
    const destinationPath = path.join(materializedPackageRoot, relativePath);

    await mkdir(path.dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
  }

  const sourceManifestPath = path.join(problem9SourceRoot, generatedManifestRelativePath);
  const sourceManifestDigest = await sha256File(sourceManifestPath);
  const fileHashes = await collectFileHashes(materializedPackageRoot);
  const packageDigest = sha256Text(
    stableStringify({
      benchmarkFamily: sourceManifest.benchmarkFamily,
      benchmarkItemId: sourceManifest.benchmarkItemId,
      canonicalModules: sourceManifest.canonicalModules,
      fileHashes,
      lanePolicy: sourceManifest.lanePolicy,
      packageId: sourceManifest.packageId,
      packageRoot: sourceManifest.materialization.packageRoot,
      packageVersion: sourceManifest.packageVersion,
      sourceManifestDigest,
      sourceSchemaVersion: sourceManifest.sourceSchemaVersion
    })
  );

  const materializedManifest = {
    manifestSchemaVersion: "1",
    packageId: sourceManifest.packageId,
    packageVersion: sourceManifest.packageVersion,
    benchmarkFamily: sourceManifest.benchmarkFamily,
    benchmarkItemId: sourceManifest.benchmarkItemId,
    packageRoot: sourceManifest.materialization.packageRoot,
    canonicalModules: sourceManifest.canonicalModules,
    lanePolicy: sourceManifest.lanePolicy,
    sourceManifestDigest,
    hashAlgorithm: "sha256",
    packageDigestMode: "metadata_plus_file_inventory_v1",
    hashes: fileHashes,
    packageDigest
  };

  await writeJsonFile(
    path.join(materializedPackageRoot, generatedManifestRelativePath),
    materializedManifest
  );

  return {
    outputRoot: materializedPackageRoot,
    packageDigest,
    packageId: sourceManifest.packageId,
    packageVersion: sourceManifest.packageVersion
  };
}

async function loadSourceManifest(): Promise<SourceManifest> {
  const sourceManifestPath = path.join(problem9SourceRoot, generatedManifestRelativePath);
  const rawSourceManifest = await readFile(sourceManifestPath, "utf8");
  return sourceManifestSchema.parse(JSON.parse(rawSourceManifest));
}

async function assertExpectedSourceTree(): Promise<void> {
  const discoveredPaths = await listRelativeFiles(problem9SourceRoot);
  const expectedPaths = [...requiredRelativePaths].sort();

  if (stableStringify(discoveredPaths) !== stableStringify(expectedPaths)) {
    throw new Error(
      [
        "Problem 9 package source tree does not match the required path set.",
        `Expected: ${expectedPaths.join(", ")}`,
        `Found: ${discoveredPaths.join(", ")}`
      ].join(" ")
    );
  }
}

async function listRelativeFiles(root: string): Promise<string[]> {
  const paths: string[] = [];
  await walkDirectory(root, root, paths);
  return paths.sort();
}

async function walkDirectory(
  root: string,
  currentDirectory: string,
  results: string[]
): Promise<void> {
  const entries = await readdir(currentDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentDirectory, entry.name);

    if (entry.isDirectory()) {
      await walkDirectory(root, fullPath, results);
      continue;
    }

    if (!entry.isFile()) {
      throw new Error(`Unsupported non-file package source entry: ${fullPath}`);
    }

    results.push(normalizePath(path.relative(root, fullPath)));
  }
}

async function collectFileHashes(
  materializedPackageRoot: string
): Promise<Record<string, string>> {
  const fileHashes: Array<[string, string]> = [];

  for (const relativePath of requiredRelativePaths) {
    if (relativePath === generatedManifestRelativePath) {
      continue;
    }

    const fullPath = path.join(materializedPackageRoot, relativePath);
    const fileStats = await stat(fullPath);

    if (!fileStats.isFile()) {
      throw new Error(`Materialized Problem 9 path is not a file: ${fullPath}`);
    }

    fileHashes.push([relativePath, await sha256File(fullPath)]);
  }

  return Object.fromEntries(fileHashes.sort(([left], [right]) => left.localeCompare(right)));
}

async function sha256File(filePath: string): Promise<string> {
  const fileContents = await readFile(filePath);
  return sha256Buffer(fileContents);
}

function sha256Buffer(buffer: Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function sha256Text(text: string): string {
  return sha256Buffer(Buffer.from(text, "utf8"));
}

function normalizePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${stableStringify(value)}\n`, "utf8");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value), null, 2);
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortJsonValue(nestedValue)])
    );
  }

  return value;
}
