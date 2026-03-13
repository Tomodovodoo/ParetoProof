import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i);

const benchmarkPackageManifestSchema = z.object({
  benchmarkFamily: z.literal("firstproof"),
  benchmarkItemId: z.literal("Problem9"),
  canonicalModules: z.object({
    gold: z.string().min(1),
    statement: z.string().min(1),
    support: z.string().min(1)
  }),
  hashes: z.record(z.string().min(1), sha256Schema),
  lanePolicy: z.object({
    primaryLane: z.string().min(1),
    supportedLanes: z.array(z.string().min(1)).min(1)
  }),
  packageDigest: sha256Schema,
  packageId: z.literal("firstproof/Problem9"),
  packageRoot: z.literal("firstproof/Problem9"),
  packageVersion: z.string().min(1)
});

const promptRunModeSchema = z.enum([
  "single_pass_probe",
  "pass_k_probe",
  "bounded_agentic_attempt"
]);

const promptToolProfileSchema = z.enum([
  "no_tools",
  "lean_mcp_readonly",
  "workspace_edit_limited"
]);

const promptAuthModeSchema = z.enum([
  "machine",
  "trusted_local_codex",
  "trusted_local_provider"
]);

const promptProviderFamilySchema = z.enum([
  "openai",
  "anthropic",
  "google",
  "aristotle",
  "axle",
  "custom"
]);

const promptLayerVersionSchema = z.object({
  benchmark: z.string().min(1),
  item: z.string().min(1),
  runEnvelope: z.string().min(1),
  system: z.string().min(1)
});

const problem9PromptPackageOptionsSchema = z
  .object({
    attemptId: z.string().min(1),
    authMode: promptAuthModeSchema,
    benchmarkPackageRoot: z.string().min(1),
    harnessRevision: z.string().min(1),
    jobId: z.string().min(1).nullable(),
    laneId: z.string().min(1),
    modelConfigId: z.string().min(1),
    outputRoot: z.string().min(1),
    passKCount: z.number().int().positive().nullable(),
    passKIndex: z.number().int().nonnegative().nullable(),
    promptLayerVersions: promptLayerVersionSchema,
    promptProtocolVersion: z.string().min(1),
    providerFamily: promptProviderFamilySchema,
    runId: z.string().min(1),
    runMode: promptRunModeSchema,
    toolProfile: promptToolProfileSchema
  })
  .superRefine((value, context) => {
    if (value.runMode === "pass_k_probe") {
      if (value.passKCount === null || value.passKIndex === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "pass_k_probe requires both passKCount and passKIndex in the run envelope."
        });
        return;
      }

      if (value.passKIndex >= value.passKCount) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "passKIndex must be smaller than passKCount."
        });
      }
      return;
    }

    if (value.passKCount !== null || value.passKIndex !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "passKCount and passKIndex are allowed only for the pass_k_probe run mode."
      });
    }
  });

const promptTemplateSourceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../prompts/problem9"
);

const textLayerFilenames = ["system.md", "benchmark.md", "item.md", "run-envelope.json"] as const;

const promptDefaults = {
  promptLayerVersions: {
    benchmark: "problem9-benchmark.v1",
    item: "problem9-item.v1",
    runEnvelope: "problem9-run-envelope.v1",
    system: "problem9-system.v1"
  },
  promptProtocolVersion: "problem9-prompt-protocol.v1"
} as const;

type BenchmarkPackageManifest = z.infer<typeof benchmarkPackageManifestSchema>;

export type MaterializeProblem9PromptPackageOptions = z.infer<
  typeof problem9PromptPackageOptionsSchema
>;

export type MaterializedProblem9PromptPackage = {
  outputRoot: string;
  promptPackageDigest: string;
};

export async function materializeProblem9PromptPackage(
  rawOptions: MaterializeProblem9PromptPackageOptions
): Promise<MaterializedProblem9PromptPackage> {
  const options = problem9PromptPackageOptionsSchema.parse(rawOptions);
  const benchmarkPackageRoot = path.resolve(options.benchmarkPackageRoot);
  const outputRoot = path.resolve(options.outputRoot);

  const benchmarkManifest = await loadBenchmarkPackageManifest(benchmarkPackageRoot);

  if (!benchmarkManifest.lanePolicy.supportedLanes.includes(options.laneId)) {
    throw new Error(
      `Lane ${options.laneId} is not supported by benchmark package ${benchmarkManifest.packageId}.`
    );
  }

  await assertNoPathOverlap(promptTemplateSourceRoot, outputRoot, "prompt template source");
  await assertNoPathOverlap(benchmarkPackageRoot, outputRoot, "benchmark package input");

  await rm(outputRoot, { force: true, recursive: true });
  await mkdir(outputRoot, { recursive: true });

  const systemTemplate = await loadNormalizedText(
    path.join(promptTemplateSourceRoot, "system.md")
  );
  const benchmarkTemplate = await loadNormalizedText(
    path.join(promptTemplateSourceRoot, "benchmark.md")
  );
  const statementMarkdown = await loadNormalizedText(
    path.join(benchmarkPackageRoot, "statements/problem.md")
  );
  const statementLean = await loadNormalizedText(
    path.join(benchmarkPackageRoot, "FirstProof/Problem9/Statement.lean")
  );
  const supportLean = await loadNormalizedText(
    path.join(benchmarkPackageRoot, "FirstProof/Problem9/Support.lean")
  );

  const benchmarkLayer = renderBenchmarkLayer({
    benchmarkPackageDigest: benchmarkManifest.packageDigest,
    benchmarkPackageVersion: benchmarkManifest.packageVersion,
    canonicalModules: benchmarkManifest.canonicalModules,
    template: benchmarkTemplate
  });
  const itemLayer = renderItemLayer({
    benchmarkManifest,
    laneId: options.laneId,
    statementLean,
    statementMarkdown,
    supportLean
  });
  const runEnvelope = renderRunEnvelope({
    ...options,
    benchmarkManifest
  });

  const layerContents = {
    "benchmark.md": benchmarkLayer,
    "item.md": itemLayer,
    "run-envelope.json": stableStringify(runEnvelope),
    "system.md": systemTemplate
  } as const;

  for (const filename of textLayerFilenames) {
    await writeNormalizedText(path.join(outputRoot, filename), layerContents[filename]);
  }

  const layerDigests = Object.fromEntries(
    Object.entries(layerContents)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([filename, content]) => [filename, sha256Text(content)])
  );

  const promptPackageDigest = sha256Text(
    stableStringify({
      authMode: options.authMode,
      benchmarkPackageDigest: benchmarkManifest.packageDigest,
      benchmarkPackageId: benchmarkManifest.packageId,
      benchmarkPackageVersion: benchmarkManifest.packageVersion,
      harnessRevision: options.harnessRevision,
      laneId: options.laneId,
      layerDigests,
      layerVersions: options.promptLayerVersions,
      modelConfigId: options.modelConfigId,
      promptProtocolVersion: options.promptProtocolVersion,
      providerFamily: options.providerFamily,
      runMode: options.runMode,
      toolProfile: options.toolProfile
    })
  );

  const promptPackageManifest = {
    promptPackageSchemaVersion: "1",
    promptPackageDigest,
    promptPackageDigestMode: "metadata_plus_layer_inventory_v1",
    promptProtocolVersion: options.promptProtocolVersion,
    benchmarkPackageId: benchmarkManifest.packageId,
    benchmarkPackageVersion: benchmarkManifest.packageVersion,
    benchmarkPackageDigest: benchmarkManifest.packageDigest,
    benchmarkItemId: benchmarkManifest.benchmarkItemId,
    laneId: options.laneId,
    runMode: options.runMode,
    toolProfile: options.toolProfile,
    providerFamily: options.providerFamily,
    authMode: options.authMode,
    modelConfigId: options.modelConfigId,
    harnessRevision: options.harnessRevision,
    layerVersions: options.promptLayerVersions,
    layerDigests,
    layers: {
      benchmark: "benchmark.md",
      item: "item.md",
      runEnvelope: "run-envelope.json",
      system: "system.md"
    }
  };

  await writeNormalizedText(
    path.join(outputRoot, "prompt-package.json"),
    stableStringify(promptPackageManifest)
  );

  return {
    outputRoot,
    promptPackageDigest
  };
}

export function getDefaultProblem9PromptPackageOptions(): Pick<
  MaterializeProblem9PromptPackageOptions,
  "promptLayerVersions" | "promptProtocolVersion"
> {
  return {
    promptLayerVersions: { ...promptDefaults.promptLayerVersions },
    promptProtocolVersion: promptDefaults.promptProtocolVersion
  };
}

async function loadBenchmarkPackageManifest(
  benchmarkPackageRoot: string
): Promise<BenchmarkPackageManifest> {
  await ensureFile(path.join(benchmarkPackageRoot, "benchmark-package.json"));
  await ensureFile(path.join(benchmarkPackageRoot, "statements/problem.md"));
  await ensureFile(path.join(benchmarkPackageRoot, "FirstProof/Problem9/Statement.lean"));
  await ensureFile(path.join(benchmarkPackageRoot, "FirstProof/Problem9/Support.lean"));

  const rawManifest = await readFile(
    path.join(benchmarkPackageRoot, "benchmark-package.json"),
    "utf8"
  );
  return benchmarkPackageManifestSchema.parse(JSON.parse(rawManifest));
}

async function ensureFile(filePath: string): Promise<void> {
  const fileStats = await stat(filePath);

  if (!fileStats.isFile()) {
    throw new Error(`Expected file path for prompt-package input: ${filePath}`);
  }
}

async function loadNormalizedText(filePath: string): Promise<string> {
  const fileContents = await readFile(filePath, "utf8");
  return normalizeText(fileContents);
}

function renderBenchmarkLayer(options: {
  benchmarkPackageDigest: string;
  benchmarkPackageVersion: string;
  canonicalModules: BenchmarkPackageManifest["canonicalModules"];
  template: string;
}): string {
  return [
    options.template.trimEnd(),
    "",
    "Pinned benchmark package:",
    `- version: ${options.benchmarkPackageVersion}`,
    `- digest: ${options.benchmarkPackageDigest}`,
    `- statement module: ${options.canonicalModules.statement}`,
    `- support module: ${options.canonicalModules.support}`,
    `- gold module: ${options.canonicalModules.gold}`
  ].join("\n");
}

function renderItemLayer(options: {
  benchmarkManifest: BenchmarkPackageManifest;
  laneId: string;
  statementLean: string;
  statementMarkdown: string;
  supportLean: string;
}): string {
  return [
    `Item id: ${options.benchmarkManifest.benchmarkItemId}`,
    `Lane: ${options.laneId}`,
    "",
    "Natural-language statement:",
    "",
    options.statementMarkdown.trimEnd(),
    "",
    "Canonical theorem target (`Statement.lean`):",
    "",
    "```lean",
    options.statementLean.trimEnd(),
    "```",
    "",
    "Benchmark-owned support context (`Support.lean`):",
    "",
    "```lean",
    options.supportLean.trimEnd(),
    "```"
  ].join("\n");
}

function renderRunEnvelope(options: MaterializeProblem9PromptPackageOptions & {
  benchmarkManifest: BenchmarkPackageManifest;
}): Record<string, unknown> {
  return {
    runEnvelopeSchemaVersion: "1",
    runId: options.runId,
    jobId: options.jobId,
    attemptId: options.attemptId,
    benchmarkPackageId: options.benchmarkManifest.packageId,
    benchmarkPackageVersion: options.benchmarkManifest.packageVersion,
    benchmarkPackageDigest: options.benchmarkManifest.packageDigest,
    benchmarkItemId: options.benchmarkManifest.benchmarkItemId,
    laneId: options.laneId,
    runMode: options.runMode,
    toolProfile: options.toolProfile,
    promptProtocolVersion: options.promptProtocolVersion,
    providerFamily: options.providerFamily,
    authMode: options.authMode,
    modelConfigId: options.modelConfigId,
    harnessRevision: options.harnessRevision,
    networkPolicy: "disabled",
    leanMcpExpected:
      options.toolProfile === "lean_mcp_readonly" ||
      options.toolProfile === "workspace_edit_limited",
    writableRoots:
      options.toolProfile === "workspace_edit_limited" ? ["workspace"] : [],
    outputContract: {
      candidatePath: "candidate/Candidate.lean",
      promptPackagePath: "prompt/prompt-package.json",
      reviewLayers: ["system.md", "benchmark.md", "item.md", "run-envelope.json"]
    },
    budgets: buildBudgetMetadata(options.runMode),
    passKProbe:
      options.runMode === "pass_k_probe"
        ? {
            passKCount: options.passKCount,
            passKIndex: options.passKIndex
          }
        : null
  };
}

function buildBudgetMetadata(runMode: z.infer<typeof promptRunModeSchema>): Record<string, unknown> {
  switch (runMode) {
    case "single_pass_probe":
      return {
        compileRepairCycles: 0,
        maxAttempts: 1,
        providerSpendUsd: 1,
        providerTokenBudget: null,
        providerTurns: 1,
        verifierRepairCycles: 0,
        wallClockSeconds: 300
      };
    case "pass_k_probe":
      return {
        compileRepairCycles: 0,
        maxAttempts: 1,
        providerSpendUsd: 1,
        providerTokenBudget: null,
        providerTurns: 1,
        verifierRepairCycles: 0,
        wallClockSeconds: 300
      };
    case "bounded_agentic_attempt":
      return {
        compileRepairCycles: 3,
        maxAttempts: 1,
        providerSpendUsd: 5,
        providerTokenBudget: 120000,
        providerTurns: 6,
        verifierRepairCycles: 2,
        wallClockSeconds: 1200
      };
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
      `Prompt package output overlaps the ${protectedDescription}. Choose a different output directory.`
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
  await writeFile(filePath, `${normalizeText(contents).replace(/\n?$/, "\n")}`, "utf8");
}

function normalizePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
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
