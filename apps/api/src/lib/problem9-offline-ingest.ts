import { createHash } from "node:crypto";
import {
  problem9OfflineIngestRequestSchema,
  type Problem9BenchmarkPackageManifest,
  type Problem9EnvironmentManifest,
  type Problem9FailureClassification,
  type Problem9OfflineArtifactManifest,
  type Problem9OfflineIngestBundle,
  type Problem9OfflineIngestRequest,
  type Problem9OfflineIngestResponse,
  type Problem9PromptPackageManifest,
  type Problem9RunBundleManifest,
  type Problem9VerifierVerdict
} from "@paretoproof/shared";
import { eq } from "drizzle-orm";
import {
  artifacts,
  attempts,
  artifactClassEnum,
  artifactLifecycleStateEnum,
  artifactPrefixFamilyEnum,
  artifactStorageProviderEnum,
  jobs,
  runs,
} from "../db/schema.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";

const requiredManifestPaths = [
  "package/benchmark-package.json",
  "package/package-ref.json",
  "prompt/prompt-package.json",
  "candidate/Candidate.lean",
  "verification/compiler-diagnostics.json",
  "verification/compiler-output.txt",
  "verification/verdict.json",
  "verification/verifier-output.json",
  "environment/environment.json"
] as const;

const benchmarkExpectedHashPaths = [
  "FirstProof/Problem9/Gold.lean",
  "FirstProof/Problem9/Statement.lean",
  "FirstProof/Problem9/Support.lean",
  "LICENSE",
  "README.md",
  "lake-manifest.json",
  "lakefile.toml",
  "lean-toolchain",
  "statements/problem.md"
] as const;

type Problem9OfflineIngestArtifactDraft = {
  artifactClassId: (typeof artifactClassEnum.enumValues)[number];
  artifactManifestDigest: string | null;
  bucketName: string;
  byteSize: number;
  contentEncoding: string | null;
  lifecycleState: (typeof artifactLifecycleStateEnum.enumValues)[number];
  mediaType: string | null;
  objectKey: string;
  prefixFamily: (typeof artifactPrefixFamilyEnum.enumValues)[number];
  providerEtag: null;
  relativePath: string;
  requiredForIngest: boolean;
  sha256: string;
  storageProvider: (typeof artifactStorageProviderEnum.enumValues)[number];
};

type Problem9OfflineArtifactManifestEntry = Problem9OfflineArtifactManifest["artifacts"][number];
type Problem9ImportedRunState = Problem9OfflineIngestResponse["run"]["state"];
type Problem9ImportedJobState = Problem9OfflineIngestResponse["job"]["state"];
type Problem9ImportedAttemptState = Problem9OfflineIngestResponse["attempt"]["state"];
type Problem9ImportedVerdictClass = Problem9OfflineIngestResponse["attempt"]["verdictClass"];
type Problem9OfflineRunInsert = Omit<typeof runs.$inferInsert, "runKind" | "state" | "verdictClass"> & {
  runKind: "single_run";
  state: Problem9ImportedRunState;
  verdictClass: Problem9ImportedVerdictClass;
};
type Problem9OfflineJobInsert = Omit<typeof jobs.$inferInsert, "runId" | "state" | "verdictClass"> & {
  state: Problem9ImportedJobState;
  verdictClass: Problem9ImportedVerdictClass;
};
type Problem9OfflineAttemptInsert = Omit<
  typeof attempts.$inferInsert,
  "jobId" | "runId" | "state" | "verdictClass"
> & {
  state: Problem9ImportedAttemptState;
  verdictClass: Problem9ImportedVerdictClass;
};

type Problem9OfflineIngestPlan = {
  artifacts: Problem9OfflineIngestArtifactDraft[];
  attempt: Problem9OfflineAttemptInsert;
  job: Problem9OfflineJobInsert;
  run: Problem9OfflineRunInsert;
};

type Problem9OfflineIngestService = (
  rawRequest: unknown,
  actorUserId: string
) => Promise<Problem9OfflineIngestResponse>;

export class Problem9OfflineIngestValidationError extends Error {
  code: string;
  issues: Array<{ message: string; path?: string }>;
  statusCode: number;

  constructor(options: {
    code: string;
    issues: Array<{ message: string; path?: string }>;
    statusCode: number;
  }) {
    super(options.code);
    this.name = "Problem9OfflineIngestValidationError";
    this.code = options.code;
    this.issues = options.issues;
    this.statusCode = options.statusCode;
  }
}

export class Problem9OfflineIngestDuplicateError extends Error {
  code = "offline_ingest_duplicate_run";
  statusCode = 409;

  constructor(readonly sourceRunId: string) {
    super(`Offline ingest already exists for run ${sourceRunId}.`);
    this.name = "Problem9OfflineIngestDuplicateError";
  }
}

export function createProblem9OfflineIngestService(
  db: ReturnTypeOfCreateDbClient
): Problem9OfflineIngestService {
  return async (rawRequest, _actorUserId) => {
    const plan = buildProblem9OfflineIngestPlan(rawRequest);

    return db.transaction(async (tx) => {
      const existingRun = await tx.query.runs.findFirst({
        where: eq(runs.sourceRunId, plan.run.sourceRunId)
      });

      if (existingRun) {
        throw new Problem9OfflineIngestDuplicateError(plan.run.sourceRunId);
      }

      const [persistedRun] = await tx
        .insert(runs)
        .values(plan.run)
        .returning({
          id: runs.id,
          sourceRunId: runs.sourceRunId,
          state: runs.state
        });

      if (!persistedRun) {
        throw new Error("Failed to persist the imported run record.");
      }

      const [persistedJob] = await tx
        .insert(jobs)
        .values({
          ...plan.job,
          runId: persistedRun.id
        })
        .returning({
          id: jobs.id,
          sourceJobId: jobs.sourceJobId,
          state: jobs.state
        });

      if (!persistedJob) {
        throw new Error("Failed to persist the imported job record.");
      }

      const [persistedAttempt] = await tx
        .insert(attempts)
        .values({
          ...plan.attempt,
          jobId: persistedJob.id,
          runId: persistedRun.id
        })
        .returning({
          id: attempts.id,
          sourceAttemptId: attempts.sourceAttemptId,
          state: attempts.state,
          verdictClass: attempts.verdictClass
        });

      if (!persistedAttempt) {
        throw new Error("Failed to persist the imported attempt record.");
      }

      await tx.insert(artifacts).values(
        plan.artifacts.map((artifactDraft) => ({
          ...artifactDraft,
          attemptId: persistedAttempt.id,
          jobId: persistedJob.id,
          ownerScope: "run_attempt" as const,
          runId: persistedRun.id
        }))
      );

      return {
        artifactCount: plan.artifacts.length,
        attempt: {
          id: persistedAttempt.id,
          sourceAttemptId: persistedAttempt.sourceAttemptId,
          state: plan.attempt.state,
          verdictClass: plan.attempt.verdictClass
        },
        job: {
          id: persistedJob.id,
          sourceJobId: persistedJob.sourceJobId,
          state: plan.job.state
        },
        run: {
          id: persistedRun.id,
          sourceRunId: persistedRun.sourceRunId,
          state: plan.run.state
        }
      } satisfies Problem9OfflineIngestResponse;
    });
  };
}

export function buildProblem9OfflineIngestPlan(rawRequest: unknown): Problem9OfflineIngestPlan {
  const parsedRequest = problem9OfflineIngestRequestSchema.safeParse(rawRequest);

  if (!parsedRequest.success) {
    throw new Problem9OfflineIngestValidationError({
      code: "invalid_problem9_offline_ingest_payload",
      issues: parsedRequest.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.join(".")
      })),
      statusCode: 400
    });
  }

  const request = parsedRequest.data as Problem9OfflineIngestRequest;
  const bundle = request.bundle;
  const manifestEntriesByPath = new Map<string, Problem9OfflineArtifactManifestEntry>(
    bundle.artifactManifest.artifacts.map((entry) => [entry.relativePath, entry])
  );

  assertNoDuplicateManifestPaths(bundle.artifactManifest);
  assertRequiredManifestEntries(bundle.artifactManifest);
  assertDigest(
    computeBenchmarkPackageDigest(bundle.benchmarkPackage),
    bundle.benchmarkPackage.packageDigest,
    "package/benchmark-package.json packageDigest",
    "bundle_digest_mismatch"
  );
  assertDigest(
    computePromptPackageDigest(bundle.promptPackage),
    bundle.promptPackage.promptPackageDigest,
    "prompt/prompt-package.json promptPackageDigest",
    "bundle_digest_mismatch"
  );
  assertDigest(
    sha256Text(stableStringify(bundle.environment)),
    bundle.runBundle.environmentDigest,
    "environment/environment.json environmentDigest",
    "bundle_digest_mismatch"
  );
  assertDigest(
    sha256Text(toWrittenText(bundle.candidateSource)),
    bundle.runBundle.candidateDigest,
    "candidate/Candidate.lean candidateDigest",
    "bundle_digest_mismatch"
  );
  assertDigest(
    sha256Text(stableStringify(bundle.verdict)),
    bundle.runBundle.verdictDigest,
    "verification/verdict.json verdictDigest",
    "bundle_digest_mismatch"
  );
  assertDigest(
    sha256Text(toWrittenText(stableStringify(bundle.artifactManifest))),
    bundle.runBundle.artifactManifestDigest,
    "artifact-manifest.json artifactManifestDigest",
    "bundle_digest_mismatch"
  );

  validateProvidedManifestEntry(
    manifestEntriesByPath,
    "package/benchmark-package.json",
    toWrittenText(stableStringify(bundle.benchmarkPackage))
  );
  validateProvidedManifestEntry(
    manifestEntriesByPath,
    "package/package-ref.json",
    toWrittenText(stableStringify(bundle.packageRef))
  );
  validateProvidedManifestEntry(
    manifestEntriesByPath,
    "prompt/prompt-package.json",
    toWrittenText(stableStringify(bundle.promptPackage))
  );
  validateProvidedManifestEntry(
    manifestEntriesByPath,
    "candidate/Candidate.lean",
    toWrittenText(bundle.candidateSource)
  );
  validateProvidedManifestEntry(
    manifestEntriesByPath,
    "verification/compiler-diagnostics.json",
    toWrittenText(stableStringify(bundle.compilerDiagnostics))
  );
  validateProvidedManifestEntry(
    manifestEntriesByPath,
    "verification/compiler-output.txt",
    toWrittenText(bundle.compilerOutput)
  );
  validateProvidedManifestEntry(
    manifestEntriesByPath,
    "verification/verdict.json",
    toWrittenText(stableStringify(bundle.verdict))
  );
  validateProvidedManifestEntry(
    manifestEntriesByPath,
    "verification/verifier-output.json",
    toWrittenText(stableStringify(bundle.verifierOutput))
  );
  validateProvidedManifestEntry(
    manifestEntriesByPath,
    "environment/environment.json",
    toWrittenText(stableStringify(bundle.environment))
  );

  if (bundle.usage !== null) {
    validateProvidedManifestEntry(
      manifestEntriesByPath,
      "execution/usage.json",
      toWrittenText(stableStringify(bundle.usage))
    );
  }

  assertConsistency(bundle);

  const computedRunConfigDigest = computeRunConfigDigest(bundle);
  assertDigest(
    computedRunConfigDigest,
    bundle.runBundle.runConfigDigest,
    "run-bundle.json runConfigDigest",
    "bundle_digest_mismatch"
  );

  const computedBundleDigest = computeBundleDigest(bundle.runBundle, bundle.artifactManifest);
  assertDigest(
    computedBundleDigest,
    bundle.runBundle.bundleDigest,
    "run-bundle.json bundleDigest",
    "bundle_digest_mismatch"
  );

  const runState: Problem9ImportedRunState =
    bundle.verdict.result === "pass" ? "succeeded" : "failed";
  const jobState: Problem9ImportedJobState =
    bundle.verdict.result === "pass" ? "completed" : "failed";
  const attemptState: Problem9ImportedAttemptState =
    bundle.verdict.result === "pass" ? "succeeded" : "failed";
  const verdictClass: Problem9ImportedVerdictClass = bundle.verdict.result;
  const bucketName = resolveArtifactBucketName();
  const rootArtifactDrafts = buildRootArtifactDrafts(bundle, bucketName);
  const manifestArtifactDrafts = bundle.artifactManifest.artifacts.map((entry) =>
    buildManifestArtifactDraft(entry, bucketName, bundle.runBundle.runId, bundle.runBundle.attemptId)
  );
  const artifactDrafts = [...rootArtifactDrafts, ...manifestArtifactDrafts].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
  const primaryFailure = bundle.verdict.result === "fail" ? bundle.verdict.primaryFailure : null;
  const completedAt = new Date();

  return {
    artifacts: artifactDrafts,
    attempt: {
      artifactManifestDigest: bundle.runBundle.artifactManifestDigest,
      authMode: bundle.runBundle.authMode,
      benchmarkPackageDigest: bundle.runBundle.benchmarkPackageDigest,
      bundleDigest: bundle.runBundle.bundleDigest,
      candidateDigest: bundle.runBundle.candidateDigest,
      completedAt,
      environmentDigest: bundle.runBundle.environmentDigest,
      failureClassification: primaryFailure,
      harnessRevision: bundle.runBundle.harnessRevision,
      importedAt: completedAt,
      laneId: bundle.runBundle.laneId,
      modelConfigId: bundle.runBundle.modelConfigId,
      modelSnapshotId: bundle.runBundle.modelSnapshotId,
      primaryFailureCode: primaryFailure?.failureCode ?? null,
      primaryFailureFamily: primaryFailure?.failureFamily ?? null,
      primaryFailureSummary: primaryFailure?.summary ?? null,
      promptPackageDigest: bundle.runBundle.promptPackageDigest,
      promptProtocolVersion: bundle.runBundle.promptProtocolVersion,
      providerFamily: bundle.runBundle.providerFamily,
      runMode: bundle.runBundle.runMode,
      sourceAttemptId: bundle.runBundle.attemptId,
      state: attemptState,
      stopReason: bundle.runBundle.stopReason,
      toolProfile: bundle.runBundle.toolProfile,
      usageSummary: toJsonRecordOrNull(bundle.usage),
      verifierResult: bundle.verdict.result,
      verifierVerdict: bundle.verdict,
      verifierVersion: bundle.runBundle.verifierVersion,
      verdictClass,
      verdictDigest: bundle.runBundle.verdictDigest
    },
    job: {
      completedAt,
      importedAt: completedAt,
      primaryFailureCode: primaryFailure?.failureCode ?? null,
      primaryFailureFamily: primaryFailure?.failureFamily ?? null,
      primaryFailureSummary: primaryFailure?.summary ?? null,
      sourceJobId: bundle.runBundle.jobId,
      state: jobState,
      stopReason: bundle.runBundle.stopReason,
      verdictClass
    },
    run: {
      authMode: bundle.runBundle.authMode,
      benchmarkItemId: bundle.runBundle.benchmarkItemId,
      benchmarkPackageDigest: bundle.runBundle.benchmarkPackageDigest,
      benchmarkPackageId: bundle.runBundle.benchmarkPackageId,
      benchmarkPackageVersion: bundle.runBundle.benchmarkPackageVersion,
      bundleDigest: bundle.runBundle.bundleDigest,
      completedAt,
      environmentDigest: bundle.runBundle.environmentDigest,
      harnessRevision: bundle.runBundle.harnessRevision,
      importedAt: completedAt,
      laneId: bundle.runBundle.laneId,
      modelConfigId: bundle.runBundle.modelConfigId,
      modelSnapshotId: bundle.runBundle.modelSnapshotId,
      primaryFailureCode: primaryFailure?.failureCode ?? null,
      primaryFailureFamily: primaryFailure?.failureFamily ?? null,
      primaryFailureSummary: primaryFailure?.summary ?? null,
      promptPackageDigest: bundle.runBundle.promptPackageDigest,
      promptProtocolVersion: bundle.runBundle.promptProtocolVersion,
      providerFamily: bundle.runBundle.providerFamily,
      runConfigDigest: bundle.runBundle.runConfigDigest,
      runKind: "single_run",
      runMode: bundle.runBundle.runMode,
      sourceRunId: bundle.runBundle.runId,
      state: runState,
      stopReason: bundle.runBundle.stopReason,
      toolProfile: bundle.runBundle.toolProfile,
      verifierVersion: bundle.runBundle.verifierVersion,
      verdictClass
    }
  };
}

function assertNoDuplicateManifestPaths(artifactManifest: Problem9OfflineArtifactManifest) {
  const seenPaths = new Set<string>();

  for (const artifact of artifactManifest.artifacts) {
    if (seenPaths.has(artifact.relativePath)) {
      throw validationError(
        "bundle_manifest_duplicate_path",
        `artifact-manifest.json contains a duplicate relative path: ${artifact.relativePath}.`,
        "artifact-manifest.json"
      );
    }

    seenPaths.add(artifact.relativePath);
  }
}

function assertRequiredManifestEntries(artifactManifest: Problem9OfflineArtifactManifest) {
  const manifestPaths = new Set(artifactManifest.artifacts.map((artifact) => artifact.relativePath));

  for (const requiredPath of requiredManifestPaths) {
    if (!manifestPaths.has(requiredPath)) {
      throw validationError(
        "required_artifact_missing",
        `artifact-manifest.json is missing the required ingest artifact ${requiredPath}.`,
        requiredPath
      );
    }
  }
}

function validateProvidedManifestEntry(
  manifestEntriesByPath: Map<string, Problem9OfflineArtifactManifestEntry>,
  relativePath: string,
  normalizedContents: string
) {
  const entry = manifestEntriesByPath.get(relativePath);

  if (!entry) {
    throw validationError(
      "required_artifact_missing",
      `artifact-manifest.json is missing the required ingest artifact ${relativePath}.`,
      relativePath
    );
  }

  assertDigest(
    sha256Text(normalizedContents),
    entry.sha256,
    `${relativePath} sha256`,
    "bundle_digest_mismatch"
  );

  const byteSize = Buffer.byteLength(normalizedContents, "utf8");

  if (byteSize !== entry.byteSize) {
    throw validationError(
      "bundle_digest_mismatch",
      `${relativePath} byteSize does not match artifact-manifest.json.`,
      relativePath
    );
  }
}

function assertConsistency(bundle: Problem9OfflineIngestBundle) {
  if (bundle.packageRef.benchmarkPackageDigest !== bundle.benchmarkPackage.packageDigest) {
    throw validationError(
      "identity_inconsistent",
      "package/package-ref.json benchmarkPackageDigest does not match package/benchmark-package.json.",
      "package/package-ref.json"
    );
  }

  if (bundle.packageRef.benchmarkPackageVersion !== bundle.benchmarkPackage.packageVersion) {
    throw validationError(
      "identity_inconsistent",
      "package/package-ref.json benchmarkPackageVersion does not match package/benchmark-package.json.",
      "package/package-ref.json"
    );
  }

  if (bundle.promptPackage.benchmarkPackageDigest !== bundle.benchmarkPackage.packageDigest) {
    throw validationError(
      "identity_inconsistent",
      "prompt/prompt-package.json benchmarkPackageDigest does not match package/benchmark-package.json.",
      "prompt/prompt-package.json"
    );
  }

  if (bundle.promptPackage.benchmarkPackageVersion !== bundle.benchmarkPackage.packageVersion) {
    throw validationError(
      "identity_inconsistent",
      "prompt/prompt-package.json benchmarkPackageVersion does not match package/benchmark-package.json.",
      "prompt/prompt-package.json"
    );
  }

  if (bundle.promptPackage.benchmarkItemId !== bundle.packageRef.benchmarkItemId) {
    throw validationError(
      "identity_inconsistent",
      "prompt/prompt-package.json benchmarkItemId does not match package/package-ref.json.",
      "prompt/prompt-package.json"
    );
  }

  if (bundle.runBundle.runId !== bundle.verdict.runId) {
    throw validationError(
      "identity_inconsistent",
      "run-bundle.json runId does not match verification/verdict.json.",
      "run-bundle.json"
    );
  }

  if (bundle.runBundle.attemptId !== bundle.verdict.attemptId) {
    throw validationError(
      "identity_inconsistent",
      "run-bundle.json attemptId does not match verification/verdict.json.",
      "run-bundle.json"
    );
  }

  if (bundle.runBundle.benchmarkPackageDigest !== bundle.packageRef.benchmarkPackageDigest) {
    throw validationError(
      "identity_inconsistent",
      "run-bundle.json benchmarkPackageDigest does not match package/package-ref.json.",
      "run-bundle.json"
    );
  }

  if (bundle.runBundle.promptPackageDigest !== bundle.promptPackage.promptPackageDigest) {
    throw validationError(
      "identity_inconsistent",
      "run-bundle.json promptPackageDigest does not match prompt/prompt-package.json.",
      "run-bundle.json"
    );
  }

  if (bundle.runBundle.environmentDigest !== sha256Text(stableStringify(bundle.environment))) {
    throw validationError(
      "bundle_digest_mismatch",
      "run-bundle.json environmentDigest does not match environment/environment.json.",
      "run-bundle.json"
    );
  }

  if (bundle.environment.harnessRevision !== bundle.runBundle.harnessRevision) {
    throw validationError(
      "identity_inconsistent",
      "environment/environment.json harnessRevision does not match run-bundle.json.",
      "environment/environment.json"
    );
  }

  if (bundle.environment.modelSnapshotId !== bundle.runBundle.modelSnapshotId) {
    throw validationError(
      "identity_inconsistent",
      "environment/environment.json modelSnapshotId does not match run-bundle.json.",
      "environment/environment.json"
    );
  }

  if (bundle.verdict.candidateDigest !== bundle.runBundle.candidateDigest) {
    throw validationError(
      "identity_inconsistent",
      "verification/verdict.json candidateDigest does not match run-bundle.json.",
      "verification/verdict.json"
    );
  }

  if (bundle.verdict.benchmarkPackageDigest !== bundle.runBundle.benchmarkPackageDigest) {
    throw validationError(
      "identity_inconsistent",
      "verification/verdict.json benchmarkPackageDigest does not match run-bundle.json.",
      "verification/verdict.json"
    );
  }

  if (bundle.verdict.laneId !== bundle.runBundle.laneId) {
    throw validationError(
      "identity_inconsistent",
      "verification/verdict.json laneId does not match run-bundle.json.",
      "verification/verdict.json"
    );
  }

  if (bundle.verdict.result === "pass") {
    if (bundle.runBundle.status !== "success") {
      throw validationError(
        "verdict_inconsistent",
        "run-bundle.json status must be success when verification/verdict.json result is pass.",
        "run-bundle.json"
      );
    }

    if (bundle.verdict.semanticEquality !== "matched") {
      throw validationError(
        "verdict_inconsistent",
        "Passing verifier verdicts require semanticEquality=matched.",
        "verification/verdict.json"
      );
    }

    if (bundle.verdict.containsAdmit || bundle.verdict.containsSorry) {
      throw validationError(
        "verdict_inconsistent",
        "Passing verifier verdicts may not contain sorry or admit.",
        "verification/verdict.json"
      );
    }

    if (bundle.verdict.axiomCheck !== "passed") {
      throw validationError(
        "verdict_inconsistent",
        "Passing verifier verdicts require axiomCheck=passed.",
        "verification/verdict.json"
      );
    }

    if (bundle.verdict.diagnosticGate !== "passed") {
      throw validationError(
        "verdict_inconsistent",
        "Passing verifier verdicts require diagnosticGate=passed.",
        "verification/verdict.json"
      );
    }
  } else {
    const primaryFailure = bundle.verdict.primaryFailure;

    if (primaryFailure === null) {
      throw validationError(
        "verdict_inconsistent",
        "Failing verifier verdicts require a primaryFailure classification.",
        "verification/verdict.json"
      );
    }

    if (bundle.runBundle.status !== "failure") {
      throw validationError(
        "verdict_inconsistent",
        "run-bundle.json status must be failure when verification/verdict.json result is fail.",
        "run-bundle.json"
      );
    }

    if (primaryFailure.failureCode !== bundle.verdict.failureCode) {
      throw validationError(
        "verdict_inconsistent",
        "verification/verdict.json failureCode must match primaryFailure.failureCode.",
        "verification/verdict.json"
      );
    }
  }
}

function computeBenchmarkPackageDigest(manifest: Problem9BenchmarkPackageManifest) {
  const declaredHashPaths = Object.keys(manifest.hashes).sort();
  const expectedHashPaths = [...benchmarkExpectedHashPaths].sort();

  if (stableStringify(declaredHashPaths) !== stableStringify(expectedHashPaths)) {
    throw validationError(
      "reproducibility_fields_missing",
      "package/benchmark-package.json hash coverage does not match the required immutable file set.",
      "package/benchmark-package.json"
    );
  }

  return sha256Text(
    stableStringify({
      benchmarkFamily: manifest.benchmarkFamily,
      benchmarkItemId: manifest.benchmarkItemId,
      canonicalModules: manifest.canonicalModules,
      fileHashes: manifest.hashes,
      lanePolicy: manifest.lanePolicy,
      packageId: manifest.packageId,
      packageRoot: manifest.packageRoot,
      packageVersion: manifest.packageVersion,
      sourceManifestDigest: manifest.sourceManifestDigest,
      sourceSchemaVersion: "1"
    })
  );
}

function computePromptPackageDigest(manifest: Problem9PromptPackageManifest) {
  return sha256Text(
    stableStringify({
      authMode: manifest.authMode,
      benchmarkPackageDigest: manifest.benchmarkPackageDigest,
      benchmarkPackageId: manifest.benchmarkPackageId,
      benchmarkPackageVersion: manifest.benchmarkPackageVersion,
      harnessRevision: manifest.harnessRevision,
      laneId: manifest.laneId,
      layerDigests: manifest.layerDigests,
      layerVersions: manifest.layerVersions,
      modelConfigId: manifest.modelConfigId,
      promptProtocolVersion: manifest.promptProtocolVersion,
      providerFamily: manifest.providerFamily,
      runMode: manifest.runMode,
      toolProfile: manifest.toolProfile
    })
  );
}

function computeRunConfigDigest(bundle: Problem9OfflineIngestBundle) {
  return sha256Text(
    stableStringify({
      authMode: bundle.promptPackage.authMode,
      benchmarkItemId: bundle.benchmarkPackage.benchmarkItemId,
      benchmarkPackageDigest: bundle.benchmarkPackage.packageDigest,
      benchmarkPackageId: bundle.benchmarkPackage.packageId,
      benchmarkPackageVersion: bundle.benchmarkPackage.packageVersion,
      environmentDigest: bundle.runBundle.environmentDigest,
      harnessRevision: bundle.promptPackage.harnessRevision,
      laneId: bundle.promptPackage.laneId,
      modelConfigId: bundle.promptPackage.modelConfigId,
      modelSnapshotId: bundle.environment.modelSnapshotId,
      promptPackageDigest: bundle.promptPackage.promptPackageDigest,
      promptProtocolVersion: bundle.promptPackage.promptProtocolVersion,
      providerFamily: bundle.promptPackage.providerFamily,
      runMode: bundle.promptPackage.runMode,
      toolProfile: bundle.promptPackage.toolProfile,
      verifierVersion: bundle.environment.verifierVersion
    })
  );
}

function computeBundleDigest(
  runBundle: Problem9RunBundleManifest,
  artifactManifest: Problem9OfflineArtifactManifest
) {
  return sha256Text(
    stableStringify({
      artifactInventory: [...artifactManifest.artifacts].sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath)
      ),
      runBundle: omitDigestFields(runBundle)
    })
  );
}

function buildRootArtifactDrafts(
  bundle: Problem9OfflineIngestBundle,
  bucketName: string
): Problem9OfflineIngestArtifactDraft[] {
  return [
    buildRootArtifactDraft({
      artifactClassId: "run_manifest",
      bucketName,
      contents: toWrittenText(stableStringify(bundle.artifactManifest)),
      relativePath: "artifact-manifest.json",
      runId: bundle.runBundle.runId,
      attemptId: bundle.runBundle.attemptId
    }),
    buildRootArtifactDraft({
      artifactClassId: "run_manifest",
      bucketName,
      contents: toWrittenText(stableStringify(bundle.runBundle)),
      relativePath: "run-bundle.json",
      runId: bundle.runBundle.runId,
      attemptId: bundle.runBundle.attemptId
    })
  ];
}

function buildRootArtifactDraft(options: {
  artifactClassId: Problem9OfflineIngestArtifactDraft["artifactClassId"];
  attemptId: string;
  bucketName: string;
  contents: string;
  relativePath: string;
  runId: string;
}): Problem9OfflineIngestArtifactDraft {
  return {
    artifactClassId: options.artifactClassId,
    artifactManifestDigest: null,
    bucketName: options.bucketName,
    byteSize: Buffer.byteLength(options.contents, "utf8"),
    contentEncoding: null,
    lifecycleState: "registered",
    mediaType: options.relativePath.endsWith(".json") ? "application/json" : "text/plain",
    objectKey: buildObjectKey({
      attemptId: options.attemptId,
      prefixFamily: "run_artifacts",
      relativePath: options.relativePath,
      runId: options.runId
    }),
    prefixFamily: "run_artifacts",
    providerEtag: null,
    relativePath: options.relativePath,
    requiredForIngest: true,
    sha256: sha256Text(options.contents),
    storageProvider: "cloudflare_r2"
  };
}

function buildManifestArtifactDraft(
  manifestEntry: Problem9OfflineArtifactManifestEntry,
  bucketName: string,
  runId: string,
  attemptId: string
): Problem9OfflineIngestArtifactDraft {
  const prefixFamily = mapPrefixFamily(manifestEntry.artifactRole);

  return {
    artifactClassId: manifestEntry.artifactRole,
    artifactManifestDigest: null,
    bucketName,
    byteSize: manifestEntry.byteSize,
    contentEncoding: manifestEntry.contentEncoding,
    lifecycleState: "registered",
    mediaType: manifestEntry.mediaType,
    objectKey: buildObjectKey({
      attemptId,
      prefixFamily,
      relativePath: manifestEntry.relativePath,
      runId
    }),
    prefixFamily,
    providerEtag: null,
    relativePath: manifestEntry.relativePath,
    requiredForIngest: manifestEntry.requiredForIngest,
    sha256: manifestEntry.sha256.toLowerCase(),
    storageProvider: "cloudflare_r2"
  };
}

function buildObjectKey(options: {
  attemptId: string;
  prefixFamily: Problem9OfflineIngestArtifactDraft["prefixFamily"];
  relativePath: string;
  runId: string;
}) {
  const prefixRoot =
    options.prefixFamily === "run_logs"
      ? "logs"
      : options.prefixFamily === "run_traces"
        ? "traces"
        : "artifacts";

  return normalizePath(
    `runs/${options.runId}/${prefixRoot}/${options.attemptId}/${options.relativePath}`
  );
}

function mapPrefixFamily(
  artifactRole: Problem9OfflineArtifactManifestEntry["artifactRole"]
): Problem9OfflineIngestArtifactDraft["prefixFamily"] {
  switch (artifactRole) {
    case "compiler_output":
      return "run_logs";
    case "execution_trace":
      return "run_traces";
    default:
      return "run_artifacts";
  }
}

function resolveArtifactBucketName() {
  return process.env.NODE_ENV === "production"
    ? "paretoproof-production-artifacts"
    : "paretoproof-dev-artifacts";
}

function toJsonRecordOrNull(value: unknown): Record<string, unknown> | null {
  if (value === null) {
    return null;
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {
    value
  };
}

function assertDigest(actual: string, expected: string, label: string, code: string) {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw validationError(code, `${label} does not match the canonical SHA-256 digest.`, label);
  }
}

function validationError(code: string, message: string, path?: string) {
  return new Problem9OfflineIngestValidationError({
    code,
    issues: [{ message, path }],
    statusCode: code === "invalid_problem9_offline_ingest_payload" ? 400 : 422
  });
}

function normalizePath(relativePath: string) {
  return relativePath.split("\\").join("/");
}

function normalizeText(text: string) {
  return text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function toWrittenText(text: string) {
  return `${normalizeText(text).replace(/\n?$/, "\n")}`;
}

function sha256Text(text: string) {
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

function omitDigestFields<TValue extends Record<string, unknown>>(value: TValue) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !key.toLowerCase().endsWith("digest"))
  );
}
