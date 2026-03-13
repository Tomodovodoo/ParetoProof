import { createHash } from "node:crypto";
import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const MATERIALIZED_PACKAGE_ID = "firstproof/Problem9";
const AUTHORING_SOURCE_ROOT = path.join("benchmarks", "firstproof", "problem9");
const SOURCE_METADATA_PATH = path.join(AUTHORING_SOURCE_ROOT, "package-source.json");
const GENERATED_MANIFEST_PATH = "benchmark-package.json";
const MATERIALIZED_ROOT_SEGMENTS = ["firstproof", "Problem9"];
const REQUIRED_MATERIALIZED_PATHS = [
  GENERATED_MANIFEST_PATH,
  "README.md",
  "LICENSE",
  "lean-toolchain",
  "lake-manifest.json",
  "lakefile.toml",
  "statements/problem.md",
  "FirstProof/Problem9/Statement.lean",
  "FirstProof/Problem9/Support.lean",
  "FirstProof/Problem9/Gold.lean",
] as const;
const AUTHORED_SOURCE_PATHS = REQUIRED_MATERIALIZED_PATHS.filter(
  (relativePath) => relativePath !== GENERATED_MANIFEST_PATH,
);

const sourceMetadataSchema = z.object({
  sourceSchemaVersion: z.literal(1),
  packageId: z.literal(MATERIALIZED_PACKAGE_ID),
  packageVersion: z.string().min(1),
  benchmarkFamily: z.literal("firstproof"),
  benchmarkItemId: z.literal("Problem9"),
  lanePolicy: z.object({
    sourceLaneId: z.literal("lean422_exact"),
    supportedLanes: z
      .array(
        z.object({
          laneId: z.enum(["lean422_exact", "lean424_interop"]),
          leanVersion: z.string().min(1),
          materialization: z.string().min(1),
        }),
      )
      .min(2),
  }),
  canonicalModules: z.object({
    statement: z.literal("FirstProof.Problem9.Statement"),
    support: z.literal("FirstProof.Problem9.Support"),
    gold: z.literal("FirstProof.Problem9.Gold"),
  }),
  requiredPaths: z.array(z.string().min(1)),
});

type SourceMetadata = z.infer<typeof sourceMetadataSchema>;

export interface MaterializeProblem9PackageOptions {
  outputDir: string;
}

export interface MaterializeProblem9PackageResult {
  materializedRoot: string;
  benchmarkManifestDigest: string;
  packageDigest: string;
  hashes: Record<string, string>;
}

function normalizePath(relativePath: string): string {
  return relativePath.replaceAll("\\", "/");
}

function sha256String(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sha256Buffer(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableValue(entry));
  }

  if (value && typeof value === "object") {
    const stableEntries = Object.entries(value as Record<string, unknown>)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, entryValue]) => [key, stableValue(entryValue)]);
    return Object.fromEntries(stableEntries);
  }

  return value;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveRepoRoot(): Promise<string> {
  let currentDirectory = path.dirname(fileURLToPath(import.meta.url));

  while (true) {
    const packageJsonPath = path.join(currentDirectory, "package.json");
    if (await pathExists(packageJsonPath)) {
      const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
        name?: unknown;
      };
      if (packageJson.name === "paretoproof") {
        return currentDirectory;
      }
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      throw new Error("Could not resolve the ParetoProof repository root.");
    }

    currentDirectory = parentDirectory;
  }
}

function assertRequiredPathContract(metadata: SourceMetadata): void {
  const metadataPaths = JSON.stringify(metadata.requiredPaths);
  const expectedPaths = JSON.stringify(REQUIRED_MATERIALIZED_PATHS);
  if (metadataPaths !== expectedPaths) {
    throw new Error(
      `Malformed source metadata: requiredPaths drifted from the canonical Problem 9 package layout.\nExpected: ${expectedPaths}\nReceived: ${metadataPaths}`,
    );
  }
}

async function readSourceMetadata(repoRoot: string): Promise<SourceMetadata> {
  const metadataPath = path.join(repoRoot, SOURCE_METADATA_PATH);
  const rawMetadata = await readFile(metadataPath, "utf8");
  const parsedMetadata = sourceMetadataSchema.parse(JSON.parse(rawMetadata));
  assertRequiredPathContract(parsedMetadata);
  return parsedMetadata;
}

async function ensureRequiredSourceFiles(repoRoot: string): Promise<void> {
  const sourceRoot = path.join(repoRoot, AUTHORING_SOURCE_ROOT);
  const generatedManifestSourcePath = path.join(sourceRoot, GENERATED_MANIFEST_PATH);
  if (await pathExists(generatedManifestSourcePath)) {
    throw new Error(
      `Authoring source must not check in ${GENERATED_MANIFEST_PATH}; it is generated during materialization.`,
    );
  }

  for (const relativePath of AUTHORED_SOURCE_PATHS) {
    const absolutePath = path.join(sourceRoot, relativePath);
    if (!(await pathExists(absolutePath))) {
      throw new Error(`Missing required Problem 9 authoring source file: ${normalizePath(relativePath)}`);
    }
  }
}

async function copyAuthoredSource(repoRoot: string, materializedRoot: string): Promise<Record<string, string>> {
  const sourceRoot = path.join(repoRoot, AUTHORING_SOURCE_ROOT);
  const hashes: Record<string, string> = {};

  for (const relativePath of AUTHORED_SOURCE_PATHS) {
    const sourcePath = path.join(sourceRoot, relativePath);
    const destinationPath = path.join(materializedRoot, relativePath);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await cp(sourcePath, destinationPath);
    const fileBytes = await readFile(destinationPath);
    hashes[normalizePath(relativePath)] = sha256Buffer(fileBytes);
  }

  return Object.fromEntries(
    Object.entries(hashes).sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath)),
  );
}

function buildManifestBase(metadata: SourceMetadata, hashes: Record<string, string>) {
  return {
    manifestSchemaVersion: 1,
    packageId: metadata.packageId,
    packageVersion: metadata.packageVersion,
    benchmarkFamily: metadata.benchmarkFamily,
    benchmarkItemId: metadata.benchmarkItemId,
    lanePolicy: metadata.lanePolicy,
    canonicalModules: metadata.canonicalModules,
    requiredPaths: [...REQUIRED_MATERIALIZED_PATHS],
    hashes,
    generatedManifestBoundary: {
      authoringSourceRoot: normalizePath(AUTHORING_SOURCE_ROOT),
      sourceMetadataPath: normalizePath(SOURCE_METADATA_PATH),
      materializedPackageRoot: normalizePath(path.join(...MATERIALIZED_ROOT_SEGMENTS)),
      generatedFile: GENERATED_MANIFEST_PATH,
      rootManifestRule:
        "benchmark-package.json is generated after copied-file hashes are known. benchmarkManifestDigest hashes the normalized manifest content before digest fields are attached, and packageDigest hashes the normalized copied-file inventory plus canonical manifest metadata instead of trying to hash the final manifest as one of its own file entries.",
    },
  };
}

async function writeManifest(
  materializedRoot: string,
  metadata: SourceMetadata,
  hashes: Record<string, string>,
): Promise<MaterializeProblem9PackageResult> {
  const manifestBase = buildManifestBase(metadata, hashes);
  const benchmarkManifestDigest = sha256String(stableJson(manifestBase));
  const packageDigest = sha256String(
    stableJson({
      ...manifestBase,
      benchmarkManifestDigest,
    }),
  );
  const finalManifest = {
    ...manifestBase,
    benchmarkManifestDigest,
    packageDigest,
  };

  await writeFile(path.join(materializedRoot, GENERATED_MANIFEST_PATH), stableJson(finalManifest), "utf8");

  return {
    materializedRoot,
    benchmarkManifestDigest,
    packageDigest,
    hashes,
  };
}

export async function materializeProblem9Package(
  options: MaterializeProblem9PackageOptions,
): Promise<MaterializeProblem9PackageResult> {
  const repoRoot = await resolveRepoRoot();
  const metadata = await readSourceMetadata(repoRoot);
  await ensureRequiredSourceFiles(repoRoot);

  const outputDirectory = path.resolve(options.outputDir);
  const materializedRoot = path.join(outputDirectory, ...MATERIALIZED_ROOT_SEGMENTS);
  if (await pathExists(materializedRoot)) {
    throw new Error(`Refusing to overwrite existing materialized package root: ${materializedRoot}`);
  }

  await mkdir(materializedRoot, { recursive: true });
  const hashes = await copyAuthoredSource(repoRoot, materializedRoot);
  return writeManifest(materializedRoot, metadata, hashes);
}
