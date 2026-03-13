import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i);
const gateSchema = z.enum(["pass", "fail"]);
const runBundleStatusSchema = z.enum(["success", "failure", "incomplete"]);

const benchmarkPackageManifestSchema = z.object({
  benchmarkFamily: z.literal("firstproof"),
  benchmarkItemId: z.literal("Problem9"),
  lanePolicy: z.object({
    primaryLane: z.string().min(1),
    supportedLanes: z.array(z.string().min(1)).min(1)
  }),
  packageDigest: sha256Schema,
  packageId: z.literal("firstproof/Problem9"),
  packageVersion: z.string().min(1)
});

const promptPackageManifestSchema = z.object({
  authMode: z.string().min(1),
  benchmarkItemId: z.literal("Problem9"),
  benchmarkPackageDigest: sha256Schema,
  benchmarkPackageId: z.literal("firstproof/Problem9"),
  benchmarkPackageVersion: z.string().min(1),
  harnessRevision: z.string().min(1),
  laneId: z.string().min(1),
  modelConfigId: z.string().min(1),
  promptPackageDigest: sha256Schema,
  promptProtocolVersion: z.string().min(1),
  providerFamily: z.string().min(1),
  runMode: z.string().min(1),
  toolProfile: z.string().min(1)
});

const runEnvelopeSchema = z.object({
  attemptId: z.string().min(1),
  authMode: z.string().min(1),
  benchmarkItemId: z.literal("Problem9"),
  benchmarkPackageDigest: sha256Schema,
  benchmarkPackageId: z.literal("firstproof/Problem9"),
  benchmarkPackageVersion: z.string().min(1),
  harnessRevision: z.string().min(1),
  jobId: z.string().min(1).nullable(),
  laneId: z.string().min(1),
  modelConfigId: z.string().min(1),
  promptProtocolVersion: z.string().min(1),
  providerFamily: z.string().min(1),
  runId: z.string().min(1),
  runMode: z.string().min(1),
  toolProfile: z.string().min(1)
});

const environmentInputSchema = z
  .object({
    executionEnvironment: z.object({
      digest: sha256Schema,
      kind: z.string().min(1)
    }),
    harnessRevision: z.string().min(1),
    lakeSnapshotIdentity: z.string().min(1),
    laneId: z.string().min(1),
    leanVersion: z.string().min(1),
    modelConfigId: z.string().min(1),
    promptProtocolVersion: z.string().min(1),
    providerFamily: z.string().min(1),
    verifierVersion: z.string().min(1)
  })
  .passthrough();

const problem9RunBundleOptionsSchema = z
  .object({
    axiomCheck: gateSchema,
    benchmarkPackageRoot: z.string().min(1),
    candidateSourcePath: z.string().min(1),
    compilerDiagnosticsPath: z.string().min(1),
    compilerOutputPath: z.string().min(1),
    containsAdmit: z.boolean(),
    containsSorry: z.boolean(),
    diagnosticGate: gateSchema,
    environmentInputPath: z.string().min(1),
    failureCode: z.string().min(1).nullable(),
    outputRoot: z.string().min(1),
    promptPackageRoot: z.string().min(1),
    result: z.enum(["pass", "fail"]),
    status: runBundleStatusSchema,
    stopReason: z.string().min(1),
    surfaceDrift: z.boolean(),
    surfaceEquality: gateSchema,
    semanticEquality: gateSchema,
    verifierOutputPath: z.string().min(1)
  })
  .superRefine((value, context) => {
    if (value.result === "fail" && value.failureCode === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A failed run bundle requires --failure-code."
      });
    }

    if (value.result === "pass" && value.failureCode !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "--failure-code is allowed only when --result fail."
      });
    }

    if (value.status === "success" && value.result !== "pass") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bundle status success requires verdict result pass."
      });
    }
  });

const optionalPromptLayerRelativePaths = [
  "system.md",
  "benchmark.md",
  "item.md",
  "run-envelope.json"
] as const;

const artifactMetadataByPath = {
  "package/package-ref.json": {
    logicalArtifactRole: "package_reference",
    mediaType: "application/json",
    required: true
  },
  "package/benchmark-package.json": {
    logicalArtifactRole: "package_reference",
    mediaType: "application/json",
    required: true
  },
  "prompt/prompt-package.json": {
    logicalArtifactRole: "prompt_package",
    mediaType: "application/json",
    required: true
  },
  "prompt/system.md": {
    logicalArtifactRole: "prompt_package",
    mediaType: "text/markdown",
    required: false
  },
  "prompt/benchmark.md": {
    logicalArtifactRole: "prompt_package",
    mediaType: "text/markdown",
    required: false
  },
  "prompt/item.md": {
    logicalArtifactRole: "prompt_package",
    mediaType: "text/markdown",
    required: false
  },
  "prompt/run-envelope.json": {
    logicalArtifactRole: "prompt_package",
    mediaType: "application/json",
    required: false
  },
  "candidate/Candidate.lean": {
    logicalArtifactRole: "candidate_source",
    mediaType: "text/plain",
    required: true
  },
  "verification/verdict.json": {
    logicalArtifactRole: "verdict_record",
    mediaType: "application/json",
    required: true
  },
  "verification/compiler-diagnostics.json": {
    logicalArtifactRole: "compiler_diagnostics",
    mediaType: "application/json",
    required: true
  },
  "verification/compiler-output.txt": {
    logicalArtifactRole: "compiler_output",
    mediaType: "text/plain",
    required: true
  },
  "verification/verifier-output.json": {
    logicalArtifactRole: "verifier_output",
    mediaType: "application/json",
    required: true
  },
  "environment/environment.json": {
    logicalArtifactRole: "environment_snapshot",
    mediaType: "application/json",
    required: true
  }
} as const;

type BenchmarkPackageManifest = z.infer<typeof benchmarkPackageManifestSchema>;
type PromptPackageManifest = z.infer<typeof promptPackageManifestSchema>;
type RunEnvelope = z.infer<typeof runEnvelopeSchema>;
type EnvironmentInput = z.infer<typeof environmentInputSchema>;

export type MaterializeProblem9RunBundleOptions = z.infer<
  typeof problem9RunBundleOptionsSchema
>;

export type MaterializedProblem9RunBundle = {
  bundleDigest: string;
  outputRoot: string;
};

export async function materializeProblem9RunBundle(
  rawOptions: MaterializeProblem9RunBundleOptions
): Promise<MaterializedProblem9RunBundle> {
  const options = problem9RunBundleOptionsSchema.parse(rawOptions);
  const outputRoot = path.resolve(options.outputRoot);
  const benchmarkPackageRoot = path.resolve(options.benchmarkPackageRoot);
  const promptPackageRoot = path.resolve(options.promptPackageRoot);
  const candidateSourcePath = path.resolve(options.candidateSourcePath);
  const compilerDiagnosticsPath = path.resolve(options.compilerDiagnosticsPath);
  const compilerOutputPath = path.resolve(options.compilerOutputPath);
  const verifierOutputPath = path.resolve(options.verifierOutputPath);
  const environmentInputPath = path.resolve(options.environmentInputPath);

  assertOutputRootIsNotFilesystemRoot(outputRoot);
  await assertNoPathOverlap(benchmarkPackageRoot, outputRoot, "benchmark package input");
  await assertNoPathOverlap(promptPackageRoot, outputRoot, "prompt package input");
  await assertNoPathOverlap(candidateSourcePath, outputRoot, "candidate source input");
  await assertNoPathOverlap(
    compilerDiagnosticsPath,
    outputRoot,
    "compiler diagnostics input"
  );
  await assertNoPathOverlap(compilerOutputPath, outputRoot, "compiler output input");
  await assertNoPathOverlap(verifierOutputPath, outputRoot, "verifier output input");
  await assertNoPathOverlap(environmentInputPath, outputRoot, "environment input");

  const benchmarkManifest = await loadBenchmarkPackageManifest(benchmarkPackageRoot);
  const promptManifest = await loadPromptPackageManifest(promptPackageRoot);
  const runEnvelope = await loadRunEnvelope(promptPackageRoot);
  const environmentInput = await loadEnvironmentInput(environmentInputPath);

  assertConsistentPromptInputs(benchmarkManifest, promptManifest, runEnvelope, environmentInput);

  const benchmarkManifestContents = await loadNormalizedText(
    path.join(benchmarkPackageRoot, "benchmark-package.json")
  );
  const promptManifestContents = await loadNormalizedText(
    path.join(promptPackageRoot, "prompt-package.json")
  );
  const runEnvelopeContents = await loadNormalizedText(
    path.join(promptPackageRoot, "run-envelope.json")
  );
  const candidateContents = await loadNormalizedText(candidateSourcePath);
  const compilerDiagnosticsContents = await loadValidatedJsonText(compilerDiagnosticsPath);
  const compilerOutputContents = await loadNormalizedText(compilerOutputPath);
  const verifierOutputContents = await loadValidatedJsonText(verifierOutputPath);
  const environmentContents = await loadValidatedJsonText(environmentInputPath, environmentInput);

  const candidateWritten = toWrittenText(candidateContents);
  const compilerDiagnosticsWritten = toWrittenText(compilerDiagnosticsContents);
  const compilerOutputWritten = toWrittenText(compilerOutputContents);
  const verifierOutputWritten = toWrittenText(verifierOutputContents);
  const environmentWritten = toWrittenText(environmentContents);

  const candidateDigest = sha256Text(candidateWritten);
  const environmentDigest = sha256Text(environmentWritten);

  const verdict = {
    verdictSchemaVersion: "1",
    runId: runEnvelope.runId,
    attemptId: runEnvelope.attemptId,
    result: options.result,
    ...(options.failureCode === null ? {} : { failureCode: options.failureCode }),
    semanticEquality: options.semanticEquality,
    surfaceEquality: options.surfaceEquality,
    surface_drift: options.surfaceDrift,
    containsSorry: options.containsSorry,
    containsAdmit: options.containsAdmit,
    axiomCheck: options.axiomCheck,
    diagnosticGate: options.diagnosticGate,
    candidateDigest,
    benchmarkPackageDigest: benchmarkManifest.packageDigest,
    laneId: runEnvelope.laneId
  };
  const verdictWritten = toWrittenText(stableStringify(verdict));
  const verdictDigest = sha256Text(verdictWritten);

  const packageRef = {
    packageRefSchemaVersion: "1",
    benchmarkFamily: benchmarkManifest.benchmarkFamily,
    benchmarkItemId: benchmarkManifest.benchmarkItemId,
    benchmarkPackageId: benchmarkManifest.packageId,
    benchmarkPackageVersion: benchmarkManifest.packageVersion,
    benchmarkPackageDigest: benchmarkManifest.packageDigest,
    laneId: runEnvelope.laneId
  };
  const packageRefWritten = toWrittenText(stableStringify(packageRef));

  const bundleFiles = new Map<string, string>([
    ["package/package-ref.json", packageRefWritten],
    ["package/benchmark-package.json", toWrittenText(benchmarkManifestContents)],
    ["prompt/prompt-package.json", toWrittenText(promptManifestContents)],
    ["candidate/Candidate.lean", candidateWritten],
    ["verification/verdict.json", verdictWritten],
    ["verification/compiler-diagnostics.json", compilerDiagnosticsWritten],
    ["verification/compiler-output.txt", compilerOutputWritten],
    ["verification/verifier-output.json", verifierOutputWritten],
    ["environment/environment.json", environmentWritten]
  ]);

  for (const relativePath of optionalPromptLayerRelativePaths) {
    const optionalContents = await maybeLoadNormalizedText(path.join(promptPackageRoot, relativePath));

    if (optionalContents === null) {
      continue;
    }

    bundleFiles.set(`prompt/${relativePath}`, toWrittenText(optionalContents));
  }

  await rm(outputRoot, { force: true, recursive: true });
  await mkdir(outputRoot, { recursive: true });

  for (const [relativePath, contents] of bundleFiles) {
    const destinationPath = path.join(outputRoot, relativePath);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await writeNormalizedText(destinationPath, contents);
  }

  const artifactManifest = buildArtifactManifest(bundleFiles);
  const artifactManifestWritten = toWrittenText(stableStringify(artifactManifest));
  const artifactManifestDigest = sha256Text(artifactManifestWritten);

  const bundleDigest = sha256Text(
    stableStringify({
      artifactInventory: artifactManifest.artifacts,
      attemptId: runEnvelope.attemptId,
      benchmarkPackageDigest: benchmarkManifest.packageDigest,
      benchmarkPackageId: benchmarkManifest.packageId,
      benchmarkPackageVersion: benchmarkManifest.packageVersion,
      bundleSchemaVersion: "1",
      candidateDigest,
      environmentDigest,
      jobId: runEnvelope.jobId,
      laneId: runEnvelope.laneId,
      promptPackageDigest: promptManifest.promptPackageDigest,
      runId: runEnvelope.runId,
      status: options.status,
      stopReason: options.stopReason,
      toolProfile: runEnvelope.toolProfile,
      verdictDigest
    })
  );

  const runBundle = {
    bundleSchemaVersion: "1",
    runId: runEnvelope.runId,
    jobId: runEnvelope.jobId,
    attemptId: runEnvelope.attemptId,
    benchmarkPackageId: benchmarkManifest.packageId,
    benchmarkPackageVersion: benchmarkManifest.packageVersion,
    benchmarkPackageDigest: benchmarkManifest.packageDigest,
    laneId: runEnvelope.laneId,
    toolProfile: runEnvelope.toolProfile,
    promptPackageDigest: promptManifest.promptPackageDigest,
    candidateDigest,
    verdictDigest,
    environmentDigest,
    artifactManifestDigest,
    bundleDigest,
    status: options.status,
    stopReason: options.stopReason
  };
  const runBundleWritten = toWrittenText(stableStringify(runBundle));

  await writeNormalizedText(path.join(outputRoot, "artifact-manifest.json"), artifactManifestWritten);
  await writeNormalizedText(path.join(outputRoot, "run-bundle.json"), runBundleWritten);

  return {
    bundleDigest,
    outputRoot
  };
}

async function loadBenchmarkPackageManifest(
  benchmarkPackageRoot: string
): Promise<BenchmarkPackageManifest> {
  const manifestPath = path.join(benchmarkPackageRoot, "benchmark-package.json");
  await ensureFile(manifestPath);
  return benchmarkPackageManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
}

async function loadPromptPackageManifest(promptPackageRoot: string): Promise<PromptPackageManifest> {
  const manifestPath = path.join(promptPackageRoot, "prompt-package.json");
  await ensureFile(manifestPath);
  return promptPackageManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
}

async function loadRunEnvelope(promptPackageRoot: string): Promise<RunEnvelope> {
  const envelopePath = path.join(promptPackageRoot, "run-envelope.json");
  await ensureFile(envelopePath);
  return runEnvelopeSchema.parse(JSON.parse(await readFile(envelopePath, "utf8")));
}

async function loadEnvironmentInput(environmentInputPath: string): Promise<EnvironmentInput> {
  await ensureFile(environmentInputPath);
  return environmentInputSchema.parse(JSON.parse(await readFile(environmentInputPath, "utf8")));
}

function assertConsistentPromptInputs(
  benchmarkManifest: BenchmarkPackageManifest,
  promptManifest: PromptPackageManifest,
  runEnvelope: RunEnvelope,
  environmentInput: EnvironmentInput
): void {
  if (promptManifest.benchmarkPackageId !== benchmarkManifest.packageId) {
    throw new Error("Prompt package benchmark package id does not match the benchmark package input.");
  }

  if (promptManifest.benchmarkPackageVersion !== benchmarkManifest.packageVersion) {
    throw new Error(
      "Prompt package benchmark package version does not match the benchmark package input."
    );
  }

  if (promptManifest.benchmarkPackageDigest.toLowerCase() !== benchmarkManifest.packageDigest.toLowerCase()) {
    throw new Error("Prompt package benchmark digest does not match the benchmark package input.");
  }

  if (runEnvelope.benchmarkPackageId !== benchmarkManifest.packageId) {
    throw new Error("Run envelope benchmark package id does not match the benchmark package input.");
  }

  if (runEnvelope.benchmarkPackageVersion !== benchmarkManifest.packageVersion) {
    throw new Error(
      "Run envelope benchmark package version does not match the benchmark package input."
    );
  }

  if (runEnvelope.benchmarkPackageDigest.toLowerCase() !== benchmarkManifest.packageDigest.toLowerCase()) {
    throw new Error("Run envelope benchmark digest does not match the benchmark package input.");
  }

  if (promptManifest.laneId !== runEnvelope.laneId) {
    throw new Error("Prompt package and run envelope disagree on laneId.");
  }

  if (promptManifest.toolProfile !== runEnvelope.toolProfile) {
    throw new Error("Prompt package and run envelope disagree on toolProfile.");
  }

  if (promptManifest.providerFamily !== runEnvelope.providerFamily) {
    throw new Error("Prompt package and run envelope disagree on providerFamily.");
  }

  if (promptManifest.authMode !== runEnvelope.authMode) {
    throw new Error("Prompt package and run envelope disagree on authMode.");
  }

  if (promptManifest.modelConfigId !== runEnvelope.modelConfigId) {
    throw new Error("Prompt package and run envelope disagree on modelConfigId.");
  }

  if (promptManifest.harnessRevision !== runEnvelope.harnessRevision) {
    throw new Error("Prompt package and run envelope disagree on harnessRevision.");
  }

  if (promptManifest.promptProtocolVersion !== runEnvelope.promptProtocolVersion) {
    throw new Error("Prompt package and run envelope disagree on promptProtocolVersion.");
  }

  if (environmentInput.promptProtocolVersion !== runEnvelope.promptProtocolVersion) {
    throw new Error("Environment input promptProtocolVersion must match the run envelope.");
  }

  if (environmentInput.harnessRevision !== runEnvelope.harnessRevision) {
    throw new Error("Environment input harnessRevision must match the run envelope.");
  }

  if (environmentInput.laneId !== runEnvelope.laneId) {
    throw new Error("Environment input laneId must match the run envelope.");
  }

  if (environmentInput.providerFamily !== runEnvelope.providerFamily) {
    throw new Error("Environment input providerFamily must match the run envelope.");
  }

  if (environmentInput.modelConfigId !== runEnvelope.modelConfigId) {
    throw new Error("Environment input modelConfigId must match the run envelope.");
  }
}

function buildArtifactManifest(bundleFiles: Map<string, string>): {
  artifactManifestSchemaVersion: string;
  artifacts: Array<{
    byteSize: number;
    digest: string;
    logicalArtifactRole: string;
    mediaType: string;
    path: string;
    required: boolean;
  }>;
  hashAlgorithm: string;
} {
  const artifacts = [...bundleFiles.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relativePath, contents]) => {
      const metadata = artifactMetadataByPath[relativePath as keyof typeof artifactMetadataByPath];

      if (!metadata) {
        throw new Error(`No artifact metadata registered for bundle path: ${relativePath}`);
      }

      return {
        path: relativePath,
        digest: sha256Text(contents),
        byteSize: Buffer.byteLength(contents, "utf8"),
        mediaType: metadata.mediaType,
        logicalArtifactRole: metadata.logicalArtifactRole,
        required: metadata.required
      };
    });

  return {
    artifactManifestSchemaVersion: "1",
    hashAlgorithm: "sha256",
    artifacts
  };
}

async function ensureFile(filePath: string): Promise<void> {
  const fileStats = await stat(filePath);

  if (!fileStats.isFile()) {
    throw new Error(`Expected file input: ${filePath}`);
  }
}

async function loadValidatedJsonText(filePath: string, preParsedValue?: unknown): Promise<string> {
  const contents = await loadNormalizedText(filePath);
  JSON.parse(contents);

  if (preParsedValue !== undefined) {
    JSON.parse(stableStringify(preParsedValue));
  }

  return contents;
}

async function loadNormalizedText(filePath: string): Promise<string> {
  return normalizeText(await readFile(filePath, "utf8"));
}

async function maybeLoadNormalizedText(filePath: string): Promise<string | null> {
  try {
    return await loadNormalizedText(filePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function assertNoPathOverlap(
  protectedRoot: string,
  outputRoot: string,
  protectedDescription: string
): Promise<void> {
  const normalizedProtectedRoot = await resolvePathForComparison(protectedRoot);
  const normalizedOutputRoot = await resolvePathForComparison(outputRoot);

  const protectedContainsOutput =
    normalizedOutputRoot === normalizedProtectedRoot ||
    normalizedOutputRoot.startsWith(`${normalizedProtectedRoot}/`);
  const outputContainsProtected =
    normalizedProtectedRoot.startsWith(`${normalizedOutputRoot}/`);

  if (protectedContainsOutput || outputContainsProtected) {
    throw new Error(
      `Run bundle output overlaps the ${protectedDescription}. Choose a different output directory.`
    );
  }
}

function assertOutputRootIsNotFilesystemRoot(outputRoot: string): void {
  if (path.parse(outputRoot).root === outputRoot) {
    throw new Error(
      "Run bundle output may not be a filesystem root. Choose a dedicated output directory."
    );
  }
}

async function resolvePathForComparison(filePath: string): Promise<string> {
  const absolutePath = path.resolve(filePath);
  const unresolvedSegments: string[] = [];
  let currentPath = absolutePath;

  while (true) {
    try {
      const resolvedPath = await realpath(currentPath);
      return normalizePath(path.join(resolvedPath, ...unresolvedSegments.reverse())).toLowerCase();
    } catch {
      const parentPath = path.dirname(currentPath);

      if (parentPath === currentPath) {
        throw new Error(`Could not resolve filesystem path for comparison: ${filePath}`);
      }

      unresolvedSegments.push(path.basename(currentPath));
      currentPath = parentPath;
    }
  }
}

async function writeNormalizedText(filePath: string, contents: string): Promise<void> {
  await writeFile(filePath, toWrittenText(contents), "utf8");
}

function normalizePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function toWrittenText(text: string): string {
  return `${normalizeText(text).replace(/\n?$/, "\n")}`;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(Buffer.from(normalizeText(text), "utf8")).digest("hex");
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
