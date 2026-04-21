import { randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  and,
  desc,
  eq,
  inArray,
  isNull
} from "drizzle-orm";
import {
  getProblem9HostedCapabilityViolation,
  getProblem9ModelConfigIdPrefix,
  type MathHostedLaunchCreateInput,
  type MathHostedLaunchCreateResponse,
  type MathLocalConnectedLaunchCreateInput,
  type MathLocalConnectedLaunchCreateResponse,
  type MathOfflineExportCreateInput,
  type MathOfflineExportCreateResponse,
  type MathQuestionLaunchConfig,
  type MathQuestionLaunchViewResponse,
  type MathRunnerBootstrapSessionRedeemInput,
  type MathRunnerBootstrapSessionRedeemResponse,
  type MathSingleRunLaunchTarget,
  type Problem9ProviderFamily,
  type Problem9RunMode,
  type Problem9ToolProfile
} from "@paretoproof/shared";
import { z } from "zod";
import {
  benchmarkVersions,
  attempts,
  jobs,
  mathLaunchRecords,
  mathRunnerBootstrapSessions,
  runs,
  workerInstances,
  workerJobLeases,
  workerPoolDefinitions
} from "../db/schema.js";
import type { HarnessRegistryService } from "./harness-registry.js";
import { createHarnessRegistryService } from "./harness-registry.js";
import {
  addSeconds,
  createProblem9JobTokenExpiry,
  createProblem9WorkerActiveJob,
  issueWorkerJobToken,
  problem9WorkerHeartbeatIntervalSeconds,
  problem9WorkerHeartbeatTimeoutSeconds,
  requiredProblem9ArtifactRoles,
  sha256Text
} from "./problem9-worker-assignment.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const fallbackRepoRoot = path.resolve(sourceDirectory, "..", "..", "..", "..");
const localBootstrapSessionLifetimeSeconds = 15 * 60;
const pendingStopReason = "not_started";
const pendingVerdictClass = "invalid_result";
const pendingVerifierResult = "invalid_result";
const problem9PromptLayerVersions = {
  benchmark: "problem9-benchmark.v1",
  item: "problem9-item.v1",
  runEnvelope: "problem9-run-envelope.v1",
  system: "problem9-system.v1"
} as const;
const problem9PromptProtocolVersion = "problem9-prompt-protocol.v1";
const supportedConnectedAuthModes = [
  "trusted_local_user",
  "machine_api_key"
] as const satisfies MathQuestionLaunchConfig["localSupportedAuthModes"];
const problem9SourceHashRelativePaths = [
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
const problem9SourceRequiredRelativePaths = [
  "benchmark-package.json",
  ...problem9SourceHashRelativePaths
] as const;
const ignoredProblem9SourcePathSegments = new Set([
  ".DS_Store",
  ".git",
  ".lake",
  ".tmp",
  "Thumbs.db"
]);

const problem9SourceManifestSchema = z.object({
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
  sourceMetadata: z.object({
    laneEvidence: z.object({
      lean422_exact: z.literal("lean-toolchain")
    }),
    license: z.object({
      file: z.literal("LICENSE"),
      spdxId: z.literal("Apache-2.0")
    }),
    provenance: z.object({
      goldModule: z.literal("FirstProof/Problem9/Gold.lean"),
      humanStatement: z.literal("statements/problem.md"),
      statementModule: z.literal("FirstProof/Problem9/Statement.lean"),
      supportModule: z.literal("FirstProof/Problem9/Support.lean")
    }),
    regressionEvidence: z.object({
      cohesionCheck: z.literal("bun run check:problem9-package-cohesion"),
      integrityTest: z.literal("node --import tsx --test test/problem9-integrity.test.ts")
    })
  }),
  sourceSchemaVersion: z.string().min(1)
});

type DbClient = ReturnTypeOfCreateDbClient;
type ReadWriteExecutor = Pick<DbClient, "select" | "update">;
type WriteExecutor = Pick<DbClient, "insert" | "select" | "update">;
type RunnerBootstrapRedeemRequest = MathRunnerBootstrapSessionRedeemInput & {
  sessionToken: string;
};
const localRunnerWorkerPoolPrefix = "local-";

type Problem9SourceBundle = {
  benchmarkPackageDigest: string | null;
  benchmarkTemplate: string;
  manifest: z.infer<typeof problem9SourceManifestSchema>;
  sourceTreeShapeValid: boolean;
  statementLean: string;
  statementMarkdown: string;
  supportLean: string;
  systemTemplate: string;
};

type LaunchConfigRow = {
  benchmarkPackageDigest: string;
  benchmarkPackageVersion: string;
  benchmarkVersionId: string;
  hostedSupported: boolean;
  id: string;
  laneId: string;
  localSupportedAuthModes: MathQuestionLaunchConfig["localSupportedAuthModes"];
  modelConfigId: string;
  modelSnapshotId: string;
  offlineExportSupportedAuthModes: MathQuestionLaunchConfig["offlineExportSupportedAuthModes"];
  providerFamily: Problem9ProviderFamily;
  runMode: Problem9RunMode;
  templateSourceRunId: string;
  toolProfile: Problem9ToolProfile;
  verifierVersion: string;
  harnessRevision: string;
};

type LaunchContext = {
  configs: LaunchConfigRow[];
  question: MathQuestionLaunchViewResponse["question"];
  source: Problem9SourceBundle;
  view: MathQuestionLaunchViewResponse;
};

type LaunchRecordDraft = {
  actorUserId: string;
  authMode: MathSingleRunLaunchTarget["authMode"];
  config: LaunchConfigRow;
  launchMode: "hosted" | "local_connected" | "offline_export";
  promptPackageDigest: string;
  questionId: string;
  sourceAttemptId: string;
  sourceJobId: string | null;
  sourceRunId: string;
  status:
    | "hosted_enqueued"
    | "local_bootstrap_issued"
    | "local_bootstrap_redeemed"
    | "offline_exported"
    | "offline_ingested";
};

type StoredLaunchRecord = typeof mathLaunchRecords.$inferSelect;

type KernelRunRows = {
  attemptId: string;
  attemptRowId: string;
  jobId: string;
  jobRowId: string;
  runId: string;
  runRowId: string;
};

export class MathLaunchServiceError extends Error {
  code: string;
  issues?: Array<{ message: string; path?: string }>;
  statusCode: number;

  constructor(options: {
    code: string;
    issues?: Array<{ message: string; path?: string }>;
    statusCode: number;
  }) {
    super(options.code);
    this.name = "MathLaunchServiceError";
    this.code = options.code;
    this.issues = options.issues;
    this.statusCode = options.statusCode;
  }
}

export type MathLaunchService = {
  attachOfflineIngestToLaunch: (options: {
    executor?: ReadWriteExecutor;
    mathLaunchId: string;
    runRowId: string;
    sourceRunId: string;
  }) => Promise<void>;
  createHostedLaunch: (
    questionId: string,
    input: MathHostedLaunchCreateInput,
    actorUserId: string
  ) => Promise<MathHostedLaunchCreateResponse>;
  createLocalBootstrap: (
    questionId: string,
    input: MathLocalConnectedLaunchCreateInput,
    actorUserId: string
  ) => Promise<MathLocalConnectedLaunchCreateResponse>;
  createOfflineExport: (
    questionId: string,
    input: MathOfflineExportCreateInput,
    actorUserId: string
  ) => Promise<MathOfflineExportCreateResponse>;
  getQuestionLaunchView: (questionId: string) => Promise<MathQuestionLaunchViewResponse | null>;
  redeemRunnerBootstrapSession: (
    bootstrapSessionId: string,
    input: RunnerBootstrapRedeemRequest
  ) => Promise<MathRunnerBootstrapSessionRedeemResponse>;
};

let cachedProblem9SourceBundle: Problem9SourceBundle | null = null;
const runnerBootstrapRedeemDuplicateConstraints = new Set(["runs_source_run_id_unique"]);

function normalizeText(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function toWrittenText(value: string) {
  return `${normalizeText(value).replace(/\n?$/, "\n")}`;
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

function resolveRepoRoot() {
  const candidateRoots = [process.cwd(), fallbackRepoRoot];

  for (const candidateRoot of candidateRoots) {
    const manifestPath = path.join(
      candidateRoot,
      "benchmarks",
      "firstproof",
      "problem9",
      "benchmark-package.json"
    );

    if (existsSync(manifestPath)) {
      return candidateRoot;
    }
  }

  throw new Error("Unable to resolve the Problem 9 benchmark source tree.");
}

function collectProblem9SourceFileHashes(sourceRoot: string) {
  return Object.fromEntries(
    [...problem9SourceHashRelativePaths]
      .sort((left, right) => left.localeCompare(right))
      .map((relativePath) => {
        const filePath = path.join(sourceRoot, relativePath);
        return [relativePath, sha256Text(normalizeText(readFileSync(filePath, "utf8")))];
      })
  );
}

function listProblem9SourceFiles(root: string, relativeRoot = ""): string[] {
  const directoryPath = path.join(root, relativeRoot);
  const entries = readdirSync(directoryPath, {
    withFileTypes: true
  });
  const files: string[] = [];

  for (const entry of entries) {
    if (ignoredProblem9SourcePathSegments.has(entry.name) || entry.name.startsWith(".#")) {
      continue;
    }

    const nextRelativePath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...listProblem9SourceFiles(root, nextRelativePath));
      continue;
    }

    if (!entry.isFile()) {
      const entryPath = path.join(root, nextRelativePath);
      throw new Error(`Unsupported non-file Problem 9 source entry: ${entryPath}`);
    }

    files.push(nextRelativePath);
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function hasExpectedProblem9SourceTreeShape(sourceRoot: string) {
  const discoveredPaths = listProblem9SourceFiles(sourceRoot);
  const expectedPaths = [...problem9SourceRequiredRelativePaths].sort((left, right) =>
    left.localeCompare(right)
  );

  return stableStringify(discoveredPaths) === stableStringify(expectedPaths);
}

function loadProblem9SourceBundle() {
  if (cachedProblem9SourceBundle) {
    return cachedProblem9SourceBundle;
  }

  const repoRoot = resolveRepoRoot();
  const sourceRoot = path.join(repoRoot, "benchmarks", "firstproof", "problem9");
  const promptRoot = path.join(repoRoot, "apps", "worker", "prompts", "problem9");
  const sourceTreeShapeValid = hasExpectedProblem9SourceTreeShape(sourceRoot);
  const sourceManifestText = normalizeText(
    readFileSync(path.join(sourceRoot, "benchmark-package.json"), "utf8")
  );
  const manifest = problem9SourceManifestSchema.parse(JSON.parse(sourceManifestText));
  const benchmarkPackageDigest = sourceTreeShapeValid
    ? sha256Text(
        stableStringify({
          benchmarkFamily: manifest.benchmarkFamily,
          benchmarkItemId: manifest.benchmarkItemId,
          canonicalModules: manifest.canonicalModules,
          fileHashes: collectProblem9SourceFileHashes(sourceRoot),
          lanePolicy: manifest.lanePolicy,
          packageId: manifest.packageId,
          packageRoot: manifest.materialization.packageRoot,
          packageVersion: manifest.packageVersion,
          sourceMetadata: manifest.sourceMetadata,
          sourceManifestDigest: sha256Text(sourceManifestText),
          sourceSchemaVersion: manifest.sourceSchemaVersion
        })
      )
    : null;
  const statementLean = sourceTreeShapeValid
    ? normalizeText(readFileSync(path.join(sourceRoot, "FirstProof", "Problem9", "Statement.lean"), "utf8"))
    : "";
  const statementMarkdown = sourceTreeShapeValid
    ? normalizeText(readFileSync(path.join(sourceRoot, "statements", "problem.md"), "utf8"))
    : "";
  const supportLean = sourceTreeShapeValid
    ? normalizeText(readFileSync(path.join(sourceRoot, "FirstProof", "Problem9", "Support.lean"), "utf8"))
    : "";

  const sourceBundle = {
    benchmarkPackageDigest,
    benchmarkTemplate: normalizeText(readFileSync(path.join(promptRoot, "benchmark.md"), "utf8")),
    manifest,
    sourceTreeShapeValid,
    statementLean,
    statementMarkdown,
    supportLean,
    systemTemplate: normalizeText(readFileSync(path.join(promptRoot, "system.md"), "utf8"))
  };

  if (sourceTreeShapeValid) {
    cachedProblem9SourceBundle = sourceBundle;
  }

  return sourceBundle;
}

function buildQuestionSummary(source: Problem9SourceBundle) {
  return {
    benchmarkFamily: source.manifest.benchmarkFamily,
    benchmarkItemId: source.manifest.benchmarkItemId,
    benchmarkPackageId: source.manifest.packageId,
    label: "Problem 9",
    questionId: "problem-9",
    routePath: "/questions/problem-9",
    sourcePackageVersion: source.manifest.packageVersion
  } satisfies MathQuestionLaunchViewResponse["question"];
}

function buildBudgetMetadata(runMode: Problem9RunMode): Record<string, unknown> {
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

function renderBenchmarkLayer(options: {
  benchmarkPackageDigest: string;
  benchmarkPackageVersion: string;
  source: Problem9SourceBundle;
}) {
  return [
    options.source.benchmarkTemplate.trimEnd(),
    "",
    "Pinned benchmark package:",
    `- version: ${options.benchmarkPackageVersion}`,
    `- digest: ${options.benchmarkPackageDigest}`,
    `- statement module: ${options.source.manifest.canonicalModules.statement}`,
    `- support module: ${options.source.manifest.canonicalModules.support}`,
    `- gold module: ${options.source.manifest.canonicalModules.gold}`
  ].join("\n");
}

function renderItemLayer(options: {
  laneId: string;
  source: Problem9SourceBundle;
}) {
  return [
    `Item id: ${options.source.manifest.benchmarkItemId}`,
    `Lane: ${options.laneId}`,
    "",
    "Natural-language statement:",
    "",
    options.source.statementMarkdown.trimEnd(),
    "",
    "Canonical theorem target (`Statement.lean`):",
    "",
    "```lean",
    options.source.statementLean.trimEnd(),
    "```",
    "",
    "Benchmark-owned support context (`Support.lean`):",
    "",
    "```lean",
    options.source.supportLean.trimEnd(),
    "```"
  ].join("\n");
}

function renderRunEnvelope(options: {
  authMode: MathSingleRunLaunchTarget["authMode"];
  benchmarkPackageDigest: string;
  benchmarkPackageVersion: string;
  config: LaunchConfigRow;
  source: Problem9SourceBundle;
  sourceAttemptId: string;
  sourceJobId: string | null;
  sourceRunId: string;
}) {
  return {
    attemptId: options.sourceAttemptId,
    authMode: options.authMode,
    benchmarkItemId: options.source.manifest.benchmarkItemId,
    benchmarkPackageDigest: options.benchmarkPackageDigest,
    benchmarkPackageId: options.source.manifest.packageId,
    benchmarkPackageVersion: options.benchmarkPackageVersion,
    budgets: buildBudgetMetadata(options.config.runMode),
    harnessRevision: options.config.harnessRevision,
    jobId: options.sourceJobId,
    laneId: options.config.laneId,
    leanMcpExpected:
      options.config.toolProfile === "lean_mcp_readonly" ||
      options.config.toolProfile === "workspace_edit_limited",
    modelConfigId: options.config.modelConfigId,
    networkPolicy: "disabled",
    outputContract: {
      candidatePath: "candidate/Candidate.lean",
      promptPackagePath: "prompt/prompt-package.json",
      reviewLayers: ["system.md", "benchmark.md", "item.md", "run-envelope.json"]
    },
    passKProbe: null,
    promptProtocolVersion: problem9PromptProtocolVersion,
    providerFamily: options.config.providerFamily,
    runEnvelopeSchemaVersion: "1",
    runId: options.sourceRunId,
    runMode: options.config.runMode,
    toolProfile: options.config.toolProfile,
    writableRoots: options.config.toolProfile === "workspace_edit_limited" ? ["workspace"] : []
  };
}

function computePromptPackageDigest(options: {
  authMode: MathSingleRunLaunchTarget["authMode"];
  benchmarkPackageDigest: string;
  benchmarkPackageVersion: string;
  config: LaunchConfigRow;
  source: Problem9SourceBundle;
  sourceAttemptId: string;
  sourceJobId: string | null;
  sourceRunId: string;
}) {
  const benchmarkLayer = toWrittenText(
    renderBenchmarkLayer({
      benchmarkPackageDigest: options.benchmarkPackageDigest,
      benchmarkPackageVersion: options.benchmarkPackageVersion,
      source: options.source
    })
  );
  const itemLayer = toWrittenText(
    renderItemLayer({
      laneId: options.config.laneId,
      source: options.source
    })
  );
  const runEnvelope = toWrittenText(
    stableStringify(
      renderRunEnvelope({
        authMode: options.authMode,
        benchmarkPackageDigest: options.benchmarkPackageDigest,
        benchmarkPackageVersion: options.benchmarkPackageVersion,
        config: options.config,
        source: options.source,
        sourceAttemptId: options.sourceAttemptId,
        sourceJobId: options.sourceJobId,
        sourceRunId: options.sourceRunId
      })
    )
  );
  const systemLayer = toWrittenText(options.source.systemTemplate);
  const layerDigests = {
    "benchmark.md": sha256Text(benchmarkLayer),
    "item.md": sha256Text(itemLayer),
    "run-envelope.json": sha256Text(runEnvelope),
    "system.md": sha256Text(systemLayer)
  } as const;

  return sha256Text(
    stableStringify({
      authMode: options.authMode,
      benchmarkPackageDigest: options.benchmarkPackageDigest,
      benchmarkPackageId: options.source.manifest.packageId,
      benchmarkPackageVersion: options.benchmarkPackageVersion,
      harnessRevision: options.config.harnessRevision,
      laneId: options.config.laneId,
      layerDigests,
      layerVersions: problem9PromptLayerVersions,
      modelConfigId: options.config.modelConfigId,
      promptProtocolVersion: problem9PromptProtocolVersion,
      providerFamily: options.config.providerFamily,
      runMode: options.config.runMode,
      toolProfile: options.config.toolProfile
    })
  );
}

function buildLaunchConfigId(options: {
  benchmarkVersionId: string;
  harnessRevision: string;
  laneId: string;
  modelConfigId: string;
  modelSnapshotId: string;
  providerFamily: Problem9ProviderFamily;
  runMode: Problem9RunMode;
  toolProfile: Problem9ToolProfile;
  verifierVersion: string;
}) {
  return sha256Text(stableStringify(options));
}

function buildPortalRunPath(runId: string) {
  return `/runs/${encodeURIComponent(runId)}`;
}

function buildPlaceholderDigest(kind: string, seed: string) {
  return sha256Text(stableStringify({ kind, seed }));
}

function buildPendingVerifierVerdict(options: {
  attemptId: string;
  benchmarkPackageDigest: string;
  candidateDigest: string;
  laneId: string;
}) {
  return {
    attemptId: options.attemptId,
    axiomCheck: "not_evaluated",
    benchmarkPackageDigest: options.benchmarkPackageDigest,
    candidateDigest: options.candidateDigest,
    containsAdmit: false,
    containsSorry: false,
    diagnosticGate: "failed",
    laneId: options.laneId,
    primaryFailure: null,
    result: "fail",
    semanticEquality: "not_evaluated",
    surfaceEquality: "not_evaluated",
    verdictSchemaVersion: "1"
  } as const;
}

function buildSingleRunTarget(record: Pick<
  typeof mathLaunchRecords.$inferSelect,
  | "authMode"
  | "benchmarkItemId"
  | "benchmarkPackageDigest"
  | "benchmarkPackageId"
  | "benchmarkPackageVersion"
  | "harnessRevision"
  | "laneId"
  | "modelConfigId"
  | "modelSnapshotId"
  | "promptPackageDigest"
  | "promptProtocolVersion"
  | "providerFamily"
  | "runMode"
  | "toolProfile"
>): MathSingleRunLaunchTarget {
  return {
    authMode: record.authMode as MathSingleRunLaunchTarget["authMode"],
    benchmarkItemId: record.benchmarkItemId,
    benchmarkPackageDigest: record.benchmarkPackageDigest,
    benchmarkPackageId: record.benchmarkPackageId,
    benchmarkPackageVersion: record.benchmarkPackageVersion,
    harnessRevision: record.harnessRevision,
    laneId: record.laneId,
    modelConfigId: record.modelConfigId,
    modelSnapshotId: record.modelSnapshotId,
    promptPackageDigest: record.promptPackageDigest,
    promptProtocolVersion: record.promptProtocolVersion,
    providerFamily: record.providerFamily as Problem9ProviderFamily,
    runKind: "single_run",
    runMode: record.runMode as Problem9RunMode,
    toolProfile: record.toolProfile as Problem9ToolProfile
  };
}

function supportsRunnerBootstrap(input: MathRunnerBootstrapSessionRedeemInput) {
  return (
    input.supportsOfflineBundleContract &&
    input.availableRunKinds.includes("single_run") &&
    requiredProblem9ArtifactRoles.every((role) => input.supportedArtifactRoles.includes(role))
  );
}

function supportsLocalRunnerIdentity(input: MathRunnerBootstrapSessionRedeemInput) {
  return (
    input.workerRuntime === "local_docker" &&
    input.workerPool.startsWith(localRunnerWorkerPoolPrefix)
  );
}

async function upsertLocalRunnerWorkerPoolDefinition(
  tx: WriteExecutor,
  request: Pick<MathRunnerBootstrapSessionRedeemInput, "workerPool" | "workerRuntime">,
  now: Date
) {
  const [insertedWorkerPoolDefinition] = await tx
    .insert(workerPoolDefinitions)
    .values({
      defaultRolloutClass: "stable",
      updatedAt: now,
      workerPool: request.workerPool,
      workerRuntime: request.workerRuntime
    })
    .onConflictDoNothing()
    .returning({
      id: workerPoolDefinitions.id
    });

  if (insertedWorkerPoolDefinition) {
    return insertedWorkerPoolDefinition.id;
  }

  const [existingWorkerPoolDefinition] = await tx
    .select({
      id: workerPoolDefinitions.id,
      workerRuntime: workerPoolDefinitions.workerRuntime
    })
    .from(workerPoolDefinitions)
    .where(eq(workerPoolDefinitions.workerPool, request.workerPool))
    .limit(1);

  if (!existingWorkerPoolDefinition) {
    throw new Error("Failed to persist the local runner worker pool definition.");
  }

  if (existingWorkerPoolDefinition.workerRuntime !== request.workerRuntime) {
    throw new MathLaunchServiceError({
      code: "math_runner_bootstrap_identity_not_supported",
      issues: [
        {
          message: `Worker pool ${request.workerPool} is already registered for runtime ${existingWorkerPoolDefinition.workerRuntime}.`,
          path: "workerPool"
        },
        {
          message: `Worker pool ${request.workerPool} is already registered for runtime ${existingWorkerPoolDefinition.workerRuntime}.`,
          path: "workerRuntime"
        }
      ],
      statusCode: 409
    });
  }

  return existingWorkerPoolDefinition.id;
}

async function upsertLocalRunnerWorkerInstance(
  tx: WriteExecutor,
  options: {
    currentLifecycleState: typeof workerInstances.$inferSelect.currentLifecycleState;
    lastClaimAt?: Date;
    lastLeaseActivityAt?: Date;
    now: Date;
    workerInstanceKey: string;
    workerPoolDefinitionId: string;
    workerRuntime: typeof workerInstances.$inferSelect.workerRuntime;
    workerVersion: string;
  }
) {
  const [insertedWorkerInstance] = await tx
    .insert(workerInstances)
    .values({
      currentLifecycleState: options.currentLifecycleState,
      lastSeenAt: options.now,
      updatedAt: options.now,
      workerId: options.workerInstanceKey,
      workerPoolDefinitionId: options.workerPoolDefinitionId,
      workerRuntime: options.workerRuntime,
      workerVersion: options.workerVersion,
      ...(options.lastClaimAt !== undefined ? { lastClaimAt: options.lastClaimAt } : {}),
      ...(options.lastLeaseActivityAt !== undefined
        ? { lastLeaseActivityAt: options.lastLeaseActivityAt }
        : {})
    })
    .onConflictDoNothing()
    .returning({
      id: workerInstances.id
    });

  if (insertedWorkerInstance) {
    return insertedWorkerInstance.id;
  }

  const [existingWorkerInstance] = await tx
    .select({
      id: workerInstances.id
    })
    .from(workerInstances)
    .where(eq(workerInstances.workerId, options.workerInstanceKey))
    .limit(1);

  if (!existingWorkerInstance) {
    throw new Error("Failed to persist the local runner worker instance.");
  }

  return existingWorkerInstance.id;
}

function buildLocalRunnerWorkerInstanceKey(bootstrapSessionId: string) {
  return `math-local-bootstrap:${bootstrapSessionId}`;
}

async function loadLaunchContext(
  db: DbClient,
  harnessRegistry: HarnessRegistryService,
  questionId: string
): Promise<LaunchContext | null> {
  if (questionId !== "problem-9") {
    return null;
  }

  const source = loadProblem9SourceBundle();
  const question = buildQuestionSummary(source);
  const benchmarkVersionRows = await db
    .select({
      benchmarkVersionId: benchmarkVersions.benchmarkVersionId,
      createdAt: benchmarkVersions.createdAt,
      displayLabel: benchmarkVersions.displayLabel,
      launchability: benchmarkVersions.launchability,
      packageDigest: benchmarkVersions.packageDigest,
      packageVersion: benchmarkVersions.packageVersion
    })
    .from(benchmarkVersions)
    .where(
      and(
        eq(benchmarkVersions.packageId, source.manifest.packageId),
        inArray(benchmarkVersions.launchability, ["internal_only", "launchable"])
      )
    )
    .orderBy(desc(benchmarkVersions.createdAt));
  const matchingSourceVersions =
    source.sourceTreeShapeValid && source.benchmarkPackageDigest
      ? benchmarkVersionRows.filter((row) => row.packageDigest === source.benchmarkPackageDigest)
      : [];
  const issues: MathQuestionLaunchViewResponse["issues"] = [];

  if (benchmarkVersionRows.length === 0) {
    issues.push({
      code: "no_launchable_benchmark_version",
      message: "No launchable or internal benchmark version exists for this question yet."
    });
  } else if (matchingSourceVersions.length === 0) {
    issues.push({
      code: "source_package_version_mismatch",
      message:
        "The current repository Problem 9 source tree does not match any launchable benchmark package digest for the declared source package version, so prompt metadata cannot be generated safely."
    });
  }

  const benchmarkVersionsByDigest = new Map<string, (typeof matchingSourceVersions)[number]>();
  for (const row of matchingSourceVersions) {
    if (!benchmarkVersionsByDigest.has(row.packageDigest)) {
      benchmarkVersionsByDigest.set(row.packageDigest, row);
    }
  }
  const matchingDigests = [...benchmarkVersionsByDigest.keys()];
  const runRows =
    matchingDigests.length === 0
      ? []
      : await db
          .select({
            benchmarkPackageDigest: runs.benchmarkPackageDigest,
            benchmarkPackageVersion: runs.benchmarkPackageVersion,
            createdAt: runs.createdAt,
            harnessRevision: runs.harnessRevision,
            laneId: runs.laneId,
            modelConfigId: runs.modelConfigId,
            modelSnapshotId: runs.modelSnapshotId,
            providerFamily: runs.providerFamily,
            runMode: runs.runMode,
            sourceRunId: runs.sourceRunId,
            toolProfile: runs.toolProfile,
            verifierVersion: runs.verifierVersion
          })
          .from(runs)
          .where(
            and(
              eq(runs.benchmarkPackageId, source.manifest.packageId),
              eq(runs.benchmarkPackageVersion, source.manifest.packageVersion),
              inArray(runs.benchmarkPackageDigest, matchingDigests)
            )
          )
          .orderBy(desc(runs.createdAt));
  const harnessCatalog = await harnessRegistry.getCatalog();
  const hostedHarness = harnessCatalog.items.find(
    (item) => item.familyId === "problem9" && item.runtimeClass === "hosted_worker"
  );
  const localHarness = harnessCatalog.items.find(
    (item) => item.familyId === "problem9" && item.runtimeClass === "trusted_local_devbox"
  );
  const configMap = new Map<string, LaunchConfigRow>();

  for (const runRow of runRows) {
    const benchmarkVersion = benchmarkVersionsByDigest.get(runRow.benchmarkPackageDigest);

    if (!benchmarkVersion) {
      continue;
    }

    if (!source.manifest.lanePolicy.supportedLanes.includes(runRow.laneId)) {
      continue;
    }

    const localSupportedAuthModes = supportedConnectedAuthModes.filter((authMode) => {
      const expectedPrefix = getProblem9ModelConfigIdPrefix(authMode);
      return (
        runRow.modelConfigId.startsWith(expectedPrefix) &&
        !!localHarness &&
        localHarness.providerFamilies.includes(runRow.providerFamily) &&
        localHarness.runModes.includes(runRow.runMode as Problem9RunMode) &&
        localHarness.toolProfiles.includes(runRow.toolProfile as Problem9ToolProfile) &&
        localHarness.authModes.includes(authMode) &&
        localHarness.harnessRevision === runRow.harnessRevision
      );
    });
    const hostedSupported =
      !!hostedHarness &&
      hostedHarness.providerFamilies.includes(runRow.providerFamily) &&
      hostedHarness.runModes.includes(runRow.runMode as Problem9RunMode) &&
      hostedHarness.toolProfiles.includes(runRow.toolProfile as Problem9ToolProfile) &&
      hostedHarness.harnessRevision === runRow.harnessRevision &&
      getProblem9HostedCapabilityViolation({
        authMode: "machine_api_key",
        modelConfigId: runRow.modelConfigId,
        providerFamily: runRow.providerFamily
      }) === null;

    if (!hostedSupported && localSupportedAuthModes.length === 0) {
      continue;
    }

    const configId = buildLaunchConfigId({
      benchmarkVersionId: benchmarkVersion.benchmarkVersionId,
      harnessRevision: runRow.harnessRevision,
      laneId: runRow.laneId,
      modelConfigId: runRow.modelConfigId,
      modelSnapshotId: runRow.modelSnapshotId,
      providerFamily: runRow.providerFamily as Problem9ProviderFamily,
      runMode: runRow.runMode as Problem9RunMode,
      toolProfile: runRow.toolProfile as Problem9ToolProfile,
      verifierVersion: runRow.verifierVersion
    });

    if (configMap.has(configId)) {
      continue;
    }

    configMap.set(configId, {
      benchmarkPackageDigest: runRow.benchmarkPackageDigest,
      benchmarkPackageVersion: runRow.benchmarkPackageVersion,
      benchmarkVersionId: benchmarkVersion.benchmarkVersionId,
      harnessRevision: runRow.harnessRevision,
      hostedSupported,
      id: configId,
      laneId: runRow.laneId,
      localSupportedAuthModes,
      modelConfigId: runRow.modelConfigId,
      modelSnapshotId: runRow.modelSnapshotId,
      offlineExportSupportedAuthModes: [...localSupportedAuthModes],
      providerFamily: runRow.providerFamily as Problem9ProviderFamily,
      runMode: runRow.runMode as Problem9RunMode,
      templateSourceRunId: runRow.sourceRunId,
      toolProfile: runRow.toolProfile as Problem9ToolProfile,
      verifierVersion: runRow.verifierVersion
    });
  }

  const configs = [...configMap.values()];

  if (matchingSourceVersions.length > 0 && configs.length === 0) {
    issues.push({
      code: "no_launch_configs",
      message:
        "No seeded launch configuration exists for the current Problem 9 benchmark version yet."
    });
  }

  const view = {
    benchmarkVersions: benchmarkVersionRows.map((row) => ({
      benchmarkVersionId: row.benchmarkVersionId,
      displayLabel: row.displayLabel,
      launchability: row.launchability,
      packageDigest: row.packageDigest,
      packageVersion: row.packageVersion
    })),
    issues,
    launchConfigs: configs.map((config) => ({
      benchmarkVersionId: config.benchmarkVersionId,
      hostedSupported: config.hostedSupported,
      id: config.id,
      laneId: config.laneId,
      localSupportedAuthModes: config.localSupportedAuthModes,
      modelConfigId: config.modelConfigId,
      modelSnapshotId: config.modelSnapshotId,
      offlineExportSupportedAuthModes: config.offlineExportSupportedAuthModes,
      providerFamily: config.providerFamily,
      runMode: config.runMode,
      templateSourceRunId: config.templateSourceRunId,
      toolProfile: config.toolProfile
    })),
    portalRunPathPattern: "/runs/:runId",
    question
  } satisfies MathQuestionLaunchViewResponse;

  return {
    configs,
    question,
    source,
    view
  };
}

function requireLaunchConfig(
  context: LaunchContext,
  launchConfigId: string
) {
  const config = context.configs.find((entry) => entry.id === launchConfigId);

  if (!config) {
    throw new MathLaunchServiceError({
      code: "math_launch_config_not_found",
      issues: [
        {
          message: `Unknown launchConfigId ${launchConfigId}.`,
          path: "launchConfigId"
        }
      ],
      statusCode: 404
    });
  }

  return config;
}

function buildLaunchRecordDraft(options: {
  actorUserId: string;
  authMode: MathSingleRunLaunchTarget["authMode"];
  config: LaunchConfigRow;
  launchMode: LaunchRecordDraft["launchMode"];
  questionId: string;
  source: Problem9SourceBundle;
  sourceJobId: string | null;
}) {
  const sourceRunId = `run_${randomUUID()}`;
  const sourceAttemptId = `attempt_${randomUUID()}`;
  const promptPackageDigest = computePromptPackageDigest({
    authMode: options.authMode,
    benchmarkPackageDigest: options.config.benchmarkPackageDigest,
    benchmarkPackageVersion: options.config.benchmarkPackageVersion,
    config: options.config,
    source: options.source,
    sourceAttemptId,
    sourceJobId: options.sourceJobId,
    sourceRunId
  });

  return {
    actorUserId: options.actorUserId,
    authMode: options.authMode,
    config: options.config,
    launchMode: options.launchMode,
    promptPackageDigest,
    questionId: options.questionId,
    sourceAttemptId,
    sourceJobId: options.sourceJobId,
    sourceRunId,
    status:
      options.launchMode === "hosted"
        ? "hosted_enqueued"
        : options.launchMode === "local_connected"
          ? "local_bootstrap_issued"
          : "offline_exported"
  } satisfies LaunchRecordDraft;
}

async function insertLaunchRecord(
  tx: WriteExecutor,
  draft: LaunchRecordDraft
) {
  const [launchRecord] = await tx
    .insert(mathLaunchRecords)
    .values({
      authMode: draft.authMode,
      benchmarkItemId: "Problem9",
      benchmarkPackageDigest: draft.config.benchmarkPackageDigest,
      benchmarkPackageId: "firstproof/Problem9",
      benchmarkPackageVersion: draft.config.benchmarkPackageVersion,
      benchmarkVersionId: draft.config.benchmarkVersionId,
      configSourceRunId: draft.config.templateSourceRunId,
      harnessRevision: draft.config.harnessRevision,
      laneId: draft.config.laneId,
      launchMode: draft.launchMode,
      mathQuestionId: draft.questionId,
      modelConfigId: draft.config.modelConfigId,
      modelSnapshotId: draft.config.modelSnapshotId,
      promptPackageDigest: draft.promptPackageDigest,
      promptProtocolVersion: problem9PromptProtocolVersion,
      providerFamily: draft.config.providerFamily,
      requestedByUserId: draft.actorUserId,
      runMode: draft.config.runMode,
      sourceAttemptId: draft.sourceAttemptId,
      sourceJobId: draft.sourceJobId,
      sourceRunId: draft.sourceRunId,
      status: draft.status,
      toolProfile: draft.config.toolProfile,
      verifierVersion: draft.config.verifierVersion
    })
    .returning();

  if (!launchRecord) {
    throw new Error("Failed to persist math launch record.");
  }

  return launchRecord;
}

async function createKernelRowsForLaunch(
  tx: WriteExecutor,
  launchRecord: StoredLaunchRecord,
  options?: {
    claimedWorker?: {
      workerId: string;
      workerPool: string;
      workerRuntime: "local_docker" | "modal";
      workerVersion: string;
    };
  }
): Promise<KernelRunRows> {
  const now = new Date();
  const candidateDigest = buildPlaceholderDigest("candidate_pending", launchRecord.sourceAttemptId);
  const verdictDigest = buildPlaceholderDigest("verdict_pending", launchRecord.sourceAttemptId);
  const attemptEnvironmentDigest = buildPlaceholderDigest(
    "attempt_environment_pending",
    launchRecord.sourceAttemptId
  );
  const artifactManifestDigest = buildPlaceholderDigest(
    "artifact_manifest_pending",
    launchRecord.sourceAttemptId
  );
  const attemptBundleDigest = buildPlaceholderDigest(
    "attempt_bundle_pending",
    launchRecord.sourceAttemptId
  );
  const [runRow] = await tx
    .insert(runs)
    .values({
      authMode: launchRecord.authMode,
      benchmarkItemId: launchRecord.benchmarkItemId,
      benchmarkPackageDigest: launchRecord.benchmarkPackageDigest,
      benchmarkPackageId: launchRecord.benchmarkPackageId,
      benchmarkPackageVersion: launchRecord.benchmarkPackageVersion,
      bundleDigest: buildPlaceholderDigest("run_bundle_pending", launchRecord.sourceRunId),
      completedAt: now,
      environmentDigest: buildPlaceholderDigest(
        "run_environment_pending",
        launchRecord.sourceRunId
      ),
      harnessRevision: launchRecord.harnessRevision,
      importedAt: now,
      laneId: launchRecord.laneId,
      modelConfigId: launchRecord.modelConfigId,
      modelSnapshotId: launchRecord.modelSnapshotId,
      promptPackageDigest: launchRecord.promptPackageDigest,
      promptProtocolVersion: launchRecord.promptProtocolVersion,
      providerFamily: launchRecord.providerFamily,
      runConfigDigest: buildPlaceholderDigest("run_config_pending", launchRecord.sourceRunId),
      runKind: "single_run",
      runMode: launchRecord.runMode,
      sourceRunId: launchRecord.sourceRunId,
      state: options?.claimedWorker ? "running" : "queued",
      stopReason: pendingStopReason,
      toolProfile: launchRecord.toolProfile,
      updatedAt: now,
      verifierVersion: launchRecord.verifierVersion,
      verdictClass: pendingVerdictClass
    })
    .returning({
      id: runs.id,
      sourceRunId: runs.sourceRunId
    });

  if (!runRow) {
    throw new Error("Failed to persist launch run row.");
  }

  const [jobRow] = await tx
    .insert(jobs)
    .values({
      completedAt: now,
      importedAt: now,
      runId: runRow.id,
      sourceJobId: launchRecord.sourceJobId,
      state: options?.claimedWorker ? "claimed" : "queued",
      stopReason: pendingStopReason,
      updatedAt: now,
      verdictClass: pendingVerdictClass
    })
    .returning({
      id: jobs.id,
      sourceJobId: jobs.sourceJobId
    });

  if (!jobRow?.sourceJobId) {
    throw new Error("Failed to persist launch job row.");
  }

  const [attemptRow] = await tx
    .insert(attempts)
    .values({
      artifactManifestDigest,
      authMode: launchRecord.authMode,
      benchmarkPackageDigest: launchRecord.benchmarkPackageDigest,
      bundleDigest: attemptBundleDigest,
      candidateDigest,
      completedAt: now,
      environmentDigest: attemptEnvironmentDigest,
      harnessRevision: launchRecord.harnessRevision,
      importedAt: now,
      jobId: jobRow.id,
      laneId: launchRecord.laneId,
      modelConfigId: launchRecord.modelConfigId,
      modelSnapshotId: launchRecord.modelSnapshotId,
      promptPackageDigest: launchRecord.promptPackageDigest,
      promptProtocolVersion: launchRecord.promptProtocolVersion,
      providerFamily: launchRecord.providerFamily,
      runId: runRow.id,
      runMode: launchRecord.runMode,
      sourceAttemptId: launchRecord.sourceAttemptId,
      state: "prepared",
      stopReason: pendingStopReason,
      toolProfile: launchRecord.toolProfile,
      updatedAt: now,
      verifierResult: pendingVerifierResult,
      verifierVerdict: buildPendingVerifierVerdict({
        attemptId: launchRecord.sourceAttemptId,
        benchmarkPackageDigest: launchRecord.benchmarkPackageDigest,
        candidateDigest,
        laneId: launchRecord.laneId
      }),
      verifierVersion: launchRecord.verifierVersion,
      verdictClass: pendingVerdictClass,
      verdictDigest
    })
    .returning({
      id: attempts.id,
      sourceAttemptId: attempts.sourceAttemptId
    });

  if (!attemptRow) {
    throw new Error("Failed to persist launch attempt row.");
  }

  return {
    attemptId: attemptRow.sourceAttemptId,
    attemptRowId: attemptRow.id,
    jobId: jobRow.sourceJobId,
    jobRowId: jobRow.id,
    runId: runRow.sourceRunId,
    runRowId: runRow.id
  };
}

async function updateLaunchRecordRunLink(
  tx: WriteExecutor,
  launchId: string,
  runRowId: string,
  status: typeof mathLaunchRecords.$inferInsert.status,
  options?: {
    ingestedAt?: Date;
  }
) {
  await tx
    .update(mathLaunchRecords)
    .set({
      ingestedAt: options?.ingestedAt,
      runId: runRowId,
      status,
      updatedAt: new Date()
    })
    .where(eq(mathLaunchRecords.id, launchId));
}

function verifyOpaqueToken(providedToken: string, expectedHash: string) {
  const providedHash = sha256Text(providedToken);
  const providedBuffer = Buffer.from(providedHash);
  const expectedBuffer = Buffer.from(expectedHash);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function isUniqueConstraintError(error: unknown, constraintNames: Set<string>) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const databaseCode = "code" in error ? String(error.code) : null;
  const constraintName =
    "constraint_name" in error
      ? String(error.constraint_name)
      : "constraint" in error
        ? String(error.constraint)
        : null;

  return (
    databaseCode === "23505" &&
    constraintName !== null &&
    constraintNames.has(constraintName)
  );
}

export function createMathLaunchService(
  db: DbClient,
  options?: {
    harnessRegistry?: HarnessRegistryService;
  }
): MathLaunchService {
  const harnessRegistry = options?.harnessRegistry ?? createHarnessRegistryService();

  return {
    async getQuestionLaunchView(questionId) {
      const context = await loadLaunchContext(db, harnessRegistry, questionId);
      return context?.view ?? null;
    },

    async createHostedLaunch(questionId, input, actorUserId) {
      const context = await loadLaunchContext(db, harnessRegistry, questionId);

      if (!context) {
        throw new MathLaunchServiceError({
          code: "math_question_not_found",
          statusCode: 404
        });
      }

      const config = requireLaunchConfig(context, input.launchConfigId);

      if (!config.hostedSupported) {
        throw new MathLaunchServiceError({
          code: "math_hosted_launch_not_supported",
          issues: [
            {
              message: "This launch configuration is not currently supported for hosted execution.",
              path: "launchConfigId"
            }
          ],
          statusCode: 409
        });
      }

      return db.transaction(async (tx) => {
        const draft = buildLaunchRecordDraft({
          actorUserId,
          authMode: "machine_api_key",
          config,
          launchMode: "hosted",
          questionId,
          source: context.source,
          sourceJobId: `job_${randomUUID()}`
        });
        const launchRecord = await insertLaunchRecord(tx, draft);
        const kernelRows = await createKernelRowsForLaunch(tx, launchRecord);

        await updateLaunchRecordRunLink(tx, launchRecord.id, kernelRows.runRowId, "hosted_enqueued");

        return {
          launchId: launchRecord.id,
          portalRunPath: buildPortalRunPath(kernelRows.runId),
          questionId,
          run: {
            attemptId: kernelRows.attemptId,
            jobId: kernelRows.jobId,
            runId: kernelRows.runId
          },
          target: buildSingleRunTarget(launchRecord)
        } satisfies MathHostedLaunchCreateResponse;
      });
    },

    async createLocalBootstrap(questionId, input, actorUserId) {
      const context = await loadLaunchContext(db, harnessRegistry, questionId);

      if (!context) {
        throw new MathLaunchServiceError({
          code: "math_question_not_found",
          statusCode: 404
        });
      }

      const config = requireLaunchConfig(context, input.launchConfigId);

      if (!config.localSupportedAuthModes.includes(input.authMode)) {
        throw new MathLaunchServiceError({
          code: "math_local_auth_mode_not_supported",
          issues: [
            {
              message: `Auth mode ${input.authMode} is not supported for this launch configuration.`,
              path: "authMode"
            }
          ],
          statusCode: 409
        });
      }

      return db.transaction(async (tx) => {
        const draft = buildLaunchRecordDraft({
          actorUserId,
          authMode: input.authMode,
          config,
          launchMode: "local_connected",
          questionId,
          source: context.source,
          sourceJobId: `job_${randomUUID()}`
        });
        const launchRecord = await insertLaunchRecord(tx, draft);
        const bootstrapToken = issueWorkerJobToken();
        const expiresAt = addSeconds(new Date(), localBootstrapSessionLifetimeSeconds);
        const [session] = await tx
          .insert(mathRunnerBootstrapSessions)
          .values({
            expiresAt,
            mathLaunchRecordId: launchRecord.id,
            requestedByUserId: actorUserId,
            sessionTokenHash: bootstrapToken.tokenHash
          })
          .returning({
            id: mathRunnerBootstrapSessions.id
          });

        if (!session) {
          throw new Error("Failed to persist math runner bootstrap session.");
        }

        return {
          bootstrapSession: {
            expiresAt: expiresAt.toISOString(),
            sessionId: session.id,
            sessionToken: bootstrapToken.token
          },
          launchId: launchRecord.id,
          questionId,
          sourceAttemptId: launchRecord.sourceAttemptId,
          sourceJobId: launchRecord.sourceJobId!,
          sourceRunId: launchRecord.sourceRunId,
          target: buildSingleRunTarget(launchRecord)
        } satisfies MathLocalConnectedLaunchCreateResponse;
      });
    },

    async createOfflineExport(questionId, input, actorUserId) {
      const context = await loadLaunchContext(db, harnessRegistry, questionId);

      if (!context) {
        throw new MathLaunchServiceError({
          code: "math_question_not_found",
          statusCode: 404
        });
      }

      const config = requireLaunchConfig(context, input.launchConfigId);

      if (!config.offlineExportSupportedAuthModes.includes(input.authMode)) {
        throw new MathLaunchServiceError({
          code: "math_offline_export_auth_mode_not_supported",
          issues: [
            {
              message: `Auth mode ${input.authMode} is not supported for offline export on this launch configuration.`,
              path: "authMode"
            }
          ],
          statusCode: 409
        });
      }

      return db.transaction(async (tx) => {
        const draft = buildLaunchRecordDraft({
          actorUserId,
          authMode: input.authMode,
          config,
          launchMode: "offline_export",
          questionId,
          source: context.source,
          sourceJobId: null
        });
        const launchRecord = await insertLaunchRecord(tx, draft);

        return {
          launchId: launchRecord.id,
          questionId,
          sourceAttemptId: launchRecord.sourceAttemptId,
          sourceJobId: null,
          sourceRunId: launchRecord.sourceRunId,
          target: buildSingleRunTarget(launchRecord)
        } satisfies MathOfflineExportCreateResponse;
      });
    },

    async redeemRunnerBootstrapSession(bootstrapSessionId, input) {
      if (!supportsLocalRunnerIdentity(input)) {
        throw new MathLaunchServiceError({
          code: "math_runner_bootstrap_identity_not_supported",
          issues: [
            {
              message:
                "Local runner bootstrap redemption only supports local_docker workers in the reserved local-* pool namespace.",
              path: "workerRuntime"
            },
            {
              message:
                "Local runner bootstrap redemption only supports local_docker workers in the reserved local-* pool namespace.",
              path: "workerPool"
            }
          ],
          statusCode: 409
        });
      }

      if (!supportsRunnerBootstrap(input)) {
        throw new MathLaunchServiceError({
          code: "math_local_runner_incompatible",
          issues: [
            {
              message:
                "The local runner must support single_run, offline bundle compatibility, and the required Problem 9 artifact roles.",
              path: "supportedArtifactRoles"
            }
          ],
          statusCode: 409
        });
      }

      const [session] = await db
        .select({
          expiresAt: mathRunnerBootstrapSessions.expiresAt,
          id: mathRunnerBootstrapSessions.id,
          mathLaunchRecordId: mathRunnerBootstrapSessions.mathLaunchRecordId,
          redeemedAt: mathRunnerBootstrapSessions.redeemedAt,
          revokedAt: mathRunnerBootstrapSessions.revokedAt,
          sessionTokenHash: mathRunnerBootstrapSessions.sessionTokenHash
        })
        .from(mathRunnerBootstrapSessions)
        .where(eq(mathRunnerBootstrapSessions.id, bootstrapSessionId));

      if (!session) {
        throw new MathLaunchServiceError({
          code: "math_runner_bootstrap_session_not_found",
          statusCode: 404
        });
      }

      if (!verifyOpaqueToken(input.sessionToken, session.sessionTokenHash)) {
        throw new MathLaunchServiceError({
          code: "math_runner_bootstrap_session_invalid",
          statusCode: 401
        });
      }

      const now = new Date();

      if (session.revokedAt || session.redeemedAt || session.expiresAt.getTime() <= now.getTime()) {
        throw new MathLaunchServiceError({
          code: "math_runner_bootstrap_session_expired",
          statusCode: 409
        });
      }

      try {
        return await db.transaction(async (tx) => {
          const [launchRecord] = await tx
            .select()
            .from(mathLaunchRecords)
            .where(eq(mathLaunchRecords.id, session.mathLaunchRecordId));

          if (!launchRecord) {
            throw new MathLaunchServiceError({
              code: "math_launch_not_found",
              statusCode: 404
            });
          }

          if (launchRecord.runId) {
            throw new MathLaunchServiceError({
              code: "math_runner_bootstrap_session_already_redeemed",
              statusCode: 409
            });
          }

          const issuedAt = new Date();
          const workerPoolDefinitionId = await upsertLocalRunnerWorkerPoolDefinition(
            tx,
            {
              workerPool: input.workerPool,
              workerRuntime: input.workerRuntime
            },
            issuedAt
          );
          const workerInstanceId = await upsertLocalRunnerWorkerInstance(tx, {
            currentLifecycleState: "running",
            lastClaimAt: issuedAt,
            lastLeaseActivityAt: issuedAt,
            now: issuedAt,
            workerInstanceKey: buildLocalRunnerWorkerInstanceKey(session.id),
            workerPoolDefinitionId,
            workerRuntime: input.workerRuntime,
            workerVersion: input.workerVersion
          });
          const kernelRows = await createKernelRowsForLaunch(tx, launchRecord, {
            claimedWorker: {
              workerId: input.workerId,
              workerPool: input.workerPool,
              workerRuntime: input.workerRuntime,
              workerVersion: input.workerVersion
            }
          });
          const leaseExpiresAt = addSeconds(issuedAt, problem9WorkerHeartbeatTimeoutSeconds);
          const jobTokenExpiresAt = createProblem9JobTokenExpiry(issuedAt);
          const jobToken = issueWorkerJobToken();
          const [lease] = await tx
            .insert(workerJobLeases)
            .values({
              attemptId: kernelRows.attemptRowId,
              heartbeatIntervalSeconds: problem9WorkerHeartbeatIntervalSeconds,
              heartbeatTimeoutSeconds: problem9WorkerHeartbeatTimeoutSeconds,
              jobId: kernelRows.jobRowId,
              jobTokenExpiresAt,
              jobTokenHash: jobToken.tokenHash,
              jobTokenScopes: [
                "heartbeat",
                "event_append",
                "artifact_manifest_write",
                "verifier_verdict_write",
                "result_finalize",
                "failure_finalize"
              ],
              leaseExpiresAt,
              runId: kernelRows.runRowId,
              workerInstanceId,
              workerId: input.workerId,
              workerPool: input.workerPool,
              workerRuntime: input.workerRuntime,
              workerVersion: input.workerVersion
            })
            .returning({
              id: workerJobLeases.id
            });

          if (!lease) {
            throw new Error("Failed to hydrate local bootstrap lease token.");
          }

          await updateLaunchRecordRunLink(
            tx,
            launchRecord.id,
            kernelRows.runRowId,
            "local_bootstrap_redeemed"
          );
          await tx
            .update(mathRunnerBootstrapSessions)
            .set({
              redeemedAt: new Date(),
              updatedAt: new Date()
            })
            .where(eq(mathRunnerBootstrapSessions.id, session.id));

          return {
            launchId: launchRecord.id,
            workerJob: createProblem9WorkerActiveJob({
              attemptId: kernelRows.attemptId,
              jobId: kernelRows.jobId,
              jobToken: jobToken.token,
              jobTokenExpiresAt,
              leaseExpiresAt,
              leaseId: lease.id,
              runId: kernelRows.runId,
              target: buildSingleRunTarget(launchRecord)
            })
          } satisfies MathRunnerBootstrapSessionRedeemResponse;
        });
      } catch (error) {
        if (isUniqueConstraintError(error, runnerBootstrapRedeemDuplicateConstraints)) {
          throw new MathLaunchServiceError({
            code: "math_runner_bootstrap_session_already_redeemed",
            statusCode: 409
          });
        }

        throw error;
      }
    },

    async attachOfflineIngestToLaunch(options) {
      const executor = options.executor ?? db;
      const [launchRecord] = await executor
        .select({
          id: mathLaunchRecords.id,
          launchMode: mathLaunchRecords.launchMode,
          runId: mathLaunchRecords.runId,
          sourceRunId: mathLaunchRecords.sourceRunId
        })
        .from(mathLaunchRecords)
        .where(eq(mathLaunchRecords.id, options.mathLaunchId));

      if (!launchRecord) {
        throw new MathLaunchServiceError({
          code: "math_launch_not_found",
          statusCode: 404
        });
      }

      if (launchRecord.launchMode !== "offline_export") {
        throw new MathLaunchServiceError({
          code: "math_launch_not_offline_export",
          statusCode: 409
        });
      }

      if (launchRecord.sourceRunId !== options.sourceRunId) {
        throw new MathLaunchServiceError({
          code: "math_launch_source_run_mismatch",
          statusCode: 409
        });
      }

      if (launchRecord.runId) {
        throw new MathLaunchServiceError({
          code: "math_launch_already_linked",
          statusCode: 409
        });
      }

      const [linkedLaunch] = await executor
        .update(mathLaunchRecords)
        .set({
          ingestedAt: new Date(),
          runId: options.runRowId,
          status: "offline_ingested",
          updatedAt: new Date()
        })
        .where(
          and(
            eq(mathLaunchRecords.id, launchRecord.id),
            isNull(mathLaunchRecords.runId)
          )
        )
        .returning({
          id: mathLaunchRecords.id
        });

      if (!linkedLaunch) {
        throw new MathLaunchServiceError({
          code: "math_launch_already_linked",
          statusCode: 409
        });
      }
    }
  };
}
