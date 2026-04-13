import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Fastify from "fastify";
import type { Problem9OfflineIngestRequest } from "@paretoproof/shared";
import {
  Problem9OfflineIngestDuplicateError,
  Problem9OfflineIngestValidationError,
  buildProblem9OfflineIngestPlan,
  createProblem9OfflineIngestService
} from "../src/lib/problem9-offline-ingest.ts";
import { artifacts, attempts, auditEvents, jobs, runs } from "../src/db/schema.ts";
import { registerOfflineIngestRoutes } from "../src/routes/offline-ingest.ts";
import { materializeProblem9Package } from "../../worker/src/lib/problem9-package.ts";
import {
  getDefaultProblem9PromptPackageOptions,
  materializeProblem9PromptPackage
} from "../../worker/src/lib/problem9-prompt-package.ts";
import { materializeProblem9RunBundle } from "../../worker/src/lib/problem9-run-bundle.ts";

async function readJsonFile<TValue>(filePath: string): Promise<TValue> {
  return JSON.parse(await readFile(filePath, "utf8")) as TValue;
}

async function readOptionalJsonFile<TValue>(filePath: string): Promise<TValue | null> {
  try {
    return await readJsonFile<TValue>(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function readTextFile(filePath: string): Promise<string> {
  return await readFile(filePath, "utf8");
}

async function buildOfflineIngestRequest(options: {
  environmentOverride?: Partial<{
    executionImageDigest: string | null;
    executionTargetKind: "paretoproof-worker" | "problem9-devbox" | "problem9-execution";
    localDevboxDigest: string | null;
    metadata: Record<string, string>;
  }>;
  failureClassificationOverride?: Partial<{
    evidenceArtifactRefs: string[];
    failureCode: string;
    failureFamily:
      | "provider"
      | "harness"
      | "tooling"
      | "budget"
      | "compile"
      | "verification"
      | "input_contract";
    phase: "prepare" | "generate" | "tool" | "compile" | "verify" | "finalize" | "cancel";
    retryEligibility: "never" | "outer_retry_allowed" | "manual_retry_only";
    summary: string;
    terminality: "terminal_attempt" | "retryable_outer" | "cancelled";
    userVisibility: "user_visible" | "user_visible_sanitized" | "internal_only";
  }>;
  includeUsage?: boolean;
  legacyBenchmarkManifest?: boolean;
  result: "pass" | "fail";
  stopReason?: string;
}): Promise<{
  request: Problem9OfflineIngestRequest;
  tempRoot: string;
}> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-problem9-ingest-"));
  const benchmarkPackageRoot = (
    await materializeProblem9Package({
      outputRoot: path.join(tempRoot, "benchmark-package")
    })
  ).outputRoot;

  if (options.legacyBenchmarkManifest) {
    await rewriteBenchmarkManifestForLegacyCompatibility(benchmarkPackageRoot);
  }

  const promptPackageRoot = path.join(tempRoot, "prompt-package");
  const candidateSourcePath = path.join(tempRoot, "candidate.lean");
  const compilerDiagnosticsPath = path.join(tempRoot, "compiler-diagnostics.json");
  const compilerOutputPath = path.join(tempRoot, "compiler-output.txt");
  const verifierOutputPath = path.join(tempRoot, "verifier-output.json");
  const environmentInputPath = path.join(tempRoot, "environment-input.json");
  const failureClassificationPath = path.join(tempRoot, "failure-classification.json");
  const promptDefaults = getDefaultProblem9PromptPackageOptions();
  const idSuffix = options.result === "pass" ? "pass" : "fail";
  const failureFamily = options.failureClassificationOverride?.failureFamily ?? "compile";
  const compileSucceeded = options.result === "pass" || failureFamily !== "compile";

  await writeFile(
    candidateSourcePath,
    [
      "import FirstProof.Problem9.Statement",
      "",
      "theorem candidate : True := by",
      "  trivial",
      ""
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    compilerDiagnosticsPath,
    JSON.stringify(
      {
        compilerDiagnosticsSchemaVersion: "1",
        diagnostics: compileSucceeded ? [] : [{ severity: "error" }],
        success: compileSucceeded
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(compilerOutputPath, "No compiler output\n", "utf8");
  await writeFile(
    verifierOutputPath,
    JSON.stringify(
      {
        axiomCheck: {
          output: options.result === "pass" ? "No axioms detected." : "",
          result: options.result === "pass" ? "passed" : "not_evaluated"
        },
        diagnosticGate: {
          result: options.result === "pass" ? "passed" : "failed"
        },
        forbiddenTokens: {
          containsAdmit: false,
          containsSorry: false
        },
        result: options.result,
        semanticCheck: {
          output: options.result === "pass" ? "" : "Compile gate failed before semantic verification.",
          result: options.result === "pass" ? "matched" : "not_evaluated"
        },
        surfaceEquality: options.result === "pass" ? "matched" : "not_evaluated",
        surface_drift: false,
        theoremHeaders: {
          canonical:
            "declaration problem9 (n : Nat) : 2 * triangular n = n * Nat.succ n",
          candidate:
            "declaration problem9 (n : Nat) : 2 * triangular n = n * Nat.succ n"
        },
        verifierOutputSchemaVersion: "1"
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    environmentInputPath,
    JSON.stringify(
      {
        environmentSchemaVersion: "1",
        executionImageDigest: options.environmentOverride?.executionImageDigest ?? null,
        executionTargetKind:
          options.environmentOverride?.executionTargetKind ?? "problem9-devbox",
        lakeSnapshotId: "lake-snapshot-test",
        leanVersion: "4.22.0",
        localDevboxDigest: options.environmentOverride?.localDevboxDigest ?? null,
        metadata: options.environmentOverride?.metadata ?? {
          source: "api-test"
        },
        modelSnapshotId: `model-snapshot-${idSuffix}`,
        os: {
          arch: "x64",
          platform: "linux",
          release: "6.8.0"
        },
        runtime: {
          bunVersion: null,
          nodeVersion: process.version,
          tsxVersion: null
        },
        verifierVersion: "problem9-verifier.v1"
      },
      null,
      2
    ),
    "utf8"
  );

  if (options.result === "fail") {
    const failureClassification = {
      evidenceArtifactRefs: ["verification/compiler-diagnostics.json"],
      failureCode: "compile_failed",
      failureFamily: "compile",
      phase: "compile",
      retryEligibility: "manual_retry_only",
      summary: "Compiler diagnostics reported a blocking error.",
      terminality: "terminal_attempt",
      userVisibility: "user_visible",
      ...options.failureClassificationOverride
    };
    await writeFile(
      failureClassificationPath,
      JSON.stringify(failureClassification, null, 2),
      "utf8"
    );
  }

  await materializeProblem9PromptPackage({
    attemptId: `attempt-${idSuffix}-1`,
    authMode: "trusted_local_user",
    benchmarkPackageRoot,
    harnessRevision: "harness-test-rev",
    jobId: `job-${idSuffix}-1`,
    laneId: "lean422_exact",
    modelConfigId: "openai/gpt-5",
    outputRoot: promptPackageRoot,
    passKCount: null,
    passKIndex: null,
    promptLayerVersions: promptDefaults.promptLayerVersions,
    promptProtocolVersion: promptDefaults.promptProtocolVersion,
    providerFamily: "openai",
    runId: `run-${idSuffix}-1`,
    runMode: "single_pass_probe",
    toolProfile: "workspace_edit_limited"
  });

  const bundleRoot = (
    await materializeProblem9RunBundle({
      benchmarkPackageRoot,
      candidateSourcePath,
      compilerDiagnosticsPath,
      compilerOutputPath,
      environmentInputPath,
      failureClassificationPath:
        options.result === "fail" ? failureClassificationPath : null,
      outputRoot: path.join(tempRoot, "run-bundle"),
      promptPackageRoot,
      verifierOutputPath
    })
  ).outputRoot;

  const request = {
    bundle: {
      artifactManifest: await readJsonFile(path.join(bundleRoot, "artifact-manifest.json")),
      benchmarkPackage: await readJsonFile(
        path.join(bundleRoot, "package", "benchmark-package.json")
      ),
      benchmarkSources: {
        "FirstProof/Problem9/Gold.lean": await readTextFile(
          path.join(bundleRoot, "package", "FirstProof", "Problem9", "Gold.lean")
        ),
        "FirstProof/Problem9/Statement.lean": await readTextFile(
          path.join(bundleRoot, "package", "FirstProof", "Problem9", "Statement.lean")
        ),
        "FirstProof/Problem9/Support.lean": await readTextFile(
          path.join(bundleRoot, "package", "FirstProof", "Problem9", "Support.lean")
        ),
        LICENSE: await readTextFile(path.join(bundleRoot, "package", "LICENSE")),
        "README.md": await readTextFile(path.join(bundleRoot, "package", "README.md")),
        "lake-manifest.json": await readTextFile(
          path.join(bundleRoot, "package", "lake-manifest.json")
        ),
        "lakefile.toml": await readTextFile(path.join(bundleRoot, "package", "lakefile.toml")),
        "lean-toolchain": await readTextFile(path.join(bundleRoot, "package", "lean-toolchain")),
        "statements/problem.md": await readTextFile(
          path.join(bundleRoot, "package", "statements", "problem.md")
        )
      },
      candidateSource: await readFile(
        path.join(bundleRoot, "candidate", "Candidate.lean"),
        "utf8"
      ),
      compilerDiagnostics: await readJsonFile(
        path.join(bundleRoot, "verification", "compiler-diagnostics.json")
      ),
      compilerOutput: await readFile(
        path.join(bundleRoot, "verification", "compiler-output.txt"),
        "utf8"
      ),
      environment: await readJsonFile(
        path.join(bundleRoot, "environment", "environment.json")
      ),
      failureClassification: await readOptionalJsonFile(
        path.join(bundleRoot, "verification", "failure-classification.json")
      ),
      packageRef: await readJsonFile(path.join(bundleRoot, "package", "package-ref.json")),
      promptPackage: await readJsonFile(
        path.join(bundleRoot, "prompt", "prompt-package.json")
      ),
      promptLayers: {
        "benchmark.md": await readTextFile(path.join(bundleRoot, "prompt", "benchmark.md")),
        "item.md": await readTextFile(path.join(bundleRoot, "prompt", "item.md")),
        "run-envelope.json": await readTextFile(
          path.join(bundleRoot, "prompt", "run-envelope.json")
        ),
        "system.md": await readTextFile(path.join(bundleRoot, "prompt", "system.md"))
      },
      runBundle: await readJsonFile<Record<string, unknown>>(path.join(bundleRoot, "run-bundle.json")),
      usage: null,
      verifierOutput: await readJsonFile(
        path.join(bundleRoot, "verification", "verifier-output.json")
      ),
      verdict: await readJsonFile(path.join(bundleRoot, "verification", "verdict.json"))
    },
    ingestRequestSchemaVersion: "1" as const
  };

  if (options.stopReason) {
    request.bundle.runBundle.stopReason = options.stopReason;
    request.bundle.runBundle.bundleDigest = computeRunBundleDigest(
      (request.bundle.artifactManifest as { artifacts: unknown[] }).artifacts,
      request.bundle.runBundle
    );
  }

  if (options.includeUsage) {
    addUsageSummaryArtifact(request, {
      completionTokens: 5,
      promptTokens: 8,
      totalTokens: 13
    });
  }

  return {
    request,
    tempRoot
  };
}

function addUsageSummaryArtifact(
  request: Problem9OfflineIngestRequest,
  usage: Record<string, unknown>
) {
  const usageText = `${stableStringify(usage)}\n`;

  request.bundle.usage = usage;
  request.bundle.artifactManifest.artifacts = [
    ...request.bundle.artifactManifest.artifacts,
    {
      artifactRole: "usage_summary",
      byteSize: Buffer.byteLength(usageText, "utf8"),
      contentEncoding: null,
      mediaType: "application/json",
      relativePath: "execution/usage.json",
      requiredForIngest: false,
      sha256: sha256Text(usageText)
    }
  ].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  request.bundle.runBundle.artifactManifestDigest = sha256Text(
    `${stableStringify(request.bundle.artifactManifest)}\n`
  );
  request.bundle.runBundle.bundleDigest = computeRunBundleDigest(
    request.bundle.artifactManifest.artifacts,
    request.bundle.runBundle
  );
}

test("buildProblem9OfflineIngestPlan maps canonical passing bundles to terminal imported states", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    result: "pass"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const plan = buildProblem9OfflineIngestPlan(request);

  assert.equal(plan.run.state, "succeeded");
  assert.equal(plan.job.state, "completed");
  assert.equal(plan.attempt.state, "succeeded");
  assert.equal(plan.attempt.verdictClass, "pass");
  assert.equal(plan.sourceStopReason, "verification_passed");
  assert.equal(plan.run.stopReason, "verifier_passed");
  assert.equal(plan.job.stopReason, "verifier_passed");
  assert.equal(plan.attempt.stopReason, "verifier_passed");
  assert.equal(plan.artifacts.length, 24);
  const rootArtifacts = plan.artifacts.filter(
    (artifact) =>
      artifact.relativePath === "artifact-manifest.json" || artifact.relativePath === "run-bundle.json"
  );
  const manifestArtifacts = plan.artifacts.filter(
    (artifact) =>
      artifact.relativePath !== "artifact-manifest.json" && artifact.relativePath !== "run-bundle.json"
  );
  assert.equal(
    rootArtifacts.every((artifact) => artifact.artifactManifestDigest === null),
    true
  );
  assert.equal(
    manifestArtifacts.every(
      (artifact) => artifact.artifactManifestDigest === request.bundle.runBundle.artifactManifestDigest
    ),
    true
  );
  assert.equal(
    plan.artifacts.find((artifact) => artifact.relativePath === "artifact-manifest.json")?.objectKey,
    "runs/run-pass-1/artifacts/attempt-pass-1/artifact-manifest.json"
  );
  assert.equal(
    plan.artifacts.find((artifact) => artifact.relativePath === "candidate/Candidate.lean")?.bucketName,
    "paretoproof-dev-artifacts"
  );
});

test("buildProblem9OfflineIngestPlan accepts optional usage summary artifacts", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    includeUsage: true,
    result: "pass"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const plan = buildProblem9OfflineIngestPlan(request);
  const usageArtifact = plan.artifacts.find((artifact) => artifact.relativePath === "execution/usage.json");
  const usageText = `${stableStringify(request.bundle.usage)}\n`;

  assert.equal(plan.artifacts.length, 25);
  assert.deepEqual(plan.attempt.usageSummary, request.bundle.usage);
  assert.ok(usageArtifact);
  assert.equal(usageArtifact.artifactClassId, "usage_summary");
  assert.equal(
    usageArtifact.artifactManifestDigest,
    request.bundle.runBundle.artifactManifestDigest
  );
  assert.equal(usageArtifact.bucketName, "paretoproof-dev-artifacts");
  assert.equal(usageArtifact.byteSize, Buffer.byteLength(usageText, "utf8"));
  assert.equal(usageArtifact.contentEncoding, null);
  assert.equal(usageArtifact.lifecycleState, "registered");
  assert.equal(usageArtifact.mediaType, "application/json");
  assert.equal(
    usageArtifact.objectKey,
    "runs/run-pass-1/artifacts/attempt-pass-1/execution/usage.json"
  );
  assert.equal(usageArtifact.prefixFamily, "run_artifacts");
  assert.equal(usageArtifact.providerEtag, null);
  assert.equal(usageArtifact.requiredForIngest, false);
  assert.equal(usageArtifact.sha256, sha256Text(usageText));
  assert.equal(usageArtifact.storageProvider, "cloudflare_r2");
});

test("buildProblem9OfflineIngestPlan accepts hosted wrapper environment identity", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    environmentOverride: {
      executionImageDigest: "7".repeat(64),
      executionTargetKind: "paretoproof-worker",
      localDevboxDigest: null,
      metadata: {
        source: "api-test"
      }
    },
    result: "pass"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const plan = buildProblem9OfflineIngestPlan(request);
  const environmentArtifact = plan.artifacts.find(
    (artifact) => artifact.relativePath === "environment/environment.json"
  );
  const manifestEnvironmentArtifact = request.bundle.artifactManifest.artifacts.find(
    (artifact) => artifact.relativePath === "environment/environment.json"
  );

  assert.equal(request.bundle.environment.executionTargetKind, "paretoproof-worker");
  assert.equal(plan.attempt.environmentDigest, request.bundle.runBundle.environmentDigest);
  assert.equal(plan.run.environmentDigest, request.bundle.runBundle.environmentDigest);
  assert.ok(environmentArtifact);
  assert.ok(manifestEnvironmentArtifact);
  assert.equal(environmentArtifact.sha256, manifestEnvironmentArtifact.sha256);
});

test("buildProblem9OfflineIngestPlan rejects hosted wrapper identity without an execution image digest", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    environmentOverride: {
      executionImageDigest: "7".repeat(64),
      executionTargetKind: "paretoproof-worker",
      localDevboxDigest: null
    },
    result: "pass"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  request.bundle.environment.executionImageDigest = null;

  assert.throws(
    () => buildProblem9OfflineIngestPlan(request),
    (error: unknown) =>
      error instanceof Problem9OfflineIngestValidationError &&
      error.code === "invalid_problem9_offline_ingest_payload" &&
      error.issues.some(
        (issue) =>
          issue.path === "bundle.environment.executionImageDigest" &&
          /required when executionTargetKind is paretoproof-worker/u.test(issue.message)
      )
  );
});

test("buildProblem9OfflineIngestPlan rejects hosted wrapper identity with a devbox digest", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    environmentOverride: {
      executionImageDigest: "7".repeat(64),
      executionTargetKind: "paretoproof-worker",
      localDevboxDigest: null
    },
    result: "pass"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  request.bundle.environment.localDevboxDigest = "8".repeat(64);

  assert.throws(
    () => buildProblem9OfflineIngestPlan(request),
    (error: unknown) =>
      error instanceof Problem9OfflineIngestValidationError &&
      error.code === "invalid_problem9_offline_ingest_payload" &&
      error.issues.some(
        (issue) =>
          issue.path === "bundle.environment.localDevboxDigest" &&
          /must be null when executionTargetKind is paretoproof-worker/u.test(issue.message)
      )
  );
});

test("buildProblem9OfflineIngestPlan preserves failure metadata for canonical failing bundles", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    result: "fail"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const plan = buildProblem9OfflineIngestPlan(request);

  assert.equal(plan.run.state, "failed");
  assert.equal(plan.job.state, "failed");
  assert.equal(plan.attempt.state, "failed");
  assert.equal(plan.attempt.verdictClass, "fail");
  assert.equal(plan.attempt.primaryFailureCode, "compile_failed");
  assert.equal(plan.attempt.failureClassification?.failureFamily, "compile");
});

test("buildProblem9OfflineIngestPlan rejects failing bundles without inline failure-classification contents", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    result: "fail"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  request.bundle.failureClassification = null;

  assert.throws(
    () => buildProblem9OfflineIngestPlan(request),
    (error: unknown) =>
      error instanceof Problem9OfflineIngestValidationError &&
      error.code === "invalid_problem9_offline_ingest_payload" &&
      error.issues.length > 0
  );
});

test("buildProblem9OfflineIngestPlan accepts input-contract failure bundles when stopReason matches the failure code", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    failureClassificationOverride: {
      failureCode: "benchmark_input_missing",
      failureFamily: "input_contract",
      phase: "prepare",
      summary: "Benchmark input was unavailable."
    },
    result: "fail",
    stopReason: "benchmark_input_missing"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const plan = buildProblem9OfflineIngestPlan(request);

  assert.equal(plan.run.stopReason, "benchmark_input_missing");
  assert.equal(plan.attempt.primaryFailureCode, "benchmark_input_missing");
  assert.equal(plan.attempt.failureClassification?.failureFamily, "input_contract");
});

test("buildProblem9OfflineIngestPlan accepts provider failure bundles when stopReason matches the failure code", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    failureClassificationOverride: {
      failureCode: "provider_timeout",
      failureFamily: "provider",
      phase: "generate",
      retryEligibility: "outer_retry_allowed",
      summary: "Provider request timed out."
    },
    result: "fail",
    stopReason: "provider_timeout"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const plan = buildProblem9OfflineIngestPlan(request);

  assert.equal(plan.run.stopReason, "provider_timeout");
  assert.equal(plan.attempt.primaryFailureCode, "provider_timeout");
  assert.equal(plan.attempt.failureClassification?.failureFamily, "provider");
});

test("buildProblem9OfflineIngestPlan accepts provider failure bundles with legacy family stop reasons", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    failureClassificationOverride: {
      failureCode: "provider_timeout",
      failureFamily: "provider",
      phase: "generate",
      retryEligibility: "outer_retry_allowed",
      summary: "Provider request timed out."
    },
    result: "fail",
    stopReason: "provider_failed"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const plan = buildProblem9OfflineIngestPlan(request);

  assert.equal(plan.run.stopReason, "provider_timeout");
  assert.equal(plan.sourceStopReason, "provider_failed");
});

test("buildProblem9OfflineIngestPlan accepts budget failure bundles with legacy family stop reasons", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    failureClassificationOverride: {
      failureCode: "turn_budget_exhausted",
      failureFamily: "budget",
      phase: "generate",
      retryEligibility: "manual_retry_only",
      summary: "Turn budget exhausted."
    },
    result: "fail",
    stopReason: "budget_exhausted"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const plan = buildProblem9OfflineIngestPlan(request);

  assert.equal(plan.run.stopReason, "turn_budget_exhausted");
  assert.equal(plan.sourceStopReason, "budget_exhausted");
});

test("buildProblem9OfflineIngestPlan accepts verification failure bundles with legacy family stop reasons", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    failureClassificationOverride: {
      failureCode: "proof_policy_failed",
      failureFamily: "verification",
      phase: "verify",
      retryEligibility: "manual_retry_only",
      summary: "Proof policy gate failed."
    },
    result: "fail",
    stopReason: "verifier_failed"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const plan = buildProblem9OfflineIngestPlan(request);

  assert.equal(plan.run.stopReason, "proof_policy_failed");
  assert.equal(plan.sourceStopReason, "verifier_failed");
});

test("buildProblem9OfflineIngestPlan accepts legacy v1 bundles without sourceMetadata", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    legacyBenchmarkManifest: true,
    result: "pass",
    stopReason: "verification_complete"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const plan = buildProblem9OfflineIngestPlan(request);

  assert.equal(plan.run.state, "succeeded");
  assert.equal(plan.job.state, "completed");
  assert.equal(plan.attempt.state, "succeeded");
  assert.equal(plan.sourceStopReason, "verification_complete");
  assert.equal(plan.run.stopReason, "verifier_passed");
  assert.equal(request.bundle.benchmarkPackage.sourceMetadata, undefined);
});

test("buildProblem9OfflineIngestPlan rejects passing bundles with non-success stop reasons", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    result: "pass",
    stopReason: "compile_failed"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  assert.throws(
    () => buildProblem9OfflineIngestPlan(request),
    (error: unknown) =>
      error instanceof Problem9OfflineIngestValidationError &&
      error.code === "verdict_inconsistent"
  );
});

test("buildProblem9OfflineIngestPlan rejects failing bundles with inconsistent stop reasons", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    result: "fail",
    stopReason: "provider_failed"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  assert.throws(
    () => buildProblem9OfflineIngestPlan(request),
    (error: unknown) =>
      error instanceof Problem9OfflineIngestValidationError &&
      error.code === "verdict_inconsistent"
  );
});

test("buildProblem9OfflineIngestPlan rejects digest mismatches", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    result: "pass"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  request.bundle.candidateSource = `${request.bundle.candidateSource}\n-- tampered`;

  assert.throws(
    () => buildProblem9OfflineIngestPlan(request),
    (error: unknown) =>
      error instanceof Problem9OfflineIngestValidationError &&
      error.code === "bundle_digest_mismatch"
  );
});

test("buildProblem9OfflineIngestPlan rejects canonical provenance metadata drift", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    result: "pass"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const readmeEntry = request.bundle.artifactManifest.artifacts.find(
    (artifact) => artifact.relativePath === "package/README.md"
  );
  assert.ok(readmeEntry);
  readmeEntry.artifactRole = "candidate_source";
  readmeEntry.requiredForIngest = false;
  request.bundle.runBundle.artifactManifestDigest = sha256Text(
    `${stableStringify(request.bundle.artifactManifest)}\n`
  );
  request.bundle.runBundle.bundleDigest = computeRunBundleDigest(
    request.bundle.artifactManifest.artifacts,
    request.bundle.runBundle
  );

  assert.throws(
    () => buildProblem9OfflineIngestPlan(request),
    (error: unknown) =>
      error instanceof Problem9OfflineIngestValidationError &&
      error.code === "unexpected_artifact_manifest_entry"
  );
});

test("buildProblem9OfflineIngestPlan rejects run-envelope semantic drift", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    result: "pass"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const runEnvelope = JSON.parse(request.bundle.promptLayers["run-envelope.json"]) as Record<
    string,
    unknown
  >;
  runEnvelope.runId = "run-tampered";
  request.bundle.promptLayers["run-envelope.json"] = `${stableStringify(runEnvelope)}\n`;
  request.bundle.promptPackage.layerDigests["run-envelope.json"] = sha256Text(
    request.bundle.promptLayers["run-envelope.json"]
  );
  request.bundle.promptPackage.promptPackageDigest = computePromptPackageDigest(
    request.bundle.promptPackage
  );
  request.bundle.runBundle.promptPackageDigest = request.bundle.promptPackage.promptPackageDigest;
  request.bundle.runBundle.runConfigDigest = computeOfflineIngestRunConfigDigest(request.bundle);

  const promptPackageEntry = request.bundle.artifactManifest.artifacts.find(
    (artifact) => artifact.relativePath === "prompt/prompt-package.json"
  );
  assert.ok(promptPackageEntry);
  const promptPackageText = `${stableStringify(request.bundle.promptPackage)}\n`;
  promptPackageEntry.sha256 = sha256Text(promptPackageText);
  promptPackageEntry.byteSize = Buffer.byteLength(promptPackageText, "utf8");

  const runEnvelopeEntry = request.bundle.artifactManifest.artifacts.find(
    (artifact) => artifact.relativePath === "prompt/run-envelope.json"
  );
  assert.ok(runEnvelopeEntry);
  runEnvelopeEntry.sha256 = sha256Text(request.bundle.promptLayers["run-envelope.json"]);
  runEnvelopeEntry.byteSize = Buffer.byteLength(
    request.bundle.promptLayers["run-envelope.json"],
    "utf8"
  );

  request.bundle.runBundle.artifactManifestDigest = sha256Text(
    `${stableStringify(request.bundle.artifactManifest)}\n`
  );
  request.bundle.runBundle.bundleDigest = computeRunBundleDigest(
    request.bundle.artifactManifest.artifacts,
    request.bundle.runBundle
  );

  assert.throws(
    () => buildProblem9OfflineIngestPlan(request),
    (error: unknown) =>
      error instanceof Problem9OfflineIngestValidationError &&
      error.code === "identity_inconsistent"
  );
});

test("buildProblem9OfflineIngestPlan rejects path traversal in identifiers", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    result: "pass"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  request.bundle.runBundle.runId = "../other-run";

  assert.throws(
    () => buildProblem9OfflineIngestPlan(request),
    (error: unknown) =>
      error instanceof Problem9OfflineIngestValidationError &&
      error.code === "invalid_problem9_offline_ingest_payload"
  );
});

test("buildProblem9OfflineIngestPlan rejects path traversal in artifact relative paths", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    result: "pass"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  request.bundle.artifactManifest.artifacts[0]!.relativePath = "../escape.txt";

  assert.throws(
    () => buildProblem9OfflineIngestPlan(request),
    (error: unknown) =>
      error instanceof Problem9OfflineIngestValidationError &&
      error.code === "invalid_problem9_offline_ingest_payload"
  );
});

test("createProblem9OfflineIngestService persists audit provenance and live-equivalent imported fields", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    result: "pass"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  let insertedRun: typeof runs.$inferInsert | null = null;
  let insertedJob: typeof jobs.$inferInsert | null = null;
  let insertedAttempt: typeof attempts.$inferInsert | null = null;
  let insertedArtifacts: Array<typeof artifacts.$inferInsert> = [];
  const insertedAuditEvents: Array<typeof auditEvents.$inferInsert> = [];
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          runs: {
            findFirst: () => Promise<null>;
          };
        };
        insert: (
          table: unknown
        ) => {
          values: (
            value: unknown
          ) => {
            returning?: () => Promise<unknown[]>;
          } | Promise<unknown>;
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          runs: {
            findFirst: async () => null
          }
        },
        insert(table: unknown) {
          return {
            values(value: unknown) {
              if (table === runs) {
                insertedRun = value as typeof runs.$inferInsert;
                return {
                  returning: async () => [
                    {
                      id: "run-row-1",
                      sourceRunId: insertedRun.sourceRunId,
                      state: insertedRun.state
                    }
                  ]
                };
              }

              if (table === jobs) {
                insertedJob = value as typeof jobs.$inferInsert;
                return {
                  returning: async () => [
                    {
                      id: "job-row-1",
                      sourceJobId: insertedJob.sourceJobId,
                      state: insertedJob.state
                    }
                  ]
                };
              }

              if (table === attempts) {
                insertedAttempt = value as typeof attempts.$inferInsert;
                return {
                  returning: async () => [
                    {
                      id: "attempt-row-1",
                      sourceAttemptId: insertedAttempt.sourceAttemptId,
                      state: insertedAttempt.state,
                      verdictClass: insertedAttempt.verdictClass
                    }
                  ]
                };
              }

              if (table === artifacts) {
                insertedArtifacts = value as Array<typeof artifacts.$inferInsert>;
                return Promise.resolve(insertedArtifacts);
              }

              if (table === auditEvents) {
                insertedAuditEvents.push(value as typeof auditEvents.$inferInsert);
                return Promise.resolve(value);
              }

              return Promise.resolve(value);
            }
          };
        }
      } as never)
  };

  const service = createProblem9OfflineIngestService(db as never);
  const response = await service(request, "user-1");

  assert.deepEqual(response, {
    artifactCount: 24,
    attempt: {
      id: "attempt-row-1",
      sourceAttemptId: "attempt-pass-1",
      state: "succeeded",
      verdictClass: "pass"
    },
    job: {
      id: "job-row-1",
      sourceJobId: "job-pass-1",
      state: "completed"
    },
    run: {
      id: "run-row-1",
      sourceRunId: "run-pass-1",
      state: "succeeded"
    }
  });
  assert.equal(insertedRun?.stopReason, "verifier_passed");
  assert.equal(insertedJob?.stopReason, "verifier_passed");
  assert.equal(insertedAttempt?.stopReason, "verifier_passed");
  assert.equal(
    insertedAttempt?.artifactManifestDigest,
    request.bundle.runBundle.artifactManifestDigest
  );
  assert.equal(insertedArtifacts.length, 24);
  const insertedRootArtifacts = insertedArtifacts.filter(
    (artifact) =>
      artifact.relativePath === "artifact-manifest.json" || artifact.relativePath === "run-bundle.json"
  );
  const insertedManifestArtifacts = insertedArtifacts.filter(
    (artifact) =>
      artifact.relativePath !== "artifact-manifest.json" && artifact.relativePath !== "run-bundle.json"
  );
  assert.equal(
    insertedRootArtifacts.every((artifact) => artifact.artifactManifestDigest === null),
    true
  );
  assert.equal(
    insertedManifestArtifacts.every(
      (artifact) =>
        artifact.artifactManifestDigest === request.bundle.runBundle.artifactManifestDigest
    ),
    true
  );
  assert.equal(insertedAuditEvents[0]?.eventId, "run.offline_ingested");
  assert.equal(insertedAuditEvents[0]?.actorUserId, "user-1");
  assert.equal(insertedAuditEvents[0]?.subjectKind, "run");
  assert.equal(insertedAuditEvents[0]?.severity, "critical");
  assert.deepEqual(insertedAuditEvents[0]?.payload, {
    actorUserId: "user-1",
    artifactCount: 24,
    attemptId: "attempt-row-1",
    jobId: "job-row-1",
    runId: "run-row-1",
    sourceAttemptId: "attempt-pass-1",
    sourceJobId: "job-pass-1",
    sourceRunId: "run-pass-1",
    sourceStopReason: "verification_passed",
    stopReason: "verifier_passed",
    verdictClass: "pass"
  });
});

test("createProblem9OfflineIngestService surfaces audit insert failures", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    result: "pass"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  let committedRun: typeof runs.$inferInsert | null = null;
  let committedJob: typeof jobs.$inferInsert | null = null;
  let committedAttempt: typeof attempts.$inferInsert | null = null;
  let committedArtifacts: Array<typeof artifacts.$inferInsert> = [];
  let committedAuditEvents: Array<typeof auditEvents.$inferInsert> = [];
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          runs: {
            findFirst: () => Promise<null>;
          };
        };
        insert: (
          table: unknown
        ) => {
          values: (
            value: unknown
          ) => {
            returning?: () => Promise<unknown[]>;
          } | Promise<unknown>;
        };
      }) => Promise<unknown>
    ) =>
      (async () => {
        let stagedRun: typeof runs.$inferInsert | null = null;
        let stagedJob: typeof jobs.$inferInsert | null = null;
        let stagedAttempt: typeof attempts.$inferInsert | null = null;
        let stagedArtifacts: Array<typeof artifacts.$inferInsert> = [];
        let stagedAuditEvents: Array<typeof auditEvents.$inferInsert> = [];

        const result = await callback({
          query: {
            runs: {
              findFirst: async () => null
            }
          },
          insert(table: unknown) {
            return {
              values(value: unknown) {
                if (table === runs) {
                  stagedRun = value as typeof runs.$inferInsert;
                  return {
                    returning: async () => [
                      {
                        id: "run-row-1",
                        sourceRunId: "run-pass-1",
                        state: "succeeded"
                      }
                    ]
                  };
                }

                if (table === jobs) {
                  stagedJob = value as typeof jobs.$inferInsert;
                  return {
                    returning: async () => [
                      {
                        id: "job-row-1",
                        sourceJobId: "job-pass-1",
                        state: "completed"
                      }
                    ]
                  };
                }

                if (table === attempts) {
                  stagedAttempt = value as typeof attempts.$inferInsert;
                  return {
                    returning: async () => [
                      {
                        id: "attempt-row-1",
                        sourceAttemptId: "attempt-pass-1",
                        state: "succeeded",
                        verdictClass: "pass"
                      }
                    ]
                  };
                }

                if (table === artifacts) {
                  stagedArtifacts = value as Array<typeof artifacts.$inferInsert>;
                  return Promise.resolve(value);
                }

                if (table === auditEvents) {
                  stagedAuditEvents.push(value as typeof auditEvents.$inferInsert);
                  return Promise.reject(new Error("audit_insert_failed"));
                }

                return Promise.resolve(value);
              }
            };
          }
        } as never);

        committedRun = stagedRun;
        committedJob = stagedJob;
        committedAttempt = stagedAttempt;
        committedArtifacts = stagedArtifacts;
        committedAuditEvents = stagedAuditEvents;
        return result;
      })()
  };

  const service = createProblem9OfflineIngestService(db as never);

  await assert.rejects(() => service(request, "user-1"), /audit_insert_failed/);
  assert.equal(committedRun, null);
  assert.equal(committedJob, null);
  assert.equal(committedAttempt, null);
  assert.equal(committedArtifacts.length, 0);
  assert.equal(committedAuditEvents.length, 0);
});

test("createProblem9OfflineIngestService preserves source failure stop reasons while persisting live-equivalent failure rows", async (t) => {
  const { request, tempRoot } = await buildOfflineIngestRequest({
    failureClassificationOverride: {
      failureCode: "provider_timeout",
      failureFamily: "provider",
      phase: "generate",
      retryEligibility: "outer_retry_allowed",
      summary: "Provider request timed out."
    },
    result: "fail",
    stopReason: "provider_failed"
  });

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  let insertedRun: typeof runs.$inferInsert | null = null;
  let insertedJob: typeof jobs.$inferInsert | null = null;
  let insertedAttempt: typeof attempts.$inferInsert | null = null;
  let insertedArtifacts: Array<typeof artifacts.$inferInsert> = [];
  const insertedAuditEvents: Array<typeof auditEvents.$inferInsert> = [];
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          runs: {
            findFirst: () => Promise<null>;
          };
        };
        insert: (
          table: unknown
        ) => {
          values: (
            value: unknown
          ) => {
            returning?: () => Promise<unknown[]>;
          } | Promise<unknown>;
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          runs: {
            findFirst: async () => null
          }
        },
        insert(table: unknown) {
          return {
            values(value: unknown) {
              if (table === runs) {
                insertedRun = value as typeof runs.$inferInsert;
                return {
                  returning: async () => [
                    {
                      id: "run-row-1",
                      sourceRunId: "run-fail-1",
                      state: "failed"
                    }
                  ]
                };
              }

              if (table === jobs) {
                insertedJob = value as typeof jobs.$inferInsert;
                return {
                  returning: async () => [
                    {
                      id: "job-row-1",
                      sourceJobId: "job-fail-1",
                      state: "failed"
                    }
                  ]
                };
              }

              if (table === attempts) {
                insertedAttempt = value as typeof attempts.$inferInsert;
                return {
                  returning: async () => [
                    {
                      id: "attempt-row-1",
                      sourceAttemptId: "attempt-fail-1",
                      state: "failed",
                      verdictClass: "fail"
                    }
                  ]
                };
              }

              if (table === artifacts) {
                insertedArtifacts = value as Array<typeof artifacts.$inferInsert>;
                return Promise.resolve(insertedArtifacts);
              }

              if (table === auditEvents) {
                insertedAuditEvents.push(value as typeof auditEvents.$inferInsert);
                return Promise.resolve(value);
              }

              return Promise.resolve(value);
            }
          };
        }
      } as never)
  };

  const service = createProblem9OfflineIngestService(db as never);
  const response = await service(request, "user-1");

  assert.deepEqual(response, {
    artifactCount: 25,
    attempt: {
      id: "attempt-row-1",
      sourceAttemptId: "attempt-fail-1",
      state: "failed",
      verdictClass: "fail"
    },
    job: {
      id: "job-row-1",
      sourceJobId: "job-fail-1",
      state: "failed"
    },
    run: {
      id: "run-row-1",
      sourceRunId: "run-fail-1",
      state: "failed"
    }
  });
  assert.equal(insertedRun?.stopReason, "provider_timeout");
  assert.equal(insertedJob?.stopReason, "provider_timeout");
  assert.equal(insertedAttempt?.stopReason, "provider_timeout");
  assert.equal(insertedArtifacts.length, 25);
  assert.deepEqual(insertedAuditEvents[0]?.payload, {
    actorUserId: "user-1",
    artifactCount: 25,
    attemptId: "attempt-row-1",
    jobId: "job-row-1",
    runId: "run-row-1",
    sourceAttemptId: "attempt-fail-1",
    sourceJobId: "job-fail-1",
    sourceRunId: "run-fail-1",
    sourceStopReason: "provider_failed",
    stopReason: "provider_timeout",
    verdictClass: "fail"
  });
});

test("POST /portal/admin/offline-ingest/problem9-run-bundles returns created responses", async (t) => {
  const app = Fastify();
  let receivedActorUserId: string | null = null;
  let receivedPayload: unknown = null;

  t.after(async () => {
    await app.close();
  });

  registerOfflineIngestRoutes(
    app,
    {} as never,
    () => (request, _reply, done) => {
      request.accessRbacContext = {
        email: "admin@paretoproof.com",
        identityId: "identity-1",
        role: "admin",
        status: "approved",
        subject: "subject-1",
        userId: "user-1"
      };
      done();
    },
    {
      ingestProblem9OfflineBundle: async (rawRequest, actorUserId) => {
        receivedActorUserId = actorUserId;
        receivedPayload = rawRequest;

        return {
          artifactCount: 24,
          attempt: {
            id: "attempt-row-1",
            sourceAttemptId: "attempt-pass-1",
            state: "succeeded",
            verdictClass: "pass"
          },
          job: {
            id: "job-row-1",
            sourceJobId: "job-pass-1",
            state: "completed"
          },
          run: {
            id: "run-row-1",
            sourceRunId: "run-pass-1",
            state: "succeeded"
          }
        };
      }
    }
  );

  const payload = {
    ingestRequestSchemaVersion: "1"
  };
  const response = await app.inject({
    method: "POST",
    payload,
    url: "/portal/admin/offline-ingest/problem9-run-bundles"
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json(), {
    artifactCount: 24,
    attempt: {
      id: "attempt-row-1",
      sourceAttemptId: "attempt-pass-1",
      state: "succeeded",
      verdictClass: "pass"
    },
    job: {
      id: "job-row-1",
      sourceJobId: "job-pass-1",
      state: "completed"
    },
    run: {
      id: "run-row-1",
      sourceRunId: "run-pass-1",
      state: "succeeded"
    }
  });
  assert.equal(receivedActorUserId, "user-1");
  assert.deepEqual(receivedPayload, payload);
});

test("POST /portal/admin/offline-ingest/problem9-run-bundles maps duplicate run conflicts to 409", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerOfflineIngestRoutes(
    app,
    {} as never,
    () => (request, _reply, done) => {
      request.accessRbacContext = {
        email: "admin@paretoproof.com",
        identityId: "identity-1",
        role: "admin",
        status: "approved",
        subject: "subject-1",
        userId: "user-1"
      };
      done();
    },
    {
      ingestProblem9OfflineBundle: async () => {
        throw new Problem9OfflineIngestDuplicateError("run-pass-1");
      }
    }
  );

  const response = await app.inject({
    method: "POST",
    payload: {
      ingestRequestSchemaVersion: "1"
    },
    url: "/portal/admin/offline-ingest/problem9-run-bundles"
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "offline_ingest_duplicate_run"
  });
});

async function rewriteBenchmarkManifestForLegacyCompatibility(
  benchmarkPackageRoot: string
): Promise<void> {
  const manifestPath = path.join(benchmarkPackageRoot, "benchmark-package.json");
  const manifest = await readJsonFile<Record<string, unknown>>(manifestPath);

  delete manifest.sourceMetadata;
  manifest.lanePolicy = {
    primaryLane: "lean422_exact",
    supportedLanes: ["lean422_exact", "lean424_interop"]
  };
  manifest.packageDigest = computeLegacyBenchmarkPackageDigest(manifest);

  await writeFile(manifestPath, `${JSON.stringify(sortJsonValue(manifest), null, 2)}\n`, "utf8");
}

function computeLegacyBenchmarkPackageDigest(manifest: Record<string, unknown>): string {
  return sha256Text(
    JSON.stringify(
      sortJsonValue({
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
      }),
      null,
      2
    )
  );
}

function computePromptPackageDigest(promptPackage: {
  authMode: string;
  benchmarkPackageDigest: string;
  benchmarkPackageId: string;
  benchmarkPackageVersion: string;
  harnessRevision: string;
  laneId: string;
  layerDigests: Record<string, string>;
  layerVersions: Record<string, string>;
  modelConfigId: string;
  promptProtocolVersion: string;
  providerFamily: string;
  runMode: string;
  toolProfile: string;
}) {
  return sha256Text(
    stableStringify({
      authMode: promptPackage.authMode,
      benchmarkPackageDigest: promptPackage.benchmarkPackageDigest,
      benchmarkPackageId: promptPackage.benchmarkPackageId,
      benchmarkPackageVersion: promptPackage.benchmarkPackageVersion,
      harnessRevision: promptPackage.harnessRevision,
      laneId: promptPackage.laneId,
      layerDigests: promptPackage.layerDigests,
      layerVersions: promptPackage.layerVersions,
      modelConfigId: promptPackage.modelConfigId,
      promptProtocolVersion: promptPackage.promptProtocolVersion,
      providerFamily: promptPackage.providerFamily,
      runMode: promptPackage.runMode,
      toolProfile: promptPackage.toolProfile
    })
  );
}

function computeOfflineIngestRunConfigDigest(bundle: {
  benchmarkPackage: {
    benchmarkItemId: string;
    packageDigest: string;
    packageId: string;
    packageVersion: string;
  };
  environment: {
    modelSnapshotId: string;
    verifierVersion: string;
  };
  promptPackage: {
    authMode: string;
    harnessRevision: string;
    laneId: string;
    modelConfigId: string;
    promptPackageDigest: string;
    promptProtocolVersion: string;
    providerFamily: string;
    runMode: string;
    toolProfile: string;
  };
  runBundle: {
    environmentDigest: string;
  };
}) {
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

function computeRunBundleDigest(
  artifactInventory: unknown[],
  runBundle: Record<string, unknown>
): string {
  return sha256Text(
    stableStringify({
      artifactInventory: [...artifactInventory].sort((left, right) =>
        String((left as { relativePath?: string }).relativePath ?? "").localeCompare(
          String((right as { relativePath?: string }).relativePath ?? "")
        )
      ),
      runBundle: Object.fromEntries(
        Object.entries(runBundle).filter(([key]) => !key.toLowerCase().endsWith("digest"))
      )
    })
  );
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

function normalizeText(text: string): string {
  return text.replace(/^\uFEFF/u, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
