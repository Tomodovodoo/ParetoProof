import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import {
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
import { parseWorkerRuntimeEnv } from "./runtime.js";

const workerClaimLoopOptionsSchema = z.object({
  authMode: z.enum(["machine_api_key", "machine_oauth"]),
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

const artifactManifestFileSchema = z.object({
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
});

const runBundleFileSchema = z.object({
  artifactManifestDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  bundleDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  candidateDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  environmentDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  runId: z.string().min(1),
  verdictDigest: z.string().regex(/^[a-f0-9]{64}$/i)
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
  "environment_snapshot",
  "usage_summary",
  "execution_trace"
] satisfies WorkerBundleArtifactRole[];

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

export type RunWorkerClaimLoopResult = {
  claimedJobs: number;
  completedJobs: number;
  idlePollCount: number;
  stoppedReason: "idle_once" | "max_jobs_reached";
};

type ActiveWorkerJob = Extract<WorkerClaimResponse, { leaseStatus: "active" }>["workerJob"];

type ActiveLeaseState = {
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
  verifierVerdict: WorkerVerifierVerdict;
  verdictDigest: string;
};

export async function runWorkerClaimLoop(
  rawOptions: WorkerClaimLoopOptions,
  dependencies: WorkerClaimLoopDependencies = {}
): Promise<RunWorkerClaimLoopResult> {
  const options = workerClaimLoopOptionsSchema.parse(rawOptions);
  const fetchImpl = dependencies.fetchImpl ?? fetch;
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
  const jobWorkspaceRoot = path.resolve(options.workspaceRoot, workerJob.jobId);
  const jobOutputRoot = path.resolve(options.outputRoot, workerJob.jobId);
  let heartbeatLoop = Promise.resolve();

  try {
    await rm(jobWorkspaceRoot, { force: true, recursive: true });
    await rm(jobOutputRoot, { force: true, recursive: true });
    await mkdir(jobWorkspaceRoot, { recursive: true });
    await mkdir(jobOutputRoot, { recursive: true });

    await refreshLease(leaseState, apiBaseUrl, dependencies);

    if (leaseState.cancelRequested) {
      return "cancelled";
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

    const benchmarkPackageRoot = path.join(jobWorkspaceRoot, "benchmark");
    const promptPackageRoot = path.join(jobWorkspaceRoot, "prompt");
    const attemptWorkspaceRoot = path.join(jobWorkspaceRoot, "workspace");
    const attemptOutputRoot = path.join(jobOutputRoot, "attempt-output");
    const benchmarkResult = await dependencies.materializeBenchmarkPackage({
      outputRoot: benchmarkPackageRoot
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
      outputRoot: promptPackageRoot,
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

    if (leaseState.cancelRequested) {
      return "cancelled";
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
        outputRoot: attemptOutputRoot,
        promptPackageRoot: promptResult.outputRoot,
        providerFamily: workerJob.target.providerFamily,
        providerModel: resolveProviderModel({
          providerFamily: workerJob.target.providerFamily,
          configuredProviderModel: options.providerModel,
          modelConfigId: workerJob.target.modelConfigId
        }),
        stubScenario: inferStubScenario(workerJob.target.modelSnapshotId),
        workspaceRoot: attemptWorkspaceRoot
      });
    } catch (error) {
      if (leaseState.cancelRequested) {
        return "cancelled";
      }

      if (leaseState.leaseLost) {
        return "lease_lost";
      }

      await submitHarnessFailure(
        leaseState,
        apiBaseUrl,
        dependencies,
        classifyHostedAttemptError(error)
      );
      return "completed";
    }

    leaseState.currentPhase = "finalize";
    leaseState.progressMessage = "Preparing terminal worker submission.";

    if (leaseState.cancelRequested) {
      return "cancelled";
    }

    if (leaseState.leaseLost) {
      return "lease_lost";
    }

    await refreshLease(leaseState, apiBaseUrl, dependencies);

    if (leaseState.cancelRequested) {
      return "cancelled";
    }

    if (leaseState.leaseLost) {
      return "lease_lost";
    }

    const bundleSubmission = await readBundleSubmission(attemptResult.outputRoot);
    assertRequiredArtifactRoles(bundleSubmission.artifactManifest, workerJob.requiredArtifactRoles);

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
          buildStaticFailure({
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
  } finally {
    leaseState.stopped = true;
    leaseState.stopHeartbeat?.();
    await heartbeatLoop;
    await rm(jobWorkspaceRoot, { force: true, recursive: true });
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
        leaseState.leaseLost = true;
        leaseState.heartbeatErrorMessage = error instanceof Error ? error.message : String(error);
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
  leaseState.lastEventSequence += 1;

  const eventPayload: WorkerExecutionEvent = {
    attemptId: leaseState.job.attemptId,
    details,
    eventKind,
    jobId: leaseState.job.jobId,
    leaseId: leaseState.job.leaseId,
    phase,
    recordedAt: dependencies.now().toISOString(),
    sequence: leaseState.lastEventSequence,
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

  if (eventResponse.acknowledgedSequence > leaseState.lastEventSequence) {
    leaseState.lastEventSequence = eventResponse.acknowledgedSequence;
  }
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
  failure: WorkerFailureClassification
): Promise<void> {
  if (leaseState.cancelRequested || leaseState.leaseLost) {
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
  const manifestFile = artifactManifestFileSchema.parse(
    JSON.parse(await readFile(path.join(bundleRoot, "artifact-manifest.json"), "utf8"))
  );
  const runBundle = runBundleFileSchema.parse(
    JSON.parse(await readFile(path.join(bundleRoot, "run-bundle.json"), "utf8"))
  );
  const verifierVerdict = workerVerifierVerdictSchema.parse(
    JSON.parse(await readFile(path.join(bundleRoot, "verification", "verdict.json"), "utf8"))
  );

  return {
    artifactManifest: manifestFile.artifacts.map((artifact) => ({
      artifactRole: artifact.artifactRole as WorkerBundleArtifactRole,
      byteSize: artifact.byteSize,
      contentEncoding: artifact.contentEncoding,
      mediaType: artifact.mediaType,
      relativePath: artifact.relativePath,
      requiredForIngest: artifact.requiredForIngest,
      sha256: artifact.sha256
    })),
    artifactManifestDigest: runBundle.artifactManifestDigest,
    bundleDigest: runBundle.bundleDigest,
    candidateDigest: runBundle.candidateDigest,
    environmentDigest: runBundle.environmentDigest,
    verifierVerdict,
    verdictDigest: runBundle.verdictDigest
  };
}

function assertRequiredArtifactRoles(
  artifacts: WorkerArtifactManifestEntry[],
  requiredArtifactRoles: WorkerBundleArtifactRole[]
): void {
  const presentRoles = new Set(artifacts.map((artifact) => artifact.artifactRole));
  const missingRoles = requiredArtifactRoles.filter((role) => !presentRoles.has(role));

  if (missingRoles.length > 0) {
    throw new Error(
      `Artifact manifest is missing required roles: ${missingRoles.sort().join(", ")}.`
    );
  }
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

function buildStaticFailure(options: {
  failureCode: WorkerFailureClassification["failureCode"];
  phase: WorkerExecutionPhase;
  summary: string;
}): WorkerFailureClassification {
  return {
    evidenceArtifactRefs: ["worker-control/prebundle"],
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
