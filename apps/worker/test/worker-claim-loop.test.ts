import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import type {
  WorkerArtifactManifestEntry,
  WorkerClaimRequest,
  WorkerResultMessageRequest,
  WorkerTerminalFailureRequest
} from "@paretoproof/shared";
import { runWorkerClaimLoop } from "../src/lib/worker-claim-loop.ts";

const fixedNow = new Date("2026-03-13T18:00:00.000Z");
const benchmarkDigest = "a".repeat(64);
const promptDigest = "b".repeat(64);
const artifactManifestDigest = "c".repeat(64);
const bundleDigest = "d".repeat(64);
const candidateDigest = "e".repeat(64);
const environmentDigest = "f".repeat(64);
const verdictDigest = "1".repeat(64);

type ApiCall = {
  body: unknown;
  path: string;
  token: string;
};

type ApiMockResponse = {
  body: unknown;
  path: string;
  status?: number;
};

type WrittenBundleDigests = {
  artifactManifestDigest: string;
  bundleDigest: string;
  candidateDigest: string;
  environmentDigest: string;
  verdictDigest: string;
};

test("runWorkerClaimLoop submits manifest and terminal result for a claimed single_run", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-claim-success-"));

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    const artifactEntries = buildArtifactEntries();
    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 0,
            jobToken: "job-token-2"
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 1
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 1
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            artifactManifestDigest,
            artifacts: artifactEntries.map((artifact, index) => ({
              artifactId: `artifact-${index + 1}`,
              artifactRole: artifact.artifactRole,
              relativePath: artifact.relativePath
            }))
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/artifacts`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 2
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 3
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            attemptState: "succeeded",
            jobState: "completed",
            runState: "succeeded"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/result`
        }
      ],
      calls
    );
    const attemptCalls: Array<Record<string, unknown>> = [];
    let writtenBundle: WrittenBundleDigests | null = null;

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async (options) => {
          attemptCalls.push(options);
          writtenBundle = await writeBundleOutputs(options.outputRoot, artifactEntries);

          return {
            artifactManifestDigest,
            attemptId: workerJob.attemptId,
            authMode: "machine_api_key",
            bundleDigest,
            compileRepairCount: 1,
            outputRoot: options.outputRoot,
            promptPackageDigest: promptDigest,
            providerFamily: "openai",
            providerTurnsUsed: 2,
            result: "pass",
            runConfigDigest: "2".repeat(64),
            runId: workerJob.runId,
            stopReason: "verification_passed",
            verifierRepairCount: 0,
            verdictDigest
          };
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 1,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });
    assert.equal(attemptCalls.length, 1);
    assert.equal(attemptCalls[0]?.authMode, "machine_api_key");
    assert.deepEqual(attemptCalls[0]?.environmentProvenance, {
      executionImageDigest: "9".repeat(64),
      executionTargetKind: "paretoproof-worker",
      localDevboxDigest: null,
      metadata: {}
    });
    assert.equal(attemptCalls[0]?.providerFamily, "openai");
    assert.equal(attemptCalls[0]?.networkPolicyMode, "hosted");
    assert.equal(attemptCalls[0]?.providerModel, "gpt-5");
    assert.equal(attemptCalls[0]?.stubScenario, "exact_canonical");

    const claimBody = calls[0]?.body as WorkerClaimRequest;
    assert.equal(calls[0]?.path, "/internal/worker/claims");
    assert.equal(calls[0]?.token, "bootstrap-token");
    assert.deepEqual(claimBody, {
      activeJobCount: 0,
      availableRunKinds: ["single_run"],
      maxConcurrentJobs: 1,
      supportedArtifactRoles: [
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
      ],
      supportsOfflineBundleContract: true,
      supportsTraceUploads: false,
      workerId: "worker-1",
      workerPool: "modal-dev",
      workerRuntime: "modal",
      workerVersion: "worker.v1"
    });

    const resultBody = calls.at(-1)?.body as WorkerResultMessageRequest;
    assert.equal(calls.at(-1)?.path, `/internal/worker/jobs/${workerJob.jobId}/result`);
    assert.equal(calls.at(-1)?.token, "job-token-2");
    assert.deepEqual(resultBody.artifactIds, expectedArtifactIds(artifactEntries));
    assert.equal(resultBody.artifactManifestDigest, writtenBundle?.artifactManifestDigest);
    assert.equal(resultBody.bundleDigest, writtenBundle?.bundleDigest);
    assert.equal(resultBody.candidateDigest, writtenBundle?.candidateDigest);
    assert.equal(resultBody.environmentDigest, writtenBundle?.environmentDigest);
    assert.equal(resultBody.verdictDigest, writtenBundle?.verdictDigest);
    assert.deepEqual(resultBody.usageSummary, {
      compileRepairCount: 1,
      providerTurnsUsed: 2,
      stopReason: "verification_passed",
      verifierRepairCount: 0
    });
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop accepts uppercase verdict benchmarkPackageDigest hex", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-claim-uppercase-verdict-digest-"));

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    const artifactEntries = buildArtifactEntries();
    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 0,
            jobToken: "job-token-2"
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 1
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 1
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            artifactManifestDigest,
            artifacts: artifactEntries.map((artifact, index) => ({
              artifactId: `artifact-${index + 1}`,
              artifactRole: artifact.artifactRole,
              relativePath: artifact.relativePath
            }))
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/artifacts`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 2
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 3
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            attemptState: "succeeded",
            jobState: "completed",
            runState: "succeeded"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/result`
        }
      ],
      calls
    );

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async (options) => {
          await writeBundleOutputsWithVerdict(options.outputRoot, artifactEntries, {
            benchmarkPackageDigest: benchmarkDigest.toUpperCase()
          });

          return {
            artifactManifestDigest,
            attemptId: workerJob.attemptId,
            authMode: "machine_api_key",
            bundleDigest,
            compileRepairCount: 0,
            outputRoot: options.outputRoot,
            promptPackageDigest: promptDigest,
            providerFamily: "openai",
            providerTurnsUsed: 1,
            result: "pass",
            runConfigDigest: "2".repeat(64),
            runId: workerJob.runId,
            stopReason: "verification_passed",
            verifierRepairCount: 0,
            verdictDigest
          };
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 1,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });
    assert.equal(calls.at(-1)?.path, `/internal/worker/jobs/${workerJob.jobId}/result`);
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop registers failure-classification artifacts for failing verifier results", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-claim-failing-verdict-"));

  try {
    const calls: ApiCall[] = [];
    const baseWorkerJob = buildWorkerJob();
    const workerJob = {
      ...baseWorkerJob,
      requiredArtifactRoles: [...baseWorkerJob.requiredArtifactRoles, "failure_classification" as const]
    };
    const artifactEntries = buildArtifactEntries({ includeFailureClassification: true });
    let writtenBundle: WrittenBundleDigests | null = null;
    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 0,
            jobToken: "job-token-2"
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 1
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 1
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            artifactManifestDigest,
            artifacts: artifactEntries.map((artifact, index) => ({
              artifactId: `artifact-${index + 1}`,
              artifactRole: artifact.artifactRole,
              relativePath: artifact.relativePath
            }))
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/artifacts`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 2
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 3
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            attemptState: "failed",
            jobState: "failed",
            runState: "failed"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/failure`
        }
      ],
      calls
    );

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async (options) => {
          writtenBundle = await writeBundleOutputsWithVerdict(options.outputRoot, artifactEntries, {
            diagnosticGate: "failed",
            failureCode: "proof_policy_failed",
            primaryFailure: {
              evidenceArtifactRefs: ["verification/failure-classification.json"],
              failureCode: "proof_policy_failed",
              failureFamily: "verification",
              phase: "verify",
              retryEligibility: "never",
              summary: "Canonical verifier failure payload.",
              terminality: "terminal_attempt",
              userVisibility: "internal_only"
            },
            result: "fail"
          });

          return {
            artifactManifestDigest,
            attemptId: workerJob.attemptId,
            authMode: "machine_api_key",
            bundleDigest,
            compileRepairCount: 0,
            outputRoot: options.outputRoot,
            promptPackageDigest: promptDigest,
            providerFamily: "openai",
            providerTurnsUsed: 1,
            result: "fail",
            runConfigDigest: "2".repeat(64),
            runId: workerJob.runId,
            stopReason: "verifier_failed",
            verifierRepairCount: 0,
            verdictDigest
          };
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 1,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });
    assert.equal(calls.at(-1)?.path, `/internal/worker/jobs/${workerJob.jobId}/failure`);
    const failureBody = calls.at(-1)?.body as WorkerTerminalFailureRequest;
    assert.deepEqual(failureBody.artifactIds, expectedArtifactIds(artifactEntries));
    assert.equal(failureBody.artifactManifestDigest, writtenBundle?.artifactManifestDigest);
    assert.equal(failureBody.bundleDigest, writtenBundle?.bundleDigest);
    assert.equal(failureBody.candidateDigest, writtenBundle?.candidateDigest);
    assert.equal(failureBody.verdictDigest, writtenBundle?.verdictDigest);
    assert.equal(failureBody.failure.failureCode, "proof_policy_failed");
    assert.deepEqual(failureBody.failure.evidenceArtifactRefs, [
      "verification/failure-classification.json"
    ]);
    assert.equal(failureBody.terminalState, "failed");
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop terminalizes cancellation after the first cancel-requested heartbeat", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-claim-cancel-"));

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    let attemptRunnerCalled = false;
    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: {
            acknowledgedEventSequence: 0,
            cancelRequested: true,
            jobToken: "job-token-2",
            jobTokenExpiresAt: fixedNow.toISOString(),
            leaseExpiresAt: fixedNow.toISOString(),
            leaseStatus: "cancel_requested"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            attemptState: "cancelled",
            jobState: "cancelled",
            runState: "cancelled"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/failure`
        }
      ],
      calls
    );

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async () => {
          attemptRunnerCalled = true;
          throw new Error("attempt runner should not have executed");
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.equal(attemptRunnerCalled, false);
    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 1,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });
    assert.deepEqual(
      calls.map((call) => call.path),
      [
        "/internal/worker/claims",
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/failure`
      ]
    );
    const failureBody = calls.at(-1)?.body as WorkerTerminalFailureRequest;
    assert.equal(failureBody.failure.failureCode, "manual_cancelled");
    assert.equal(failureBody.failure.phase, "cancel");
    assert.equal(failureBody.terminalState, "cancelled");
    assert.deepEqual(failureBody.failure.evidenceArtifactRefs, [
      "worker-control/pre-bundle-failure"
    ]);
    assert.equal(calls.at(-1)?.token, "job-token-2");
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop terminalizes cancellation after control-plane cancel during finalization", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-claim-finalize-cancel-"));

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    const artifactEntries = buildArtifactEntries();
    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 0,
            jobToken: "job-token-2"
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 1
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 1,
            cancelRequested: true,
            jobToken: "job-token-3",
            leaseStatus: "cancel_requested"
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            attemptState: "cancelled",
            jobState: "cancelled",
            runState: "cancelled"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/failure`
        }
      ],
      calls
    );
    let attemptRunnerCalled = false;

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async (options) => {
          attemptRunnerCalled = true;
          await writeBundleOutputs(options.outputRoot, artifactEntries);

          return {
            artifactManifestDigest,
            attemptId: workerJob.attemptId,
            authMode: "machine_api_key",
            bundleDigest,
            compileRepairCount: 0,
            outputRoot: options.outputRoot,
            promptPackageDigest: promptDigest,
            providerFamily: "openai",
            providerTurnsUsed: 1,
            result: "pass",
            runConfigDigest: "2".repeat(64),
            runId: workerJob.runId,
            stopReason: "verification_passed",
            verifierRepairCount: 0,
            verdictDigest
          };
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.equal(attemptRunnerCalled, true);
    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 1,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });
    assert.deepEqual(
      calls.map((call) => call.path),
      [
        "/internal/worker/claims",
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/failure`
      ]
    );
    const failureBody = calls.at(-1)?.body as WorkerTerminalFailureRequest;
    assert.equal(failureBody.failure.failureCode, "manual_cancelled");
    assert.equal(failureBody.failure.phase, "cancel");
    assert.equal(failureBody.terminalState, "cancelled");
    assert.equal(calls.at(-1)?.token, "job-token-3");
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop preserves cancelled terminalization when the first cancel submit fails transiently", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "paretoproof-worker-claim-finalize-cancel-retry-")
  );

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    const artifactEntries = buildArtifactEntries();
    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 0,
            jobToken: "job-token-2"
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 1
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 1,
            cancelRequested: true,
            jobToken: "job-token-3",
            leaseStatus: "cancel_requested"
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            error: "failure_write_failed"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/failure`,
          status: 500
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            attemptState: "cancelled",
            jobState: "cancelled",
            runState: "cancelled"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/failure`
        }
      ],
      calls
    );

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async (options) => {
          await writeBundleOutputs(options.outputRoot, artifactEntries);

          return {
            artifactManifestDigest,
            attemptId: workerJob.attemptId,
            authMode: "machine_api_key",
            bundleDigest,
            compileRepairCount: 0,
            outputRoot: options.outputRoot,
            promptPackageDigest: promptDigest,
            providerFamily: "openai",
            providerTurnsUsed: 1,
            result: "pass",
            runConfigDigest: "2".repeat(64),
            runId: workerJob.runId,
            stopReason: "verification_passed",
            verifierRepairCount: 0,
            verdictDigest
          };
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 1,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });
    assert.deepEqual(
      calls.map((call) => call.path),
      [
        "/internal/worker/claims",
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/failure`,
        `/internal/worker/jobs/${workerJob.jobId}/failure`
      ]
    );
    const firstFailureBody = calls.at(-2)?.body as WorkerTerminalFailureRequest;
    const recoveredFailureBody = calls.at(-1)?.body as WorkerTerminalFailureRequest;
    assert.equal(firstFailureBody.failure.failureCode, "manual_cancelled");
    assert.equal(firstFailureBody.terminalState, "cancelled");
    assert.equal(recoveredFailureBody.failure.failureCode, "manual_cancelled");
    assert.equal(recoveredFailureBody.failure.phase, "cancel");
    assert.equal(recoveredFailureBody.terminalState, "cancelled");
    assert.deepEqual(recoveredFailureBody.failure.evidenceArtifactRefs, [
      "worker-control/pre-bundle-failure"
    ]);
    assert.equal(calls.at(-1)?.token, "job-token-3");
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop treats bounded cancel-finalization window loss as lease loss instead of crashing", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "paretoproof-worker-claim-finalize-cancel-expired-")
  );

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    const artifactEntries = buildArtifactEntries();
    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 0,
            jobToken: "job-token-2"
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 1
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 1,
            cancelRequested: true,
            jobToken: "job-token-3",
            leaseStatus: "cancel_requested"
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            error: "worker_lease_not_active"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/failure`,
          status: 409
        }
      ],
      calls
    );
    let attemptRunnerCalled = false;

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async (options) => {
          attemptRunnerCalled = true;
          await writeBundleOutputs(options.outputRoot, artifactEntries);

          return {
            artifactManifestDigest,
            attemptId: workerJob.attemptId,
            authMode: "machine_api_key",
            bundleDigest,
            compileRepairCount: 0,
            outputRoot: options.outputRoot,
            promptPackageDigest: promptDigest,
            providerFamily: "openai",
            providerTurnsUsed: 1,
            result: "pass",
            runConfigDigest: "2".repeat(64),
            runId: workerJob.runId,
            stopReason: "verification_passed",
            verifierRepairCount: 0,
            verdictDigest
          };
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.equal(attemptRunnerCalled, true);
    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 0,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });
    assert.deepEqual(
      calls.map((call) => call.path),
      [
        "/internal/worker/claims",
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/failure`
      ]
    );
    assert.equal(calls.at(-1)?.token, "job-token-3");
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop treats late-finalize cancel-window loss as lease loss after artifact registration", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "paretoproof-worker-claim-late-finalize-cancel-expired-")
  );

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    const artifactEntries = buildArtifactEntries();
    let writtenBundle: WrittenBundleDigests | null = null;
    let heartbeatCount = 0;
    let sleepCount = 0;
    let releaseLateCancelHeartbeat: (() => void) | null = null;
    let resolveLateCancelHeartbeatSeen: (() => void) | null = null;
    const lateCancelHeartbeatReleased = new Promise<void>((resolve) => {
      releaseLateCancelHeartbeat = resolve;
    });
    const lateCancelHeartbeatSeen = new Promise<void>((resolve) => {
      resolveLateCancelHeartbeatSeen = resolve;
    });
    const fetchImpl = async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const bodyText = typeof init?.body === "string" ? init.body : "";
      const body = bodyText.length > 0 ? JSON.parse(bodyText) : null;

      calls.push({
        body,
        path: url.pathname,
        token:
          new Headers(init?.headers).get("authorization")?.replace(/^Bearer\s+/u, "") ?? ""
      });

      if (url.pathname === "/internal/worker/claims") {
        return jsonResponse({
          leaseStatus: "active",
          pollAfterSeconds: 0,
          workerJob
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/heartbeat`) {
        heartbeatCount += 1;

        if (heartbeatCount === 1) {
          return jsonResponse(
            buildHeartbeatResponse({
              acknowledgedEventSequence: 0,
              jobToken: "job-token-2"
            })
          );
        }

        if (heartbeatCount === 2) {
          return jsonResponse(
            buildHeartbeatResponse({
              acknowledgedEventSequence: 1,
              jobToken: "job-token-3"
            })
          );
        }

        if (heartbeatCount === 3) {
          resolveLateCancelHeartbeatSeen?.();
          return jsonResponse(
            buildHeartbeatResponse({
              acknowledgedEventSequence: 1,
              cancelRequested: true,
              jobToken: "job-token-4",
              leaseStatus: "cancel_requested"
            })
          );
        }

        throw new Error(`Unexpected extra heartbeat ${heartbeatCount}.`);
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/events`) {
        if (body.sequence === 2) {
          releaseLateCancelHeartbeat?.();
          await lateCancelHeartbeatSeen;
        }

        return jsonResponse({
          acceptedAt: fixedNow.toISOString(),
          acknowledgedSequence: body.sequence
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/artifacts`) {
        return jsonResponse({
          acceptedAt: fixedNow.toISOString(),
          artifactManifestDigest,
          artifacts: artifactEntries.map((artifact, index) => ({
            artifactId: `artifact-${index + 1}`,
            artifactRole: artifact.artifactRole,
            relativePath: artifact.relativePath
          }))
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/failure`) {
        return new Response(JSON.stringify({ error: "worker_lease_not_active" }), {
          headers: {
            "content-type": "application/json"
          },
          status: 409
        });
      }

      throw new Error(`Unexpected fetch path ${url.pathname}.`);
    };

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async (options) => {
          writtenBundle = await writeBundleOutputs(options.outputRoot, artifactEntries);

          return {
            artifactManifestDigest,
            attemptId: workerJob.attemptId,
            authMode: "machine_api_key",
            bundleDigest,
            compileRepairCount: 0,
            outputRoot: options.outputRoot,
            promptPackageDigest: promptDigest,
            providerFamily: "openai",
            providerTurnsUsed: 1,
            result: "pass",
            runConfigDigest: "2".repeat(64),
            runId: workerJob.runId,
            stopReason: "verification_passed",
            verifierRepairCount: 0,
            verdictDigest
          };
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: async () => {
          sleepCount += 1;

          if (sleepCount === 1) {
            await lateCancelHeartbeatReleased;
            return;
          }

          return neverSleep();
        }
      }
    );

    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 0,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });
    assert.deepEqual(
      calls.map((call) => call.path),
      [
        "/internal/worker/claims",
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/artifacts`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/failure`
      ]
    );
    const failureBody = calls.at(-1)?.body as WorkerTerminalFailureRequest;
    assert.deepEqual(failureBody.artifactIds, expectedArtifactIds(artifactEntries));
    assert.equal(failureBody.artifactManifestDigest, writtenBundle?.artifactManifestDigest);
    assert.equal(failureBody.bundleDigest, writtenBundle?.bundleDigest);
    assert.equal(failureBody.candidateDigest, writtenBundle?.candidateDigest);
    assert.deepEqual(failureBody.failure.evidenceArtifactRefs, ["verification/verdict.json"]);
    assert.equal(failureBody.terminalState, "cancelled");
    assert.equal(calls.at(-1)?.token, "job-token-4");
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop treats late-finalize cancel-window loss as lease loss after bundle finalization", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "paretoproof-worker-claim-post-bundle-cancel-expired-")
  );

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    const artifactEntries = buildArtifactEntries();
    let writtenBundle: WrittenBundleDigests | null = null;
    let heartbeatCount = 0;
    let sleepCount = 0;
    let releaseLateCancelHeartbeat: (() => void) | null = null;
    let resolveLateCancelHeartbeatSeen: (() => void) | null = null;
    const lateCancelHeartbeatReleased = new Promise<void>((resolve) => {
      releaseLateCancelHeartbeat = resolve;
    });
    const lateCancelHeartbeatSeen = new Promise<void>((resolve) => {
      resolveLateCancelHeartbeatSeen = resolve;
    });
    const fetchImpl = async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const bodyText = typeof init?.body === "string" ? init.body : "";
      const body = bodyText.length > 0 ? JSON.parse(bodyText) : null;

      calls.push({
        body,
        path: url.pathname,
        token:
          new Headers(init?.headers).get("authorization")?.replace(/^Bearer\s+/u, "") ?? ""
      });

      if (url.pathname === "/internal/worker/claims") {
        return jsonResponse({
          leaseStatus: "active",
          pollAfterSeconds: 0,
          workerJob
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/heartbeat`) {
        heartbeatCount += 1;

        if (heartbeatCount === 1) {
          return jsonResponse(
            buildHeartbeatResponse({
              acknowledgedEventSequence: 0,
              jobToken: "job-token-2"
            })
          );
        }

        if (heartbeatCount === 2) {
          return jsonResponse(
            buildHeartbeatResponse({
              acknowledgedEventSequence: 1,
              jobToken: "job-token-3"
            })
          );
        }

        if (heartbeatCount === 3) {
          resolveLateCancelHeartbeatSeen?.();
          return jsonResponse(
            buildHeartbeatResponse({
              acknowledgedEventSequence: 2,
              cancelRequested: true,
              jobToken: "job-token-4",
              leaseStatus: "cancel_requested"
            })
          );
        }

        throw new Error(`Unexpected extra heartbeat ${heartbeatCount}.`);
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/events`) {
        if (body.sequence === 3) {
          releaseLateCancelHeartbeat?.();
          await lateCancelHeartbeatSeen;
        }

        return jsonResponse({
          acceptedAt: fixedNow.toISOString(),
          acknowledgedSequence: body.sequence
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/artifacts`) {
        return jsonResponse({
          acceptedAt: fixedNow.toISOString(),
          artifactManifestDigest,
          artifacts: artifactEntries.map((artifact, index) => ({
            artifactId: `artifact-${index + 1}`,
            artifactRole: artifact.artifactRole,
            relativePath: artifact.relativePath
          }))
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/failure`) {
        return new Response(JSON.stringify({ error: "worker_lease_not_active" }), {
          headers: {
            "content-type": "application/json"
          },
          status: 409
        });
      }

      throw new Error(`Unexpected fetch path ${url.pathname}.`);
    };

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async (options) => {
          writtenBundle = await writeBundleOutputs(options.outputRoot, artifactEntries);

          return {
            artifactManifestDigest,
            attemptId: workerJob.attemptId,
            authMode: "machine_api_key",
            bundleDigest,
            compileRepairCount: 0,
            outputRoot: options.outputRoot,
            promptPackageDigest: promptDigest,
            providerFamily: "openai",
            providerTurnsUsed: 1,
            result: "pass",
            runConfigDigest: "2".repeat(64),
            runId: workerJob.runId,
            stopReason: "verification_passed",
            verifierRepairCount: 0,
            verdictDigest
          };
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: async () => {
          sleepCount += 1;

          if (sleepCount === 1) {
            await lateCancelHeartbeatReleased;
            return;
          }

          return neverSleep();
        }
      }
    );

    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 0,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });
    assert.deepEqual(
      calls.map((call) => call.path),
      [
        "/internal/worker/claims",
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/artifacts`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/failure`
      ]
    );
    const failureBody = calls.at(-1)?.body as WorkerTerminalFailureRequest;
    assert.deepEqual(failureBody.artifactIds, expectedArtifactIds(artifactEntries));
    assert.equal(failureBody.artifactManifestDigest, writtenBundle?.artifactManifestDigest);
    assert.equal(failureBody.bundleDigest, writtenBundle?.bundleDigest);
    assert.equal(failureBody.candidateDigest, writtenBundle?.candidateDigest);
    assert.deepEqual(failureBody.failure.evidenceArtifactRefs, ["verification/verdict.json"]);
    assert.equal(failureBody.terminalState, "cancelled");
    assert.equal(calls.at(-1)?.token, "job-token-4");
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop converts non-lease finalize heartbeat failures into canonical pre-bundle failures", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "paretoproof-worker-claim-finalize-heartbeat-failure-")
  );

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    const artifactEntries = buildArtifactEntries();
    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 0,
            jobToken: "job-token-2"
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 1
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: {
            error: "backend_unavailable"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
          status: 500
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            attemptState: "failed",
            jobState: "failed",
            runState: "failed"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/failure`
        }
      ],
      calls
    );

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async (options) => {
          await writeBundleOutputs(options.outputRoot, artifactEntries);

          return {
            artifactManifestDigest,
            attemptId: workerJob.attemptId,
            authMode: "machine_api_key",
            bundleDigest,
            compileRepairCount: 0,
            outputRoot: options.outputRoot,
            promptPackageDigest: promptDigest,
            providerFamily: "openai",
            providerTurnsUsed: 1,
            result: "pass",
            runConfigDigest: "2".repeat(64),
            runId: workerJob.runId,
            stopReason: "verification_passed",
            verifierRepairCount: 0,
            verdictDigest
          };
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 1,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });
    assert.deepEqual(
      calls.map((call) => call.path),
      [
        "/internal/worker/claims",
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/failure`
      ]
    );
    const failureBody = calls.at(-1)?.body as WorkerTerminalFailureRequest;
    assert.equal(failureBody.failure.failureCode, "harness_crashed");
    assert.match(failureBody.failure.summary, /Worker control request failed \(500\).*\/heartbeat/u);
    assert.deepEqual(failureBody.failure.evidenceArtifactRefs, ["worker-control/pre-bundle-failure"]);
    assert.equal(failureBody.artifactIds, undefined);
    assert.equal(failureBody.artifactManifestDigest, null);
    assert.equal(failureBody.bundleDigest, null);
    assert.equal(failureBody.candidateDigest, null);
    assert.equal(failureBody.verifierVerdict, null);
    assert.equal(failureBody.verdictDigest, null);
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop converts non-lease background heartbeat failures into canonical pre-bundle failures", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "paretoproof-worker-claim-background-heartbeat-failure-")
  );

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    let heartbeatCount = 0;
    let resolveHeartbeatFailureSeen: (() => void) | null = null;
    const heartbeatFailureSeen = new Promise<void>((resolve) => {
      resolveHeartbeatFailureSeen = resolve;
    });
    const fetchImpl = async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const bodyText = typeof init?.body === "string" ? init.body : "";

      calls.push({
        body: bodyText.length > 0 ? JSON.parse(bodyText) : null,
        path: url.pathname,
        token:
          new Headers(init?.headers).get("authorization")?.replace(/^Bearer\s+/u, "") ?? ""
      });

      if (url.pathname === "/internal/worker/claims") {
        return jsonResponse({
          leaseStatus: "active",
          pollAfterSeconds: 0,
          workerJob
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/heartbeat`) {
        heartbeatCount += 1;

        if (heartbeatCount === 1) {
          return jsonResponse(
            buildHeartbeatResponse({
              acknowledgedEventSequence: 0,
              jobToken: "job-token-2"
            })
          );
        }

        if (heartbeatCount === 2) {
          resolveHeartbeatFailureSeen?.();
          return new Response(JSON.stringify({ error: "backend_unavailable" }), {
            headers: {
              "content-type": "application/json"
            },
            status: 500
          });
        }

        throw new Error(`Unexpected extra heartbeat ${heartbeatCount}.`);
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/events`) {
        return jsonResponse({
          acceptedAt: fixedNow.toISOString(),
          acknowledgedSequence: 1
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/failure`) {
        return jsonResponse({
          acceptedAt: fixedNow.toISOString(),
          attemptState: "failed",
          jobState: "failed",
          runState: "failed"
        });
      }

      throw new Error(`Unexpected fetch path ${url.pathname}.`);
    };

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async (options) => {
          await heartbeatFailureSeen;
          await writeBundleOutputs(options.outputRoot, buildArtifactEntries());

          return {
            artifactManifestDigest,
            attemptId: workerJob.attemptId,
            authMode: "machine_api_key",
            bundleDigest,
            compileRepairCount: 0,
            outputRoot: options.outputRoot,
            promptPackageDigest: promptDigest,
            providerFamily: "openai",
            providerTurnsUsed: 1,
            result: "pass",
            runConfigDigest: "2".repeat(64),
            runId: workerJob.runId,
            stopReason: "verification_passed",
            verifierRepairCount: 0,
            verdictDigest
          };
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: async () => {}
      }
    );

    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 1,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });
    assert.deepEqual(
      calls.map((call) => call.path),
      [
        "/internal/worker/claims",
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/failure`
      ]
    );
    const failureBody = calls.at(-1)?.body as WorkerTerminalFailureRequest;
    assert.equal(failureBody.failure.failureCode, "harness_crashed");
    assert.match(failureBody.failure.summary, /Worker control request failed \(500\).*\/heartbeat/u);
    assert.deepEqual(failureBody.failure.evidenceArtifactRefs, ["worker-control/pre-bundle-failure"]);
    assert.equal(failureBody.artifactIds, undefined);
    assert.equal(failureBody.bundleDigest, null);
    assert.equal(failureBody.verifierVerdict, null);
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop falls back to an artifact-backed harness failure when terminal result submission fails", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "paretoproof-worker-claim-result-submit-failure-")
  );

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    const artifactEntries = buildArtifactEntries();
    let writtenBundle: WrittenBundleDigests | null = null;
    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 0,
            jobToken: "job-token-2"
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 1
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 1
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            artifactManifestDigest,
            artifacts: artifactEntries.map((artifact, index) => ({
              artifactId: `artifact-${index + 1}`,
              artifactRole: artifact.artifactRole,
              relativePath: artifact.relativePath
            }))
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/artifacts`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 2
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 3
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: {
            error: "result_write_failed"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/result`,
          status: 500
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            attemptState: "failed",
            jobState: "failed",
            runState: "failed"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/failure`
        }
      ],
      calls
    );

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async (options) => {
          writtenBundle = await writeBundleOutputs(options.outputRoot, artifactEntries);

          return {
            artifactManifestDigest,
            attemptId: workerJob.attemptId,
            authMode: "machine_api_key",
            bundleDigest,
            compileRepairCount: 0,
            outputRoot: options.outputRoot,
            promptPackageDigest: promptDigest,
            providerFamily: "openai",
            providerTurnsUsed: 1,
            result: "pass",
            runConfigDigest: "2".repeat(64),
            runId: workerJob.runId,
            stopReason: "verification_passed",
            verifierRepairCount: 0,
            verdictDigest
          };
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 1,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });
    assert.deepEqual(
      calls.map((call) => call.path),
      [
        "/internal/worker/claims",
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/artifacts`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/result`,
        `/internal/worker/jobs/${workerJob.jobId}/failure`
      ]
    );
    const failureBody = calls.at(-1)?.body as WorkerTerminalFailureRequest;
    assert.equal(failureBody.failure.failureCode, "harness_crashed");
    assert.match(failureBody.failure.summary, /Worker control request failed \(500\).*\/result/u);
    assert.deepEqual(failureBody.failure.evidenceArtifactRefs, ["verification/verdict.json"]);
    assert.deepEqual(failureBody.artifactIds, expectedArtifactIds(artifactEntries));
    assert.equal(failureBody.artifactManifestDigest, writtenBundle?.artifactManifestDigest);
    assert.equal(failureBody.bundleDigest, writtenBundle?.bundleDigest);
    assert.equal(failureBody.candidateDigest, writtenBundle?.candidateDigest);
    assert.equal(failureBody.verdictDigest, null);
    assert.equal(failureBody.verifierVerdict, null);
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop preserves cancelled terminalization when a late cancel arrives during result-submit recovery", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "paretoproof-worker-claim-result-submit-cancel-race-")
  );

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    const artifactEntries = buildArtifactEntries();
    let sleepCount = 0;
    let heartbeatCount = 0;
    let releaseLateCancelHeartbeat: (() => void) | null = null;
    const lateCancelHeartbeatReleased = new Promise<void>((resolve) => {
      releaseLateCancelHeartbeat = resolve;
    });
    const fetchImpl = async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const bodyText = typeof init?.body === "string" ? init.body : "";
      const body = bodyText.length > 0 ? JSON.parse(bodyText) : null;

      calls.push({
        body,
        path: url.pathname,
        token:
          new Headers(init?.headers).get("authorization")?.replace(/^Bearer\s+/u, "") ?? ""
      });

      if (url.pathname === "/internal/worker/claims") {
        return jsonResponse({
          leaseStatus: "active",
          pollAfterSeconds: 0,
          workerJob
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/heartbeat`) {
        heartbeatCount += 1;

        if (heartbeatCount === 1) {
          return jsonResponse(
            buildHeartbeatResponse({
              acknowledgedEventSequence: 0,
              jobToken: "job-token-2"
            })
          );
        }

        if (heartbeatCount === 2) {
          return jsonResponse(
            buildHeartbeatResponse({
              acknowledgedEventSequence: 1
            })
          );
        }

        if (heartbeatCount === 3) {
          return jsonResponse(
            buildHeartbeatResponse({
              acknowledgedEventSequence: 3,
              cancelRequested: true,
              jobToken: "job-token-3",
              leaseStatus: "cancel_requested"
            })
          );
        }

        throw new Error(`Unexpected extra heartbeat ${heartbeatCount}.`);
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/events`) {
        return jsonResponse({
          acceptedAt: fixedNow.toISOString(),
          acknowledgedSequence: body.sequence
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/artifacts`) {
        return jsonResponse({
          acceptedAt: fixedNow.toISOString(),
          artifactManifestDigest,
          artifacts: artifactEntries.map((artifact, index) => ({
            artifactId: `artifact-${index + 1}`,
            artifactRole: artifact.artifactRole,
            relativePath: artifact.relativePath
          }))
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/result`) {
        releaseLateCancelHeartbeat?.();
        return new Response(JSON.stringify({ error: "result_write_failed" }), {
          headers: {
            "content-type": "application/json"
          },
          status: 500
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/failure`) {
        return jsonResponse({
          acceptedAt: fixedNow.toISOString(),
          attemptState: "cancelled",
          jobState: "cancelled",
          runState: "cancelled"
        });
      }

      throw new Error(`Unexpected fetch path ${url.pathname}.`);
    };

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async (options) => {
          await writeBundleOutputs(options.outputRoot, artifactEntries);

          return {
            artifactManifestDigest,
            attemptId: workerJob.attemptId,
            authMode: "machine_api_key",
            bundleDigest,
            compileRepairCount: 0,
            outputRoot: options.outputRoot,
            promptPackageDigest: promptDigest,
            providerFamily: "openai",
            providerTurnsUsed: 1,
            result: "pass",
            runConfigDigest: "2".repeat(64),
            runId: workerJob.runId,
            stopReason: "verification_passed",
            verifierRepairCount: 0,
            verdictDigest
          };
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: async () => {
          sleepCount += 1;

          if (sleepCount === 1) {
            await lateCancelHeartbeatReleased;
          }
        }
      }
    );

    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 1,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });
    assert.deepEqual(
      calls.map((call) => call.path),
      [
        "/internal/worker/claims",
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/artifacts`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/result`,
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/failure`
      ]
    );
    const failureBody = calls.at(-1)?.body as WorkerTerminalFailureRequest;
    assert.equal(failureBody.failure.failureCode, "manual_cancelled");
    assert.equal(failureBody.failure.phase, "cancel");
    assert.equal(failureBody.terminalState, "cancelled");
    assert.deepEqual(failureBody.artifactIds, expectedArtifactIds(artifactEntries));
    assert.deepEqual(failureBody.failure.evidenceArtifactRefs, ["verification/verdict.json"]);
    assert.equal(calls.at(-1)?.token, "job-token-3");
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop preserves cancelled terminalization when a late cancel arrives during failing-verdict submission", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "paretoproof-worker-claim-failing-verdict-cancel-race-")
  );

  try {
    const calls: ApiCall[] = [];
    const baseWorkerJob = buildWorkerJob();
    const workerJob = {
      ...baseWorkerJob,
      requiredArtifactRoles: [...baseWorkerJob.requiredArtifactRoles, "failure_classification" as const]
    };
    const artifactEntries = buildArtifactEntries({ includeFailureClassification: true });
    let heartbeatCount = 0;
    let writtenBundle: WrittenBundleDigests | null = null;
    let releaseLateCancelHeartbeat: (() => void) | null = null;
    const lateCancelHeartbeatReleased = new Promise<void>((resolve) => {
      releaseLateCancelHeartbeat = resolve;
    });
    const fetchImpl = async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const bodyText = typeof init?.body === "string" ? init.body : "";
      const body = bodyText.length > 0 ? JSON.parse(bodyText) : null;

      calls.push({
        body,
        path: url.pathname,
        token:
          new Headers(init?.headers).get("authorization")?.replace(/^Bearer\s+/u, "") ?? ""
      });

      if (url.pathname === "/internal/worker/claims") {
        return jsonResponse({
          leaseStatus: "active",
          pollAfterSeconds: 0,
          workerJob
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/heartbeat`) {
        heartbeatCount += 1;

        if (heartbeatCount === 1) {
          return jsonResponse(
            buildHeartbeatResponse({
              acknowledgedEventSequence: 0,
              jobToken: "job-token-2"
            })
          );
        }

        if (heartbeatCount === 2) {
          return jsonResponse(
            buildHeartbeatResponse({
              acknowledgedEventSequence: 1
            })
          );
        }

        if (heartbeatCount === 3) {
          return jsonResponse(
            buildHeartbeatResponse({
              acknowledgedEventSequence: 3,
              cancelRequested: true,
              jobToken: "job-token-3",
              leaseStatus: "cancel_requested"
            })
          );
        }

        throw new Error(`Unexpected extra heartbeat ${heartbeatCount}.`);
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/events`) {
        return jsonResponse({
          acceptedAt: fixedNow.toISOString(),
          acknowledgedSequence: body.sequence
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/artifacts`) {
        return jsonResponse({
          acceptedAt: fixedNow.toISOString(),
          artifactManifestDigest,
          artifacts: artifactEntries.map((artifact, index) => ({
            artifactId: `artifact-${index + 1}`,
            artifactRole: artifact.artifactRole,
            relativePath: artifact.relativePath
          }))
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/failure`) {
        if (body.terminalState === "failed") {
          releaseLateCancelHeartbeat?.();
          return new Response(
            JSON.stringify({
              error: "worker_cancel_requested_requires_cancelled_terminalization"
            }),
            {
              headers: {
                "content-type": "application/json"
              },
              status: 409
            }
          );
        }

        return jsonResponse({
          acceptedAt: fixedNow.toISOString(),
          attemptState: "cancelled",
          jobState: "cancelled",
          runState: "cancelled"
        });
      }

      throw new Error(`Unexpected fetch path ${url.pathname}.`);
    };

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async (options) => {
          writtenBundle = await writeBundleOutputsWithVerdict(options.outputRoot, artifactEntries, {
            diagnosticGate: "failed",
            failureCode: "proof_policy_failed",
            primaryFailure: {
              evidenceArtifactRefs: ["verification/failure-classification.json"],
              failureCode: "proof_policy_failed",
              failureFamily: "verification",
              phase: "verify",
              retryEligibility: "never",
              summary: "Canonical verifier failure payload.",
              terminality: "terminal_attempt",
              userVisibility: "internal_only"
            },
            result: "fail"
          });

          return {
            artifactManifestDigest,
            attemptId: workerJob.attemptId,
            authMode: "machine_api_key",
            bundleDigest,
            compileRepairCount: 0,
            outputRoot: options.outputRoot,
            promptPackageDigest: promptDigest,
            providerFamily: "openai",
            providerTurnsUsed: 1,
            result: "fail",
            runConfigDigest: "2".repeat(64),
            runId: workerJob.runId,
            stopReason: "verifier_failed",
            verifierRepairCount: 0,
            verdictDigest
          };
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: async () => {
          await lateCancelHeartbeatReleased;
        }
      }
    );

    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 1,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });
    assert.deepEqual(
      calls.map((call) => call.path),
      [
        "/internal/worker/claims",
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/artifacts`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/failure`,
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/failure`
      ]
    );
    const firstFailureBody = calls.at(-3)?.body as WorkerTerminalFailureRequest;
    const recoveredFailureBody = calls.at(-1)?.body as WorkerTerminalFailureRequest;
    assert.equal(firstFailureBody.failure.failureCode, "proof_policy_failed");
    assert.equal(firstFailureBody.terminalState, "failed");
    assert.equal(recoveredFailureBody.failure.failureCode, "manual_cancelled");
    assert.equal(recoveredFailureBody.failure.phase, "cancel");
    assert.equal(recoveredFailureBody.terminalState, "cancelled");
    assert.deepEqual(recoveredFailureBody.artifactIds, expectedArtifactIds(artifactEntries));
    assert.deepEqual(recoveredFailureBody.failure.evidenceArtifactRefs, ["verification/verdict.json"]);
    assert.equal(recoveredFailureBody.artifactManifestDigest, writtenBundle?.artifactManifestDigest);
    assert.equal(recoveredFailureBody.bundleDigest, writtenBundle?.bundleDigest);
    assert.equal(recoveredFailureBody.candidateDigest, writtenBundle?.candidateDigest);
    assert.equal(recoveredFailureBody.verdictDigest, null);
    assert.equal(recoveredFailureBody.verifierVerdict, null);
    assert.equal(calls.at(-1)?.token, "job-token-3");
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop preserves lease_lost when terminal result submission loses the lease", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-claim-result-lease-loss-"));

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    const artifactEntries = buildArtifactEntries();
    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 0,
            jobToken: "job-token-2"
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 1
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 1
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            artifactManifestDigest,
            artifacts: artifactEntries.map((artifact, index) => ({
              artifactId: `artifact-${index + 1}`,
              artifactRole: artifact.artifactRole,
              relativePath: artifact.relativePath
            }))
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/artifacts`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 2
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 3
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: {
            error: "worker_lease_not_active"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/result`,
          status: 409
        }
      ],
      calls
    );

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async (options) => {
          await writeBundleOutputs(options.outputRoot, artifactEntries);

          return {
            artifactManifestDigest,
            attemptId: workerJob.attemptId,
            authMode: "machine_api_key",
            bundleDigest,
            compileRepairCount: 0,
            outputRoot: options.outputRoot,
            promptPackageDigest: promptDigest,
            providerFamily: "openai",
            providerTurnsUsed: 1,
            result: "pass",
            runConfigDigest: "2".repeat(64),
            runId: workerJob.runId,
            stopReason: "verification_passed",
            verifierRepairCount: 0,
            verdictDigest
          };
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 0,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });
    assert.deepEqual(
      calls.map((call) => call.path),
      [
        "/internal/worker/claims",
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/artifacts`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/result`
      ]
    );
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop retries failing-verdict terminalization with a canonical harness failure when the first failure submit fails", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "paretoproof-worker-claim-failure-submit-recovery-")
  );

  try {
    const calls: ApiCall[] = [];
    const baseWorkerJob = buildWorkerJob();
    const workerJob = {
      ...baseWorkerJob,
      requiredArtifactRoles: [...baseWorkerJob.requiredArtifactRoles, "failure_classification" as const]
    };
    const artifactEntries = buildArtifactEntries({ includeFailureClassification: true });
    let writtenBundle: WrittenBundleDigests | null = null;
    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 0,
            jobToken: "job-token-2"
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 1
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 1
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            artifactManifestDigest,
            artifacts: artifactEntries.map((artifact, index) => ({
              artifactId: `artifact-${index + 1}`,
              artifactRole: artifact.artifactRole,
              relativePath: artifact.relativePath
            }))
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/artifacts`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 2
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 3
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: {
            error: "failure_write_failed"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/failure`,
          status: 500
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            attemptState: "failed",
            jobState: "failed",
            runState: "failed"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/failure`
        }
      ],
      calls
    );

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async (options) => {
          writtenBundle = await writeBundleOutputsWithVerdict(options.outputRoot, artifactEntries, {
            diagnosticGate: "failed",
            failureCode: "proof_policy_failed",
            primaryFailure: {
              evidenceArtifactRefs: ["verification/failure-classification.json"],
              failureCode: "proof_policy_failed",
              failureFamily: "verification",
              phase: "verify",
              retryEligibility: "never",
              summary: "Canonical verifier failure payload.",
              terminality: "terminal_attempt",
              userVisibility: "internal_only"
            },
            result: "fail"
          });

          return {
            artifactManifestDigest,
            attemptId: workerJob.attemptId,
            authMode: "machine_api_key",
            bundleDigest,
            compileRepairCount: 0,
            outputRoot: options.outputRoot,
            promptPackageDigest: promptDigest,
            providerFamily: "openai",
            providerTurnsUsed: 1,
            result: "fail",
            runConfigDigest: "2".repeat(64),
            runId: workerJob.runId,
            stopReason: "verifier_failed",
            verifierRepairCount: 0,
            verdictDigest
          };
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 1,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });
    assert.deepEqual(
      calls.map((call) => call.path),
      [
        "/internal/worker/claims",
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/artifacts`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/failure`,
        `/internal/worker/jobs/${workerJob.jobId}/failure`
      ]
    );
    const firstFailureBody = calls.at(-2)?.body as WorkerTerminalFailureRequest;
    const recoveredFailureBody = calls.at(-1)?.body as WorkerTerminalFailureRequest;
    assert.equal(firstFailureBody.failure.failureCode, "proof_policy_failed");
    assert.equal(recoveredFailureBody.failure.failureCode, "harness_crashed");
    assert.match(
      recoveredFailureBody.failure.summary,
      /Worker control request failed \(500\).*\/failure/u
    );
    assert.deepEqual(recoveredFailureBody.failure.evidenceArtifactRefs, ["verification/verdict.json"]);
    assert.deepEqual(recoveredFailureBody.artifactIds, expectedArtifactIds(artifactEntries));
    assert.equal(recoveredFailureBody.artifactManifestDigest, writtenBundle?.artifactManifestDigest);
    assert.equal(recoveredFailureBody.bundleDigest, writtenBundle?.bundleDigest);
    assert.equal(recoveredFailureBody.candidateDigest, writtenBundle?.candidateDigest);
    assert.equal(recoveredFailureBody.verdictDigest, null);
    assert.equal(recoveredFailureBody.verifierVerdict, null);
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop heartbeats do not advertise unsent finalize event sequences", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-claim-sequence-"));

  try {
    const workerJob = buildWorkerJob();
    const artifactEntries = buildArtifactEntries();
    let heartbeatCount = 0;
    let sleepCount = 0;
    let resolveAttemptFinish: (() => void) | null = null;
    let resolveSecondSleep: (() => void) | null = null;
    let resolvePendingFinalizeEvent: (() => void) | null = null;
    let concurrentHeartbeatSequence: number | null = null;
    const attemptMayFinish = new Promise<void>((resolve) => {
      resolveAttemptFinish = resolve;
    });
    const secondSleepReleased = new Promise<void>((resolve) => {
      resolveSecondSleep = resolve;
    });
    const pendingFinalizeHeartbeat = new Promise<void>((resolve) => {
      resolvePendingFinalizeEvent = resolve;
    });

    const fetchImpl = async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const bodyText = typeof init?.body === "string" ? init.body : "";
      const body = bodyText.length > 0 ? JSON.parse(bodyText) : null;

      if (url.pathname === "/internal/worker/claims") {
        return jsonResponse({
          leaseStatus: "active",
          pollAfterSeconds: 0,
          workerJob
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/heartbeat`) {
        heartbeatCount += 1;

        if (heartbeatCount === 2) {
          resolveAttemptFinish?.();
        }

        if (heartbeatCount === 4) {
          concurrentHeartbeatSequence = body.lastEventSequence;
          resolvePendingFinalizeEvent?.();
        }

        return jsonResponse(buildHeartbeatResponse());
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/events`) {
        if (body.sequence === 2) {
          resolveSecondSleep?.();
          await pendingFinalizeHeartbeat;
          return jsonResponse({
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 2
          });
        }

        return jsonResponse({
          acceptedAt: fixedNow.toISOString(),
          acknowledgedSequence: body.sequence
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/artifacts`) {
        return jsonResponse({
          acceptedAt: fixedNow.toISOString(),
          artifactManifestDigest,
          artifacts: artifactEntries.map((artifact, index) => ({
            artifactId: `artifact-${index + 1}`,
            artifactRole: artifact.artifactRole,
            relativePath: artifact.relativePath
          }))
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/result`) {
        return jsonResponse({
          acceptedAt: fixedNow.toISOString(),
          attemptState: "succeeded",
          jobState: "completed",
          runState: "succeeded"
        });
      }

      throw new Error(`Unexpected fetch path ${url.pathname}.`);
    };

    await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async (options) => {
          await attemptMayFinish;
          await writeBundleOutputs(options.outputRoot, artifactEntries);

          return {
            artifactManifestDigest,
            attemptId: workerJob.attemptId,
            authMode: "machine_api_key",
            bundleDigest,
            compileRepairCount: 0,
            outputRoot: options.outputRoot,
            promptPackageDigest: promptDigest,
            providerFamily: "openai",
            providerTurnsUsed: 1,
            result: "pass",
            runConfigDigest: "2".repeat(64),
            runId: workerJob.runId,
            stopReason: "verification_passed",
            verifierRepairCount: 0,
            verdictDigest
          };
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: async () => {
          sleepCount += 1;

          if (sleepCount === 1) {
            return;
          }

          if (sleepCount === 2) {
            await secondSleepReleased;
            return;
          }

          return neverSleep();
        }
      }
    );

    assert.equal(concurrentHeartbeatSequence, 1);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop submits a canonical pre-bundle failure when the inner attempt runner fails", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-claim-failure-"));

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: buildHeartbeatResponse(),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 1
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            attemptState: "failed",
            jobState: "failed",
            runState: "failed"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/failure`
        }
      ],
      calls
    );

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async () => {
          throw new Error("provider auth failed for hosted attempt");
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 1,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });

    const failureBody = calls.at(-1)?.body as WorkerTerminalFailureRequest;
    assert.equal(calls.at(-1)?.path, `/internal/worker/jobs/${workerJob.jobId}/failure`);
    assert.equal(failureBody.failure.failureCode, "provider_auth_error");
    assert.deepEqual(failureBody.failure.evidenceArtifactRefs, [
      "worker-control/pre-bundle-failure"
    ]);
    assert.equal(failureBody.bundleDigest, null);
    assert.equal(failureBody.verifierVerdict, null);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop preserves cancelled terminalization when a late cancel arrives during attempt-failure recovery", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "paretoproof-worker-claim-attempt-failure-cancel-race-")
  );

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    let heartbeatCount = 0;
    let releasePendingHeartbeat: (() => void) | null = null;
    let resolvePendingHeartbeatStarted: (() => void) | null = null;
    const pendingHeartbeatStarted = new Promise<void>((resolve) => {
      resolvePendingHeartbeatStarted = resolve;
    });
    const fetchImpl = async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const bodyText = typeof init?.body === "string" ? init.body : "";

      calls.push({
        body: bodyText.length > 0 ? JSON.parse(bodyText) : null,
        path: url.pathname,
        token:
          new Headers(init?.headers).get("authorization")?.replace(/^Bearer\s+/u, "") ?? ""
      });

      if (url.pathname === "/internal/worker/claims") {
        return jsonResponse({
          leaseStatus: "active",
          pollAfterSeconds: 0,
          workerJob
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/heartbeat`) {
        heartbeatCount += 1;

        if (heartbeatCount === 1) {
          return jsonResponse(
            buildHeartbeatResponse({
              acknowledgedEventSequence: 0,
              jobToken: "job-token-2"
            })
          );
        }

        if (heartbeatCount === 2) {
          resolvePendingHeartbeatStarted?.();
          return await new Promise<Response>((resolve) => {
            releasePendingHeartbeat = () => {
              resolve(
                jsonResponse(
                  buildHeartbeatResponse({
                    acknowledgedEventSequence: 1,
                    cancelRequested: true,
                    jobToken: "job-token-3",
                    leaseStatus: "cancel_requested"
                  })
                )
              );
            };
          });
        }

        throw new Error(`Unexpected extra heartbeat ${heartbeatCount}.`);
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/events`) {
        return jsonResponse({
          acceptedAt: fixedNow.toISOString(),
          acknowledgedSequence: 1
        });
      }

      if (url.pathname === `/internal/worker/jobs/${workerJob.jobId}/failure`) {
        return jsonResponse({
          acceptedAt: fixedNow.toISOString(),
          attemptState: "cancelled",
          jobState: "cancelled",
          runState: "cancelled"
        });
      }

      throw new Error(`Unexpected fetch path ${url.pathname}.`);
    };

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async () => {
          await pendingHeartbeatStarted;
          queueMicrotask(() => {
            releasePendingHeartbeat?.();
          });
          throw new Error("provider auth failed for hosted attempt");
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: async () => {}
      }
    );

    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 1,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });
    assert.deepEqual(
      calls.map((call) => call.path),
      [
        "/internal/worker/claims",
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/failure`
      ]
    );
    const failureBody = calls.at(-1)?.body as WorkerTerminalFailureRequest;
    assert.equal(failureBody.failure.failureCode, "manual_cancelled");
    assert.equal(failureBody.failure.phase, "cancel");
    assert.equal(failureBody.terminalState, "cancelled");
    assert.equal(calls.at(-1)?.token, "job-token-3");
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop constrains claimed job filesystem paths under the configured roots", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-claim-paths-"));

  try {
    const calls: ApiCall[] = [];
    const workerJob = {
      ...buildWorkerJob(),
      jobId: "C:\\danger"
    };
    const benchmarkRoots: string[] = [];
    const attemptCalls: Array<Record<string, unknown>> = [];
    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: buildHeartbeatResponse(),
          path: jobEndpointPath(workerJob.jobId, "heartbeat")
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 1
          },
          path: jobEndpointPath(workerJob.jobId, "events")
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            attemptState: "failed",
            jobState: "failed",
            runState: "failed"
          },
          path: jobEndpointPath(workerJob.jobId, "failure")
        }
      ],
      calls
    );

    await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async (options) => {
          attemptCalls.push(options);
          throw new Error("provider auth failed for hosted attempt");
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => {
          benchmarkRoots.push(outputRoot);
          return {
            outputRoot,
            packageDigest: benchmarkDigest,
            packageId: "firstproof/Problem9",
            packageVersion: "2026.03.13"
          };
        },
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.equal(benchmarkRoots.length, 1);
    assert.match(benchmarkRoots[0]!, /lease-1__C__danger/i);
    assert.ok(benchmarkRoots[0]!.startsWith(path.join(tempRoot, "workspace")));
    assert.ok(!benchmarkRoots[0]!.includes("C:\\danger"));
    assert.equal(attemptCalls.length, 1);
    assert.ok(
      String(attemptCalls[0]!.workspaceRoot).startsWith(path.join(tempRoot, "workspace"))
    );
    assert.ok(String(attemptCalls[0]!.outputRoot).startsWith(path.join(tempRoot, "output")));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop rejects modal control-plane raw IP origins before any hosted fetch", async () => {
  await assert.rejects(
    () =>
      runWorkerClaimLoop(
        {
          authMode: "machine_api_key",
          maxJobs: 1,
          once: true,
          outputRoot: path.join(os.tmpdir(), "paretoproof-worker-output"),
          workerId: "worker-1",
          workerPool: "modal-dev",
          workerRuntime: "modal",
          workerVersion: "worker.v1",
          workspaceRoot: path.join(os.tmpdir(), "paretoproof-worker-workspace")
        },
        {
          rawEnv: {
            API_BASE_URL: "http://127.0.0.1:3000",
            CODEX_API_KEY: "worker-api-key",
            PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
            WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
          }
        }
      ),
    /raw_ip_forbidden/
  );
});

test("runWorkerClaimLoop fails closed on pre-existing lease residue and skips execution", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-claim-residue-"));

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    const leaseWorkspaceRoot = buildLeaseScopedRoot(path.join(tempRoot, "workspace"), workerJob);
    const leaseStagingRoot = buildLeaseScopedRoot(path.join(tempRoot, "output"), workerJob);
    await mkdir(leaseWorkspaceRoot, { recursive: true });
    await mkdir(leaseStagingRoot, { recursive: true });
    await writeFile(path.join(leaseWorkspaceRoot, "stale.txt"), "stale workspace", "utf8");
    await writeFile(path.join(leaseStagingRoot, "stale.txt"), "stale staging", "utf8");

    let attemptRunnerCalled = false;
    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            attemptState: "failed",
            jobState: "failed",
            runState: "failed"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/failure`
        }
      ],
      calls
    );

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async () => {
          attemptRunnerCalled = true;
          throw new Error("attempt runner should not execute");
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.equal(attemptRunnerCalled, false);
    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 1,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });

    const failureBody = calls.at(-1)?.body as WorkerTerminalFailureRequest;
    assert.equal(failureBody.failure.failureCode, "tool_permission_violation");
    assert.match(failureBody.failure.summary, /Unsafe hosted residue detected/);
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop recovers when the first prepare-phase failure submission itself fails", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "paretoproof-worker-claim-prepare-submit-recovery-")
  );

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    const leaseWorkspaceRoot = buildLeaseScopedRoot(path.join(tempRoot, "workspace"), workerJob);
    const leaseStagingRoot = buildLeaseScopedRoot(path.join(tempRoot, "output"), workerJob);
    await mkdir(leaseWorkspaceRoot, { recursive: true });
    await mkdir(leaseStagingRoot, { recursive: true });
    await writeFile(path.join(leaseWorkspaceRoot, "stale.txt"), "stale workspace", "utf8");
    await writeFile(path.join(leaseStagingRoot, "stale.txt"), "stale staging", "utf8");

    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: {
            error: "failure_write_failed"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/failure`,
          status: 500
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            attemptState: "failed",
            jobState: "failed",
            runState: "failed"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/failure`
        }
      ],
      calls
    );

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async () => {
          throw new Error("attempt runner should not execute");
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 1,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });
    assert.deepEqual(
      calls.map((call) => call.path),
      [
        "/internal/worker/claims",
        `/internal/worker/jobs/${workerJob.jobId}/failure`,
        `/internal/worker/jobs/${workerJob.jobId}/failure`
      ]
    );
    const firstFailureBody = calls.at(-2)?.body as WorkerTerminalFailureRequest;
    const recoveredFailureBody = calls.at(-1)?.body as WorkerTerminalFailureRequest;
    assert.equal(firstFailureBody.failure.failureCode, "tool_permission_violation");
    assert.equal(recoveredFailureBody.failure.failureCode, "harness_crashed");
    assert.match(
      recoveredFailureBody.failure.summary,
      /Worker control request failed \(500\).*\/failure/u
    );
    assert.deepEqual(recoveredFailureBody.failure.evidenceArtifactRefs, ["worker-control/pre-bundle-failure"]);
    assert.equal(recoveredFailureBody.artifactIds, undefined);
    assert.equal(recoveredFailureBody.verifierVerdict, null);
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop preserves cancelled terminalization when the first prepare-phase failure submit races a server-side cancel", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "paretoproof-worker-claim-prepare-submit-cancel-race-")
  );

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    const leaseWorkspaceRoot = buildLeaseScopedRoot(path.join(tempRoot, "workspace"), workerJob);
    const leaseStagingRoot = buildLeaseScopedRoot(path.join(tempRoot, "output"), workerJob);
    await mkdir(leaseWorkspaceRoot, { recursive: true });
    await mkdir(leaseStagingRoot, { recursive: true });
    await writeFile(path.join(leaseWorkspaceRoot, "stale.txt"), "stale workspace", "utf8");
    await writeFile(path.join(leaseStagingRoot, "stale.txt"), "stale staging", "utf8");

    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: {
            error: "worker_cancel_requested_requires_cancelled_terminalization"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/failure`,
          status: 409
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            attemptState: "cancelled",
            jobState: "cancelled",
            runState: "cancelled"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/failure`
        }
      ],
      calls
    );

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async () => {
          throw new Error("attempt runner should not execute");
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 1,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });
    assert.deepEqual(
      calls.map((call) => call.path),
      [
        "/internal/worker/claims",
        `/internal/worker/jobs/${workerJob.jobId}/failure`,
        `/internal/worker/jobs/${workerJob.jobId}/failure`
      ]
    );
    const firstFailureBody = calls.at(-2)?.body as WorkerTerminalFailureRequest;
    const recoveredFailureBody = calls.at(-1)?.body as WorkerTerminalFailureRequest;
    assert.equal(firstFailureBody.failure.failureCode, "tool_permission_violation");
    assert.equal(firstFailureBody.terminalState, "failed");
    assert.equal(recoveredFailureBody.failure.failureCode, "manual_cancelled");
    assert.equal(recoveredFailureBody.failure.phase, "cancel");
    assert.equal(recoveredFailureBody.terminalState, "cancelled");
    assert.deepEqual(recoveredFailureBody.failure.evidenceArtifactRefs, ["worker-control/pre-bundle-failure"]);
    assert.deepEqual(recoveredFailureBody.artifactIds, []);
    assert.equal(recoveredFailureBody.verifierVerdict, null);
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("runWorkerClaimLoop reports invalid hosted modelConfigId prefixes before attempt execution", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "paretoproof-worker-claim-model-config-")
  );

  try {
    const calls: ApiCall[] = [];
    const workerJob = {
      ...buildWorkerJob(),
      target: {
        ...buildWorkerJob().target,
        modelConfigId: "local_stub/problem9_fixture.v1"
      }
    };
    let attemptRunnerCalled = false;
    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: buildHeartbeatResponse(),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            attemptState: "failed",
            jobState: "failed",
            runState: "failed"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/failure`
        }
      ],
      calls
    );

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async () => {
          attemptRunnerCalled = true;
          throw new Error("attempt runner should not execute");
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.equal(attemptRunnerCalled, false);
    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 1,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });

    const failureBody = calls.at(-1)?.body as WorkerTerminalFailureRequest;
    assert.equal(failureBody.failure.failureCode, "provider_unsupported_request");
    assert.match(failureBody.failure.summary, /Hosted modelConfigId must start with openai\//);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

function buildWorkerJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    attemptId: "attempt-1",
    heartbeatIntervalSeconds: 30,
    heartbeatTimeoutSeconds: 90,
    jobId: "job-1",
    jobToken: "job-token-1",
    jobTokenExpiresAt: fixedNow.toISOString(),
    jobTokenScopes: [
      "heartbeat",
      "event_append",
      "artifact_manifest_write",
      "result_finalize",
      "failure_finalize"
    ],
    leaseExpiresAt: fixedNow.toISOString(),
    leaseId: "lease-1",
    offlineBundleCompatible: true as const,
    requiredArtifactRoles: [
      "run_manifest",
      "package_reference",
      "prompt_package",
      "candidate_source",
      "verdict_record",
      "compiler_output",
      "compiler_diagnostics",
      "verifier_output",
      "environment_snapshot"
    ],
    runBundleSchemaVersion: "1",
    runId: "run-1",
    target: {
      authMode: "machine_api_key" as const,
      benchmarkItemId: "Problem9",
      benchmarkPackageDigest: benchmarkDigest,
      benchmarkPackageId: "firstproof/Problem9",
      benchmarkPackageVersion: "2026.03.13",
      harnessRevision: "worker-harness.v1",
      laneId: "lean422_exact",
      modelConfigId: "openai/gpt-5",
      modelSnapshotId: "openai/gpt-5.2026-03-13",
      promptPackageDigest: promptDigest,
      promptProtocolVersion: "problem9-prompt-protocol.v1",
      providerFamily: "openai" as const,
      runKind: "single_run" as const,
      runMode: "bounded_agentic_attempt" as const,
      toolProfile: "workspace_edit_limited" as const
    },
    ...overrides
  };
}

function buildHeartbeatResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    acknowledgedEventSequence: 0,
    cancelRequested: false,
    jobToken: null,
    jobTokenExpiresAt: fixedNow.toISOString(),
    leaseExpiresAt: fixedNow.toISOString(),
    leaseStatus: "active",
    ...overrides
  };
}

function buildArtifactEntries(options: { includeFailureClassification?: boolean } = {}): WorkerArtifactManifestEntry[] {
  const entries: WorkerArtifactManifestEntry[] = [
    {
      artifactRole: "package_reference",
      byteSize: 128,
      contentEncoding: null,
      mediaType: "application/json",
      relativePath: "package/benchmark-package.json",
      requiredForIngest: true,
      sha256: "3".repeat(64)
    },
    {
      artifactRole: "package_reference",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "text/plain",
      relativePath: "package/FirstProof/Problem9/Gold.lean",
      requiredForIngest: true,
      sha256: "31".repeat(32)
    },
    {
      artifactRole: "package_reference",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "text/plain",
      relativePath: "package/FirstProof/Problem9/Statement.lean",
      requiredForIngest: true,
      sha256: "32".repeat(32)
    },
    {
      artifactRole: "package_reference",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "text/plain",
      relativePath: "package/FirstProof/Problem9/Support.lean",
      requiredForIngest: true,
      sha256: "33".repeat(32)
    },
    {
      artifactRole: "package_reference",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "text/plain",
      relativePath: "package/LICENSE",
      requiredForIngest: true,
      sha256: "34".repeat(32)
    },
    {
      artifactRole: "package_reference",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "text/plain",
      relativePath: "package/README.md",
      requiredForIngest: true,
      sha256: "35".repeat(32)
    },
    {
      artifactRole: "package_reference",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "application/json",
      relativePath: "package/lake-manifest.json",
      requiredForIngest: true,
      sha256: "36".repeat(32)
    },
    {
      artifactRole: "package_reference",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "text/plain",
      relativePath: "package/lakefile.toml",
      requiredForIngest: true,
      sha256: "37".repeat(32)
    },
    {
      artifactRole: "package_reference",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "text/plain",
      relativePath: "package/lean-toolchain",
      requiredForIngest: true,
      sha256: "38".repeat(32)
    },
    {
      artifactRole: "package_reference",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "application/json",
      relativePath: "package/package-ref.json",
      requiredForIngest: true,
      sha256: "4".repeat(64)
    },
    {
      artifactRole: "package_reference",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "text/plain",
      relativePath: "package/statements/problem.md",
      requiredForIngest: true,
      sha256: "39".repeat(32)
    },
    {
      artifactRole: "prompt_package",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "application/json",
      relativePath: "prompt/prompt-package.json",
      requiredForIngest: true,
      sha256: "5".repeat(64)
    },
    {
      artifactRole: "prompt_package",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "text/plain",
      relativePath: "prompt/benchmark.md",
      requiredForIngest: true,
      sha256: "41".repeat(32)
    },
    {
      artifactRole: "prompt_package",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "text/plain",
      relativePath: "prompt/item.md",
      requiredForIngest: true,
      sha256: "42".repeat(32)
    },
    {
      artifactRole: "prompt_package",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "application/json",
      relativePath: "prompt/run-envelope.json",
      requiredForIngest: true,
      sha256: "43".repeat(32)
    },
    {
      artifactRole: "prompt_package",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "text/plain",
      relativePath: "prompt/system.md",
      requiredForIngest: true,
      sha256: "44".repeat(32)
    },
    {
      artifactRole: "candidate_source",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "text/plain",
      relativePath: "candidate/Candidate.lean",
      requiredForIngest: true,
      sha256: "6".repeat(64)
    },
    {
      artifactRole: "compiler_diagnostics",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "application/json",
      relativePath: "verification/compiler-diagnostics.json",
      requiredForIngest: true,
      sha256: "7".repeat(64)
    },
    {
      artifactRole: "compiler_output",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "text/plain",
      relativePath: "verification/compiler-output.txt",
      requiredForIngest: true,
      sha256: "8".repeat(64)
    },
    {
      artifactRole: "verdict_record",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "application/json",
      relativePath: "verification/verdict.json",
      requiredForIngest: true,
      sha256: "9".repeat(64)
    },
    {
      artifactRole: "verifier_output",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "application/json",
      relativePath: "verification/verifier-output.json",
      requiredForIngest: true,
      sha256: "a".repeat(64)
    },
    {
      artifactRole: "environment_snapshot",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "application/json",
      relativePath: "environment/environment.json",
      requiredForIngest: true,
      sha256: "b".repeat(64)
    },
    {
      artifactRole: "usage_summary",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "application/json",
      relativePath: "diagnostics/usage-summary.json",
      requiredForIngest: false,
      sha256: "c".repeat(64)
    },
    {
      artifactRole: "execution_trace",
      byteSize: 64,
      contentEncoding: "gzip",
      mediaType: "application/x-ndjson",
      relativePath: "traces/execution-trace.ndjson.gz",
      requiredForIngest: false,
      sha256: "d".repeat(64)
    }
  ];

  if (options.includeFailureClassification) {
    entries.splice(entries.findIndex((entry) => entry.relativePath === "verification/verdict.json"), 0, {
      artifactRole: "failure_classification",
      byteSize: 64,
      contentEncoding: null,
      mediaType: "application/json",
      relativePath: "verification/failure-classification.json",
      requiredForIngest: true,
      sha256: "45".repeat(32)
    });
  }

  return entries;
}

async function writeBundleOutputs(outputRoot: string, artifactEntries: WorkerArtifactManifestEntry[]) {
  return writeBundleOutputsWithVerdict(outputRoot, artifactEntries);
}

async function writeBundleOutputsWithVerdict(
  outputRoot: string,
  artifactEntries: WorkerArtifactManifestEntry[],
  verdictOverrides: Record<string, unknown> = {},
  environmentOverrides: Record<string, unknown> = {}
) : Promise<WrittenBundleDigests> {
  await mkdir(path.join(outputRoot, "package"), { recursive: true });
  await mkdir(path.join(outputRoot, "package", "FirstProof", "Problem9"), { recursive: true });
  await mkdir(path.join(outputRoot, "package", "statements"), { recursive: true });
  await mkdir(path.join(outputRoot, "prompt"), { recursive: true });
  await mkdir(path.join(outputRoot, "candidate"), { recursive: true });
  await mkdir(path.join(outputRoot, "diagnostics"), { recursive: true });
  await mkdir(path.join(outputRoot, "environment"), { recursive: true });
  await mkdir(path.join(outputRoot, "traces"), { recursive: true });
  await mkdir(path.join(outputRoot, "verification"), { recursive: true });
  const candidateSource = "theorem Candidate : True := by\n  trivial\n";
  const benchmarkSources = {
    "FirstProof/Problem9/Gold.lean": "theorem problem9_gold : True := by\n  trivial\n",
    "FirstProof/Problem9/Statement.lean": "theorem problem9_statement : True := by\n  trivial\n",
    "FirstProof/Problem9/Support.lean": "theorem problem9_support : True := by\n  trivial\n",
    "LICENSE": "Apache License\nVersion 2.0, January 2004\n",
    "README.md": "# Problem9\n\nCanonical benchmark package fixture.\n",
    "lake-manifest.json": `${stableStringify({ packagesDir: ".lake/packages" })}\n`,
    "lakefile.toml": 'name = "FirstProof"\n',
    "lean-toolchain": "leanprover/lean4:v4.22.0\n",
    "statements/problem.md": "# Problem 9\n\nShow `True`.\n"
  } as const;
  const promptLayers = {
    "benchmark.md": "Benchmark instructions.\n",
    "item.md": "Item-specific guidance.\n",
    "run-envelope.json": `${stableStringify({
      attemptId: "attempt-1",
      authMode: "machine_api_key",
      benchmarkItemId: "Problem9",
      benchmarkPackageDigest: benchmarkDigest,
      benchmarkPackageId: "firstproof/Problem9",
      benchmarkPackageVersion: "2026.03.13",
      harnessRevision: "worker-harness.v1",
      jobId: "job-1",
      laneId: "lean422_exact",
      modelConfigId: "openai/gpt-5",
      promptProtocolVersion: "problem9-prompt-protocol.v1",
      providerFamily: "openai",
      runEnvelopeSchemaVersion: "1",
      runId: "run-1",
      runMode: "bounded_agentic_attempt",
      toolProfile: "workspace_edit_limited"
    })}\n`,
    "system.md": "System prompt guidance.\n"
  } as const;
  const benchmarkPackage = {
    benchmarkFamily: "firstproof",
    benchmarkItemId: "Problem9",
    canonicalModules: {
      gold: "FirstProof/Problem9/Gold.lean",
      statement: "FirstProof/Problem9/Statement.lean",
      support: "FirstProof/Problem9/Support.lean"
    },
    hashAlgorithm: "sha256",
    hashes: Object.fromEntries(
      Object.entries(benchmarkSources).map(([relativePath, contents]) => [
        relativePath,
        sha256Text(contents)
      ])
    ),
    lanePolicy: {
      primaryLane: "lean422_exact",
      supportedLanes: ["lean422_exact"]
    },
    manifestSchemaVersion: "1",
    packageDigest: benchmarkDigest,
    packageDigestMode: "metadata_plus_file_inventory_v1",
    packageId: "firstproof/Problem9",
    packageRoot: "firstproof/Problem9",
    packageVersion: "2026.03.13",
    sourceManifestDigest: "5".repeat(64)
  };
  const packageRef = {
    benchmarkItemId: "Problem9",
    benchmarkPackageDigest: benchmarkDigest,
    benchmarkPackageId: "firstproof/Problem9",
    benchmarkPackageVersion: "2026.03.13",
    canonicalModules: benchmarkPackage.canonicalModules,
    laneId: "lean422_exact",
    packageRefSchemaVersion: "1",
    packageRoot: "firstproof/Problem9"
  };
  const promptPackage = {
    authMode: "machine_api_key",
    benchmarkItemId: "Problem9",
    benchmarkPackageDigest: benchmarkDigest,
    benchmarkPackageId: "firstproof/Problem9",
    benchmarkPackageVersion: "2026.03.13",
    harnessRevision: "worker-harness.v1",
    laneId: "lean422_exact",
    layerDigests: Object.fromEntries(
      Object.entries(promptLayers).map(([relativePath, contents]) => [
        relativePath,
        sha256Text(contents)
      ])
    ),
    layerVersions: {
      benchmark: "1",
      item: "1",
      runEnvelope: "1",
      system: "1"
    },
    layers: {
      benchmark: "benchmark.md",
      item: "item.md",
      runEnvelope: "run-envelope.json",
      system: "system.md"
    },
    modelConfigId: "openai/gpt-5",
    promptPackageDigest: promptDigest,
    promptPackageDigestMode: "metadata_plus_layer_inventory_v1",
    promptPackageSchemaVersion: "1",
    promptProtocolVersion: "problem9-prompt-protocol.v1",
    providerFamily: "openai",
    runMode: "bounded_agentic_attempt",
    toolProfile: "workspace_edit_limited"
  };
  const compilerDiagnostics = {
    severity: "info"
  };
  const compilerOutput = "Build completed successfully.\n";
  const verifierOutput = {
    exitCode: 0
  };
  const usageSummary = {
    completionTokens: 22,
    promptTokens: 20,
    totalTokens: 42
  };
  const executionTrace = gzipSync(
    Buffer.from('{"event":"attempt_started","ts":"2026-03-13T00:00:00.000Z"}\n', "utf8")
  );
  const failureClassification = {
    evidenceArtifactRefs: ["verification/failure-classification.json"],
    failureCode: "proof_policy_failed",
    failureFamily: "verification",
    phase: "verify",
    retryEligibility: "never",
    summary: "Canonical verifier failure payload.",
    terminality: "terminal_attempt",
    userVisibility: "internal_only"
  };
  const environment = {
    authMode: "machine_api_key",
    environmentSchemaVersion: "1",
    executionImageDigest: "9".repeat(64),
    executionTargetKind: "paretoproof-worker",
    harnessRevision: "worker-harness.v1",
    lakeSnapshotId: "leanprover/lean4:v4.22.0",
    laneId: "lean422_exact",
    leanVersion: "4.22.0",
    localDevboxDigest: null,
    metadata: {},
    modelConfigId: "openai/gpt-5",
    modelSnapshotId: "openai/gpt-5.2026-03-13",
    os: {
      arch: process.arch,
      platform: process.platform,
      release: "test-kernel"
    },
    promptProtocolVersion: "problem9-prompt-protocol.v1",
    providerFamily: "openai",
    runMode: "bounded_agentic_attempt",
    runtime: {
      bunVersion: null,
      nodeVersion: process.version,
      tsxVersion: null
    },
    toolProfile: "workspace_edit_limited",
    verifierVersion: "lean4.22.0",
    ...environmentOverrides
  };
  const baseVerdict = {
    attemptId: "attempt-1",
    axiomCheck: "passed",
    benchmarkPackageDigest: benchmarkDigest,
    candidateDigest: sha256Text(candidateSource),
    containsAdmit: false,
    containsSorry: false,
    diagnosticGate: "passed",
    laneId: "lean422_exact",
    primaryFailure: null,
    result: "pass",
    runId: "run-1",
    semanticEquality: "matched",
    surfaceEquality: "matched",
    surface_drift: false,
    verdictSchemaVersion: "problem9-verdict.v1"
  };
  const verdict = {
    ...baseVerdict,
    ...verdictOverrides
  };
  const writtenBenchmarkPackage = `${stableStringify(benchmarkPackage)}\n`;
  const writtenPackageRef = `${stableStringify(packageRef)}\n`;
  const writtenPromptPackage = `${stableStringify(promptPackage)}\n`;
  const writtenEnvironment = `${stableStringify(environment)}\n`;
  const writtenUsageSummary = `${stableStringify(usageSummary)}\n`;
  const writtenVerdict = `${stableStringify(verdict)}\n`;
  const writtenCompilerDiagnostics = `${stableStringify(compilerDiagnostics)}\n`;
  const writtenVerifierOutput = `${stableStringify(verifierOutput)}\n`;
  await writeFile(path.join(outputRoot, "candidate", "Candidate.lean"), candidateSource, "utf8");
  await writeFile(
    path.join(outputRoot, "package", "benchmark-package.json"),
    writtenBenchmarkPackage,
    "utf8"
  );
  for (const [relativePath, contents] of Object.entries(benchmarkSources)) {
    await writeFile(path.join(outputRoot, "package", relativePath), contents, "utf8");
  }
  await writeFile(path.join(outputRoot, "package", "package-ref.json"), writtenPackageRef, "utf8");
  await writeFile(
    path.join(outputRoot, "prompt", "prompt-package.json"),
    writtenPromptPackage,
    "utf8"
  );
  for (const [relativePath, contents] of Object.entries(promptLayers)) {
    await writeFile(path.join(outputRoot, "prompt", relativePath), contents, "utf8");
  }
  await writeFile(
    path.join(outputRoot, "environment", "environment.json"),
    writtenEnvironment,
    "utf8"
  );
  await writeFile(
    path.join(outputRoot, "diagnostics", "usage-summary.json"),
    writtenUsageSummary,
    "utf8"
  );
  await writeFile(
    path.join(outputRoot, "verification", "compiler-diagnostics.json"),
    writtenCompilerDiagnostics,
    "utf8"
  );
  await writeFile(
    path.join(outputRoot, "verification", "compiler-output.txt"),
    compilerOutput,
    "utf8"
  );
  await writeFile(
    path.join(outputRoot, "verification", "verifier-output.json"),
    writtenVerifierOutput,
    "utf8"
  );
  if (
    artifactEntries.some(
      (artifact) => artifact.relativePath === "verification/failure-classification.json"
    )
  ) {
    await writeFile(
      path.join(outputRoot, "verification", "failure-classification.json"),
      `${stableStringify(failureClassification)}\n`,
      "utf8"
    );
  }
  await writeFile(
    path.join(outputRoot, "verification", "verdict.json"),
    writtenVerdict,
    "utf8"
  );
  await writeFile(
    path.join(outputRoot, "traces", "execution-trace.ndjson.gz"),
    executionTrace
  );
  const writtenCandidate = normalizeText(candidateSource);
  const canonicalCandidateDigest = sha256Text(writtenCandidate);
  const canonicalEnvironmentDigest = sha256Text(stableStringify(environment));
  const canonicalVerdictDigest = sha256Text(stableStringify(verdict));
  const verdictResult = String(verdict.result ?? "pass");
  const manifestEntries = await Promise.all(
    artifactEntries.map((artifact) => materializeArtifactManifestEntry(outputRoot, artifact))
  );
  const manifest = {
    artifactManifestSchemaVersion: "1",
    artifacts: manifestEntries,
    hashAlgorithm: "sha256"
  };
  const writtenArtifactManifest = `${stableStringify(manifest)}\n`;
  const canonicalArtifactManifestDigest = sha256Text(writtenArtifactManifest);
  const runBundle = {
    artifactManifestDigest: canonicalArtifactManifestDigest,
    attemptId: "attempt-1",
    authMode: "machine_api_key",
    benchmarkItemId: "Problem9",
    benchmarkPackageDigest: benchmarkDigest,
    benchmarkPackageId: "firstproof/Problem9",
    benchmarkPackageVersion: "2026.03.13",
    bundleSchemaVersion: "1",
    candidateDigest: canonicalCandidateDigest,
    environmentDigest: canonicalEnvironmentDigest,
    harnessRevision: "worker-harness.v1",
    jobId: "job-1",
    laneId: "lean422_exact",
    modelConfigId: "openai/gpt-5",
    modelSnapshotId: "openai/gpt-5.2026-03-13",
    promptPackageDigest: promptDigest,
    promptProtocolVersion: "problem9-prompt-protocol.v1",
    providerFamily: "openai",
    runConfigDigest: computeRunConfigDigest({
      benchmarkPackage,
      environmentDigest: canonicalEnvironmentDigest,
      promptPackage
    }),
    runId: "run-1",
    runMode: "bounded_agentic_attempt",
    status: verdictResult === "pass" ? "success" : "failure",
    stopReason: verdictResult === "pass" ? "verification_passed" : "verifier_failed",
    toolProfile: "workspace_edit_limited",
    verifierVersion: "lean4.22.0",
    verdictDigest: canonicalVerdictDigest
  };
  const canonicalBundleDigest = sha256Text(
    stableStringify({
      artifactInventory: [...manifestEntries].sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath)
      ),
      runBundle: omitDigestFields(runBundle)
    })
  );
  await writeFile(
    path.join(outputRoot, "artifact-manifest.json"),
    writtenArtifactManifest,
    "utf8"
  );
  await writeFile(
    path.join(outputRoot, "run-bundle.json"),
    `${stableStringify({
      ...runBundle,
      bundleDigest: canonicalBundleDigest
    })}\n`,
    "utf8"
  );

  return {
    artifactManifestDigest: canonicalArtifactManifestDigest,
    bundleDigest: canonicalBundleDigest,
    candidateDigest: canonicalCandidateDigest,
    environmentDigest: canonicalEnvironmentDigest,
    verdictDigest: canonicalVerdictDigest
  };
}

test("runWorkerClaimLoop rejects bundle digest drift before artifact registration", async () => {
  const mismatchCases = [
    {
      expectedSummary: /artifactManifestDigest does not match artifact-manifest\.json/i,
      name: "artifactManifestDigest",
      tamper: async (outputRoot: string) => {
        await rewriteRunBundle(outputRoot, (runBundle) => ({
          ...runBundle,
          artifactManifestDigest: "0".repeat(64)
        }));
      }
    },
    {
      expectedSummary: /candidateDigest does not match candidate\/Candidate\.lean/i,
      name: "candidateDigest",
      tamper: async (outputRoot: string) => {
        await rewriteRunBundle(outputRoot, (runBundle) => ({
          ...runBundle,
          candidateDigest: "0".repeat(64)
        }));
      }
    },
    {
      expectedSummary: /environmentDigest does not match environment\/environment\.json/i,
      name: "environmentDigest",
      tamper: async (outputRoot: string) => {
        await rewriteRunBundle(outputRoot, (runBundle) => ({
          ...runBundle,
          environmentDigest: "0".repeat(64)
        }));
      }
    },
    {
      expectedSummary: /verdictDigest does not match verification\/verdict\.json/i,
      name: "verdictDigest",
      tamper: async (outputRoot: string) => {
        await rewriteRunBundle(outputRoot, (runBundle) => ({
          ...runBundle,
          verdictDigest: "0".repeat(64)
        }));
      }
    },
    {
      expectedSummary: /bundleDigest does not match the canonical bundle digest/i,
      name: "bundleDigest",
      tamper: async (outputRoot: string) => {
        await rewriteRunBundle(outputRoot, (runBundle) => ({
          ...runBundle,
          bundleDigest: "0".repeat(64)
        }));
      }
    },
    {
      expectedSummary: /verification\/verdict\.json candidateDigest does not match candidate\/Candidate\.lean/i,
      name: "verdict candidateDigest drift",
      tamper: async (outputRoot: string) => {
        const verdict = await readJsonFile(path.join(outputRoot, "verification", "verdict.json"));
        const artifactManifest = await readJsonFile(path.join(outputRoot, "artifact-manifest.json"));
        const tamperedVerdict = {
          ...verdict,
          candidateDigest: "0".repeat(64)
        };
        const verdictText = stableStringify(tamperedVerdict);

        await writeFile(path.join(outputRoot, "verification", "verdict.json"), verdictText, "utf8");
        await upsertArtifactManifestEntry(outputRoot, {
          artifactRole: "verdict_record",
          contentEncoding: null,
          mediaType: "application/json",
          relativePath: "verification/verdict.json",
          requiredForIngest: true
        });
        await refreshBundleDigests(outputRoot, (runBundle) => {
          const nextRunBundle = {
            ...runBundle,
            verdictDigest: sha256Text(verdictText)
          };

          return {
            ...nextRunBundle,
            bundleDigest: sha256Text(
              stableStringify({
                artifactInventory: [
                  ...((artifactManifest.artifacts as Array<Record<string, unknown>>) ?? [])
                ].sort((left, right) =>
                  String(left.relativePath).localeCompare(String(right.relativePath))
                ),
                runBundle: omitDigestFields(nextRunBundle)
              })
            )
          };
        });
      }
    },
    {
      expectedSummary: /benchmarkPackageDigest does not match the claimed job target/i,
      name: "benchmarkPackageDigest identity drift",
      tamper: async (outputRoot: string) => {
        const benchmarkPackage = await readJsonFile(path.join(outputRoot, "package", "benchmark-package.json"));
        const packageRef = await readJsonFile(path.join(outputRoot, "package", "package-ref.json"));
        const promptPackage = await readJsonFile(path.join(outputRoot, "prompt", "prompt-package.json"));
        const runEnvelope = await readJsonFile(path.join(outputRoot, "prompt", "run-envelope.json"));
        const environment = await readJsonFile(path.join(outputRoot, "environment", "environment.json"));
        const verdict = await readJsonFile(path.join(outputRoot, "verification", "verdict.json"));
        const tamperedBenchmarkPackage = {
          ...benchmarkPackage,
          packageDigest: "9".repeat(64)
        };
        const tamperedPackageRef = {
          ...packageRef,
          benchmarkPackageDigest: "9".repeat(64)
        };
        const tamperedPromptPackage = {
          ...promptPackage,
          benchmarkPackageDigest: "9".repeat(64)
        };
        const tamperedRunEnvelope = {
          ...runEnvelope,
          benchmarkPackageDigest: "9".repeat(64)
        };
        const tamperedVerdict = {
          ...verdict,
          benchmarkPackageDigest: "9".repeat(64)
        };
        const runEnvelopeText = `${stableStringify(tamperedRunEnvelope)}\n`;
        const tamperedPromptPackageWithRunEnvelope = {
          ...tamperedPromptPackage,
          layerDigests: {
            ...(tamperedPromptPackage.layerDigests as Record<string, unknown>),
            "run-envelope.json": sha256Text(runEnvelopeText)
          }
        };
        const verdictText = stableStringify(tamperedVerdict);

        await writeFile(
          path.join(outputRoot, "package", "benchmark-package.json"),
          `${stableStringify(tamperedBenchmarkPackage)}\n`,
          "utf8"
        );
        await writeFile(
          path.join(outputRoot, "prompt", "prompt-package.json"),
          `${stableStringify(tamperedPromptPackageWithRunEnvelope)}\n`,
          "utf8"
        );
        await writeFile(path.join(outputRoot, "prompt", "run-envelope.json"), runEnvelopeText, "utf8");
        await writeFile(
          path.join(outputRoot, "package", "package-ref.json"),
          `${stableStringify(tamperedPackageRef)}\n`,
          "utf8"
        );
        await upsertArtifactManifestEntry(outputRoot, {
          artifactRole: "package_reference",
          contentEncoding: null,
          mediaType: "application/json",
          relativePath: "package/benchmark-package.json",
          requiredForIngest: true
        });
        await upsertArtifactManifestEntry(outputRoot, {
          artifactRole: "package_reference",
          contentEncoding: null,
          mediaType: "application/json",
          relativePath: "package/package-ref.json",
          requiredForIngest: true
        });
        await upsertArtifactManifestEntry(outputRoot, {
          artifactRole: "prompt_package",
          contentEncoding: null,
          mediaType: "application/json",
          relativePath: "prompt/prompt-package.json",
          requiredForIngest: true
        });
        await upsertArtifactManifestEntry(outputRoot, {
          artifactRole: "prompt_package",
          contentEncoding: null,
          mediaType: "application/json",
          relativePath: "prompt/run-envelope.json",
          requiredForIngest: true
        });
        await writeFile(path.join(outputRoot, "verification", "verdict.json"), verdictText, "utf8");
        await upsertArtifactManifestEntry(outputRoot, {
          artifactRole: "verdict_record",
          contentEncoding: null,
          mediaType: "application/json",
          relativePath: "verification/verdict.json",
          requiredForIngest: true
        });
        await refreshBundleDigests(outputRoot, (runBundle) => ({
          ...runBundle,
          benchmarkPackageDigest: "9".repeat(64),
          runConfigDigest: computeRunConfigDigest({
            benchmarkPackage: {
              benchmarkItemId: String(tamperedBenchmarkPackage.benchmarkItemId),
              packageDigest: String(tamperedBenchmarkPackage.packageDigest),
              packageId: String(tamperedBenchmarkPackage.packageId),
              packageVersion: String(tamperedBenchmarkPackage.packageVersion)
            },
            environmentDigest: sha256Text(stableStringify(environment)),
            promptPackage: {
              authMode: String(tamperedPromptPackageWithRunEnvelope.authMode),
              harnessRevision: String(tamperedPromptPackageWithRunEnvelope.harnessRevision),
              laneId: String(tamperedPromptPackageWithRunEnvelope.laneId),
              modelConfigId: String(tamperedPromptPackageWithRunEnvelope.modelConfigId),
              promptPackageDigest: String(tamperedPromptPackageWithRunEnvelope.promptPackageDigest),
              promptProtocolVersion: String(tamperedPromptPackageWithRunEnvelope.promptProtocolVersion),
              providerFamily: String(tamperedPromptPackageWithRunEnvelope.providerFamily),
              runMode: String(tamperedPromptPackageWithRunEnvelope.runMode),
              toolProfile: String(tamperedPromptPackageWithRunEnvelope.toolProfile)
            }
          }),
          verdictDigest: sha256Text(verdictText)
        }));
      }
    },
    {
      expectedSummary: /modelConfigId does not match the claimed job target/i,
      name: "coherent prompt and environment retamper",
      tamper: async (outputRoot: string) => {
        const promptPackage = await readJsonFile(path.join(outputRoot, "prompt", "prompt-package.json"));
        const runEnvelope = await readJsonFile(path.join(outputRoot, "prompt", "run-envelope.json"));
        const environment = await readJsonFile(path.join(outputRoot, "environment", "environment.json"));
        const tamperedPromptPackage = { ...promptPackage, modelConfigId: "openai/gpt-5-pro" };
        const tamperedRunEnvelope = { ...runEnvelope, modelConfigId: "openai/gpt-5-pro" };
        const tamperedEnvironment = { ...environment, modelConfigId: "openai/gpt-5-pro" };
        const runEnvelopeText = `${stableStringify(tamperedRunEnvelope)}\n`;
        const tamperedPromptPackageWithRunEnvelope = {
          ...tamperedPromptPackage,
          layerDigests: {
            ...(tamperedPromptPackage.layerDigests as Record<string, unknown>),
            "run-envelope.json": sha256Text(runEnvelopeText)
          }
        };

        await writeFile(
          path.join(outputRoot, "prompt", "prompt-package.json"),
          `${stableStringify(tamperedPromptPackageWithRunEnvelope)}\n`,
          "utf8"
        );
        await writeFile(path.join(outputRoot, "prompt", "run-envelope.json"), runEnvelopeText, "utf8");
        await writeFile(
          path.join(outputRoot, "environment", "environment.json"),
          `${stableStringify(tamperedEnvironment)}\n`,
          "utf8"
        );
        await upsertArtifactManifestEntry(outputRoot, {
          artifactRole: "prompt_package",
          contentEncoding: null,
          mediaType: "application/json",
          relativePath: "prompt/prompt-package.json",
          requiredForIngest: true
        });
        await upsertArtifactManifestEntry(outputRoot, {
          artifactRole: "prompt_package",
          contentEncoding: null,
          mediaType: "application/json",
          relativePath: "prompt/run-envelope.json",
          requiredForIngest: true
        });
        await upsertArtifactManifestEntry(outputRoot, {
          artifactRole: "environment_snapshot",
          contentEncoding: null,
          mediaType: "application/json",
          relativePath: "environment/environment.json",
          requiredForIngest: true
        });
        await refreshBundleDigests(outputRoot, (runBundle) => ({
          ...runBundle,
          environmentDigest: sha256Text(stableStringify(tamperedEnvironment)),
          modelConfigId: "openai/gpt-5-pro",
          runConfigDigest: computeRunConfigDigest({
            benchmarkPackage: {
              benchmarkItemId: "Problem9",
              packageDigest: benchmarkDigest,
              packageId: "firstproof/Problem9",
              packageVersion: "2026.03.13"
            },
            environmentDigest: sha256Text(stableStringify(tamperedEnvironment)),
            promptPackage: {
              authMode: String(tamperedPromptPackageWithRunEnvelope.authMode),
              harnessRevision: String(tamperedPromptPackageWithRunEnvelope.harnessRevision),
              laneId: String(tamperedPromptPackageWithRunEnvelope.laneId),
              modelConfigId: String(tamperedPromptPackageWithRunEnvelope.modelConfigId),
              promptPackageDigest: String(tamperedPromptPackageWithRunEnvelope.promptPackageDigest),
              promptProtocolVersion: String(tamperedPromptPackageWithRunEnvelope.promptProtocolVersion),
              providerFamily: String(tamperedPromptPackageWithRunEnvelope.providerFamily),
              runMode: String(tamperedPromptPackageWithRunEnvelope.runMode),
              toolProfile: String(tamperedPromptPackageWithRunEnvelope.toolProfile)
            }
          })
        }));
      }
    },
    {
      expectedSummary:
        /environment\/environment\.json executionTargetKind does not match the hosted worker runtime provenance\./i,
      name: "hosted provenance drift",
      tamper: async (outputRoot: string) => {
        const benchmarkPackage = await readJsonFile(path.join(outputRoot, "package", "benchmark-package.json"));
        const promptPackage = await readJsonFile(path.join(outputRoot, "prompt", "prompt-package.json"));
        const environment = await readJsonFile(path.join(outputRoot, "environment", "environment.json"));
        const tamperedEnvironment = {
          ...environment,
          executionTargetKind: "problem9-execution"
        };
        const environmentDigest = sha256Text(stableStringify(tamperedEnvironment));

        await writeFile(
          path.join(outputRoot, "environment", "environment.json"),
          `${stableStringify(tamperedEnvironment)}\n`,
          "utf8"
        );
        await upsertArtifactManifestEntry(outputRoot, {
          artifactRole: "environment_snapshot",
          contentEncoding: null,
          mediaType: "application/json",
          relativePath: "environment/environment.json",
          requiredForIngest: true
        });
        await refreshBundleDigests(outputRoot, (runBundle) => ({
          ...runBundle,
          environmentDigest,
          runConfigDigest: computeRunConfigDigest({
            benchmarkPackage: {
              benchmarkItemId: String(benchmarkPackage.benchmarkItemId),
              packageDigest: String(benchmarkPackage.packageDigest),
              packageId: String(benchmarkPackage.packageId),
              packageVersion: String(benchmarkPackage.packageVersion)
            },
            environmentDigest,
            promptPackage: {
              authMode: String(promptPackage.authMode),
              harnessRevision: String(promptPackage.harnessRevision),
              laneId: String(promptPackage.laneId),
              modelConfigId: String(promptPackage.modelConfigId),
              promptPackageDigest: String(promptPackage.promptPackageDigest),
              promptProtocolVersion: String(promptPackage.promptProtocolVersion),
              providerFamily: String(promptPackage.providerFamily),
              runMode: String(promptPackage.runMode),
              toolProfile: String(promptPackage.toolProfile)
            }
          })
        }));
      }
    },
    {
      expectedSummary: /bundleSchemaVersion does not match the claimed job target/i,
      name: "bundleSchemaVersion drift",
      tamper: async (outputRoot: string) => {
        await refreshBundleDigests(outputRoot, (runBundle) => ({
          ...runBundle,
          bundleSchemaVersion: "2"
        }));
      }
    },
    {
      expectedSummary: /environment\/environment\.json must use artifactRole environment_snapshot/i,
      name: "artifact role path drift",
      tamper: async (outputRoot: string) => {
        await rewriteArtifactManifest(outputRoot, (artifactManifest) => ({
          ...artifactManifest,
          artifacts: (((artifactManifest.artifacts as Array<Record<string, unknown>>) ?? []))
            .map((artifact) =>
              String(artifact.relativePath) === "environment/environment.json"
                ? {
                    ...artifact,
                    artifactRole: "prompt_package"
                  }
                : artifact
            )
        }));
        await refreshBundleDigests(outputRoot);
      }
    },
    {
      expectedSummary:
        /artifact-manifest\.json is missing required bundle file: package\/README\.md\./i,
      name: "missing benchmark provenance manifest entry",
      tamper: async (outputRoot: string) => {
        await rewriteArtifactManifest(outputRoot, (artifactManifest) => ({
          ...artifactManifest,
          artifacts: (((artifactManifest.artifacts as Array<Record<string, unknown>>) ?? [])).filter(
            (artifact) => String(artifact.relativePath) !== "package/README.md"
          )
        }));
        await refreshBundleDigests(outputRoot);
      }
    },
    {
      expectedSummary:
        /package\/README\.md mediaType does not match the canonical bundle contract\./i,
      name: "benchmark provenance metadata drift",
      tamper: async (outputRoot: string) => {
        await rewriteArtifactManifest(outputRoot, (artifactManifest) => ({
          ...artifactManifest,
          artifacts: (((artifactManifest.artifacts as Array<Record<string, unknown>>) ?? [])).map(
            (artifact) =>
              String(artifact.relativePath) === "package/README.md"
                ? {
                    ...artifact,
                    mediaType: null
                  }
                : artifact
          )
        }));
        await refreshBundleDigests(outputRoot);
      }
    },
    {
      expectedSummary: /Passing verifier verdicts require diagnosticGate=passed/i,
      name: "passing verdict semantic drift",
      tamper: async (outputRoot: string) => {
        const verdict = await readJsonFile(path.join(outputRoot, "verification", "verdict.json"));
        const tamperedVerdict = {
          ...verdict,
          diagnosticGate: "failed"
        };
        const verdictText = stableStringify(tamperedVerdict);

        await writeFile(path.join(outputRoot, "verification", "verdict.json"), verdictText, "utf8");
        await upsertArtifactManifestEntry(outputRoot, {
          artifactRole: "verdict_record",
          contentEncoding: null,
          mediaType: "application/json",
          relativePath: "verification/verdict.json",
          requiredForIngest: true
        });
        await refreshBundleDigests(outputRoot, (runBundle) => ({
          ...runBundle,
          verdictDigest: sha256Text(verdictText)
        }));
      }
    },
    {
      expectedSummary: /Passing verifier verdicts may not include a primaryFailure classification/i,
      name: "passing verdict with primaryFailure",
      tamper: async (outputRoot: string) => {
        const verdict = await readJsonFile(path.join(outputRoot, "verification", "verdict.json"));
        const tamperedVerdict = {
          ...verdict,
          primaryFailure: {
            evidenceArtifactRefs: ["verification/verdict.json"],
            failureCode: "proof_policy_failed",
            failureFamily: "verification",
            phase: "verify",
            retryEligibility: "never",
            summary: "unexpected failure payload",
            terminality: "terminal_attempt",
            userVisibility: "internal_only"
          }
        };
        const verdictText = stableStringify(tamperedVerdict);

        await writeFile(path.join(outputRoot, "verification", "verdict.json"), verdictText, "utf8");
        await upsertArtifactManifestEntry(outputRoot, {
          artifactRole: "verdict_record",
          contentEncoding: null,
          mediaType: "application/json",
          relativePath: "verification/verdict.json",
          requiredForIngest: true
        });
        await refreshBundleDigests(outputRoot, (runBundle) => ({
          ...runBundle,
          verdictDigest: sha256Text(verdictText)
        }));
      }
    },
    {
      expectedSummary: /failureCode to match primaryFailure\.failureCode/i,
      name: "failing verdict failureCode drift",
      tamper: async (outputRoot: string) => {
        const verdict = await readJsonFile(path.join(outputRoot, "verification", "verdict.json"));
        const tamperedVerdict = {
          ...verdict,
          diagnosticGate: "failed",
          failureCode: "proof_policy_failed",
          primaryFailure: {
            evidenceArtifactRefs: ["verification/verdict.json"],
            failureCode: "forbidden_axiom_dependency",
            failureFamily: "verification",
            phase: "verify",
            retryEligibility: "never",
            summary: "axiom drift",
            terminality: "terminal_attempt",
            userVisibility: "internal_only"
          },
          result: "fail"
        };
        const verdictText = stableStringify(tamperedVerdict);

        await writeFile(path.join(outputRoot, "verification", "verdict.json"), verdictText, "utf8");
        await upsertArtifactManifestEntry(outputRoot, {
          artifactRole: "verdict_record",
          contentEncoding: null,
          mediaType: "application/json",
          relativePath: "verification/verdict.json",
          requiredForIngest: true
        });
        await refreshBundleDigests(outputRoot, (runBundle) => ({
          ...runBundle,
          status: "failure",
          stopReason: "verifier_failed",
          verdictDigest: sha256Text(verdictText)
        }));
      }
    },
    {
      expectedSummary: /status does not match verification\/verdict\.json result/i,
      name: "verdict result drift",
      tamper: async (outputRoot: string) => {
        const verdict = await readJsonFile(path.join(outputRoot, "verification", "verdict.json"));
        const tamperedVerdict = {
          ...verdict,
          result: "fail"
        };
        const verdictText = stableStringify(tamperedVerdict);

        await writeFile(path.join(outputRoot, "verification", "verdict.json"), verdictText, "utf8");
        await upsertArtifactManifestEntry(outputRoot, {
          artifactRole: "verdict_record",
          contentEncoding: null,
          mediaType: "application/json",
          relativePath: "verification/verdict.json",
          requiredForIngest: true
        });
        await refreshBundleDigests(outputRoot, (runBundle) => ({
          ...runBundle,
          verdictDigest: sha256Text(verdictText)
        }));
      }
    },
    {
      expectedSummary: /verification\/verdict\.json runId does not match run-bundle\.json/i,
      name: "verdict runId drift",
      tamper: async (outputRoot: string) => {
        const verdict = await readJsonFile(path.join(outputRoot, "verification", "verdict.json"));
        const tamperedVerdict = {
          ...verdict,
          runId: "run-2"
        };
        const verdictText = stableStringify(tamperedVerdict);

        await writeFile(path.join(outputRoot, "verification", "verdict.json"), verdictText, "utf8");
        await upsertArtifactManifestEntry(outputRoot, {
          artifactRole: "verdict_record",
          contentEncoding: null,
          mediaType: "application/json",
          relativePath: "verification/verdict.json",
          requiredForIngest: true
        });
        await refreshBundleDigests(outputRoot, (runBundle) => ({
          ...runBundle,
          verdictDigest: sha256Text(verdictText)
        }));
      }
    },
    {
      expectedSummary: /prompt\/prompt-package\.json sha256 does not match artifact-manifest\.json/i,
      name: "artifact manifest entry sha256 drift",
      tamper: async (outputRoot: string) => {
        const promptEntry = await buildArtifactManifestEntryForPath(outputRoot, {
          artifactRole: "prompt_package",
          contentEncoding: null,
          mediaType: "application/json",
          relativePath: "prompt/prompt-package.json",
          requiredForIngest: true
        });

        await rewriteArtifactManifest(outputRoot, (artifactManifest) => ({
          ...artifactManifest,
          artifacts: (((artifactManifest.artifacts as Array<Record<string, unknown>>) ?? []))
            .map((artifact) =>
              String(artifact.relativePath) === "prompt/prompt-package.json"
                ? {
                    ...promptEntry,
                    sha256: "0".repeat(64)
                  }
                : artifact
            )
        }));
        await refreshBundleDigests(outputRoot);
      }
    },
    {
      expectedSummary: /prompt\/prompt-package\.json byteSize does not match artifact-manifest\.json/i,
      name: "artifact manifest entry byteSize drift",
      tamper: async (outputRoot: string) => {
        const promptEntry = await buildArtifactManifestEntryForPath(outputRoot, {
          artifactRole: "prompt_package",
          contentEncoding: null,
          mediaType: "application/json",
          relativePath: "prompt/prompt-package.json",
          requiredForIngest: true
        });

        await rewriteArtifactManifest(outputRoot, (artifactManifest) => ({
          ...artifactManifest,
          artifacts: (((artifactManifest.artifacts as Array<Record<string, unknown>>) ?? []))
            .map((artifact) =>
              String(artifact.relativePath) === "prompt/prompt-package.json"
                ? {
                    ...promptEntry,
                    byteSize: promptEntry.byteSize + 1
                  }
                : artifact
            )
        }));
        await refreshBundleDigests(outputRoot);
      }
    },
    {
      expectedSummary:
        /package\/README\.md does not match package\/benchmark-package\.json hashes\./i,
      name: "benchmark source digest drift",
      tamper: async (outputRoot: string) => {
        await writeFile(path.join(outputRoot, "package", "README.md"), "# Tampered benchmark fixture\n", "utf8");
        await upsertArtifactManifestEntry(outputRoot, {
          artifactRole: "package_reference",
          contentEncoding: null,
          mediaType: "text/plain",
          relativePath: "package/README.md",
          requiredForIngest: true
        });
        await refreshBundleDigests(outputRoot);
      }
    },
    {
      expectedSummary:
        /prompt\/system\.md does not match prompt\/prompt-package\.json layerDigests\./i,
      name: "prompt layer digest drift",
      tamper: async (outputRoot: string) => {
        await writeFile(
          path.join(outputRoot, "prompt", "system.md"),
          "Tampered system prompt\n",
          "utf8"
        );
        await upsertArtifactManifestEntry(outputRoot, {
          artifactRole: "prompt_package",
          contentEncoding: null,
          mediaType: "text/plain",
          relativePath: "prompt/system.md",
          requiredForIngest: true
        });
        await refreshBundleDigests(outputRoot);
      }
    },
    {
      expectedSummary:
        /prompt\/run-envelope\.json runId does not match the canonical bundle contract\./i,
      name: "run-envelope semantic drift",
      tamper: async (outputRoot: string) => {
        const runEnvelopePath = path.join(outputRoot, "prompt", "run-envelope.json");
        const promptPackagePath = path.join(outputRoot, "prompt", "prompt-package.json");
        const runEnvelope = await readJsonFile(runEnvelopePath);
        const promptPackage = await readJsonFile(promptPackagePath);
        const tamperedRunEnvelope = {
          ...runEnvelope,
          runId: "run-tampered"
        };
        const tamperedRunEnvelopeText = `${stableStringify(tamperedRunEnvelope)}\n`;
        const tamperedPromptPackage = {
          ...promptPackage,
          layerDigests: {
            ...(promptPackage.layerDigests as Record<string, unknown>),
            "run-envelope.json": sha256Text(tamperedRunEnvelopeText)
          }
        };

        await writeFile(runEnvelopePath, tamperedRunEnvelopeText, "utf8");
        await writeFile(promptPackagePath, `${stableStringify(tamperedPromptPackage)}\n`, "utf8");
        await upsertArtifactManifestEntry(outputRoot, {
          artifactRole: "prompt_package",
          contentEncoding: null,
          mediaType: "application/json",
          relativePath: "prompt/run-envelope.json",
          requiredForIngest: true
        });
        await upsertArtifactManifestEntry(outputRoot, {
          artifactRole: "prompt_package",
          contentEncoding: null,
          mediaType: "application/json",
          relativePath: "prompt/prompt-package.json",
          requiredForIngest: true
        });
        await refreshBundleDigests(outputRoot);
      }
    }
  ] as const;

  for (const mismatchCase of mismatchCases) {
    {
      const tempRoot = await mkdtemp(
        path.join(os.tmpdir(), `paretoproof-worker-claim-bundle-mismatch-${sanitizePath(mismatchCase.name)}-`)
      );

      try {
        const calls: ApiCall[] = [];
        const workerJob = buildWorkerJob();
        const artifactEntries = buildArtifactEntries();
        const fetchImpl = createFetchMock(
          [
            {
              body: {
                leaseStatus: "active",
                pollAfterSeconds: 0,
                workerJob
              },
              path: "/internal/worker/claims"
            },
            {
              body: buildHeartbeatResponse({
                acknowledgedEventSequence: 0,
                jobToken: "job-token-2"
              }),
              path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
            },
            {
              body: {
                acceptedAt: fixedNow.toISOString(),
                acknowledgedSequence: 1
              },
              path: `/internal/worker/jobs/${workerJob.jobId}/events`
            },
            {
              body: buildHeartbeatResponse({
                acknowledgedEventSequence: 1
              }),
              path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
            },
            {
              body: {
                acceptedAt: fixedNow.toISOString(),
                attemptState: "failed",
                jobState: "failed",
                runState: "failed"
              },
              path: `/internal/worker/jobs/${workerJob.jobId}/failure`
            }
          ],
          calls
        );

        const result = await runWorkerClaimLoop(
          {
            authMode: "machine_api_key",
            maxJobs: 1,
            once: true,
            outputRoot: path.join(tempRoot, "output"),
            workerId: "worker-1",
            workerPool: "modal-dev",
            workerRuntime: "modal",
            workerVersion: "worker.v1",
            workspaceRoot: path.join(tempRoot, "workspace")
          },
          {
            attemptRunner: async (options) => {
              await writeBundleOutputs(options.outputRoot, artifactEntries);
              await mismatchCase.tamper(options.outputRoot);

              return {
                artifactManifestDigest,
                attemptId: workerJob.attemptId,
                authMode: "machine_api_key",
                bundleDigest,
                compileRepairCount: 0,
                outputRoot: options.outputRoot,
                promptPackageDigest: promptDigest,
                providerFamily: "openai",
                providerTurnsUsed: 1,
                result: "pass",
                runConfigDigest: "2".repeat(64),
                runId: workerJob.runId,
                stopReason: "verification_passed",
                verifierRepairCount: 0,
                verdictDigest
              };
            },
            fetchImpl,
            materializeBenchmarkPackage: async ({ outputRoot }) => ({
              outputRoot,
              packageDigest: benchmarkDigest,
              packageId: "firstproof/Problem9",
              packageVersion: "2026.03.13"
            }),
            materializePromptPackage: async ({ outputRoot }) => ({
              outputRoot,
              promptPackageDigest: promptDigest
            }),
            now: () => fixedNow,
            rawEnv: {
              API_BASE_URL: "https://api.paretoproof.test",
              CODEX_API_KEY: "worker-api-key",
              PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
              WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
            },
            sleep: neverSleep
          }
        );

        assert.deepEqual(result, {
          claimedJobs: 1,
          completedJobs: 1,
          idlePollCount: 0,
          stoppedReason: "max_jobs_reached"
        });
        assert.deepEqual(
          calls.map((call) => call.path),
          [
            "/internal/worker/claims",
            `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
            `/internal/worker/jobs/${workerJob.jobId}/events`,
            `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
            `/internal/worker/jobs/${workerJob.jobId}/failure`
          ]
        );
        const failureBody = calls.at(-1)?.body as WorkerTerminalFailureRequest;
        assert.equal(failureBody.failure.failureCode, "harness_crashed");
        assert.match(failureBody.failure.summary, mismatchCase.expectedSummary);
        assert.deepEqual(failureBody.failure.evidenceArtifactRefs, ["worker-control/pre-bundle-failure"]);
        assert.equal(failureBody.artifactIds, undefined);
        assert.equal(failureBody.artifactManifestDigest, null);
        assert.equal(failureBody.bundleDigest, null);
        assert.equal(failureBody.candidateDigest, null);
        assert.equal(failureBody.verdictDigest, null);
        assert.equal(failureBody.verifierVerdict, null);
        await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
        await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
      } finally {
        await rm(tempRoot, { force: true, recursive: true });
      }
    }
  }
});

test("runWorkerClaimLoop rejects a failing verdict that omits primaryFailure before artifact registration", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "paretoproof-worker-claim-fail-without-primary-failure-")
  );

  try {
    const calls: ApiCall[] = [];
    const workerJob = buildWorkerJob();
    const artifactEntries = buildArtifactEntries();
    const fetchImpl = createFetchMock(
      [
        {
          body: {
            leaseStatus: "active",
            pollAfterSeconds: 0,
            workerJob
          },
          path: "/internal/worker/claims"
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 0,
            jobToken: "job-token-2"
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            acknowledgedSequence: 1
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/events`
        },
        {
          body: buildHeartbeatResponse({
            acknowledgedEventSequence: 1
          }),
          path: `/internal/worker/jobs/${workerJob.jobId}/heartbeat`
        },
        {
          body: {
            acceptedAt: fixedNow.toISOString(),
            attemptState: "failed",
            jobState: "failed",
            runState: "failed"
          },
          path: `/internal/worker/jobs/${workerJob.jobId}/failure`
        }
      ],
      calls
    );

    const result = await runWorkerClaimLoop(
      {
        authMode: "machine_api_key",
        maxJobs: 1,
        once: true,
        outputRoot: path.join(tempRoot, "output"),
        workerId: "worker-1",
        workerPool: "modal-dev",
        workerRuntime: "modal",
        workerVersion: "worker.v1",
        workspaceRoot: path.join(tempRoot, "workspace")
      },
      {
        attemptRunner: async (options) => {
          await writeBundleOutputsWithVerdict(options.outputRoot, artifactEntries, {
            diagnosticGate: "failed",
            result: "fail"
          });

          return {
            artifactManifestDigest,
            attemptId: workerJob.attemptId,
            authMode: "machine_api_key",
            bundleDigest,
            compileRepairCount: 0,
            outputRoot: options.outputRoot,
            promptPackageDigest: promptDigest,
            providerFamily: "openai",
            providerTurnsUsed: 2,
            result: "fail",
            runConfigDigest: "2".repeat(64),
            runId: workerJob.runId,
            stopReason: "verifier_failed",
            verifierRepairCount: 0,
            verdictDigest
          };
        },
        fetchImpl,
        materializeBenchmarkPackage: async ({ outputRoot }) => ({
          outputRoot,
          packageDigest: benchmarkDigest,
          packageId: "firstproof/Problem9",
          packageVersion: "2026.03.13"
        }),
        materializePromptPackage: async ({ outputRoot }) => ({
          outputRoot,
          promptPackageDigest: promptDigest
        }),
        now: () => fixedNow,
        rawEnv: {
          API_BASE_URL: "https://api.paretoproof.test",
          CODEX_API_KEY: "worker-api-key",
          PARETOPROOF_WORKER_IMAGE_DIGEST: "9".repeat(64),
          WORKER_BOOTSTRAP_TOKEN: "bootstrap-token"
        },
        sleep: neverSleep
      }
    );

    assert.deepEqual(result, {
      claimedJobs: 1,
      completedJobs: 1,
      idlePollCount: 0,
      stoppedReason: "max_jobs_reached"
    });

    assert.deepEqual(
      calls.map((call) => call.path),
      [
        "/internal/worker/claims",
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/events`,
        `/internal/worker/jobs/${workerJob.jobId}/heartbeat`,
        `/internal/worker/jobs/${workerJob.jobId}/failure`
      ]
    );
    const failureBody = calls.at(-1)?.body as WorkerTerminalFailureRequest;
    assert.equal(calls.at(-1)?.path, `/internal/worker/jobs/${workerJob.jobId}/failure`);
    assert.equal(failureBody.failure.failureCode, "harness_crashed");
    assert.match(failureBody.failure.summary, /Failing verifier verdicts require a primaryFailure classification/i);
    assert.deepEqual(failureBody.failure.evidenceArtifactRefs, ["worker-control/pre-bundle-failure"]);
    assert.equal(failureBody.artifactIds, undefined);
    assert.equal(failureBody.artifactManifestDigest, null);
    assert.equal(failureBody.bundleDigest, null);
    assert.equal(failureBody.verifierVerdict, null);
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "workspace"));
    await assertDirectoryEmptyOrMissing(path.join(tempRoot, "output"));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

function createFetchMock(script: ApiMockResponse[], calls: ApiCall[]) {
  return async (input: URL | RequestInfo, init?: RequestInit) => {
    const next = script.shift();

    if (!next) {
      throw new Error(`Unexpected extra fetch to ${String(input)}.`);
    }

    const url = new URL(typeof input === "string" ? input : input.toString());
    const bodyText = typeof init?.body === "string" ? init.body : "";

    calls.push({
      body: bodyText.length > 0 ? JSON.parse(bodyText) : null,
      path: url.pathname,
      token:
        new Headers(init?.headers).get("authorization")?.replace(/^Bearer\s+/u, "") ?? ""
    });

    assert.equal(url.pathname, next.path);

    return new Response(JSON.stringify(next.body), {
      headers: {
        "content-type": "application/json"
      },
      status: next.status ?? 200
    });
  };
}

async function rewriteRunBundle(
  outputRoot: string,
  mutator: (runBundle: Record<string, unknown>) => Record<string, unknown>
) {
  const runBundlePath = path.join(outputRoot, "run-bundle.json");
  const currentRunBundle = await readJsonFile(runBundlePath);
  await writeFile(runBundlePath, `${stableStringify(mutator(currentRunBundle))}\n`, "utf8");
}

async function rewriteArtifactManifest(
  outputRoot: string,
  mutator: (artifactManifest: Record<string, unknown>) => Record<string, unknown>
) {
  const artifactManifestPath = path.join(outputRoot, "artifact-manifest.json");
  const currentArtifactManifest = await readJsonFile(artifactManifestPath);
  await writeFile(
    artifactManifestPath,
    `${stableStringify(mutator(currentArtifactManifest))}\n`,
    "utf8"
  );
}

async function refreshBundleDigests(
  outputRoot: string,
  mutator: (runBundle: Record<string, unknown>) => Record<string, unknown> = (runBundle) => runBundle
) {
  const artifactManifestPath = path.join(outputRoot, "artifact-manifest.json");
  const runBundlePath = path.join(outputRoot, "run-bundle.json");
  const artifactManifestText = normalizeText(await readFile(artifactManifestPath, "utf8"));
  const artifactManifest = JSON.parse(artifactManifestText) as {
    artifacts?: Array<Record<string, unknown>>;
  };
  const currentRunBundle = await readJsonFile(runBundlePath);
  const artifactManifestDigest = sha256Text(artifactManifestText);
  const nextRunBundle = mutator({
    ...currentRunBundle,
    artifactManifestDigest
  });
  const bundleDigest = sha256Text(
    stableStringify({
      artifactInventory: [...(artifactManifest.artifacts ?? [])].sort((left, right) =>
        String(left.relativePath).localeCompare(String(right.relativePath))
      ),
      runBundle: omitDigestFields(nextRunBundle)
    })
  );

  await writeFile(
    runBundlePath,
    `${stableStringify({
      ...nextRunBundle,
      artifactManifestDigest,
      bundleDigest
    })}\n`,
    "utf8"
  );
}

async function upsertArtifactManifestEntry(
  outputRoot: string,
  artifact: Pick<
    WorkerArtifactManifestEntry,
    "artifactRole" | "contentEncoding" | "mediaType" | "relativePath" | "requiredForIngest"
  >
) {
  const materializedArtifact = await buildArtifactManifestEntryForPath(outputRoot, artifact);

  await rewriteArtifactManifest(outputRoot, (artifactManifest) => {
    const currentArtifacts = ((artifactManifest.artifacts as Array<Record<string, unknown>>) ?? [])
      .filter((entry) => String(entry.relativePath) !== artifact.relativePath);

    return {
      ...artifactManifest,
      artifacts: [...currentArtifacts, materializedArtifact].sort((left, right) =>
        String(left.relativePath).localeCompare(String(right.relativePath))
      )
    };
  });
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(normalizeText(await readFile(filePath, "utf8"))) as Record<
    string,
    unknown
  >;
}

function sanitizePath(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
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

function computeRunConfigDigest(options: {
  benchmarkPackage: {
    benchmarkItemId: string;
    packageDigest: string;
    packageId: string;
    packageVersion: string;
  };
  environmentDigest: string;
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
}) {
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
      modelSnapshotId: "openai/gpt-5.2026-03-13",
      promptPackageDigest: options.promptPackage.promptPackageDigest,
      promptProtocolVersion: options.promptPackage.promptProtocolVersion,
      providerFamily: options.promptPackage.providerFamily,
      runMode: options.promptPackage.runMode,
      toolProfile: options.promptPackage.toolProfile,
      verifierVersion: "lean4.22.0"
    })
  );
}

function expectedArtifactIds(artifactEntries: WorkerArtifactManifestEntry[]) {
  return artifactEntries.map((_, index) => `artifact-${index + 1}`);
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

async function materializeArtifactManifestEntry(
  outputRoot: string,
  artifact: WorkerArtifactManifestEntry
): Promise<WorkerArtifactManifestEntry> {
  if (artifact.artifactRole === "run_manifest" || artifact.relativePath === "run-bundle.json") {
    return artifact;
  }

  return buildArtifactManifestEntryForPath(outputRoot, artifact);
}

async function buildArtifactManifestEntryForPath(
  outputRoot: string,
  artifact: Pick<
    WorkerArtifactManifestEntry,
    "artifactRole" | "contentEncoding" | "mediaType" | "relativePath" | "requiredForIngest"
  >
): Promise<WorkerArtifactManifestEntry> {
  const fileBytes = await readFile(path.join(outputRoot, artifact.relativePath));

  return {
    ...artifact,
    byteSize: fileBytes.byteLength,
    sha256: shouldHashNormalizedTextArtifact(artifact)
      ? sha256Text(fileBytes.toString("utf8"))
      : sha256Bytes(fileBytes)
  };
}

function shouldHashNormalizedTextArtifact(
  artifact: Pick<WorkerArtifactManifestEntry, "contentEncoding" | "mediaType">
) {
  if (artifact.contentEncoding !== null) {
    return false;
  }

  return artifact.mediaType === "application/json" || artifact.mediaType?.startsWith("text/") === true;
}

function neverSleep(): Promise<void> {
  return new Promise(() => {});
}

function jobEndpointPath(jobId: string, suffix: string): string {
  return new URL(
    `/internal/worker/jobs/${jobId}/${suffix}`,
    "https://api.paretoproof.test"
  ).pathname;
}

function buildLeaseScopedRoot(baseRoot: string, workerJob: ReturnType<typeof buildWorkerJob>): string {
  return path.join(
    baseRoot,
    [sanitizePathSegment(workerJob.leaseId), sanitizePathSegment(workerJob.jobId)].join("__")
  );
}

function sanitizePathSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]/g, "_");

  if (sanitized.length === 0 || /^\.+$/u.test(sanitized)) {
    return "_";
  }

  return sanitized;
}

async function assertDirectoryEmptyOrMissing(rootPath: string): Promise<void> {
  const entries = await readdir(rootPath).catch(() => null);
  assert.deepEqual(entries ?? [], []);
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    status: 200
  });
}
