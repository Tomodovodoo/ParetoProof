import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type WorkerArtifactManifestEntry,
  type WorkerArtifactManifestRequest,
  type WorkerArtifactManifestResponse,
  type WorkerClaimRequest,
  type WorkerClaimResponse,
  type WorkerExecutionEvent,
  type WorkerExecutionEventKind,
  type WorkerExecutionEventResponse,
  type WorkerExecutionPhase,
  type WorkerFailureClassification,
  type WorkerHeartbeatRequest,
  type WorkerHeartbeatResponse,
  type WorkerResultMessageRequest,
  type WorkerResultMessageResponse,
  type WorkerRunTarget,
  type WorkerTerminalFailureRequest,
  type WorkerTerminalFailureResponse,
  type WorkerVerifierVerdict,
  workerArtifactManifestResponseSchema,
  workerClaimResponseSchema,
  workerExecutionEventResponseSchema,
  workerFailureClassificationSchema,
  workerHeartbeatResponseSchema,
  workerResultMessageResponseSchema,
  workerTerminalFailureResponseSchema,
  workerVerifierVerdictSchema
} from "@paretoproof/shared";
import { z } from "zod";
import {
  getDefaultProblem9PromptPackageOptions,
  materializeProblem9PromptPackage
} from "./problem9-prompt-package.js";
import { materializeProblem9Package } from "./problem9-package.js";
import { type Problem9AttemptResult, runProblem9Attempt } from "./problem9-attempt.js";
import { parseWorkerRuntimeEnv } from "./runtime.js";

const providerFamilySchema = z.enum(["openai", "anthropic", "google", "aristotle", "axle", "custom"]);
const benchmarkPackageManifestSchema = z.object({ lanePolicy: z.object({ primaryLane: z.string().min(1) }) });
const artifactManifestFileSchema = z.object({
  artifacts: z.array(z.object({
    artifactRole: z.string().min(1),
    byteSize: z.number().int().nonnegative(),
    contentEncoding: z.string().min(1).nullable(),
    mediaType: z.string().min(1).nullable(),
    relativePath: z.string().min(1),
    requiredForIngest: z.boolean(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i)
  }))
});
const runBundleManifestSchema = z.object({
  artifactManifestDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  bundleDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  candidateDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  environmentDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  status: z.enum(["success", "failure", "incomplete"]),
  stopReason: z.string().min(1),
  verdictDigest: z.string().regex(/^[a-f0-9]{64}$/i)
});
const supportedArtifactRoles = ["run_manifest", "package_reference", "prompt_package", "candidate_source", "verdict_record", "compiler_output", "compiler_diagnostics", "verifier_output", "environment_snapshot", "usage_summary", "execution_trace"] as const;

type ProviderFamily = z.infer<typeof providerFamilySchema>;
export type HostedAuthMode = "machine_api_key" | "machine_oauth";
export type WorkerRuntime = "local_docker" | "modal";
export type RunWorkerClaimLoopOptions = {
  authMode: HostedAuthMode;
  baseWorkingRoot: string;
  harnessRevision?: string;
  once?: boolean;
  providerFamily?: ProviderFamily;
  providerModel?: string;
  workerId: string;
  workerPool: string;
  workerRuntime: WorkerRuntime;
  workerVersion: string;
};
export type RunWorkerClaimLoopResult = {
  claimCount: number;
  lastClaimStatus: WorkerClaimResponse["leaseStatus"];
  lastJobOutcome: "failed" | "idle" | "lease_expired" | "lease_lost" | "succeeded" | null;
  processedJobs: number;
};
type ExecuteAttempt = (options: Parameters<typeof runProblem9Attempt>[0] & { signal?: AbortSignal }) => Promise<Problem9AttemptResult>;
type LoggerEntry = { data?: Record<string, unknown>; message: string };
type ClaimLoopDependencies = {
  executeAttempt: ExecuteAttempt;
  logError: (entry: LoggerEntry) => void;
  logInfo: (entry: LoggerEntry) => void;
  now: () => Date;
  sleep: (milliseconds: number) => Promise<void>;
};
type ActiveWorkerJob = Extract<WorkerClaimResponse, { leaseStatus: "active" }>["workerJob"];
type LeaseTermination = { summary: string; type: "cancel_requested" | "expired" };
type ClaimedJobOutcome = { status: "failed" | "lease_expired" | "lease_lost" | "succeeded"; terminalSummary: string };
type LeaseSession = {
  abortController: AbortController;
  currentPhase: WorkerExecutionPhase;
  currentProgressMessage: string | null;
  currentToken: string;
  heartbeatLoop: Promise<void>;
  job: ActiveWorkerJob;
  leaseTermination: LeaseTermination | null;
  nextSequence: number;
  stopHeartbeatLoop: boolean;
};
type BundleSubmissionData = {
  artifactManifestDigest: string;
  artifacts: WorkerArtifactManifestEntry[];
  bundleDigest: string;
  candidateDigest: string;
  environmentDigest: string;
  runBundleStatus: "failure" | "incomplete" | "success";
  stopReason: string;
  verdict: WorkerVerifierVerdict;
  verdictDigest: string;
};

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => { setTimeout(resolve, milliseconds); });
}
function formatLogLine(entry: LoggerEntry) {
  const prefix = `[run-worker-claim-loop] ${entry.message}`;
  return entry.data ? `${prefix} ${JSON.stringify(entry.data)}` : prefix;
}
const defaultDependencies: ClaimLoopDependencies = {
  executeAttempt: (options) => runProblem9Attempt(options),
  logError: (entry) => { console.error(formatLogLine(entry)); },
  logInfo: (entry) => { console.log(formatLogLine(entry)); },
  now: () => new Date(),
  sleep: defaultSleep
};

export async function runWorkerClaimLoop(
  options: RunWorkerClaimLoopOptions,
  dependencyOverrides: Partial<ClaimLoopDependencies> = {}
): Promise<RunWorkerClaimLoopResult> {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides } satisfies ClaimLoopDependencies;
  const runtimeEnv = await parseWorkerRuntimeEnv({ authMode: options.authMode, commandFamily: "worker_claim_loop" });
  const apiClient = new WorkerControlApiClient({ baseUrl: runtimeEnv.apiBaseUrl!, bootstrapToken: runtimeEnv.workerBootstrapToken! });
  await mkdir(path.resolve(options.baseWorkingRoot), { recursive: true });

  let claimCount = 0;
  let lastClaimStatus: WorkerClaimResponse["leaseStatus"] = "idle";
  let lastJobOutcome: RunWorkerClaimLoopResult["lastJobOutcome"] = null;
  let processedJobs = 0;

  while (true) {
    claimCount += 1;
    const claimResponse = await apiClient.claim(buildClaimRequest(options));
    lastClaimStatus = claimResponse.leaseStatus;
    dependencies.logInfo({
      message: "claim",
      data: claimResponse.leaseStatus === "active"
        ? { attemptId: claimResponse.workerJob.attemptId, jobId: claimResponse.workerJob.jobId, leaseId: claimResponse.workerJob.leaseId, pollAfterSeconds: claimResponse.pollAfterSeconds, runId: claimResponse.workerJob.runId }
        : { leaseStatus: claimResponse.leaseStatus, pollAfterSeconds: claimResponse.pollAfterSeconds }
    });

    if (claimResponse.leaseStatus === "idle") {
      lastJobOutcome = "idle";
      if (options.once) break;
      await dependencies.sleep(claimResponse.pollAfterSeconds * 1000);
      continue;
    }

    processedJobs += 1;
    const outcome = await runClaimedJob(options, claimResponse.workerJob, apiClient, dependencies);
    lastJobOutcome = outcome.status;
    if (options.once) break;
  }

  return { claimCount, lastClaimStatus, lastJobOutcome, processedJobs };
}

async function runClaimedJob(
  options: RunWorkerClaimLoopOptions,
  job: ActiveWorkerJob,
  apiClient: WorkerControlApiClient,
  dependencies: ClaimLoopDependencies
): Promise<ClaimedJobOutcome> {
  const attemptRoot = path.join(path.resolve(options.baseWorkingRoot), sanitizePathSegment(job.runId), sanitizePathSegment(job.attemptId));
  const packageOutputRoot = path.join(attemptRoot, "package-materialization");
  const promptPackageRoot = path.join(attemptRoot, "prompt-package");
  const workspaceRoot = path.join(attemptRoot, "workspace");
  const outputRoot = path.join(attemptRoot, "output");
  await rm(attemptRoot, { force: true, recursive: true });
  await mkdir(attemptRoot, { recursive: true });
  const session = startLeaseSession(job, apiClient, dependencies);

  try {
    setLeaseProgress(session, "prepare", "Materializing canonical Problem 9 inputs");
    const benchmarkPackage = await materializeProblem9Package({ outputRoot: packageOutputRoot });
    throwIfLeaseTerminated(session);
    const laneId = await resolvePrimaryLaneId(benchmarkPackage.outputRoot);
    const providerFamily = resolveProviderFamily(job.target, options.providerFamily);

    await materializeProblem9PromptPackage({
      ...getDefaultProblem9PromptPackageOptions(),
      attemptId: job.attemptId,
      authMode: options.authMode,
      benchmarkPackageRoot: benchmarkPackage.outputRoot,
      harnessRevision: await resolveHarnessRevision(options.harnessRevision),
      jobId: job.jobId,
      laneId,
      modelConfigId: job.target.modelConfigId,
      outputRoot: promptPackageRoot,
      passKCount: null,
      passKIndex: null,
      providerFamily,
      runId: job.runId,
      runMode: "bounded_agentic_attempt",
      toolProfile: "workspace_edit_limited"
    });
    throwIfLeaseTerminated(session);

    await appendEvent(session, apiClient, dependencies, {
      details: { benchmarkItemId: resolveBenchmarkItemId(job.target), modelConfigId: job.target.modelConfigId, runKind: job.target.runKind },
      eventKind: "attempt_started",
      phase: "prepare",
      summary: "Claimed a hosted Problem 9 assignment and materialized prompt inputs."
    });

    setLeaseProgress(session, "generate", "Executing the shared Problem 9 attempt runner");
    const attemptResult = await dependencies.executeAttempt({
      authMode: options.authMode,
      benchmarkPackageRoot: benchmarkPackage.outputRoot,
      outputRoot,
      promptPackageRoot,
      providerFamily,
      providerModel: resolveProviderModel(job.target, options.providerModel),
      signal: session.abortController.signal,
      stubScenario: "exact_canonical",
      workspaceRoot
    });
    throwIfLeaseTerminated(session);

    setLeaseProgress(session, "finalize", "Registering artifacts and terminal state");
    const bundle = await loadBundleSubmissionData(attemptResult.outputRoot);

    await appendEvent(session, apiClient, dependencies, {
      details: { artifactManifestDigest: bundle.artifactManifestDigest, bundleDigest: bundle.bundleDigest, status: bundle.runBundleStatus, stopReason: bundle.stopReason },
      eventKind: "bundle_finalized",
      phase: "finalize",
      summary: `Finalized the canonical Problem 9 bundle with stopReason=${bundle.stopReason}.`
    });

    const artifactManifestResponse = await apiClient.submitArtifactManifest(session.currentToken, {
      artifactManifestDigest: bundle.artifactManifestDigest,
      artifacts: bundle.artifacts,
      attemptId: job.attemptId,
      jobId: job.jobId,
      leaseId: job.leaseId,
      recordedAt: dependencies.now().toISOString()
    });

    await appendEvent(session, apiClient, dependencies, {
      details: { artifactCount: artifactManifestResponse.artifacts.length, artifactManifestDigest: artifactManifestResponse.artifactManifestDigest },
      eventKind: "artifact_manifest_written",
      phase: "finalize",
      summary: "Registered the canonical Problem 9 artifact manifest."
    });

    const artifactIds = artifactManifestResponse.artifacts.map(
      (artifact: WorkerArtifactManifestResponse["artifacts"][number]) => artifact.artifactId
    );

    if (attemptResult.result === "pass") {
      const resultResponse = await apiClient.submitResult(session.currentToken, {
        artifactIds,
        artifactManifestDigest: bundle.artifactManifestDigest,
        attemptId: job.attemptId,
        bundleDigest: bundle.bundleDigest,
        candidateDigest: bundle.candidateDigest,
        completedAt: dependencies.now().toISOString(),
        environmentDigest: bundle.environmentDigest,
        jobId: job.jobId,
        leaseId: job.leaseId,
        offlineBundleCompatible: true,
        runId: job.runId,
        summary: `Problem 9 attempt succeeded with stopReason=${bundle.stopReason}.`,
        usageSummary: { compileRepairCount: attemptResult.compileRepairCount, providerTurnsUsed: attemptResult.providerTurnsUsed, verifierRepairCount: attemptResult.verifierRepairCount },
        verifierVerdict: bundle.verdict,
        verdictDigest: bundle.verdictDigest
      });

      dependencies.logInfo({ message: "terminal_result", data: { attemptState: resultResponse.attemptState, jobId: job.jobId, runId: job.runId, runState: resultResponse.runState } });
      return { status: "succeeded", terminalSummary: resultResponse.runState };
    }

    const failureClassification = bundle.verdict.primaryFailure;
    if (!failureClassification) {
      throw new Error("Failing hosted run bundle was missing primaryFailure.");
    }

    const failureResponse = await apiClient.submitFailure(session.currentToken, {
      artifactIds,
      artifactManifestDigest: bundle.artifactManifestDigest,
      attemptId: job.attemptId,
      bundleDigest: bundle.bundleDigest,
      candidateDigest: bundle.candidateDigest,
      failedAt: dependencies.now().toISOString(),
      failure: failureClassification,
      jobId: job.jobId,
      leaseId: job.leaseId,
      runId: job.runId,
      summary: `Problem 9 attempt failed with stopReason=${bundle.stopReason}.`,
      terminalState: failureClassification.terminality === "cancelled" ? "cancelled" : "failed",
      verifierVerdict: bundle.verdict,
      verdictDigest: bundle.verdictDigest
    });

    dependencies.logInfo({ message: "terminal_failure", data: { attemptState: failureResponse.attemptState, failureCode: failureClassification.failureCode, jobId: job.jobId, runId: job.runId } });
    return { status: "failed", terminalSummary: failureClassification.failureCode };
  } catch (error) {
    if (session.leaseTermination) {
      dependencies.logInfo({ message: "lease_terminated", data: { attemptId: job.attemptId, jobId: job.jobId, leaseId: job.leaseId, leaseStatus: session.leaseTermination.type } });
      return { status: session.leaseTermination.type === "expired" ? "lease_expired" : "lease_lost", terminalSummary: session.leaseTermination.summary };
    }

    const bundle = await tryLoadBundleSubmissionData(outputRoot);
    const fallbackFailure = classifyHostedLoopFailure(error);
    const failure = bundle?.verdict.primaryFailure ?? fallbackFailure;

    try {
      const failureResponse = await apiClient.submitFailure(session.currentToken, {
        artifactIds: [],
        artifactManifestDigest: bundle?.artifactManifestDigest ?? null,
        attemptId: job.attemptId,
        bundleDigest: bundle?.bundleDigest ?? null,
        candidateDigest: bundle?.candidateDigest ?? null,
        failedAt: dependencies.now().toISOString(),
        failure,
        jobId: job.jobId,
        leaseId: job.leaseId,
        runId: job.runId,
        summary: error instanceof Error ? error.message : String(error),
        terminalState: failure.terminality === "cancelled" ? "cancelled" : "failed",
        verifierVerdict: bundle?.verdict ?? null,
        verdictDigest: bundle?.verdictDigest ?? null
      });

      dependencies.logInfo({ message: "terminal_failure", data: { attemptState: failureResponse.attemptState, failureCode: failure.failureCode, jobId: job.jobId, runId: job.runId } });
    } catch (submitError) {
      if (submitError instanceof WorkerControlClientError && submitError.code === "worker_lease_not_active") {
        dependencies.logInfo({ message: "lease_lost_during_failure_submit", data: { attemptId: job.attemptId, jobId: job.jobId, leaseId: job.leaseId } });
        return { status: "lease_lost", terminalSummary: "Worker lease was lost before failure submission completed." };
      }

      throw submitError;
    }

    return { status: "failed", terminalSummary: failure.failureCode };
  } finally {
    session.stopHeartbeatLoop = true;
    await session.heartbeatLoop;
  }
}

function buildClaimRequest(options: RunWorkerClaimLoopOptions): WorkerClaimRequest {
  return {
    activeJobCount: 0,
    availableRunKinds: ["single_run"],
    maxConcurrentJobs: 1,
    supportedArtifactRoles: [...supportedArtifactRoles],
    supportsOfflineBundleContract: true,
    supportsTraceUploads: false,
    workerId: options.workerId,
    workerPool: options.workerPool,
    workerRuntime: options.workerRuntime,
    workerVersion: options.workerVersion
  };
}

function startLeaseSession(job: ActiveWorkerJob, apiClient: WorkerControlApiClient, dependencies: ClaimLoopDependencies): LeaseSession {
  const session: LeaseSession = { abortController: new AbortController(), currentPhase: "prepare", currentProgressMessage: "Preparing worker assignment", currentToken: job.jobToken, heartbeatLoop: Promise.resolve(), job, leaseTermination: null, nextSequence: 1, stopHeartbeatLoop: false };
  session.heartbeatLoop = runHeartbeatLoop(session, apiClient, dependencies);
  return session;
}

async function runHeartbeatLoop(session: LeaseSession, apiClient: WorkerControlApiClient, dependencies: ClaimLoopDependencies) {
  const intervalMs = Math.max(1, session.job.heartbeatIntervalSeconds) * 1000;

  while (!session.stopHeartbeatLoop) {
    await dependencies.sleep(intervalMs);
    if (session.stopHeartbeatLoop) return;

    try {
      const heartbeatResponse = await apiClient.heartbeat(session.currentToken, session.job.jobId, {
        attemptId: session.job.attemptId,
        jobId: session.job.jobId,
        lastEventSequence: session.nextSequence - 1,
        leaseId: session.job.leaseId,
        observedAt: dependencies.now().toISOString(),
        phase: session.currentPhase,
        progressMessage: session.currentProgressMessage
      });

      dependencies.logInfo({ message: "heartbeat", data: { acknowledgedEventSequence: heartbeatResponse.acknowledgedEventSequence, cancelRequested: heartbeatResponse.cancelRequested, jobId: session.job.jobId, leaseStatus: heartbeatResponse.leaseStatus } });
      if (heartbeatResponse.jobToken) session.currentToken = heartbeatResponse.jobToken;

      if (heartbeatResponse.leaseStatus === "cancel_requested" || heartbeatResponse.cancelRequested) {
        session.leaseTermination = { summary: "Control plane requested cancellation for the active lease.", type: "cancel_requested" };
        session.abortController.abort(new Error("Worker lease was cancelled."));
        return;
      }

      if (heartbeatResponse.leaseStatus === "expired") {
        session.leaseTermination = { summary: "Worker lease expired before the attempt finished.", type: "expired" };
        session.abortController.abort(new Error("Worker lease expired."));
        return;
      }
    } catch (error) {
      if (session.stopHeartbeatLoop) return;

      if (error instanceof WorkerControlClientError && error.code === "worker_lease_not_active") {
        session.leaseTermination = { summary: "Worker lease became inactive during heartbeat.", type: "expired" };
        session.abortController.abort(new Error("Worker lease became inactive."));
        return;
      }

      dependencies.logError({ message: "heartbeat_error", data: { error: error instanceof Error ? error.message : String(error), jobId: session.job.jobId } });
      session.leaseTermination = { summary: "Heartbeat failed and the worker can no longer trust its lease state.", type: "expired" };
      session.abortController.abort(new Error("Heartbeat failed."));
      return;
    }
  }
}

function setLeaseProgress(session: LeaseSession, phase: WorkerExecutionPhase, progressMessage: string | null) {
  session.currentPhase = phase;
  session.currentProgressMessage = progressMessage;
}
function throwIfLeaseTerminated(session: LeaseSession) {
  if (session.leaseTermination) throw new Error(session.leaseTermination.summary);
}

async function appendEvent(
  session: LeaseSession,
  apiClient: WorkerControlApiClient,
  dependencies: ClaimLoopDependencies,
  options: { details: Record<string, unknown>; eventKind: WorkerExecutionEventKind; phase: WorkerExecutionPhase; summary: string }
) {
  throwIfLeaseTerminated(session);
  const response = await apiClient.reportEvent(session.currentToken, session.job.jobId, {
    attemptId: session.job.attemptId,
    details: options.details,
    eventKind: options.eventKind,
    jobId: session.job.jobId,
    leaseId: session.job.leaseId,
    phase: options.phase,
    recordedAt: dependencies.now().toISOString(),
    sequence: session.nextSequence,
    summary: options.summary
  });
  session.nextSequence = response.acknowledgedSequence + 1;
}

async function resolvePrimaryLaneId(benchmarkPackageRoot: string) {
  const rawManifest = await readFile(path.join(benchmarkPackageRoot, "benchmark-package.json"), "utf8");
  const manifest = benchmarkPackageManifestSchema.parse(JSON.parse(normalizeText(rawManifest)));
  return manifest.lanePolicy.primaryLane;
}

async function resolveHarnessRevision(override: string | undefined) {
  if (override) return override;
  const execution = await runCommand("git", ["rev-parse", "HEAD"], process.cwd());
  return execution.exitCode === 0 && execution.stdout ? execution.stdout : "worker-claim-loop.local";
}

function resolveBenchmarkItemId(target: WorkerRunTarget) {
  switch (target.runKind) {
    case "single_run":
      return target.benchmarkItemId;
    case "benchmark_slice":
    case "full_benchmark":
      return target.benchmarkVersionId;
    case "repeated_n":
      return target.benchmarkTargetId;
  }
}

function resolveProviderFamily(target: WorkerRunTarget, override: ProviderFamily | undefined): ProviderFamily {
  if (override) return override;
  const modelConfigId = target.modelConfigId.trim().toLowerCase();
  if (modelConfigId.startsWith("openai/") || modelConfigId.startsWith("openai.")) return "openai";
  if (modelConfigId.startsWith("anthropic/") || modelConfigId.startsWith("anthropic.")) return "anthropic";
  if (modelConfigId.startsWith("google/") || modelConfigId.startsWith("google.")) return "google";
  if (modelConfigId.startsWith("aristotle/") || modelConfigId.startsWith("aristotle.")) return "aristotle";
  if (modelConfigId.startsWith("axle/") || modelConfigId.startsWith("axle.")) return "axle";
  return "custom";
}

function resolveProviderModel(target: WorkerRunTarget, override: string | undefined) {
  if (override) return override;
  const slashIndex = target.modelConfigId.indexOf("/");
  return slashIndex === -1 ? target.modelConfigId : target.modelConfigId.slice(slashIndex + 1);
}

async function loadBundleSubmissionData(bundleRoot: string): Promise<BundleSubmissionData> {
  const runBundle = runBundleManifestSchema.parse(JSON.parse(normalizeText(await readFile(path.join(bundleRoot, "run-bundle.json"), "utf8"))));
  const artifactManifest = artifactManifestFileSchema.parse(JSON.parse(normalizeText(await readFile(path.join(bundleRoot, "artifact-manifest.json"), "utf8"))));
  const verdict = workerVerifierVerdictSchema.parse(JSON.parse(normalizeText(await readFile(path.join(bundleRoot, "verification", "verdict.json"), "utf8"))));
  const runManifestPath = path.join(bundleRoot, "run-bundle.json");
  const runManifestStats = await stat(runManifestPath);

  return {
    artifactManifestDigest: runBundle.artifactManifestDigest,
    artifacts: [
      ...artifactManifest.artifacts.map((artifact) => artifact as WorkerArtifactManifestEntry),
      { artifactRole: "run_manifest", byteSize: runManifestStats.size, contentEncoding: null, mediaType: "application/json", relativePath: "run-bundle.json", requiredForIngest: true, sha256: await sha256NormalizedFile(runManifestPath) }
    ],
    bundleDigest: runBundle.bundleDigest,
    candidateDigest: runBundle.candidateDigest,
    environmentDigest: runBundle.environmentDigest,
    runBundleStatus: runBundle.status,
    stopReason: runBundle.stopReason,
    verdict,
    verdictDigest: runBundle.verdictDigest
  };
}

async function tryLoadBundleSubmissionData(bundleRoot: string) {
  try { return await loadBundleSubmissionData(path.join(bundleRoot, "problem9-run-bundle")); }
  catch {
    try { return await loadBundleSubmissionData(bundleRoot); }
    catch { return null; }
  }
}

function classifyHostedLoopFailure(error: unknown): WorkerFailureClassification {
  const message = error instanceof Error ? error.message : String(error);
  const evidenceArtifactRefs = ["worker://runtime-error"];

  if (/provider.*auth|auth mode|CODEX_API_KEY|codex login/i.test(message)) {
    return workerFailureClassificationSchema.parse({ evidenceArtifactRefs, failureCode: "provider_auth_error", failureFamily: "provider", phase: "generate", retryEligibility: "manual_retry_only", summary: message, terminality: "terminal_attempt", userVisibility: "user_visible_sanitized" });
  }
  if (/timed out/i.test(message)) {
    return workerFailureClassificationSchema.parse({ evidenceArtifactRefs, failureCode: "provider_timeout", failureFamily: "provider", phase: "generate", retryEligibility: "outer_retry_allowed", summary: message, terminality: "retryable_outer", userVisibility: "user_visible_sanitized" });
  }
  if (/benchmark package|Expected file path for prompt-package input|Problem 9 package source tree/i.test(message)) {
    return workerFailureClassificationSchema.parse({ evidenceArtifactRefs, failureCode: "benchmark_input_missing", failureFamily: "input_contract", phase: "prepare", retryEligibility: "manual_retry_only", summary: message, terminality: "terminal_attempt", userVisibility: "user_visible" });
  }
  if (/Lane .* is not supported|run envelope|prompt package/i.test(message)) {
    return workerFailureClassificationSchema.parse({ evidenceArtifactRefs, failureCode: "run_configuration_invalid", failureFamily: "input_contract", phase: "prepare", retryEligibility: "manual_retry_only", summary: message, terminality: "terminal_attempt", userVisibility: "user_visible" });
  }
  return workerFailureClassificationSchema.parse({ evidenceArtifactRefs, failureCode: "harness_bootstrap_failed", failureFamily: "harness", phase: "prepare", retryEligibility: "outer_retry_allowed", summary: message, terminality: "retryable_outer", userVisibility: "user_visible_sanitized" });
}

class WorkerControlClientError extends Error {
  code: string;
  responseBody: unknown;
  statusCode: number;

  constructor(options: { code: string; message: string; responseBody: unknown; statusCode: number }) {
    super(options.message);
    this.code = options.code;
    this.name = "WorkerControlClientError";
    this.responseBody = options.responseBody;
    this.statusCode = options.statusCode;
  }
}

class WorkerControlApiClient {
  readonly baseUrl: string;
  readonly bootstrapToken: string;

  constructor(options: { baseUrl: string; bootstrapToken: string }) {
    this.baseUrl = options.baseUrl.replace(/\/+$/u, "");
    this.bootstrapToken = options.bootstrapToken;
  }

  async claim(request: WorkerClaimRequest): Promise<WorkerClaimResponse> {
    return this.postJson("/internal/worker/claims", this.bootstrapToken, request, workerClaimResponseSchema);
  }
  async heartbeat(token: string, jobId: string, request: WorkerHeartbeatRequest): Promise<WorkerHeartbeatResponse> {
    return this.postJson(`/internal/worker/jobs/${encodeURIComponent(jobId)}/heartbeat`, token, request, workerHeartbeatResponseSchema);
  }
  async reportEvent(token: string, jobId: string, request: WorkerExecutionEvent): Promise<WorkerExecutionEventResponse> {
    return this.postJson(`/internal/worker/jobs/${encodeURIComponent(jobId)}/events`, token, request, workerExecutionEventResponseSchema);
  }
  async submitArtifactManifest(token: string, request: WorkerArtifactManifestRequest): Promise<WorkerArtifactManifestResponse> {
    return this.postJson(`/internal/worker/jobs/${encodeURIComponent(request.jobId)}/artifacts`, token, request, workerArtifactManifestResponseSchema);
  }
  async submitResult(token: string, request: WorkerResultMessageRequest): Promise<WorkerResultMessageResponse> {
    return this.postJson(`/internal/worker/jobs/${encodeURIComponent(request.jobId)}/result`, token, request, workerResultMessageResponseSchema);
  }
  async submitFailure(token: string, request: WorkerTerminalFailureRequest): Promise<WorkerTerminalFailureResponse> {
    return this.postJson(`/internal/worker/jobs/${encodeURIComponent(request.jobId)}/failure`, token, request, workerTerminalFailureResponseSchema);
  }

  private async postJson<TSchema extends z.ZodTypeAny>(pathname: string, bearerToken: string, body: unknown, schema: TSchema): Promise<z.output<TSchema>> {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      body: JSON.stringify(body),
      headers: { authorization: `Bearer ${bearerToken}`, "content-type": "application/json" },
      method: "POST"
    });
    const responseText = await response.text();
    const responseBody = responseText.trim().length === 0 ? null : safeParseJson(responseText);

    if (!response.ok) {
      const code = responseBody && typeof responseBody === "object" && "error" in responseBody && typeof responseBody.error === "string" ? responseBody.error : `http_${response.status}`;
      const message = responseBody && typeof responseBody === "object" && "message" in responseBody && typeof responseBody.message === "string" ? responseBody.message : `Worker control request failed with HTTP ${response.status}.`;
      throw new WorkerControlClientError({ code, message, responseBody, statusCode: response.status });
    }

    return schema.parse(responseBody);
  }
}

async function runCommand(command: string, args: string[], cwd: string) {
  return new Promise<{ exitCode: number; stderr: string; stdout: string }>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer | string) => { stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stderr: stderr.trim(), stdout: stdout.trim() });
    });
  });
}

function safeParseJson(value: string) {
  try { return JSON.parse(value); }
  catch { return value; }
}

async function sha256NormalizedFile(filePath: string) {
  return createHash("sha256").update(Buffer.from(normalizeText(await readFile(filePath, "utf8")), "utf8")).digest("hex");
}
function normalizeText(value: string) {
  return value.replace(/^\uFEFF/u, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export function buildWorkerClaimLoopDefaults() {
  return {
    baseWorkingRoot: path.join(os.tmpdir(), "paretoproof", "worker-claim-loop"),
    workerId: `${os.hostname()}-${process.pid}`,
    workerPool: "default",
    workerRuntime: "modal" as const,
    workerVersion: "worker.local"
  };
}
