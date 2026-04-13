import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  problem9BenchmarkPackageManifestSchema,
  problem9EnvironmentManifestSchema,
  problem9PackageRefSchema,
  problem9PromptPackageManifestSchema,
  assertProblem9HostedCapability,
  problem9HostedAuthModes,
  type WorkerArtifactManifestEntry,
  type WorkerArtifactManifestRequest,
  type WorkerArtifactManifestResponse,
  type WorkerBundleArtifactRole,
  type WorkerClaimRequest,
  type WorkerClaimResponse,
  type WorkerExecutionEvent,
  type WorkerExecutionEventKind,
  type WorkerExecutionPhase,
  type WorkerFailureClassification,
  type WorkerHeartbeatRequest,
  type WorkerHeartbeatResponse,
  type WorkerResultMessageRequest,
  type WorkerResultMessageResponse,
  type WorkerTerminalFailureRequest,
  type WorkerTerminalFailureResponse,
  type WorkerVerifierVerdict,
  workerArtifactManifestResponseSchema,
  workerClaimResponseSchema,
  workerExecutionEventResponseSchema,
  workerFailureCodeSchema,
  workerHeartbeatResponseSchema,
  workerResultMessageResponseSchema,
  workerTerminalFailureResponseSchema,
  workerVerifierVerdictSchema
} from "@paretoproof/shared";
import { z } from "zod";
import type { Problem9AttemptResult } from "./problem9-attempt.js";
import { runProblem9Attempt } from "./problem9-attempt.js";
import {
  getDefaultProblem9PromptPackageOptions,
  materializeProblem9PromptPackage
} from "./problem9-prompt-package.js";
import { materializeProblem9Package } from "./problem9-package.js";
import {
  createHostedControlPlaneFetch,
  resolveHostedControlPlaneOrigin
} from "./hosted-network-policy.js";
import { parseWorkerRuntimeEnv } from "./runtime.js";

const workerClaimLoopOptionsSchema = z.object({
  authMode: z.enum(problem9HostedAuthModes),
  maxConcurrentJobs: z.number().int().positive().default(1),
  maxJobs: z.number().int().positive().nullable().default(null),
  once: z.boolean().default(false),
  outputRoot: z.string().min(1),
  providerModel: z.string().min(1).optional(),
  workerId: z.string().min(1),
  workerPool: z.string().min(1),
  workerRuntime: z.enum(["local_docker", "modal"]).default("modal"),
  workerVersion: z.string().min(1),
  workspaceRoot: z.string().min(1)
});

const artifactManifestFileSchema = z
  .object({
    artifacts: z.array(
      z.object({
        artifactRole: z.string().min(1),
        byteSize: z.number().int().nonnegative(),
        contentEncoding: z.string().min(1).nullable(),
        mediaType: z.string().min(1).nullable(),
        relativePath: z.string().min(1),
        requiredForIngest: z.boolean(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/i)
      })
    )
  })
  .passthrough();

const runBundleFileSchema = z
  .object({
    artifactManifestDigest: z.string().regex(/^[a-f0-9]{64}$/i),
    attemptId: z.string().min(1),
    authMode: z.string().min(1),
    benchmarkItemId: z.string().min(1),
    benchmarkPackageDigest: z.string().regex(/^[a-f0-9]{64}$/i),
    benchmarkPackageId: z.string().min(1),
    benchmarkPackageVersion: z.string().min(1),
    bundleDigest: z.string().regex(/^[a-f0-9]{64}$/i),
    bundleSchemaVersion: z.string().min(1),
    candidateDigest: z.string().regex(/^[a-f0-9]{64}$/i),
    environmentDigest: z.string().regex(/^[a-f0-9]{64}$/i),
    harnessRevision: z.string().min(1),
    jobId: z.string().min(1).nullable(),
    laneId: z.string().min(1),
    modelConfigId: z.string().min(1),
    modelSnapshotId: z.string().min(1),
    promptPackageDigest: z.string().regex(/^[a-f0-9]{64}$/i),
    promptProtocolVersion: z.string().min(1),
    providerFamily: z.string().min(1),
    runConfigDigest: z.string().regex(/^[a-f0-9]{64}$/i),
    runId: z.string().min(1),
    runMode: z.string().min(1),
    status: z.string().min(1),
    stopReason: z.string().min(1),
    toolProfile: z.string().min(1),
    verifierVersion: z.string().min(1),
    verdictDigest: z.string().regex(/^[a-f0-9]{64}$/i)
  })
  .passthrough();
const promptRunEnvelopeSchema = z.object({
  attemptId: z.string().min(1),
  authMode: z.string().min(1),
  benchmarkItemId: z.literal("Problem9"),
  benchmarkPackageDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  benchmarkPackageId: z.literal("firstproof/Problem9"),
  benchmarkPackageVersion: z.string().min(1),
  harnessRevision: z.string().min(1),
  jobId: z.string().min(1).nullable(),
  laneId: z.string().min(1),
  modelConfigId: z.string().min(1),
  promptProtocolVersion: z.string().min(1),
  providerFamily: z.string().min(1),
  runEnvelopeSchemaVersion: z.literal("1"),
  runId: z.string().min(1),
  runMode: z.string().min(1),
  toolProfile: z.string().min(1)
});

const supportedArtifactRoles = [
  "run_manifest",
  "package_reference",
  "prompt_package",
  "candidate_source",
  "verdict_record",
  "compiler_output",
  "compiler_diagnostics",
  "verifier_output",
  "failure_classification",
  "environment_snapshot",
  "usage_summary",
  "execution_trace"
] satisfies WorkerBundleArtifactRole[];

const optionalArtifactRoles = new Set(["usage_summary", "execution_trace"] as const);
const benchmarkSourcePaths = [
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
const promptLayerPaths = ["benchmark.md", "item.md", "run-envelope.json", "system.md"] as const;

const canonicalArtifactRoleByPath = {
  "candidate/Candidate.lean": "candidate_source",
  "environment/environment.json": "environment_snapshot",
  "package/benchmark-package.json": "package_reference",
  "package/FirstProof/Problem9/Gold.lean": "package_reference",
  "package/FirstProof/Problem9/Statement.lean": "package_reference",
  "package/FirstProof/Problem9/Support.lean": "package_reference",
  "package/LICENSE": "package_reference",
  "package/README.md": "package_reference",
  "package/lake-manifest.json": "package_reference",
  "package/lakefile.toml": "package_reference",
  "package/lean-toolchain": "package_reference",
  "package/package-ref.json": "package_reference",
  "package/statements/problem.md": "package_reference",
  "prompt/benchmark.md": "prompt_package",
  "prompt/item.md": "prompt_package",
  "prompt/prompt-package.json": "prompt_package",
  "prompt/run-envelope.json": "prompt_package",
  "prompt/system.md": "prompt_package",
  "verification/compiler-diagnostics.json": "compiler_diagnostics",
  "verification/compiler-output.txt": "compiler_output",
  "verification/failure-classification.json": "failure_classification",
  "verification/verdict.json": "verdict_record",
  "verification/verifier-output.json": "verifier_output"
} as const satisfies Record<string, WorkerBundleArtifactRole>;
const alwaysRequiredCanonicalArtifactPaths = Object.keys(canonicalArtifactRoleByPath).filter(
  (relativePath) => relativePath !== "verification/failure-classification.json"
);

type WorkerClaimLoopOptions = z.input<typeof workerClaimLoopOptionsSchema>;
type WorkerClaimLoopResolvedOptions = z.output<typeof workerClaimLoopOptionsSchema>;
type WorkerFetch = typeof fetch;
type WorkerSleep = (ms: number) => Promise<void>;

type WorkerClaimLoopDependencies = {
  attemptRunner?: typeof runProblem9Attempt;
  fetchImpl?: WorkerFetch;
  materializeBenchmarkPackage?: typeof materializeProblem9Package;
  materializePromptPackage?: typeof materializeProblem9PromptPackage;
  now?: () => Date;
  rawEnv?: Partial<Record<string, string | undefined>>;
  sleep?: WorkerSleep;
};

type WorkerClaimLoopResolvedDependencies = {
  attemptRunner: typeof runProblem9Attempt;
  fetchImpl: WorkerFetch;
  materializeBenchmarkPackage: typeof materializeProblem9Package;
  materializePromptPackage: typeof materializeProblem9PromptPackage;
  now: () => Date;
  sleep: WorkerSleep;
};

const startupValidationOnlyEnabled = (() => {
  const rawValue = process.env.PARETOPROOF_STARTUP_VALIDATION_ONLY?.trim().toLowerCase();
  return rawValue === "1" || rawValue === "true";
})();

export type RunWorkerClaimLoopResult = {
  claimedJobs: number;
  completedJobs: number;
  idlePollCount: number;
  stoppedReason: "idle_once" | "max_jobs_reached";
};

type ActiveWorkerJob = Extract<WorkerClaimResponse, { leaseStatus: "active" }>["workerJob"];

type ActiveLeaseState = {
  backgroundControlError: unknown | null;
  cancelRequested: boolean;
  currentPhase: WorkerExecutionPhase;
  heartbeatErrorMessage: string | null;
  job: NonNullable<ActiveWorkerJob>;
  jobToken: string;
  lastEventSequence: number;
  leaseLost: boolean;
  progressMessage: string | null;
  stopHeartbeat: (() => void) | null;
  stopped: boolean;
};

type PreparedBundleSubmission = {
  artifactManifest: WorkerArtifactManifestEntry[];
  artifactManifestDigest: string;
  bundleDigest: string;
  candidateDigest: string;
  environmentDigest: string;
  runBundle: z.output<typeof runBundleFileSchema>;
  verifierVerdict: WorkerVerifierVerdict & { runId: string };
  verdictDigest: string;
};

type CancellationTerminalContext = {
  artifactIds: string[];
  artifactManifestDigest: string;
  artifacts: Pick<WorkerArtifactManifestResponse["artifacts"][number], "artifactRole" | "relativePath">[];
  bundleDigest: string;
  candidateDigest: string;
};

class BundleSubmissionIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundleSubmissionIntegrityError";
  }
}

const bundleVerifierVerdictFileSchema = workerVerifierVerdictSchema
  .extend({
    failureCode: workerFailureCodeSchema.optional(),
    runId: z.string().min(1)
  })
  .passthrough();

type LeaseFilesystemRoots = {
  attemptOutputRoot: string;
  attemptWorkspaceRoot: string;
  benchmarkPackageRoot: string;
  leaseStagingRoot: string;
  leaseWorkspaceRoot: string;
  promptPackageRoot: string;
};

export async function runWorkerClaimLoop(
  rawOptions: WorkerClaimLoopOptions,
  dependencies: WorkerClaimLoopDependencies = {}
): Promise<RunWorkerClaimLoopResult> {
  const options = workerClaimLoopOptionsSchema.parse(rawOptions);
  const baseFetchImpl = dependencies.fetchImpl ?? fetch;
  const sleep = dependencies.sleep ?? defaultSleep;
  const now = dependencies.now ?? (() => new Date());
  const attemptRunner = dependencies.attemptRunner ?? runProblem9Attempt;
  const materializeBenchmarkPackage =
    dependencies.materializeBenchmarkPackage ?? materializeProblem9Package;
  const materializePromptPackage =
    dependencies.materializePromptPackage ?? materializeProblem9PromptPackage;

  const runtimeEnv = await parseWorkerRuntimeEnv({
    authMode: options.authMode,
    commandFamily: "worker_claim_loop"
  }, dependencies.rawEnv);
  const fetchImpl =
    options.workerRuntime === "modal"
      ? createHostedControlPlaneFetch(
          baseFetchImpl,
          resolveHostedControlPlaneOrigin(runtimeEnv.apiBaseUrl!, {
            allowLoopback: false
          })
        )
      : createHostedControlPlaneFetch(
          baseFetchImpl,
          resolveHostedControlPlaneOrigin(runtimeEnv.apiBaseUrl!, {
            allowLoopback: true
          })
        );

  if (startupValidationOnlyEnabled) {
    return {
      claimedJobs: 0,
      completedJobs: 0,
      idlePollCount: 0,
      stoppedReason: "idle_once"
    };
  }

  let claimedJobs = 0;
  let completedJobs = 0;
  let idlePollCount = 0;

  while (true) {
    if (options.maxJobs !== null && claimedJobs >= options.maxJobs) {
      return {
        claimedJobs,
        completedJobs,
        idlePollCount,
        stoppedReason: "max_jobs_reached"
      };
    }

    const claimResponse = await claimWorkerJob({
      apiBaseUrl: runtimeEnv.apiBaseUrl!,
      fetchImpl,
      workerBootstrapToken: runtimeEnv.workerBootstrapToken!,
      workerRequest: buildClaimRequest(options)
    });

    if (claimResponse.leaseStatus === "idle") {
      idlePollCount += 1;

      if (options.once) {
        return {
          claimedJobs,
          completedJobs,
          idlePollCount,
          stoppedReason: "idle_once"
        };
      }

      await sleep(claimResponse.pollAfterSeconds * 1000);
      continue;
    }

    claimedJobs += 1;
    const outcome = await processClaimedJob(
      claimResponse.workerJob,
      options,
      runtimeEnv.apiBaseUrl!,
      {
        attemptRunner,
        fetchImpl,
        materializeBenchmarkPackage,
        materializePromptPackage,
        now,
        sleep
      }
    );

    if (outcome === "completed") {
      completedJobs += 1;
    }

    if (options.once) {
      return {
        claimedJobs,
        completedJobs,
        idlePollCount,
        stoppedReason:
          options.maxJobs !== null && claimedJobs >= options.maxJobs
            ? "max_jobs_reached"
            : "idle_once"
      };
    }
  }
}

async function processClaimedJob(
  workerJob: NonNullable<ActiveWorkerJob>,
  options: WorkerClaimLoopResolvedOptions,
  apiBaseUrl: string,
  dependencies: WorkerClaimLoopResolvedDependencies
): Promise<"completed" | "cancelled" | "lease_lost"> {
  const leaseState: ActiveLeaseState = {
    backgroundControlError: null,
    cancelRequested: false,
    currentPhase: "prepare",
    heartbeatErrorMessage: null,
    job: workerJob,
    jobToken: workerJob.jobToken,
    lastEventSequence: 0,
    leaseLost: false,
    progressMessage: "Preparing Problem 9 worker job.",
    stopHeartbeat: null,
    stopped: false
  };
  const leaseRoots = buildLeaseFilesystemRoots({
    jobId: workerJob.jobId,
    leaseId: workerJob.leaseId,
    outputRoot: options.outputRoot,
    workspaceRoot: options.workspaceRoot
  });
  let heartbeatLoop = Promise.resolve();
  let failureTerminalContext: CancellationTerminalContext | null = null;

  try {
    try {
      await prepareLeaseFilesystemRoots(leaseRoots);
    } catch (error) {
      try {
        await submitHarnessFailure(
          leaseState,
          apiBaseUrl,
          dependencies,
          buildStaticFailure({
            summary: error instanceof Error ? error.message : String(error),
            failureCode: "tool_permission_violation",
            phase: "prepare"
          })
        );
      } catch (submissionError) {
        return await normalizeUnhandledClaimLoopFailure(
          leaseState,
          apiBaseUrl,
          dependencies,
          submissionError,
          null,
          heartbeatLoop
        );
      }
      return "completed";
    }

    try {
      await refreshLease(leaseState, apiBaseUrl, dependencies);

      if (
        await submitCancellationIfRequested(
          leaseState,
          apiBaseUrl,
          dependencies,
          "Worker received a control-plane cancellation request before execution started."
        )
      ) {
        return "completed";
      }

      if (leaseState.leaseLost) {
        return "lease_lost";
      }

      if (workerJob.target.runKind !== "single_run") {
        await submitHarnessFailure(
          leaseState,
          apiBaseUrl,
          dependencies,
          buildStaticFailure({
            summary: `Worker received unsupported run kind ${workerJob.target.runKind}.`,
            failureCode: "run_configuration_invalid",
            phase: "prepare"
          })
        );
        return "completed";
      }

      if (workerJob.target.benchmarkItemId !== "Problem9") {
        await submitHarnessFailure(
          leaseState,
          apiBaseUrl,
          dependencies,
          buildStaticFailure({
            summary: `Worker received unsupported benchmark item ${workerJob.target.benchmarkItemId}.`,
            failureCode: "run_configuration_invalid",
            phase: "prepare"
          })
        );
        return "completed";
      }

      if (workerJob.target.runMode === "pass_k_probe") {
        await submitHarnessFailure(
          leaseState,
          apiBaseUrl,
          dependencies,
          buildStaticFailure({
            summary: "Hosted worker single-run execution does not support pass_k_probe targets yet.",
            failureCode: "run_configuration_invalid",
            phase: "prepare"
          })
        );
        return "completed";
      }

      try {
        assertProblem9HostedCapability({
          authMode: workerJob.target.authMode,
          modelConfigId: workerJob.target.modelConfigId,
          providerFamily: workerJob.target.providerFamily
        });
      } catch (error) {
        await submitHarnessFailure(
          leaseState,
          apiBaseUrl,
          dependencies,
          buildStaticFailure({
            summary: error instanceof Error ? error.message : String(error),
            failureCode: "provider_unsupported_request",
            phase: "prepare"
          })
        );
        return "completed";
      }

      const benchmarkResult = await dependencies.materializeBenchmarkPackage({
        outputRoot: leaseRoots.benchmarkPackageRoot
      });

      assertExpectedBenchmarkIdentity(workerJob.target, benchmarkResult);

      const promptDefaults = getDefaultProblem9PromptPackageOptions();
      const promptResult = await dependencies.materializePromptPackage({
        attemptId: workerJob.attemptId,
        authMode: workerJob.target.authMode,
        benchmarkPackageRoot: benchmarkResult.outputRoot,
        harnessRevision: workerJob.target.harnessRevision,
        jobId: workerJob.jobId,
        laneId: workerJob.target.laneId,
        modelConfigId: workerJob.target.modelConfigId,
        outputRoot: leaseRoots.promptPackageRoot,
        passKCount: null,
        passKIndex: null,
        promptLayerVersions: promptDefaults.promptLayerVersions,
        promptProtocolVersion: workerJob.target.promptProtocolVersion,
        providerFamily: workerJob.target.providerFamily,
        runId: workerJob.runId,
        runMode: workerJob.target.runMode,
        toolProfile: workerJob.target.toolProfile
      });

      if (promptResult.promptPackageDigest !== workerJob.target.promptPackageDigest) {
        throw new Error(
          `Prompt package digest mismatch: expected ${workerJob.target.promptPackageDigest}, got ${promptResult.promptPackageDigest}.`
        );
      }

      await appendWorkerEvent(
        leaseState,
        apiBaseUrl,
        dependencies,
        "attempt_started",
        "prepare",
        "Materialized benchmark and prompt package; starting Problem 9 attempt.",
        {
          benchmarkPackageDigest: benchmarkResult.packageDigest,
          promptPackageDigest: promptResult.promptPackageDigest,
          runMode: workerJob.target.runMode
        }
      );

      if (
        await submitCancellationIfRequested(
          leaseState,
          apiBaseUrl,
          dependencies,
          "Worker received a control-plane cancellation request before the attempt entered execution."
        )
      ) {
        return "completed";
      }

      if (leaseState.leaseLost) {
        return "lease_lost";
      }

      leaseState.currentPhase = "generate";
      leaseState.progressMessage = "Running Problem 9 attempt.";
      heartbeatLoop = startHeartbeatLoop(leaseState, apiBaseUrl, dependencies);

      let attemptResult: Problem9AttemptResult;

      try {
        attemptResult = await dependencies.attemptRunner({
          authMode: workerJob.target.authMode,
          benchmarkPackageRoot: benchmarkResult.outputRoot,
          modelSnapshotId: workerJob.target.modelSnapshotId,
          networkPolicyMode: "hosted",
          outputRoot: leaseRoots.attemptOutputRoot,
          promptPackageRoot: promptResult.outputRoot,
          providerFamily: workerJob.target.providerFamily,
          providerModel: resolveProviderModel({
            providerFamily: workerJob.target.providerFamily,
            configuredProviderModel: options.providerModel,
            modelConfigId: workerJob.target.modelConfigId
          }),
          stubScenario: inferStubScenario(workerJob.target.modelSnapshotId),
          workspaceRoot: leaseRoots.attemptWorkspaceRoot
        });
      } catch (error) {
        leaseState.stopped = true;
        leaseState.stopHeartbeat?.();
        await heartbeatLoop;

        if (
          await submitCancellationIfRequested(
            leaseState,
            apiBaseUrl,
            dependencies,
            "Worker stopped after a control-plane cancellation request during attempt execution."
          )
        ) {
          return "completed";
        }

        if (leaseState.leaseLost) {
          return "lease_lost";
        }

        const backgroundAttemptError = consumeBackgroundControlError(leaseState);

        if (backgroundAttemptError) {
          return await normalizeUnhandledClaimLoopFailure(
            leaseState,
            apiBaseUrl,
            dependencies,
            backgroundAttemptError,
            failureTerminalContext,
            heartbeatLoop
          );
        }

        if (leaseState.cancelRequested) {
          return await normalizeUnhandledClaimLoopFailure(
            leaseState,
            apiBaseUrl,
            dependencies,
            error,
            failureTerminalContext,
            heartbeatLoop
          );
        }

        await submitHarnessFailure(
          leaseState,
          apiBaseUrl,
          dependencies,
          classifyHostedAttemptError(error)
        );
        return "completed";
      }

      await Promise.resolve();

      const backgroundAttemptError = consumeBackgroundControlError(leaseState);

      if (backgroundAttemptError) {
        return await normalizeUnhandledClaimLoopFailure(
          leaseState,
          apiBaseUrl,
          dependencies,
          backgroundAttemptError,
          failureTerminalContext,
          heartbeatLoop
        );
      }

      leaseState.currentPhase = "finalize";
      leaseState.progressMessage = "Preparing terminal worker submission.";

      if (
        await submitCancellationIfRequested(
          leaseState,
          apiBaseUrl,
          dependencies,
          "Worker received a control-plane cancellation request before terminal submission."
        )
      ) {
        return "completed";
      }

      if (leaseState.leaseLost) {
        return "lease_lost";
      }

      await refreshLease(leaseState, apiBaseUrl, dependencies);

      if (
        await submitCancellationIfRequested(
          leaseState,
          apiBaseUrl,
          dependencies,
          "Worker received a control-plane cancellation request while preparing terminal submission."
        )
      ) {
        return "completed";
      }

      if (leaseState.leaseLost) {
        return "lease_lost";
      }

      const preFinalizeBackgroundError = consumeBackgroundControlError(leaseState);

      if (preFinalizeBackgroundError) {
        return await normalizeUnhandledClaimLoopFailure(
          leaseState,
          apiBaseUrl,
          dependencies,
          preFinalizeBackgroundError,
          failureTerminalContext,
          heartbeatLoop
        );
      }

      let bundleSubmission: PreparedBundleSubmission;

      try {
        bundleSubmission = await readBundleSubmission(attemptResult.outputRoot);
        assertBundleSubmissionMatchesJobTarget(bundleSubmission, {
          attemptId: workerJob.attemptId,
          authMode: workerJob.target.authMode,
          benchmarkItemId: workerJob.target.benchmarkItemId,
          benchmarkPackageDigest: workerJob.target.benchmarkPackageDigest,
          benchmarkPackageId: workerJob.target.benchmarkPackageId,
          benchmarkPackageVersion: workerJob.target.benchmarkPackageVersion,
          bundleSchemaVersion: workerJob.runBundleSchemaVersion,
          harnessRevision: workerJob.target.harnessRevision,
          jobId: workerJob.jobId,
          laneId: workerJob.target.laneId,
          modelConfigId: workerJob.target.modelConfigId,
          modelSnapshotId: workerJob.target.modelSnapshotId,
          promptPackageDigest: workerJob.target.promptPackageDigest,
          promptProtocolVersion: workerJob.target.promptProtocolVersion,
          providerFamily: workerJob.target.providerFamily,
          runId: workerJob.runId,
          runMode: workerJob.target.runMode,
          status: attemptResult.result === "pass" ? "success" : "failure",
          stopReason: attemptResult.stopReason,
          toolProfile: workerJob.target.toolProfile
        });
        assertRequiredArtifactRoles(bundleSubmission.artifactManifest, workerJob.requiredArtifactRoles);
      } catch (error) {
        if (error instanceof Error) {
          await submitHarnessFailure(
            leaseState,
            apiBaseUrl,
            dependencies,
            buildStaticFailure({
              summary: error.message,
              failureCode: "harness_crashed",
              phase: "finalize"
            })
          );
          if (
            await submitCancellationIfRequested(
              leaseState,
              apiBaseUrl,
              dependencies,
              "Worker received a control-plane cancellation request while validating the terminal bundle."
            )
          ) {
            return "completed";
          }

          return leaseState.leaseLost ? "lease_lost" : "completed";
        }

        throw error;
      }

      const manifestResponse = await submitArtifactManifest(
        leaseState,
        apiBaseUrl,
        dependencies,
        {
          artifacts: bundleSubmission.artifactManifest,
          artifactManifestDigest: bundleSubmission.artifactManifestDigest,
          attemptId: workerJob.attemptId,
          jobId: workerJob.jobId,
          leaseId: workerJob.leaseId,
          recordedAt: dependencies.now().toISOString()
        }
      );
      const cancellationTerminalContext: CancellationTerminalContext = {
        artifactIds: manifestResponse.artifacts.map((artifact) => artifact.artifactId),
        artifactManifestDigest: bundleSubmission.artifactManifestDigest,
        artifacts: manifestResponse.artifacts,
        bundleDigest: bundleSubmission.bundleDigest,
        candidateDigest: bundleSubmission.candidateDigest
      };
      failureTerminalContext = cancellationTerminalContext;

      await appendWorkerEvent(
        leaseState,
        apiBaseUrl,
        dependencies,
        "artifact_manifest_written",
        "finalize",
        "Registered artifact manifest for Problem 9 attempt bundle.",
        {
          artifactCount: bundleSubmission.artifactManifest.length,
          artifactManifestDigest: bundleSubmission.artifactManifestDigest
        }
      );

      if (
        await submitCancellationIfRequested(
          leaseState,
          apiBaseUrl,
          dependencies,
          "Worker received a control-plane cancellation request after artifact registration.",
          cancellationTerminalContext
        )
      ) {
        return "completed";
      }

      if (leaseState.leaseLost) {
        return "lease_lost";
      }

      const postManifestBackgroundError = consumeBackgroundControlError(leaseState);

      if (postManifestBackgroundError) {
        return await normalizeUnhandledClaimLoopFailure(
          leaseState,
          apiBaseUrl,
          dependencies,
          postManifestBackgroundError,
          failureTerminalContext,
          heartbeatLoop
        );
      }

      await appendWorkerEvent(
        leaseState,
        apiBaseUrl,
        dependencies,
        "bundle_finalized",
        "finalize",
        `Finalized offline-compatible run bundle with ${bundleSubmission.verifierVerdict.result} verdict.`,
        {
          bundleDigest: bundleSubmission.bundleDigest,
          verdictDigest: bundleSubmission.verdictDigest
        }
      );

      if (
        await submitCancellationIfRequested(
          leaseState,
          apiBaseUrl,
          dependencies,
          "Worker received a control-plane cancellation request after bundle finalization.",
          cancellationTerminalContext
        )
      ) {
        return "completed";
      }

      if (leaseState.leaseLost) {
        return "lease_lost";
      }

      const postBundleBackgroundError = consumeBackgroundControlError(leaseState);

      if (postBundleBackgroundError) {
        return await normalizeUnhandledClaimLoopFailure(
          leaseState,
          apiBaseUrl,
          dependencies,
          postBundleBackgroundError,
          failureTerminalContext,
          heartbeatLoop
        );
      }

      if (bundleSubmission.verifierVerdict.result === "pass") {
        const resultResponse = await submitWorkerResult(
          leaseState,
          apiBaseUrl,
          dependencies,
          {
            artifactIds: manifestResponse.artifacts.map((artifact) => artifact.artifactId),
            artifactManifestDigest: bundleSubmission.artifactManifestDigest,
            attemptId: workerJob.attemptId,
            bundleDigest: bundleSubmission.bundleDigest,
            candidateDigest: bundleSubmission.candidateDigest,
            completedAt: dependencies.now().toISOString(),
            environmentDigest: bundleSubmission.environmentDigest,
            jobId: workerJob.jobId,
            leaseId: workerJob.leaseId,
            offlineBundleCompatible: true,
            runId: workerJob.runId,
            summary: "Problem 9 attempt passed the authoritative verifier.",
            usageSummary: {
              compileRepairCount: attemptResult.compileRepairCount,
              providerTurnsUsed: attemptResult.providerTurnsUsed,
              stopReason: attemptResult.stopReason,
              verifierRepairCount: attemptResult.verifierRepairCount
            },
            verifierVerdict: bundleSubmission.verifierVerdict,
            verdictDigest: bundleSubmission.verdictDigest
          }
        );

        if (resultResponse.runState !== "succeeded") {
          throw new Error(`Unexpected worker result terminal state ${resultResponse.runState}.`);
        }

        return "completed";
      }

      await submitWorkerFailure(
        leaseState,
        apiBaseUrl,
        dependencies,
        {
          artifactIds: manifestResponse.artifacts.map((artifact) => artifact.artifactId),
          artifactManifestDigest: bundleSubmission.artifactManifestDigest,
          attemptId: workerJob.attemptId,
          bundleDigest: bundleSubmission.bundleDigest,
          candidateDigest: bundleSubmission.candidateDigest,
          failedAt: dependencies.now().toISOString(),
          failure:
            bundleSubmission.verifierVerdict.primaryFailure ??
            buildSelectedArtifactFallbackFailure(manifestResponse.artifacts, {
              summary: "Worker produced a failing verdict without a canonical primaryFailure payload.",
              failureCode: "proof_policy_failed",
              phase: "verify"
            }),
          jobId: workerJob.jobId,
          leaseId: workerJob.leaseId,
          runId: workerJob.runId,
          summary:
            bundleSubmission.verifierVerdict.primaryFailure?.summary ??
            "Problem 9 attempt failed verification.",
          terminalState: "failed",
          verifierVerdict: bundleSubmission.verifierVerdict,
          verdictDigest: bundleSubmission.verdictDigest
        }
      );

      return "completed";
    } catch (error) {
      return await normalizeUnhandledClaimLoopFailure(
        leaseState,
        apiBaseUrl,
        dependencies,
        error,
        failureTerminalContext,
        heartbeatLoop
      );
    }
  } finally {
    leaseState.stopped = true;
    leaseState.stopHeartbeat?.();
    await heartbeatLoop;
    await cleanupLeaseFilesystemRoots(leaseRoots);
  }
}

function buildClaimRequest(options: WorkerClaimLoopResolvedOptions): WorkerClaimRequest {
  return {
    activeJobCount: 0,
    availableRunKinds: ["single_run"],
    maxConcurrentJobs: options.maxConcurrentJobs,
    supportedArtifactRoles: [...supportedArtifactRoles],
    supportsOfflineBundleContract: true,
    supportsTraceUploads: false,
    workerId: options.workerId,
    workerPool: options.workerPool,
    workerRuntime: options.workerRuntime,
    workerVersion: options.workerVersion
  };
}

async function claimWorkerJob(options: {
  apiBaseUrl: string;
  fetchImpl: WorkerFetch;
  workerBootstrapToken: string;
  workerRequest: WorkerClaimRequest;
}): Promise<WorkerClaimResponse> {
  return postWorkerControl(
    options.fetchImpl,
    new URL("/internal/worker/claims", options.apiBaseUrl),
    {
      headers: {
        authorization: `Bearer ${options.workerBootstrapToken}`
      },
      method: "POST",
      payload: options.workerRequest,
      schema: workerClaimResponseSchema
    }
  );
}

function startHeartbeatLoop(
  leaseState: ActiveLeaseState,
  apiBaseUrl: string,
  dependencies: WorkerClaimLoopResolvedDependencies
): Promise<void> {
  const stopSignal = new Promise<void>((resolve) => {
    leaseState.stopHeartbeat = resolve;
  });

  return (async () => {
    while (!leaseState.stopped && !leaseState.cancelRequested && !leaseState.leaseLost) {
      await Promise.race([
        dependencies.sleep(leaseState.job.heartbeatIntervalSeconds * 1000),
        stopSignal
      ]);

      if (leaseState.stopped || leaseState.cancelRequested || leaseState.leaseLost) {
        return;
      }

      try {
        await refreshLease(leaseState, apiBaseUrl, dependencies);
      } catch (error) {
        leaseState.heartbeatErrorMessage = error instanceof Error ? error.message : String(error);
        if (isLeaseLossControlError(error)) {
          leaseState.leaseLost = true;
        } else {
          leaseState.backgroundControlError = error;
        }
        return;
      }
    }
  })();
}

async function refreshLease(
  leaseState: ActiveLeaseState,
  apiBaseUrl: string,
  dependencies: WorkerClaimLoopResolvedDependencies
): Promise<void> {
  const heartbeatResponse = await postWorkerControl(
    dependencies.fetchImpl,
    new URL(`/internal/worker/jobs/${leaseState.job.jobId}/heartbeat`, apiBaseUrl),
    {
      headers: {
        authorization: `Bearer ${leaseState.jobToken}`
      },
      method: "POST",
      payload: {
        attemptId: leaseState.job.attemptId,
        jobId: leaseState.job.jobId,
        lastEventSequence: leaseState.lastEventSequence,
        leaseId: leaseState.job.leaseId,
        observedAt: dependencies.now().toISOString(),
        phase: leaseState.currentPhase,
        progressMessage: leaseState.progressMessage
      } satisfies WorkerHeartbeatRequest,
      schema: workerHeartbeatResponseSchema
    }
  );

  applyHeartbeatResponse(leaseState, heartbeatResponse);
}

function applyHeartbeatResponse(
  leaseState: ActiveLeaseState,
  heartbeatResponse: WorkerHeartbeatResponse
): void {
  if (heartbeatResponse.acknowledgedEventSequence > leaseState.lastEventSequence) {
    leaseState.lastEventSequence = heartbeatResponse.acknowledgedEventSequence;
  }

  if (heartbeatResponse.jobToken) {
    leaseState.jobToken = heartbeatResponse.jobToken;
  }

  leaseState.cancelRequested =
    heartbeatResponse.cancelRequested || heartbeatResponse.leaseStatus === "cancel_requested";
  leaseState.leaseLost = heartbeatResponse.leaseStatus === "expired";
}

async function appendWorkerEvent(
  leaseState: ActiveLeaseState,
  apiBaseUrl: string,
  dependencies: WorkerClaimLoopResolvedDependencies,
  eventKind: WorkerExecutionEventKind,
  phase: WorkerExecutionPhase,
  summary: string,
  details: Record<string, unknown>
): Promise<void> {
  if (leaseState.cancelRequested || leaseState.leaseLost) {
    return;
  }

  leaseState.currentPhase = phase;
  leaseState.progressMessage = summary;
  const nextSequence = leaseState.lastEventSequence + 1;

  const eventPayload: WorkerExecutionEvent = {
    attemptId: leaseState.job.attemptId,
    details,
    eventKind,
    jobId: leaseState.job.jobId,
    leaseId: leaseState.job.leaseId,
    phase,
    recordedAt: dependencies.now().toISOString(),
    sequence: nextSequence,
    summary
  };

  const eventResponse = await postWorkerControl(
    dependencies.fetchImpl,
    new URL(`/internal/worker/jobs/${leaseState.job.jobId}/events`, apiBaseUrl),
    {
      headers: {
        authorization: `Bearer ${leaseState.jobToken}`
      },
      method: "POST",
      payload: eventPayload,
      schema: workerExecutionEventResponseSchema
    }
  );

  leaseState.lastEventSequence = Math.max(
    leaseState.lastEventSequence,
    nextSequence,
    eventResponse.acknowledgedSequence
  );
}

async function submitArtifactManifest(
  leaseState: ActiveLeaseState,
  apiBaseUrl: string,
  dependencies: WorkerClaimLoopResolvedDependencies,
  payload: WorkerArtifactManifestRequest
): Promise<WorkerArtifactManifestResponse> {
  return postWorkerControl(
    dependencies.fetchImpl,
    new URL(`/internal/worker/jobs/${leaseState.job.jobId}/artifacts`, apiBaseUrl),
    {
      headers: {
        authorization: `Bearer ${leaseState.jobToken}`
      },
      method: "POST",
      payload,
      schema: workerArtifactManifestResponseSchema
    }
  );
}

async function submitWorkerResult(
  leaseState: ActiveLeaseState,
  apiBaseUrl: string,
  dependencies: WorkerClaimLoopResolvedDependencies,
  payload: WorkerResultMessageRequest
): Promise<WorkerResultMessageResponse> {
  return postWorkerControl(
    dependencies.fetchImpl,
    new URL(`/internal/worker/jobs/${leaseState.job.jobId}/result`, apiBaseUrl),
    {
      headers: {
        authorization: `Bearer ${leaseState.jobToken}`
      },
      method: "POST",
      payload,
      schema: workerResultMessageResponseSchema
    }
  );
}

async function submitWorkerFailure(
  leaseState: ActiveLeaseState,
  apiBaseUrl: string,
  dependencies: WorkerClaimLoopResolvedDependencies,
  payload: WorkerTerminalFailureRequest
): Promise<WorkerTerminalFailureResponse> {
  return postWorkerControl(
    dependencies.fetchImpl,
    new URL(`/internal/worker/jobs/${leaseState.job.jobId}/failure`, apiBaseUrl),
    {
      headers: {
        authorization: `Bearer ${leaseState.jobToken}`
      },
      method: "POST",
      payload,
      schema: workerTerminalFailureResponseSchema
    }
  );
}

async function submitHarnessFailure(
  leaseState: ActiveLeaseState,
  apiBaseUrl: string,
  dependencies: WorkerClaimLoopResolvedDependencies,
  failure: WorkerFailureClassification,
  options: {
    allowCancelRequested?: boolean;
  } = {}
): Promise<void> {
  if (leaseState.leaseLost || (leaseState.cancelRequested && !options.allowCancelRequested)) {
    return;
  }

  leaseState.currentPhase = failure.phase;
  leaseState.progressMessage = failure.summary;

  await submitWorkerFailure(leaseState, apiBaseUrl, dependencies, {
    artifactManifestDigest: null,
    attemptId: leaseState.job.attemptId,
    bundleDigest: null,
    candidateDigest: null,
    failedAt: dependencies.now().toISOString(),
    failure,
    jobId: leaseState.job.jobId,
    leaseId: leaseState.job.leaseId,
    runId: leaseState.job.runId,
    summary: failure.summary,
    terminalState: failure.terminality === "cancelled" ? "cancelled" : "failed",
    verifierVerdict: null,
    verdictDigest: null
  });
}

async function submitCancellationIfRequested(
  leaseState: ActiveLeaseState,
  apiBaseUrl: string,
  dependencies: WorkerClaimLoopResolvedDependencies,
  summary = "Worker received a control-plane cancellation request.",
  terminalContext: CancellationTerminalContext | null = null
): Promise<boolean> {
  if (!leaseState.cancelRequested || leaseState.leaseLost) {
    return false;
  }

  leaseState.currentPhase = "cancel";
  leaseState.progressMessage = summary;
  const failure = terminalContext
    ? buildSelectedArtifactFallbackFailure(terminalContext.artifacts, {
        summary,
        failureCode: "manual_cancelled",
        phase: "cancel"
      })
    : buildStaticFailure({
        summary,
        failureCode: "manual_cancelled",
        phase: "cancel"
      });

  try {
    await submitWorkerFailure(
      leaseState,
      apiBaseUrl,
      dependencies,
      {
        artifactIds: terminalContext?.artifactIds ?? [],
        artifactManifestDigest: terminalContext?.artifactManifestDigest ?? null,
        attemptId: leaseState.job.attemptId,
        bundleDigest: terminalContext?.bundleDigest ?? null,
        candidateDigest: terminalContext?.candidateDigest ?? null,
        failedAt: dependencies.now().toISOString(),
        failure,
        jobId: leaseState.job.jobId,
        leaseId: leaseState.job.leaseId,
        runId: leaseState.job.runId,
        summary,
        terminalState: "cancelled",
        verifierVerdict: null,
        verdictDigest: null
      }
    );
  } catch (error) {
    if (isLeaseLossControlError(error)) {
      leaseState.heartbeatErrorMessage = error instanceof Error ? error.message : String(error);
      leaseState.leaseLost = true;
      return false;
    }

    throw error;
  }

  return true;
}

async function normalizeUnhandledClaimLoopFailure(
  leaseState: ActiveLeaseState,
  apiBaseUrl: string,
  dependencies: WorkerClaimLoopResolvedDependencies,
  error: unknown,
  terminalContext: CancellationTerminalContext | null,
  heartbeatLoop: Promise<void>
): Promise<"completed" | "lease_lost"> {
  leaseState.stopped = true;
  leaseState.stopHeartbeat?.();
  await heartbeatLoop;

  if (isLeaseLossControlError(error)) {
    leaseState.heartbeatErrorMessage = error instanceof Error ? error.message : String(error);
    leaseState.leaseLost = true;
    return "lease_lost";
  }

  const cancellationSummary =
    "Worker received a control-plane cancellation request while recovering from an internal worker control failure.";
  let recoveryError = error;
  let retryCancelledTerminalization = isCancelRequestedTerminalizationConflict(error);

  if (retryCancelledTerminalization) {
    leaseState.cancelRequested = true;
  }

  if (leaseState.cancelRequested) {
    try {
      if (
        await submitCancellationIfRequested(
          leaseState,
          apiBaseUrl,
          dependencies,
          cancellationSummary,
          terminalContext
        )
      ) {
        return "completed";
      }

      if (leaseState.leaseLost) {
        return "lease_lost";
      }
    } catch (cancelError) {
      if (isLeaseLossControlError(cancelError)) {
        leaseState.heartbeatErrorMessage =
          cancelError instanceof Error ? cancelError.message : String(cancelError);
        leaseState.leaseLost = true;
        return "lease_lost";
      }

      recoveryError = cancelError;
      retryCancelledTerminalization = true;
    }
  }

  const summary = retryCancelledTerminalization
    ? cancellationSummary
    : recoveryError instanceof Error
      ? recoveryError.message
      : String(recoveryError);
  const failure = retryCancelledTerminalization
    ? terminalContext
      ? buildSelectedArtifactFallbackFailure(terminalContext.artifacts, {
          summary,
          failureCode: "manual_cancelled",
          phase: "cancel"
        })
      : buildStaticFailure({
          summary,
          failureCode: "manual_cancelled",
          phase: "cancel"
        })
    : terminalContext
      ? buildSelectedArtifactFallbackFailure(terminalContext.artifacts, {
          summary,
          failureCode: "harness_crashed",
          phase: leaseState.currentPhase
        })
      : buildStaticFailure({
          summary,
          failureCode: "harness_crashed",
          phase: leaseState.currentPhase
        });

  try {
    await submitWorkerFailure(leaseState, apiBaseUrl, dependencies, {
      artifactIds: terminalContext?.artifactIds,
      artifactManifestDigest: terminalContext?.artifactManifestDigest ?? null,
      attemptId: leaseState.job.attemptId,
      bundleDigest: terminalContext?.bundleDigest ?? null,
      candidateDigest: terminalContext?.candidateDigest ?? null,
      failedAt: dependencies.now().toISOString(),
      failure,
      jobId: leaseState.job.jobId,
      leaseId: leaseState.job.leaseId,
      runId: leaseState.job.runId,
      summary,
      terminalState: retryCancelledTerminalization ? "cancelled" : "failed",
      verifierVerdict: null,
      verdictDigest: null
    });
  } catch (submissionError) {
    if (isLeaseLossControlError(submissionError)) {
      leaseState.heartbeatErrorMessage =
        submissionError instanceof Error ? submissionError.message : String(submissionError);
      leaseState.leaseLost = true;
      return "lease_lost";
    }

    throw submissionError;
  }

  return "completed";
}

function consumeBackgroundControlError(leaseState: ActiveLeaseState): unknown | null {
  const backgroundControlError = leaseState.backgroundControlError;
  leaseState.backgroundControlError = null;
  return backgroundControlError;
}

function isLeaseLossControlError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /invalid_worker_job_token|worker_lease_not_active|worker_lease_not_found/u.test(
    error.message
  );
}

function isCancelRequestedTerminalizationConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    /worker_cancel_requested_requires_cancelled_terminalization/u.test(error.message)
  );
}

function assertExpectedBenchmarkIdentity(
  target: Extract<NonNullable<ActiveWorkerJob>["target"], { runKind: "single_run" }>,
  benchmarkResult: Awaited<ReturnType<typeof materializeProblem9Package>>
): void {
  if (
    benchmarkResult.packageId !== target.benchmarkPackageId ||
    benchmarkResult.packageVersion !== target.benchmarkPackageVersion
  ) {
    throw new Error("Materialized benchmark package identity does not match the claimed target.");
  }

  if (benchmarkResult.packageDigest !== target.benchmarkPackageDigest) {
    throw new Error(
      `Benchmark package digest mismatch: expected ${target.benchmarkPackageDigest}, got ${benchmarkResult.packageDigest}.`
    );
  }
}

async function readBundleSubmission(bundleRoot: string): Promise<PreparedBundleSubmission> {
  const bundleRootRealPath = await realpath(bundleRoot);
  const artifactManifestText = await loadBundleTextFile(bundleRootRealPath, "artifact-manifest.json");
  const runBundleText = await loadBundleTextFile(bundleRootRealPath, "run-bundle.json");
  const verdictText = await loadBundleTextFile(bundleRootRealPath, "verification/verdict.json");
  const candidateText = await loadBundleTextFile(bundleRootRealPath, "candidate/Candidate.lean");
  const environmentText = await loadBundleTextFile(bundleRootRealPath, "environment/environment.json");
  const benchmarkPackageText = await loadBundleTextFile(
    bundleRootRealPath,
    "package/benchmark-package.json"
  );
  const promptPackageText = await loadBundleTextFile(
    bundleRootRealPath,
    "prompt/prompt-package.json"
  );
  const packageRefText = await loadBundleTextFile(bundleRootRealPath, "package/package-ref.json");
  const manifestValue = JSON.parse(artifactManifestText);
  const environmentValue = JSON.parse(environmentText);
  const verdictValue = JSON.parse(verdictText);
  const benchmarkPackageValue = JSON.parse(benchmarkPackageText);
  const promptPackageValue = JSON.parse(promptPackageText);
  const packageRefValue = JSON.parse(packageRefText);
  const manifestFile = artifactManifestFileSchema.parse(manifestValue);
  const runBundle = runBundleFileSchema.parse(JSON.parse(runBundleText));
  const verifierVerdict = bundleVerifierVerdictFileSchema.parse(verdictValue);
  const benchmarkPackage = problem9BenchmarkPackageManifestSchema.parse(benchmarkPackageValue);
  const promptPackage = problem9PromptPackageManifestSchema.parse(promptPackageValue);
  const packageRef = problem9PackageRefSchema.parse(packageRefValue);
  const environment = problem9EnvironmentManifestSchema.parse(environmentValue);
  const artifactManifestDigest = sha256Text(artifactManifestText);
  const candidateDigest = sha256Text(candidateText);
  const environmentDigest = sha256Text(stableStringify(environment));
  const verdictDigest = sha256Text(stableStringify(verdictValue));
  const bundleDigest = computeBundleDigest(runBundle, manifestFile);

  assertCanonicalDigest(
    artifactManifestDigest,
    runBundle.artifactManifestDigest,
    "run-bundle.json artifactManifestDigest does not match artifact-manifest.json."
  );
  assertCanonicalDigest(
    candidateDigest,
    runBundle.candidateDigest,
    "run-bundle.json candidateDigest does not match candidate/Candidate.lean."
  );
  assertCanonicalDigest(
    environmentDigest,
    runBundle.environmentDigest,
    "run-bundle.json environmentDigest does not match environment/environment.json."
  );
  assertCanonicalDigest(
    verdictDigest,
    runBundle.verdictDigest,
    "run-bundle.json verdictDigest does not match verification/verdict.json."
  );
  assertCanonicalDigest(
    bundleDigest,
    runBundle.bundleDigest,
    "run-bundle.json bundleDigest does not match the canonical bundle digest."
  );

  await assertManifestEntriesMatchFiles(bundleRootRealPath, manifestFile);

  if (normalizeDigest(verifierVerdict.candidateDigest) !== normalizeDigest(candidateDigest)) {
    throw new BundleSubmissionIntegrityError(
      "verification/verdict.json candidateDigest does not match candidate/Candidate.lean."
    );
  }

  if (
    (verifierVerdict.result === "pass" && runBundle.status !== "success") ||
    (verifierVerdict.result === "fail" && runBundle.status !== "failure")
  ) {
    throw new BundleSubmissionIntegrityError(
      "run-bundle.json status does not match verification/verdict.json result."
    );
  }

  assertBundleSubmissionFileConsistency({
    benchmarkPackage,
    environment,
    environmentDigest,
    packageRef,
    promptPackage,
    runBundle,
    verifierVerdict
  });
  await assertBundleProvenanceDigests(bundleRootRealPath, {
    benchmarkPackage,
    promptPackage,
    runBundle
  });

  assertVerifierVerdictSemantics(verifierVerdict);

  assertCanonicalDigest(
    computeRunConfigDigest({
      benchmarkPackage,
      environment,
      environmentDigest,
      promptPackage
    }),
    runBundle.runConfigDigest,
    "run-bundle.json runConfigDigest does not match the canonical run configuration digest."
  );

  return {
    artifactManifest: manifestFile.artifacts.map((artifact) => ({
      artifactRole: artifact.artifactRole as WorkerBundleArtifactRole,
      byteSize: artifact.byteSize,
      contentEncoding: artifact.contentEncoding,
      mediaType: artifact.mediaType,
      relativePath: normalizeManifestRelativePath(artifact.relativePath),
      requiredForIngest: artifact.requiredForIngest,
      sha256: artifact.sha256
    })),
    artifactManifestDigest,
    bundleDigest,
    candidateDigest,
    environmentDigest,
    runBundle,
    verifierVerdict,
    verdictDigest
  };
}

function assertBundleSubmissionMatchesJobTarget(
  bundleSubmission: PreparedBundleSubmission,
  expected: {
    attemptId: string;
    authMode: string;
    benchmarkItemId: string;
    benchmarkPackageDigest: string;
    benchmarkPackageId: string;
    benchmarkPackageVersion: string;
    bundleSchemaVersion: string;
    harnessRevision: string;
    jobId: string;
    laneId: string;
    modelConfigId: string;
    modelSnapshotId: string;
    promptPackageDigest: string;
    promptProtocolVersion: string;
    providerFamily: string;
    runId: string;
    runMode: string;
    status: string;
    stopReason: string;
    toolProfile: string;
  }
): void {
  const runBundleChecks: Array<[field: string, actual: string | null, expectedValue: string]> = [
    ["attemptId", bundleSubmission.runBundle.attemptId, expected.attemptId],
    ["authMode", bundleSubmission.runBundle.authMode, expected.authMode],
    ["benchmarkItemId", bundleSubmission.runBundle.benchmarkItemId, expected.benchmarkItemId],
    ["benchmarkPackageDigest", bundleSubmission.runBundle.benchmarkPackageDigest, expected.benchmarkPackageDigest],
    ["benchmarkPackageId", bundleSubmission.runBundle.benchmarkPackageId, expected.benchmarkPackageId],
    ["benchmarkPackageVersion", bundleSubmission.runBundle.benchmarkPackageVersion, expected.benchmarkPackageVersion],
    ["bundleSchemaVersion", bundleSubmission.runBundle.bundleSchemaVersion, expected.bundleSchemaVersion],
    ["harnessRevision", bundleSubmission.runBundle.harnessRevision, expected.harnessRevision],
    ["jobId", bundleSubmission.runBundle.jobId, expected.jobId],
    ["laneId", bundleSubmission.runBundle.laneId, expected.laneId],
    ["modelConfigId", bundleSubmission.runBundle.modelConfigId, expected.modelConfigId],
    ["modelSnapshotId", bundleSubmission.runBundle.modelSnapshotId, expected.modelSnapshotId],
    ["promptPackageDigest", bundleSubmission.runBundle.promptPackageDigest, expected.promptPackageDigest],
    ["promptProtocolVersion", bundleSubmission.runBundle.promptProtocolVersion, expected.promptProtocolVersion],
    ["providerFamily", bundleSubmission.runBundle.providerFamily, expected.providerFamily],
    ["runId", bundleSubmission.runBundle.runId, expected.runId],
    ["runMode", bundleSubmission.runBundle.runMode, expected.runMode],
    ["status", bundleSubmission.runBundle.status, expected.status],
    ["stopReason", bundleSubmission.runBundle.stopReason, expected.stopReason],
    ["toolProfile", bundleSubmission.runBundle.toolProfile, expected.toolProfile]
  ];
  const mismatchedRunBundleField = runBundleChecks.find(
    ([field, actual, expectedValue]) => !isBundleFieldMatch(field, actual, expectedValue)
  );

  if (mismatchedRunBundleField) {
    throw new BundleSubmissionIntegrityError(
      `run-bundle.json ${mismatchedRunBundleField[0]} does not match the claimed job target.`
    );
  }

  const verdictChecks: Array<[field: string, actual: string, expectedValue: string]> = [
    ["attemptId", bundleSubmission.verifierVerdict.attemptId, expected.attemptId],
    ["benchmarkPackageDigest", bundleSubmission.verifierVerdict.benchmarkPackageDigest, expected.benchmarkPackageDigest],
    ["laneId", bundleSubmission.verifierVerdict.laneId, expected.laneId],
    ["runId", bundleSubmission.verifierVerdict.runId, expected.runId]
  ];
  const mismatchedVerdictField = verdictChecks.find(
    ([field, actual, expectedValue]) => !isBundleFieldMatch(field, actual, expectedValue)
  );

  if (mismatchedVerdictField) {
    throw new BundleSubmissionIntegrityError(
      `verification/verdict.json ${mismatchedVerdictField[0]} does not match the claimed job target.`
    );
  }
}

async function assertManifestEntriesMatchFiles(
  bundleRootRealPath: string,
  artifactManifest: z.output<typeof artifactManifestFileSchema>
): Promise<void> {
  const seenRelativePaths = new Set<string>();

  for (const artifact of artifactManifest.artifacts) {
    const canonicalRelativePath = normalizeManifestRelativePath(artifact.relativePath);

    if (seenRelativePaths.has(canonicalRelativePath)) {
      throw new BundleSubmissionIntegrityError(
        `artifact-manifest.json contains a duplicate relativePath: ${canonicalRelativePath}.`
      );
    }

    seenRelativePaths.add(canonicalRelativePath);

    const expectedArtifactRole =
      canonicalArtifactRoleByPath[canonicalRelativePath as keyof typeof canonicalArtifactRoleByPath];

    if (expectedArtifactRole && artifact.artifactRole !== expectedArtifactRole) {
      throw new BundleSubmissionIntegrityError(
        `artifact-manifest.json ${canonicalRelativePath} must use artifactRole ${expectedArtifactRole}.`
      );
    }

    if (!expectedArtifactRole && !isOptionalArtifactRole(artifact.artifactRole)) {
      throw new BundleSubmissionIntegrityError(
        `artifact-manifest.json ${canonicalRelativePath} uses unsupported artifactRole ${artifact.artifactRole}.`
      );
    }

    if (artifact.relativePath === "run-bundle.json" || artifact.artifactRole === "run_manifest") {
      throw new BundleSubmissionIntegrityError(
        "artifact-manifest.json must not declare run-bundle.json as a manifest artifact."
      );
    }

    const filePath = await resolveBundleFilePath(bundleRootRealPath, canonicalRelativePath);
    const fileStats = await stat(filePath);

    assertCanonicalDigest(
      await computeArtifactDigest(filePath, artifact),
      artifact.sha256,
      `${canonicalRelativePath} sha256 does not match artifact-manifest.json.`
    );

    if (fileStats.size !== artifact.byteSize) {
      throw new BundleSubmissionIntegrityError(
        `${canonicalRelativePath} byteSize does not match artifact-manifest.json.`
      );
    }

    if (!expectedArtifactRole) {
      continue;
    }

    const expectedManifestMetadata = expectedManifestMetadataForPath(canonicalRelativePath);

    if (artifact.contentEncoding !== expectedManifestMetadata.contentEncoding) {
      throw new BundleSubmissionIntegrityError(
        `${canonicalRelativePath} contentEncoding does not match the canonical bundle contract.`
      );
    }

    if (artifact.mediaType !== expectedManifestMetadata.mediaType) {
      throw new BundleSubmissionIntegrityError(
        `${canonicalRelativePath} mediaType does not match the canonical bundle contract.`
      );
    }

    if (artifact.requiredForIngest !== expectedManifestMetadata.requiredForIngest) {
      throw new BundleSubmissionIntegrityError(
        `${canonicalRelativePath} requiredForIngest does not match the canonical bundle contract.`
      );
    }
  }

  for (const requiredRelativePath of alwaysRequiredCanonicalArtifactPaths) {
    if (!seenRelativePaths.has(requiredRelativePath)) {
      throw new BundleSubmissionIntegrityError(
        `artifact-manifest.json is missing required bundle file: ${requiredRelativePath}.`
      );
    }
  }
}

async function resolveBundleFilePath(
  bundleRootRealPath: string,
  relativePath: string
): Promise<string> {
  const fullPath = path.join(bundleRootRealPath, relativePath);
  const fileStats = await lstat(fullPath).catch(() => null);

  if (!fileStats?.isFile() || fileStats.isSymbolicLink()) {
    throw new BundleSubmissionIntegrityError(
      `artifact-manifest.json references a missing or unsupported bundle file: ${relativePath}.`
    );
  }

  const resolvedFilePath = await realpath(fullPath);
  const relativeResolvedPath = path.relative(bundleRootRealPath, resolvedFilePath);

  if (
    relativeResolvedPath.startsWith("..") ||
    path.isAbsolute(relativeResolvedPath) ||
    relativeResolvedPath.length === 0
  ) {
    throw new BundleSubmissionIntegrityError(
      `artifact-manifest.json path escapes the bundle root: ${relativePath}.`
    );
  }

  return resolvedFilePath;
}

async function loadBundleTextFile(
  bundleRootRealPath: string,
  relativePath: string
): Promise<string> {
  const filePath = await resolveBundleFilePath(bundleRootRealPath, relativePath);
  return loadNormalizedText(filePath);
}

async function computeArtifactDigest(
  filePath: string,
  artifact: Pick<WorkerArtifactManifestEntry, "contentEncoding" | "mediaType">
): Promise<string> {
  const fileBytes = await readFile(filePath);

  if (shouldHashNormalizedTextArtifact(artifact)) {
    return sha256Text(fileBytes.toString("utf8"));
  }

  return sha256Bytes(fileBytes);
}

function shouldHashNormalizedTextArtifact(
  artifact: Pick<WorkerArtifactManifestEntry, "contentEncoding" | "mediaType">
): boolean {
  if (artifact.contentEncoding !== null) {
    return false;
  }

  return artifact.mediaType === "application/json" || artifact.mediaType?.startsWith("text/") === true;
}

function assertBundleSubmissionFileConsistency(options: {
  benchmarkPackage: z.output<typeof problem9BenchmarkPackageManifestSchema>;
  environment: z.output<typeof problem9EnvironmentManifestSchema>;
  environmentDigest: string;
  packageRef: z.output<typeof problem9PackageRefSchema>;
  promptPackage: z.output<typeof problem9PromptPackageManifestSchema>;
  runBundle: z.output<typeof runBundleFileSchema>;
  verifierVerdict: z.output<typeof bundleVerifierVerdictFileSchema>;
}): void {
  if (normalizeDigest(options.packageRef.benchmarkPackageDigest) !== normalizeDigest(options.benchmarkPackage.packageDigest)) {
    throw new BundleSubmissionIntegrityError(
      "package/package-ref.json benchmarkPackageDigest does not match package/benchmark-package.json."
    );
  }

  if (options.packageRef.benchmarkPackageVersion !== options.benchmarkPackage.packageVersion) {
    throw new BundleSubmissionIntegrityError(
      "package/package-ref.json benchmarkPackageVersion does not match package/benchmark-package.json."
    );
  }

  if (options.packageRef.benchmarkItemId !== options.benchmarkPackage.benchmarkItemId) {
    throw new BundleSubmissionIntegrityError(
      "package/package-ref.json benchmarkItemId does not match package/benchmark-package.json."
    );
  }

  if (
    normalizeDigest(options.promptPackage.benchmarkPackageDigest) !==
    normalizeDigest(options.benchmarkPackage.packageDigest)
  ) {
    throw new BundleSubmissionIntegrityError(
      "prompt/prompt-package.json benchmarkPackageDigest does not match package/benchmark-package.json."
    );
  }

  if (options.promptPackage.benchmarkPackageVersion !== options.benchmarkPackage.packageVersion) {
    throw new BundleSubmissionIntegrityError(
      "prompt/prompt-package.json benchmarkPackageVersion does not match package/benchmark-package.json."
    );
  }

  if (options.promptPackage.benchmarkItemId !== options.benchmarkPackage.benchmarkItemId) {
    throw new BundleSubmissionIntegrityError(
      "prompt/prompt-package.json benchmarkItemId does not match package/benchmark-package.json."
    );
  }

  const runBundlePromptChecks: Array<[field: string, actual: string, expectedValue: string]> = [
    ["authMode", options.runBundle.authMode, options.promptPackage.authMode],
    ["benchmarkItemId", options.runBundle.benchmarkItemId, options.promptPackage.benchmarkItemId],
    ["benchmarkPackageId", options.runBundle.benchmarkPackageId, options.promptPackage.benchmarkPackageId],
    ["benchmarkPackageVersion", options.runBundle.benchmarkPackageVersion, options.promptPackage.benchmarkPackageVersion],
    ["harnessRevision", options.runBundle.harnessRevision, options.promptPackage.harnessRevision],
    ["laneId", options.runBundle.laneId, options.promptPackage.laneId],
    ["modelConfigId", options.runBundle.modelConfigId, options.promptPackage.modelConfigId],
    ["promptProtocolVersion", options.runBundle.promptProtocolVersion, options.promptPackage.promptProtocolVersion],
    ["providerFamily", options.runBundle.providerFamily, options.promptPackage.providerFamily],
    ["runMode", options.runBundle.runMode, options.promptPackage.runMode],
    ["toolProfile", options.runBundle.toolProfile, options.promptPackage.toolProfile]
  ];
  const mismatchedRunBundlePromptField = runBundlePromptChecks.find(
    ([, actual, expectedValue]) => actual !== expectedValue
  );

  if (mismatchedRunBundlePromptField) {
    throw new BundleSubmissionIntegrityError(
      `run-bundle.json ${mismatchedRunBundlePromptField[0]} does not match prompt/prompt-package.json.`
    );
  }

  if (normalizeDigest(options.runBundle.benchmarkPackageDigest) !== normalizeDigest(options.benchmarkPackage.packageDigest)) {
    throw new BundleSubmissionIntegrityError(
      "run-bundle.json benchmarkPackageDigest does not match package/benchmark-package.json."
    );
  }

  if (normalizeDigest(options.runBundle.promptPackageDigest) !== normalizeDigest(options.promptPackage.promptPackageDigest)) {
    throw new BundleSubmissionIntegrityError(
      "run-bundle.json promptPackageDigest does not match prompt/prompt-package.json."
    );
  }

  if (normalizeDigest(options.runBundle.environmentDigest) !== normalizeDigest(options.environmentDigest)) {
    throw new BundleSubmissionIntegrityError(
      "run-bundle.json environmentDigest does not match environment/environment.json."
    );
  }

  if (options.environment.harnessRevision !== options.runBundle.harnessRevision) {
    throw new BundleSubmissionIntegrityError(
      "environment/environment.json harnessRevision does not match run-bundle.json."
    );
  }

  const environmentRunBundleChecks: Array<[field: string, actual: string, expectedValue: string]> = [
    ["authMode", options.environment.authMode, options.runBundle.authMode],
    ["laneId", options.environment.laneId, options.runBundle.laneId],
    ["modelConfigId", options.environment.modelConfigId, options.runBundle.modelConfigId],
    ["promptProtocolVersion", options.environment.promptProtocolVersion, options.runBundle.promptProtocolVersion],
    ["providerFamily", options.environment.providerFamily, options.runBundle.providerFamily],
    ["runMode", options.environment.runMode, options.runBundle.runMode],
    ["toolProfile", options.environment.toolProfile, options.runBundle.toolProfile],
    ["verifierVersion", options.environment.verifierVersion, options.runBundle.verifierVersion]
  ];
  const mismatchedEnvironmentField = environmentRunBundleChecks.find(
    ([, actual, expectedValue]) => actual !== expectedValue
  );

  if (mismatchedEnvironmentField) {
    throw new BundleSubmissionIntegrityError(
      `environment/environment.json ${mismatchedEnvironmentField[0]} does not match run-bundle.json.`
    );
  }

  if (options.environment.modelSnapshotId !== options.runBundle.modelSnapshotId) {
    throw new BundleSubmissionIntegrityError(
      "environment/environment.json modelSnapshotId does not match run-bundle.json."
    );
  }

  if (options.verifierVerdict.runId !== options.runBundle.runId) {
    throw new BundleSubmissionIntegrityError(
      "verification/verdict.json runId does not match run-bundle.json."
    );
  }

  if (options.verifierVerdict.attemptId !== options.runBundle.attemptId) {
    throw new BundleSubmissionIntegrityError(
      "verification/verdict.json attemptId does not match run-bundle.json."
    );
  }

  if (
    normalizeDigest(options.verifierVerdict.benchmarkPackageDigest) !==
    normalizeDigest(options.runBundle.benchmarkPackageDigest)
  ) {
    throw new BundleSubmissionIntegrityError(
      "verification/verdict.json benchmarkPackageDigest does not match run-bundle.json."
    );
  }

  if (options.verifierVerdict.laneId !== options.runBundle.laneId) {
    throw new BundleSubmissionIntegrityError(
      "verification/verdict.json laneId does not match run-bundle.json."
    );
  }
}

async function assertBundleProvenanceDigests(
  bundleRootRealPath: string,
  options: {
    benchmarkPackage: z.output<typeof problem9BenchmarkPackageManifestSchema>;
    promptPackage: z.output<typeof problem9PromptPackageManifestSchema>;
    runBundle: z.output<typeof runBundleFileSchema>;
  }
): Promise<void> {
  for (const relativePath of benchmarkSourcePaths) {
    assertCanonicalDigest(
      sha256Text(await loadBundleTextFile(bundleRootRealPath, `package/${relativePath}`)),
      options.benchmarkPackage.hashes[relativePath],
      `package/${relativePath} does not match package/benchmark-package.json hashes.`
    );
  }

  for (const relativePath of promptLayerPaths) {
    assertCanonicalDigest(
      sha256Text(await loadBundleTextFile(bundleRootRealPath, `prompt/${relativePath}`)),
      options.promptPackage.layerDigests[relativePath],
      `prompt/${relativePath} does not match prompt/prompt-package.json layerDigests.`
    );
  }

  assertPromptRunEnvelopeConsistency(
    parsePromptRunEnvelope(await loadBundleTextFile(bundleRootRealPath, "prompt/run-envelope.json")),
    options
  );
}

function parsePromptRunEnvelope(contents: string) {
  try {
    return promptRunEnvelopeSchema.parse(JSON.parse(contents));
  } catch {
    throw new BundleSubmissionIntegrityError(
      "prompt/run-envelope.json is not a valid prompt run envelope."
    );
  }
}

function assertPromptRunEnvelopeConsistency(
  runEnvelope: z.infer<typeof promptRunEnvelopeSchema>,
  options: {
    benchmarkPackage: z.output<typeof problem9BenchmarkPackageManifestSchema>;
    promptPackage: z.output<typeof problem9PromptPackageManifestSchema>;
    runBundle: z.output<typeof runBundleFileSchema>;
  }
): void {
  const checks: Array<[actual: string | null, expected: string | null, label: string]> = [
    [runEnvelope.attemptId, options.runBundle.attemptId, "attemptId"],
    [runEnvelope.authMode, options.promptPackage.authMode, "authMode"],
    [runEnvelope.benchmarkItemId, options.runBundle.benchmarkItemId, "benchmarkItemId"],
    [
      runEnvelope.benchmarkPackageDigest,
      options.benchmarkPackage.packageDigest,
      "benchmarkPackageDigest"
    ],
    [runEnvelope.benchmarkPackageId, options.benchmarkPackage.packageId, "benchmarkPackageId"],
    [
      runEnvelope.benchmarkPackageVersion,
      options.benchmarkPackage.packageVersion,
      "benchmarkPackageVersion"
    ],
    [runEnvelope.harnessRevision, options.promptPackage.harnessRevision, "harnessRevision"],
    [runEnvelope.jobId, options.runBundle.jobId, "jobId"],
    [runEnvelope.laneId, options.promptPackage.laneId, "laneId"],
    [runEnvelope.modelConfigId, options.promptPackage.modelConfigId, "modelConfigId"],
    [
      runEnvelope.promptProtocolVersion,
      options.promptPackage.promptProtocolVersion,
      "promptProtocolVersion"
    ],
    [runEnvelope.providerFamily, options.promptPackage.providerFamily, "providerFamily"],
    [runEnvelope.runId, options.runBundle.runId, "runId"],
    [runEnvelope.runMode, options.promptPackage.runMode, "runMode"],
    [runEnvelope.toolProfile, options.promptPackage.toolProfile, "toolProfile"]
  ];

  for (const [actual, expected, label] of checks) {
    if (actual !== expected) {
      throw new BundleSubmissionIntegrityError(
        `prompt/run-envelope.json ${label} does not match the canonical bundle contract.`
      );
    }
  }
}

function assertVerifierVerdictSemantics(
  verifierVerdict: z.output<typeof bundleVerifierVerdictFileSchema>
): void {
  if (verifierVerdict.result === "pass") {
    if (verifierVerdict.primaryFailure !== null) {
      throw new BundleSubmissionIntegrityError(
        "Passing verifier verdicts may not include a primaryFailure classification."
      );
    }

    if (verifierVerdict.semanticEquality !== "matched") {
      throw new BundleSubmissionIntegrityError(
        "Passing verifier verdicts require semanticEquality=matched."
      );
    }

    if (verifierVerdict.containsAdmit || verifierVerdict.containsSorry) {
      throw new BundleSubmissionIntegrityError(
        "Passing verifier verdicts may not contain sorry or admit."
      );
    }

    if (verifierVerdict.axiomCheck !== "passed") {
      throw new BundleSubmissionIntegrityError(
        "Passing verifier verdicts require axiomCheck=passed."
      );
    }

    if (verifierVerdict.diagnosticGate !== "passed") {
      throw new BundleSubmissionIntegrityError(
        "Passing verifier verdicts require diagnosticGate=passed."
      );
    }

    return;
  }

  if (verifierVerdict.primaryFailure === null) {
    throw new BundleSubmissionIntegrityError(
      "Failing verifier verdicts require a primaryFailure classification."
    );
  }

  if (
    verifierVerdict.failureCode !== undefined &&
    verifierVerdict.failureCode !== verifierVerdict.primaryFailure.failureCode
  ) {
    throw new BundleSubmissionIntegrityError(
      "Failing verifier verdicts require failureCode to match primaryFailure.failureCode."
    );
  }
}

function computeRunConfigDigest(options: {
  benchmarkPackage: z.output<typeof problem9BenchmarkPackageManifestSchema>;
  environment: z.output<typeof problem9EnvironmentManifestSchema>;
  environmentDigest: string;
  promptPackage: z.output<typeof problem9PromptPackageManifestSchema>;
}): string {
  return sha256Text(
    stableStringify({
      authMode: options.promptPackage.authMode,
      benchmarkItemId: options.benchmarkPackage.benchmarkItemId,
      benchmarkPackageDigest: options.benchmarkPackage.packageDigest,
      benchmarkPackageId: options.benchmarkPackage.packageId,
      benchmarkPackageVersion: options.benchmarkPackage.packageVersion,
      environmentDigest: options.environmentDigest,
      harnessRevision: options.promptPackage.harnessRevision,
      laneId: options.promptPackage.laneId,
      modelConfigId: options.promptPackage.modelConfigId,
      modelSnapshotId: options.environment.modelSnapshotId,
      promptPackageDigest: options.promptPackage.promptPackageDigest,
      promptProtocolVersion: options.promptPackage.promptProtocolVersion,
      providerFamily: options.promptPackage.providerFamily,
      runMode: options.promptPackage.runMode,
      toolProfile: options.promptPackage.toolProfile,
      verifierVersion: options.environment.verifierVersion
    })
  );
}

function assertRequiredArtifactRoles(
  artifacts: WorkerArtifactManifestEntry[],
  requiredArtifactRoles: WorkerBundleArtifactRole[]
): void {
  const presentRoles = new Set(artifacts.map((artifact) => artifact.artifactRole));
  const missingRoles = requiredArtifactRoles.filter(
    (role) => role !== "run_manifest" && !presentRoles.has(role)
  );

  if (missingRoles.length > 0) {
    throw new Error(
      `Artifact manifest is missing required roles: ${missingRoles.sort().join(", ")}.`
    );
  }
}

function normalizeManifestRelativePath(value: string): string {
  const slashNormalized = value.replace(/\\/g, "/");
  const canonicalPath = path.posix.normalize(slashNormalized);

  if (
    slashNormalized.length === 0 ||
    slashNormalized !== canonicalPath ||
    canonicalPath.startsWith("../") ||
    canonicalPath === ".." ||
    canonicalPath.startsWith("/") ||
    canonicalPath.endsWith("/") ||
    canonicalPath === "."
  ) {
    throw new BundleSubmissionIntegrityError(
      `artifact-manifest.json relativePath must be canonical and traversal-free: ${value}.`
    );
  }

  return canonicalPath;
}

function expectedManifestMetadataForPath(relativePath: string) {
  return {
    contentEncoding: null,
    mediaType: relativePath.endsWith(".json")
      ? "application/json"
      : isNormalizedTextBundlePath(relativePath)
        ? "text/plain"
        : null,
    requiredForIngest: true
  };
}

function isNormalizedTextBundlePath(relativePath: string): boolean {
  const baseName = path.posix.basename(relativePath);

  return (
    relativePath.endsWith(".txt") ||
    relativePath.endsWith(".lean") ||
    relativePath.endsWith(".md") ||
    relativePath.endsWith(".toml") ||
    baseName === "LICENSE" ||
    baseName === "lean-toolchain"
  );
}

function isOptionalArtifactRole(role: string): role is "usage_summary" | "execution_trace" {
  return optionalArtifactRoles.has(role as "usage_summary" | "execution_trace");
}

function resolveProviderModel(options: {
  configuredProviderModel?: string;
  modelConfigId: string;
  providerFamily: string;
}): string | undefined {
  if (options.configuredProviderModel) {
    return options.configuredProviderModel;
  }

  const prefix = `${options.providerFamily}/`;
  return options.modelConfigId.startsWith(prefix)
    ? options.modelConfigId.slice(prefix.length)
    : options.modelConfigId;
}

function inferStubScenario(
  modelSnapshotId: string
): "compile_failure" | "exact_canonical" {
  return /compile_failure/i.test(modelSnapshotId) ? "compile_failure" : "exact_canonical";
}

function sanitizePathSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]/g, "_");

  if (sanitized.length === 0 || /^\.+$/u.test(sanitized)) {
    return "_";
  }

  return sanitized;
}

function assertCanonicalDigest(actual: string, declared: string, message: string): void {
  if (normalizeDigest(actual) !== normalizeDigest(declared)) {
    throw new BundleSubmissionIntegrityError(message);
  }
}

function normalizeDigest(digest: string): string {
  return digest.trim().toLowerCase();
}

function computeBundleDigest(
  runBundle: z.output<typeof runBundleFileSchema>,
  artifactManifest: z.output<typeof artifactManifestFileSchema>
): string {
  return sha256Text(
    stableStringify({
      artifactInventory: [...artifactManifest.artifacts].sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath)
      ),
      runBundle: omitDigestFields(runBundle)
    })
  );
}

function omitDigestFields<TValue extends Record<string, unknown>>(value: TValue) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !key.toLowerCase().endsWith("digest"))
  );
}

function loadNormalizedText(filePath: string): Promise<string> {
  return readFile(filePath, "utf8").then(normalizeText);
}

function normalizeText(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function sha256Text(text: string): string {
  return createHash("sha256").update(Buffer.from(normalizeText(text), "utf8")).digest("hex");
}

function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
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

function isBundleFieldMatch(field: string, actual: string | null, expectedValue: string): boolean {
  if (actual === null) {
    return false;
  }

  if (field.toLowerCase().endsWith("digest")) {
    return normalizeDigest(actual) === normalizeDigest(expectedValue);
  }

  return actual === expectedValue;
}

function buildLeaseFilesystemRoots(options: {
  jobId: string;
  leaseId: string;
  outputRoot: string;
  workspaceRoot: string;
}): LeaseFilesystemRoots {
  const leasePathSegment = [
    sanitizePathSegment(options.leaseId),
    sanitizePathSegment(options.jobId)
  ].join("__");
  const leaseWorkspaceRoot = path.join(path.resolve(options.workspaceRoot), leasePathSegment);
  const leaseStagingRoot = path.join(path.resolve(options.outputRoot), leasePathSegment);

  return {
    attemptOutputRoot: path.join(leaseStagingRoot, "attempt-output"),
    attemptWorkspaceRoot: path.join(leaseWorkspaceRoot, "workspace"),
    benchmarkPackageRoot: path.join(leaseWorkspaceRoot, "benchmark"),
    leaseStagingRoot,
    leaseWorkspaceRoot,
    promptPackageRoot: path.join(leaseWorkspaceRoot, "prompt")
  };
}

async function prepareLeaseFilesystemRoots(roots: LeaseFilesystemRoots): Promise<void> {
  await ensureLeaseWritableRootPrepared(roots.leaseWorkspaceRoot, "lease workspace root");
  await ensureLeaseWritableRootPrepared(roots.leaseStagingRoot, "lease staging root");
}

async function ensureLeaseWritableRootPrepared(rootPath: string, description: string): Promise<void> {
  const rootStats = await stat(rootPath).catch(() => null);

  if (rootStats === null) {
    await mkdir(rootPath, { recursive: true });
    return;
  }

  if (!rootStats.isDirectory()) {
    throw new Error(`Hosted ${description} is not a directory: ${rootPath}.`);
  }

  const entries = await readdir(rootPath);

  if (entries.length > 0) {
    throw new Error(
      `Unsafe hosted residue detected in ${description} ${rootPath}; expected an empty per-lease root before execution.`
    );
  }
}

async function cleanupLeaseFilesystemRoots(roots: LeaseFilesystemRoots): Promise<void> {
  await rm(roots.leaseWorkspaceRoot, { force: true, recursive: true });
  await rm(roots.leaseStagingRoot, { force: true, recursive: true });
}

function classifyHostedAttemptError(error: unknown): WorkerFailureClassification {
  const message = error instanceof Error ? error.message : String(error);

  if (/benchmark package digest mismatch/i.test(message)) {
    return buildStaticFailure({
      summary: message,
      failureCode: "benchmark_input_digest_mismatch",
      phase: "prepare"
    });
  }

  if (/benchmark package/i.test(message)) {
    return buildStaticFailure({
      summary: message,
      failureCode: "benchmark_input_missing",
      phase: "prepare"
    });
  }

  if (/prompt package/i.test(message)) {
    return buildStaticFailure({
      summary: message,
      failureCode: "prompt_package_missing",
      phase: "prepare"
    });
  }

  if (/provider model is required/i.test(message) || /unsupported run kind/i.test(message)) {
    return buildStaticFailure({
      summary: message,
      failureCode: "run_configuration_invalid",
      phase: "prepare"
    });
  }

  if (/not implemented/i.test(message)) {
    return buildStaticFailure({
      summary: message,
      failureCode: "provider_unsupported_request",
      phase: "generate"
    });
  }

  if (/auth/i.test(message)) {
    return buildStaticFailure({
      summary: message,
      failureCode: "provider_auth_error",
      phase: "generate"
    });
  }

  if (/network policy|host_not_allowlisted|raw_ip_forbidden|path_outside_policy/i.test(message)) {
    return buildStaticFailure({
      summary: message,
      failureCode: "tool_permission_violation",
      phase: "generate"
    });
  }

  if (/timeout/i.test(message)) {
    return buildStaticFailure({
      summary: message,
      failureCode: "provider_timeout",
      phase: "generate"
    });
  }

  if (/candidate lean source|malformed|empty/i.test(message)) {
    return buildStaticFailure({
      summary: message,
      failureCode: "provider_malformed_response",
      phase: "generate"
    });
  }

  return buildStaticFailure({
    summary: message,
    failureCode: "harness_crashed",
    phase: "finalize"
  });
}

function buildSelectedArtifactFallbackFailure(
  artifacts: Pick<WorkerArtifactManifestResponse["artifacts"][number], "artifactRole" | "relativePath">[],
  options: {
    failureCode: WorkerFailureClassification["failureCode"];
    phase: WorkerExecutionPhase;
    summary: string;
  }
): WorkerFailureClassification {
  const preferredArtifact =
    artifacts.find((artifact) => artifact.artifactRole === "verdict_record") ?? artifacts[0];

  return {
    ...buildStaticFailure(options),
    evidenceArtifactRefs: [preferredArtifact?.relativePath ?? "worker-control/pre-bundle-failure"]
  };
}

function buildStaticFailure(options: {
  failureCode: WorkerFailureClassification["failureCode"];
  phase: WorkerExecutionPhase;
  summary: string;
}): WorkerFailureClassification {
  return {
    evidenceArtifactRefs: ["worker-control/pre-bundle-failure"],
    failureCode: options.failureCode,
    failureFamily: classifyFailureFamily(options.failureCode),
    phase: options.phase,
    retryEligibility:
      options.failureCode === "provider_timeout" || options.failureCode === "provider_internal_error"
        ? "outer_retry_allowed"
        : "manual_retry_only",
    summary: options.summary,
    terminality: options.failureCode === "manual_cancelled" ? "cancelled" : "terminal_attempt",
    userVisibility: "user_visible"
  };
}

function classifyFailureFamily(
  failureCode: WorkerFailureClassification["failureCode"]
): WorkerFailureClassification["failureFamily"] {
  switch (failureCode) {
    case "provider_auth_error":
    case "provider_rate_limited":
    case "provider_transport_error":
    case "provider_timeout":
    case "provider_cancelled":
    case "provider_refusal":
    case "provider_unsupported_request":
    case "provider_malformed_response":
    case "provider_tool_contract_error":
    case "provider_internal_error":
      return "provider";
    case "wall_clock_budget_exhausted":
    case "provider_usage_budget_exhausted":
    case "turn_budget_exhausted":
    case "compile_repair_budget_exhausted":
    case "verifier_repair_budget_exhausted":
      return "budget";
    case "compile_failed":
      return "compile";
    case "manual_cancelled":
    case "worker_lease_lost":
    case "harness_bootstrap_failed":
    case "harness_crashed":
    case "harness_output_missing":
      return "harness";
    case "forbidden_placeholder_token":
    case "theorem_reference_missing":
    case "theorem_semantic_mismatch":
    case "extra_theorem_assumptions":
    case "wrong_theorem_target":
    case "forbidden_axiom_dependency":
    case "environment_instability_detected":
    case "proof_policy_failed":
      return "verification";
    case "benchmark_input_missing":
    case "benchmark_input_digest_mismatch":
    case "lane_configuration_invalid":
    case "prompt_package_missing":
    case "run_configuration_invalid":
      return "input_contract";
    case "tool_bootstrap_failed":
    case "tool_contract_violation":
    case "tool_permission_violation":
    case "tool_use_outside_policy":
    case "tool_result_missing":
    case "stuck_loop_detected":
    case "candidate_output_missing":
    case "candidate_output_malformed":
    case "candidate_file_outside_contract":
      return "tooling";
  }
}

async function postWorkerControl<TSchema extends z.ZodTypeAny>(
  fetchImpl: WorkerFetch,
  url: URL,
  options: {
    headers: Record<string, string>;
    method: "POST";
    payload: unknown;
    schema: TSchema;
  }
): Promise<z.output<TSchema>> {
  const response = await fetchImpl(url, {
    body: JSON.stringify(options.payload),
    headers: {
      "content-type": "application/json",
      ...options.headers
    },
    method: options.method
  });
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Worker control request failed (${response.status}) for ${url.pathname}: ${responseText || response.statusText}`
    );
  }

  const payload = responseText.trim().length === 0 ? null : JSON.parse(responseText);
  return options.schema.parse(payload);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
