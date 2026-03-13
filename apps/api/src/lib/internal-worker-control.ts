import { createHash, randomBytes } from "node:crypto";
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  or,
  type SQL
} from "drizzle-orm";
import type {
  WorkerArtifactManifestRequest,
  WorkerArtifactManifestResponse,
  WorkerBundleArtifactRole,
  WorkerClaimRequest,
  WorkerClaimResponse,
  WorkerExecutionEvent,
  WorkerExecutionEventResponse,
  WorkerHeartbeatRequest,
  WorkerHeartbeatResponse,
  WorkerJobTokenScope,
  WorkerResultMessageRequest,
  WorkerResultMessageResponse,
  WorkerTerminalFailureRequest,
  WorkerTerminalFailureResponse
} from "@paretoproof/shared";
import {
  artifacts,
  attempts,
  jobs,
  runs,
  workerAttemptEvents,
  workerJobLeases
} from "../db/schema.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";

const idlePollAfterSeconds = 30;
const heartbeatIntervalSeconds = 60;
const heartbeatTimeoutSeconds = 180;
const runBundleSchemaVersion = "1";
const requiredProblem9ArtifactRoles = [
  "run_manifest",
  "package_reference",
  "prompt_package",
  "candidate_source",
  "verdict_record",
  "compiler_output",
  "compiler_diagnostics",
  "verifier_output",
  "environment_snapshot"
] satisfies WorkerBundleArtifactRole[];
const issuedJobTokenScopes = [
  "heartbeat",
  "event_append",
  "artifact_manifest_write",
  "verifier_verdict_write",
  "result_finalize",
  "failure_finalize"
] satisfies WorkerJobTokenScope[];

type DbClient = ReturnTypeOfCreateDbClient;
type SelectExecutor = Pick<DbClient, "select">;
type ReadExecutor = Pick<DbClient, "select">;
type ReadWriteExecutor = Pick<DbClient, "select" | "update">;

type CandidateClaimRow = {
  attemptId: string;
  attemptRowId: string;
  benchmarkItemId: string;
  jobId: string;
  jobRowId: string;
  modelConfigId: string;
  runId: string;
  runKind: typeof runs.$inferSelect.runKind;
  runRowId: string;
  runState: typeof runs.$inferSelect.state;
};

type LeaseStateRow = {
  artifactManifestDigest: string;
  attemptState: typeof attempts.$inferSelect.state;
  bundleDigest: string;
  candidateDigest: string;
  heartbeatTimeoutSeconds: number;
  jobState: typeof jobs.$inferSelect.state;
  lastEventSequence: number;
  leaseExpiresAt: Date;
  revokedAt: Date | null;
  runState: typeof runs.$inferSelect.state;
  verifierVerdict: Record<string, unknown>;
  verdictDigest: string;
};

type StoredAttemptEvent = {
  createdAt: Date;
  details: Record<string, unknown>;
  eventKind: typeof workerAttemptEvents.$inferSelect.eventKind;
  phase: typeof workerAttemptEvents.$inferSelect.phase;
  summary: string;
};

type StoredArtifactRow = {
  artifactClassId: typeof artifacts.$inferSelect.artifactClassId;
  artifactManifestDigest: string | null;
  bucketName: string;
  byteSize: number;
  contentEncoding: string | null;
  id: string;
  lifecycleState: typeof artifacts.$inferSelect.lifecycleState;
  mediaType: string | null;
  objectKey: string;
  prefixFamily: typeof artifacts.$inferSelect.prefixFamily;
  relativePath: string;
  requiredForIngest: boolean;
  sha256: string;
  storageProvider: typeof artifacts.$inferSelect.storageProvider;
};

type ArtifactManifestSubmissionArtifact = WorkerArtifactManifestResponse["artifacts"][number];

export type InternalWorkerJobAuthContext = {
  attemptId: string;
  attemptRowId: string;
  attemptState: typeof attempts.$inferSelect.state;
  heartbeatTimeoutSeconds: number;
  jobId: string;
  jobRowId: string;
  jobState: typeof jobs.$inferSelect.state;
  jobTokenScopes: WorkerJobTokenScope[];
  lastEventSequence: number;
  leaseExpiresAt: Date;
  leaseId: string;
  leaseRowId: string;
  runId: string;
  runRowId: string;
  runState: typeof runs.$inferSelect.state;
};

export class InternalWorkerControlError extends Error {
  code: string;
  issues?: Array<{ message: string; path?: string }>;
  statusCode: number;

  constructor(options: {
    code: string;
    issues?: Array<{ message: string; path?: string }>;
    statusCode: number;
  }) {
    super(options.code);
    this.name = "InternalWorkerControlError";
    this.code = options.code;
    this.issues = options.issues;
    this.statusCode = options.statusCode;
  }
}

function addSeconds(timestamp: Date, seconds: number) {
  return new Date(timestamp.getTime() + seconds * 1000);
}

function sha256Text(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function issueJobToken() {
  const token = randomBytes(32).toString("base64url");

  return {
    token,
    tokenHash: sha256Text(token)
  };
}

function buildIdleClaimResponse(): WorkerClaimResponse {
  return {
    leaseStatus: "idle",
    pollAfterSeconds: idlePollAfterSeconds,
    workerJob: null
  };
}

function supportsCurrentProblem9Assignment(request: WorkerClaimRequest) {
  if (request.activeJobCount >= request.maxConcurrentJobs) {
    return false;
  }

  if (!request.supportsOfflineBundleContract) {
    return false;
  }

  if (!request.availableRunKinds.includes("single_run")) {
    return false;
  }

  return requiredProblem9ArtifactRoles.every((role) =>
    request.supportedArtifactRoles.includes(role)
  );
}

function queuedJobWhereClause(): SQL {
  return and(
    eq(jobs.state, "queued"),
    eq(attempts.state, "prepared"),
    eq(runs.runKind, "single_run"),
    or(eq(runs.state, "queued"), eq(runs.state, "running"))
  )!;
}

async function selectNextClaimCandidate(tx: SelectExecutor): Promise<CandidateClaimRow | null> {
  const [candidate] = await tx
    .select({
      attemptId: attempts.sourceAttemptId,
      attemptRowId: attempts.id,
      benchmarkItemId: runs.benchmarkItemId,
      jobId: jobs.sourceJobId,
      jobRowId: jobs.id,
      modelConfigId: runs.modelConfigId,
      runId: runs.sourceRunId,
      runKind: runs.runKind,
      runRowId: runs.id,
      runState: runs.state
    })
    .from(jobs)
    .innerJoin(runs, eq(jobs.runId, runs.id))
    .innerJoin(attempts, eq(attempts.jobId, jobs.id))
    .leftJoin(
      workerJobLeases,
      and(eq(workerJobLeases.jobId, jobs.id), isNull(workerJobLeases.revokedAt))
    )
    .where(and(queuedJobWhereClause(), isNull(workerJobLeases.id)))
    .orderBy(asc(jobs.createdAt), asc(attempts.createdAt))
    .limit(1);

  if (!candidate?.jobId || !candidate.runId || !candidate.attemptId) {
    return null;
  }

  return {
    attemptId: candidate.attemptId,
    attemptRowId: candidate.attemptRowId,
    benchmarkItemId: candidate.benchmarkItemId,
    jobId: candidate.jobId,
    jobRowId: candidate.jobRowId,
    modelConfigId: candidate.modelConfigId,
    runId: candidate.runId,
    runKind: candidate.runKind,
    runRowId: candidate.runRowId,
    runState: candidate.runState
  };
}

function createJobTokenExpiry(now: Date) {
  return addSeconds(now, heartbeatTimeoutSeconds);
}

function normalizeRelativePath(relativePath: string) {
  return relativePath.split("\\").join("/");
}

function normalizeDigest(value: string) {
  return value.toLowerCase();
}

function mapArtifactPrefixFamily(artifactRole: WorkerBundleArtifactRole) {
  switch (artifactRole) {
    case "compiler_output":
      return "run_logs" as const;
    case "execution_trace":
      return "run_traces" as const;
    default:
      return "run_artifacts" as const;
  }
}

function resolveArtifactBucketName() {
  return process.env.NODE_ENV === "production"
    ? "paretoproof-production-artifacts"
    : "paretoproof-dev-artifacts";
}

function buildArtifactObjectKey(options: {
  attemptId: string;
  artifactRole: WorkerBundleArtifactRole;
  relativePath: string;
  runId: string;
}) {
  const prefixFamily = mapArtifactPrefixFamily(options.artifactRole);
  const prefixRoot =
    prefixFamily === "run_logs"
      ? "logs"
      : prefixFamily === "run_traces"
        ? "traces"
        : "artifacts";

  return normalizeRelativePath(
    `runs/${options.runId}/${prefixRoot}/${options.attemptId}/${options.relativePath}`
  );
}

function createConflictError(code: string, message: string, path?: string) {
  return new InternalWorkerControlError({
    code,
    issues: [{ message, path }],
    statusCode: 409
  });
}

function createValidationError(code: string, message: string, path?: string) {
  return new InternalWorkerControlError({
    code,
    issues: [{ message, path }],
    statusCode: 422
  });
}

function parseTimestamp(value: string, path: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw createValidationError("worker_invalid_timestamp", `Invalid timestamp for ${path}.`, path);
  }

  return parsed;
}

function hasScope(authContext: InternalWorkerJobAuthContext, scope: WorkerJobTokenScope) {
  return authContext.jobTokenScopes.includes(scope);
}

function ensureScope(authContext: InternalWorkerJobAuthContext, scope: WorkerJobTokenScope) {
  if (!hasScope(authContext, scope)) {
    throw new InternalWorkerControlError({
      code: "worker_job_token_scope_missing",
      issues: [{ message: `Job token is missing the required ${scope} scope.`, path: "authorization" }],
      statusCode: 403
    });
  }
}

function assertLeaseIdentity(
  request: { attemptId: string; jobId: string; leaseId: string },
  authContext: InternalWorkerJobAuthContext
) {
  if (request.jobId !== authContext.jobId) {
    throw new InternalWorkerControlError({
      code: "worker_job_id_mismatch",
      issues: [{ message: "Payload jobId does not match the active lease.", path: "jobId" }],
      statusCode: 400
    });
  }

  if (request.attemptId !== authContext.attemptId) {
    throw new InternalWorkerControlError({
      code: "worker_attempt_id_mismatch",
      issues: [{ message: "Payload attemptId does not match the active lease.", path: "attemptId" }],
      statusCode: 409
    });
  }

  if (request.leaseId !== authContext.leaseId) {
    throw new InternalWorkerControlError({
      code: "worker_lease_id_mismatch",
      issues: [{ message: "Payload leaseId does not match the active lease.", path: "leaseId" }],
      statusCode: 409
    });
  }
}

function assertRunIdentity(runId: string, authContext: InternalWorkerJobAuthContext) {
  if (runId !== authContext.runId) {
    throw new InternalWorkerControlError({
      code: "worker_run_id_mismatch",
      issues: [{ message: "Payload runId does not match the active lease.", path: "runId" }],
      statusCode: 409
    });
  }
}

async function loadLeaseState(
  db: ReadExecutor,
  leaseRowId: string
): Promise<LeaseStateRow | null> {
  const [lease] = await db
    .select({
      artifactManifestDigest: attempts.artifactManifestDigest,
      attemptState: attempts.state,
      bundleDigest: attempts.bundleDigest,
      candidateDigest: attempts.candidateDigest,
      heartbeatTimeoutSeconds: workerJobLeases.heartbeatTimeoutSeconds,
      jobState: jobs.state,
      lastEventSequence: workerJobLeases.lastEventSequence,
      leaseExpiresAt: workerJobLeases.leaseExpiresAt,
      revokedAt: workerJobLeases.revokedAt,
      runState: runs.state,
      verifierVerdict: attempts.verifierVerdict,
      verdictDigest: attempts.verdictDigest
    })
    .from(workerJobLeases)
    .innerJoin(jobs, eq(workerJobLeases.jobId, jobs.id))
    .innerJoin(runs, eq(workerJobLeases.runId, runs.id))
    .innerJoin(attempts, eq(workerJobLeases.attemptId, attempts.id))
    .where(eq(workerJobLeases.id, leaseRowId))
    .limit(1);

  return lease ?? null;
}

function ensureLeaseIsActive(leaseState: LeaseStateRow, now: Date) {
  if (leaseState.revokedAt || leaseState.leaseExpiresAt.getTime() <= now.getTime()) {
    throw createConflictError(
      "worker_lease_not_active",
      "The worker lease is no longer active for this submission."
    );
  }
}

function ensureSubmissionState(
  leaseState: LeaseStateRow,
  options: {
    allowCancelRequested: boolean;
    path: string;
  }
) {
  const allowedRunStates = options.allowCancelRequested
    ? new Set(["queued", "running", "cancel_requested"])
    : new Set(["queued", "running"]);
  const allowedJobStates = options.allowCancelRequested
    ? new Set(["claimed", "running", "cancel_requested"])
    : new Set(["claimed", "running"]);
  const allowedAttemptStates = new Set(["prepared", "active"]);

  if (!allowedRunStates.has(leaseState.runState)) {
    throw createConflictError(
      "worker_run_not_mutable",
      `Run state ${leaseState.runState} does not allow ${options.path}.`,
      "runState"
    );
  }

  if (!allowedJobStates.has(leaseState.jobState)) {
    throw createConflictError(
      "worker_job_not_mutable",
      `Job state ${leaseState.jobState} does not allow ${options.path}.`,
      "jobState"
    );
  }

  if (!allowedAttemptStates.has(leaseState.attemptState)) {
    throw createConflictError(
      "worker_attempt_not_mutable",
      `Attempt state ${leaseState.attemptState} does not allow ${options.path}.`,
      "attemptState"
    );
  }
}

async function promoteExecutionToRunning(
  db: ReadWriteExecutor,
  authContext: InternalWorkerJobAuthContext,
  leaseState: LeaseStateRow,
  now: Date
) {
  if (leaseState.jobState === "claimed") {
    await db
      .update(jobs)
      .set({
        state: "running",
        updatedAt: now
      })
      .where(eq(jobs.id, authContext.jobRowId));
  }

  if (leaseState.attemptState === "prepared") {
    await db
      .update(attempts)
      .set({
        state: "active",
        updatedAt: now
      })
      .where(eq(attempts.id, authContext.attemptRowId));
  }

  if (leaseState.runState === "queued") {
    await db
      .update(runs)
      .set({
        state: "running",
        updatedAt: now
      })
      .where(eq(runs.id, authContext.runRowId));
  }
}

function buildArtifactIdentityKey(artifactRole: WorkerBundleArtifactRole, relativePath: string) {
  return `${artifactRole}:${normalizeRelativePath(relativePath)}`;
}

async function loadArtifactsByAttempt(
  db: ReadExecutor,
  attemptRowId: string
): Promise<Map<string, StoredArtifactRow>> {
  const artifactRows = await db
    .select({
      artifactClassId: artifacts.artifactClassId,
      artifactManifestDigest: artifacts.artifactManifestDigest,
      bucketName: artifacts.bucketName,
      byteSize: artifacts.byteSize,
      contentEncoding: artifacts.contentEncoding,
      id: artifacts.id,
      lifecycleState: artifacts.lifecycleState,
      mediaType: artifacts.mediaType,
      objectKey: artifacts.objectKey,
      prefixFamily: artifacts.prefixFamily,
      relativePath: artifacts.relativePath,
      requiredForIngest: artifacts.requiredForIngest,
      sha256: artifacts.sha256,
      storageProvider: artifacts.storageProvider
    })
    .from(artifacts)
    .where(eq(artifacts.attemptId, attemptRowId));

  return new Map(
    artifactRows.map((artifactRow) => [
      buildArtifactIdentityKey(artifactRow.artifactClassId, artifactRow.relativePath),
      artifactRow
    ])
  );
}

async function loadArtifactsByIds(
  db: ReadExecutor,
  attemptRowId: string,
  artifactIds: string[]
): Promise<StoredArtifactRow[]> {
  if (artifactIds.length === 0) {
    return [];
  }

  return db
    .select({
      artifactClassId: artifacts.artifactClassId,
      artifactManifestDigest: artifacts.artifactManifestDigest,
      bucketName: artifacts.bucketName,
      byteSize: artifacts.byteSize,
      contentEncoding: artifacts.contentEncoding,
      id: artifacts.id,
      lifecycleState: artifacts.lifecycleState,
      mediaType: artifacts.mediaType,
      objectKey: artifacts.objectKey,
      prefixFamily: artifacts.prefixFamily,
      relativePath: artifacts.relativePath,
      requiredForIngest: artifacts.requiredForIngest,
      sha256: artifacts.sha256,
      storageProvider: artifacts.storageProvider
    })
    .from(artifacts)
    .where(and(eq(artifacts.attemptId, attemptRowId), inArray(artifacts.id, artifactIds)));
}

function assertArtifactSelection(
  artifactRows: StoredArtifactRow[],
  artifactIds: string[],
  artifactManifestDigest: string | null,
  path: string
) {
  if (artifactRows.length !== artifactIds.length) {
    throw createValidationError(
      "worker_artifact_reference_invalid",
      "One or more referenced artifactIds do not belong to the active attempt.",
      path
    );
  }

  if (
    artifactManifestDigest &&
    artifactRows.some(
      (artifactRow) =>
        artifactRow.artifactManifestDigest !== null &&
        artifactRow.artifactManifestDigest !== artifactManifestDigest
    )
  ) {
    throw createValidationError(
      "worker_artifact_manifest_mismatch",
      "Referenced artifactIds do not match the submitted artifactManifestDigest.",
      path
    );
  }
}

async function loadStoredAttemptEvent(
  db: ReadExecutor,
  attemptRowId: string,
  sequence: number
): Promise<StoredAttemptEvent | null> {
  const [event] = await db
    .select({
      createdAt: workerAttemptEvents.createdAt,
      details: workerAttemptEvents.details,
      eventKind: workerAttemptEvents.eventKind,
      phase: workerAttemptEvents.phase,
      summary: workerAttemptEvents.summary
    })
    .from(workerAttemptEvents)
    .where(
      and(
        eq(workerAttemptEvents.attemptId, attemptRowId),
        eq(workerAttemptEvents.sequence, sequence)
      )
    )
    .limit(1);

  return event ?? null;
}

function matchesStoredEvent(request: WorkerExecutionEvent, storedEvent: StoredAttemptEvent) {
  return (
    storedEvent.eventKind === request.eventKind &&
    storedEvent.phase === request.phase &&
    storedEvent.summary === request.summary &&
    JSON.stringify(storedEvent.details) === JSON.stringify(request.details)
  );
}

function assertArtifactRowsMatchManifest(
  existingArtifact: StoredArtifactRow,
  requestArtifact: WorkerArtifactManifestRequest["artifacts"][number],
  authContext: InternalWorkerJobAuthContext,
  artifactManifestDigest: string
) {
  if (
    existingArtifact.artifactClassId !== requestArtifact.artifactRole ||
    existingArtifact.relativePath !== normalizeRelativePath(requestArtifact.relativePath) ||
    normalizeDigest(existingArtifact.sha256) !== normalizeDigest(requestArtifact.sha256) ||
    existingArtifact.byteSize !== requestArtifact.byteSize ||
    existingArtifact.mediaType !== requestArtifact.mediaType ||
    existingArtifact.contentEncoding !== requestArtifact.contentEncoding ||
    existingArtifact.requiredForIngest !== requestArtifact.requiredForIngest ||
    existingArtifact.artifactManifestDigest === null ||
    existingArtifact.artifactManifestDigest !== artifactManifestDigest
  ) {
    throw createConflictError(
      "worker_artifact_manifest_conflict",
      `Artifact ${requestArtifact.relativePath} already exists with different metadata.`,
      "artifacts"
    );
  }

  const expectedObjectKey = buildArtifactObjectKey({
    attemptId: authContext.attemptId,
    artifactRole: requestArtifact.artifactRole,
    relativePath: requestArtifact.relativePath,
    runId: authContext.runId
  });

  if (
    existingArtifact.storageProvider !== "cloudflare_r2" ||
    existingArtifact.bucketName !== resolveArtifactBucketName() ||
    existingArtifact.objectKey !== expectedObjectKey ||
    existingArtifact.prefixFamily !== mapArtifactPrefixFamily(requestArtifact.artifactRole)
  ) {
    throw createConflictError(
      "worker_artifact_manifest_conflict",
      `Artifact ${requestArtifact.relativePath} already exists with a conflicting storage locator.`,
      "artifacts"
    );
  }
}

function assertResultPayload(request: WorkerResultMessageRequest) {
  if (request.verifierVerdict.attemptId !== request.attemptId) {
    throw createValidationError(
      "worker_verifier_verdict_attempt_mismatch",
      "verifierVerdict.attemptId must match attemptId.",
      "verifierVerdict.attemptId"
    );
  }

  if (
    normalizeDigest(request.verifierVerdict.candidateDigest) !==
    normalizeDigest(request.candidateDigest)
  ) {
    throw createValidationError(
      "worker_candidate_digest_mismatch",
      "candidateDigest must match verifierVerdict.candidateDigest.",
      "candidateDigest"
    );
  }

  if (request.verifierVerdict.result !== "pass") {
    throw createValidationError(
      "worker_result_requires_pass_verdict",
      "The success route only accepts pass verifier verdicts.",
      "verifierVerdict.result"
    );
  }

  if (request.verifierVerdict.primaryFailure !== null) {
    throw createValidationError(
      "worker_result_primary_failure_forbidden",
      "Pass verifier verdicts must not include a primary failure.",
      "verifierVerdict.primaryFailure"
    );
  }
}

function assertFailurePayload(request: WorkerTerminalFailureRequest) {
  if (request.verifierVerdict) {
    if (request.verifierVerdict.attemptId !== request.attemptId) {
      throw createValidationError(
        "worker_verifier_verdict_attempt_mismatch",
        "verifierVerdict.attemptId must match attemptId.",
        "verifierVerdict.attemptId"
      );
    }

    if (request.verifierVerdict.result !== "fail") {
      throw createValidationError(
        "worker_failure_requires_failing_verdict",
        "Failure submission verifierVerdict.result must be fail when present.",
        "verifierVerdict.result"
      );
    }

    if (request.candidateDigest === null) {
      throw createValidationError(
        "worker_candidate_digest_required",
        "candidateDigest is required when verifierVerdict is present.",
        "candidateDigest"
      );
    }

    if (
      normalizeDigest(request.verifierVerdict.candidateDigest) !==
      normalizeDigest(request.candidateDigest)
    ) {
      throw createValidationError(
        "worker_candidate_digest_mismatch",
        "candidateDigest must match verifierVerdict.candidateDigest.",
        "candidateDigest"
      );
    }

    if (
      request.verifierVerdict.primaryFailure &&
      request.verifierVerdict.primaryFailure.failureCode !== request.failure.failureCode
    ) {
      throw createValidationError(
        "worker_failure_code_mismatch",
        "verifierVerdict.primaryFailure.failureCode must match failure.failureCode when present.",
        "verifierVerdict.primaryFailure.failureCode"
      );
    }
  }

  if ((request.verifierVerdict === null) !== (request.verdictDigest === null)) {
    throw createValidationError(
      "worker_verdict_digest_mismatch",
      "verifierVerdict and verdictDigest must either both be present or both be null.",
      "verdictDigest"
    );
  }

  if (request.terminalState === "cancelled" && request.failure.terminality !== "cancelled") {
    throw createValidationError(
      "worker_failure_terminality_mismatch",
      "Cancelled terminal submissions require failure.terminality=cancelled.",
      "failure.terminality"
    );
  }

  if (request.terminalState === "failed" && request.failure.terminality === "cancelled") {
    throw createValidationError(
      "worker_failure_terminality_mismatch",
      "Failed terminal submissions may not use failure.terminality=cancelled.",
      "failure.terminality"
    );
  }
}

function selectFailureVerdictClass(request: WorkerTerminalFailureRequest) {
  if (request.terminalState === "cancelled") {
    return "invalid_result" as const;
  }

  return request.verifierVerdict?.result === "fail"
    ? ("fail" as const)
    : ("invalid_result" as const);
}

function isWorkerAttemptEventDuplicateError(error: unknown) {
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
    constraintName === "worker_attempt_events_attempt_sequence_unique"
  );
}

export const internalWorkerControlTestUtils = {
  assertArtifactRowsMatchManifest,
  assertFailurePayload,
  assertResultPayload
};

export function createInternalWorkerControlService(db: DbClient) {
  return {
    async authenticateJobToken(
      jobId: string,
      jobToken: string
    ): Promise<InternalWorkerJobAuthContext | null> {
      const jobTokenHash = sha256Text(jobToken);
      const now = new Date();
      const [lease] = await db
        .select({
          attemptId: attempts.sourceAttemptId,
          attemptRowId: attempts.id,
          attemptState: attempts.state,
          heartbeatTimeoutSeconds: workerJobLeases.heartbeatTimeoutSeconds,
          jobId: jobs.sourceJobId,
          jobRowId: jobs.id,
          jobState: jobs.state,
          jobTokenScopes: workerJobLeases.jobTokenScopes,
          lastEventSequence: workerJobLeases.lastEventSequence,
          leaseExpiresAt: workerJobLeases.leaseExpiresAt,
          leaseId: workerJobLeases.id,
          leaseRowId: workerJobLeases.id,
          runId: runs.sourceRunId,
          runRowId: runs.id,
          runState: runs.state
        })
        .from(workerJobLeases)
        .innerJoin(jobs, eq(workerJobLeases.jobId, jobs.id))
        .innerJoin(runs, eq(workerJobLeases.runId, runs.id))
        .innerJoin(attempts, eq(workerJobLeases.attemptId, attempts.id))
        .where(
          and(
            eq(jobs.sourceJobId, jobId),
            eq(workerJobLeases.jobTokenHash, jobTokenHash),
            gt(workerJobLeases.jobTokenExpiresAt, now),
            isNull(workerJobLeases.revokedAt)
          )
        )
        .limit(1);

      if (!lease?.jobId) {
        return null;
      }

      return {
        attemptId: lease.attemptId,
        attemptRowId: lease.attemptRowId,
        attemptState: lease.attemptState,
        heartbeatTimeoutSeconds: lease.heartbeatTimeoutSeconds,
        jobId: lease.jobId,
        jobRowId: lease.jobRowId,
        jobState: lease.jobState,
        jobTokenScopes: Array.isArray(lease.jobTokenScopes)
          ? (lease.jobTokenScopes as WorkerJobTokenScope[])
          : [],
        lastEventSequence: lease.lastEventSequence,
        leaseExpiresAt: lease.leaseExpiresAt,
        leaseId: lease.leaseId,
        leaseRowId: lease.leaseRowId,
        runId: lease.runId,
        runRowId: lease.runRowId,
        runState: lease.runState
      };
    },

    async claim(request: WorkerClaimRequest): Promise<WorkerClaimResponse> {
      if (!supportsCurrentProblem9Assignment(request)) {
        return buildIdleClaimResponse();
      }

      return db.transaction(async (tx) => {
        const candidate = await selectNextClaimCandidate(tx);

        if (!candidate) {
          return buildIdleClaimResponse();
        }

        const now = new Date();
        const leaseExpiresAt = addSeconds(now, heartbeatTimeoutSeconds);
        const jobTokenExpiresAt = createJobTokenExpiry(now);
        const { token, tokenHash } = issueJobToken();

        const [lease] = await tx
          .insert(workerJobLeases)
          .values({
            attemptId: candidate.attemptRowId,
            heartbeatIntervalSeconds,
            heartbeatTimeoutSeconds,
            jobId: candidate.jobRowId,
            jobTokenExpiresAt,
            jobTokenHash: tokenHash,
            jobTokenScopes: [...issuedJobTokenScopes],
            leaseExpiresAt,
            runId: candidate.runRowId,
            workerId: request.workerId,
            workerPool: request.workerPool,
            workerRuntime: request.workerRuntime,
            workerVersion: request.workerVersion
          })
          .returning({
            id: workerJobLeases.id
          });

        if (!lease) {
          throw new Error("Failed to persist the worker job lease.");
        }

        await tx
          .update(jobs)
          .set({
            state: "claimed",
            updatedAt: now
          })
          .where(eq(jobs.id, candidate.jobRowId));

        if (candidate.runState === "queued") {
          await tx
            .update(runs)
            .set({
              state: "running",
              updatedAt: now
            })
            .where(eq(runs.id, candidate.runRowId));
        }

        return {
          leaseStatus: "active",
          pollAfterSeconds: 0,
          workerJob: {
            attemptId: candidate.attemptId,
            heartbeatIntervalSeconds,
            heartbeatTimeoutSeconds,
            jobId: candidate.jobId,
            jobToken: token,
            jobTokenExpiresAt: jobTokenExpiresAt.toISOString(),
            jobTokenScopes: [...issuedJobTokenScopes],
            leaseExpiresAt: leaseExpiresAt.toISOString(),
            leaseId: lease.id,
            offlineBundleCompatible: true,
            requiredArtifactRoles: [...requiredProblem9ArtifactRoles],
            runBundleSchemaVersion,
            runId: candidate.runId,
            target: {
              benchmarkItemId: candidate.benchmarkItemId,
              modelConfigId: candidate.modelConfigId,
              runKind: "single_run"
            }
          }
        } satisfies WorkerClaimResponse;
      });
    },

    async heartbeat(
      request: WorkerHeartbeatRequest,
      authContext: InternalWorkerJobAuthContext
    ): Promise<WorkerHeartbeatResponse> {
      ensureScope(authContext, "heartbeat");
      assertLeaseIdentity(request, authContext);
      parseTimestamp(request.observedAt, "observedAt");

      return db.transaction(async (tx) => {
        const lease = await loadLeaseState(tx, authContext.leaseRowId);

        if (!lease) {
          throw new InternalWorkerControlError({
            code: "worker_lease_not_found",
            statusCode: 404
          });
        }

        const now = new Date();
        const acknowledgedEventSequence = Math.max(
          lease.lastEventSequence,
          request.lastEventSequence
        );

        if (lease.revokedAt || lease.leaseExpiresAt.getTime() <= now.getTime()) {
          await tx
            .update(workerJobLeases)
            .set({
              revokedAt: lease.revokedAt ?? now,
              updatedAt: now
            })
            .where(eq(workerJobLeases.id, authContext.leaseRowId));

          return {
            acknowledgedEventSequence,
            cancelRequested: false,
            jobToken: null,
            jobTokenExpiresAt: null,
            leaseExpiresAt: null,
            leaseStatus: "expired"
          } satisfies WorkerHeartbeatResponse;
        }

        if (
          lease.jobState === "completed" ||
          lease.jobState === "failed" ||
          lease.jobState === "cancelled" ||
          lease.attemptState === "succeeded" ||
          lease.attemptState === "failed" ||
          lease.attemptState === "cancelled"
        ) {
          await tx
            .update(workerJobLeases)
            .set({
              revokedAt: now,
              updatedAt: now
            })
            .where(eq(workerJobLeases.id, authContext.leaseRowId));

          return {
            acknowledgedEventSequence,
            cancelRequested: false,
            jobToken: null,
            jobTokenExpiresAt: null,
            leaseExpiresAt: null,
            leaseStatus: "expired"
          } satisfies WorkerHeartbeatResponse;
        }

        if (lease.jobState === "cancel_requested") {
          await tx
            .update(workerJobLeases)
            .set({
              lastEventSequence: acknowledgedEventSequence,
              lastHeartbeatAt: now,
              revokedAt: now,
              updatedAt: now
            })
            .where(eq(workerJobLeases.id, authContext.leaseRowId));

          return {
            acknowledgedEventSequence,
            cancelRequested: true,
            jobToken: null,
            jobTokenExpiresAt: null,
            leaseExpiresAt: null,
            leaseStatus: "cancel_requested"
          } satisfies WorkerHeartbeatResponse;
        }

        const nextLeaseExpiresAt = addSeconds(now, lease.heartbeatTimeoutSeconds);
        const nextJobTokenExpiresAt = addSeconds(now, lease.heartbeatTimeoutSeconds);
        const { token, tokenHash } = issueJobToken();

        await tx
          .update(workerJobLeases)
          .set({
            jobTokenExpiresAt: nextJobTokenExpiresAt,
            jobTokenHash: tokenHash,
            lastEventSequence: acknowledgedEventSequence,
            lastHeartbeatAt: now,
            leaseExpiresAt: nextLeaseExpiresAt,
            updatedAt: now
          })
          .where(eq(workerJobLeases.id, authContext.leaseRowId));

        await promoteExecutionToRunning(tx, authContext, lease, now);

        return {
          acknowledgedEventSequence,
          cancelRequested: false,
          jobToken: token,
          jobTokenExpiresAt: nextJobTokenExpiresAt.toISOString(),
          leaseExpiresAt: nextLeaseExpiresAt.toISOString(),
          leaseStatus: "active"
        } satisfies WorkerHeartbeatResponse;
      });
    },

    async reportEvent(
      request: WorkerExecutionEvent,
      authContext: InternalWorkerJobAuthContext
    ): Promise<WorkerExecutionEventResponse> {
      ensureScope(authContext, "event_append");
      assertLeaseIdentity(request, authContext);
      parseTimestamp(request.recordedAt, "recordedAt");

      return db.transaction(async (tx) => {
        const lease = await loadLeaseState(tx, authContext.leaseRowId);

        if (!lease) {
          throw new InternalWorkerControlError({
            code: "worker_lease_not_found",
            statusCode: 404
          });
        }

        const now = new Date();
        ensureLeaseIsActive(lease, now);
        ensureSubmissionState(lease, {
          allowCancelRequested: false,
          path: "event reporting"
        });

        if (request.sequence <= lease.lastEventSequence) {
          const storedEvent = await loadStoredAttemptEvent(
            tx,
            authContext.attemptRowId,
            request.sequence
          );

          if (storedEvent && matchesStoredEvent(request, storedEvent)) {
            return {
              acceptedAt: storedEvent.createdAt.toISOString(),
              acknowledgedSequence: request.sequence
            };
          }

          throw createConflictError(
            "worker_event_sequence_conflict",
            "Event sequence has already been used for a different event.",
            "sequence"
          );
        }

        if (request.sequence !== lease.lastEventSequence + 1) {
          throw createConflictError(
            "worker_event_sequence_gap",
            "Event sequence must advance exactly one step at a time.",
            "sequence"
          );
        }

        try {
          await tx.insert(workerAttemptEvents).values({
            attemptId: authContext.attemptRowId,
            details: request.details,
            eventKind: request.eventKind,
            jobId: authContext.jobRowId,
            leaseId: authContext.leaseRowId,
            phase: request.phase,
            recordedAt: new Date(request.recordedAt),
            runId: authContext.runRowId,
            sequence: request.sequence,
            summary: request.summary
          });
        } catch (error) {
          if (!isWorkerAttemptEventDuplicateError(error)) {
            throw error;
          }

          const storedEvent = await loadStoredAttemptEvent(
            tx,
            authContext.attemptRowId,
            request.sequence
          );

          if (storedEvent && matchesStoredEvent(request, storedEvent)) {
            return {
              acceptedAt: storedEvent.createdAt.toISOString(),
              acknowledgedSequence: request.sequence
            };
          }

          throw createConflictError(
            "worker_event_sequence_conflict",
            "Event sequence has already been used for a different event.",
            "sequence"
          );
        }

        await tx
          .update(workerJobLeases)
          .set({
            lastEventSequence: request.sequence,
            updatedAt: now
          })
          .where(eq(workerJobLeases.id, authContext.leaseRowId));

        await promoteExecutionToRunning(tx, authContext, lease, now);

        return {
          acceptedAt: now.toISOString(),
          acknowledgedSequence: request.sequence
        };
      });
    },

    async submitArtifactManifest(
      request: WorkerArtifactManifestRequest,
      authContext: InternalWorkerJobAuthContext
    ): Promise<WorkerArtifactManifestResponse> {
      ensureScope(authContext, "artifact_manifest_write");
      assertLeaseIdentity(request, authContext);
      parseTimestamp(request.recordedAt, "recordedAt");

      return db.transaction(async (tx) => {
        const lease = await loadLeaseState(tx, authContext.leaseRowId);

        if (!lease) {
          throw new InternalWorkerControlError({
            code: "worker_lease_not_found",
            statusCode: 404
          });
        }

        const now = new Date();
        ensureLeaseIsActive(lease, now);
        ensureSubmissionState(lease, {
          allowCancelRequested: false,
          path: "artifact manifest submission"
        });

        const existingArtifactsByKey = await loadArtifactsByAttempt(tx, authContext.attemptRowId);
        const bucketName = resolveArtifactBucketName();
        const responseArtifacts: ArtifactManifestSubmissionArtifact[] = [];
        const insertValues: Array<typeof artifacts.$inferInsert> = [];

        for (const artifact of request.artifacts) {
          const normalizedPath = normalizeRelativePath(artifact.relativePath);
          const artifactKey = buildArtifactIdentityKey(artifact.artifactRole, normalizedPath);
          const existingArtifact = existingArtifactsByKey.get(artifactKey);

          if (existingArtifact) {
            assertArtifactRowsMatchManifest(
              existingArtifact,
              artifact,
              authContext,
              request.artifactManifestDigest
            );
            responseArtifacts.push({
              artifactId: existingArtifact.id,
              artifactRole: artifact.artifactRole,
              relativePath: normalizedPath
            });
            continue;
          }

          insertValues.push({
            artifactClassId: artifact.artifactRole,
            artifactManifestDigest: request.artifactManifestDigest,
            attemptId: authContext.attemptRowId,
            bucketName,
            byteSize: artifact.byteSize,
            contentEncoding: artifact.contentEncoding,
            jobId: authContext.jobRowId,
            lifecycleState: "registered",
            mediaType: artifact.mediaType,
            objectKey: buildArtifactObjectKey({
              attemptId: authContext.attemptId,
              artifactRole: artifact.artifactRole,
              relativePath: normalizedPath,
              runId: authContext.runId
            }),
            ownerScope: "run_attempt",
            prefixFamily: mapArtifactPrefixFamily(artifact.artifactRole),
            providerEtag: null,
            relativePath: normalizedPath,
            requiredForIngest: artifact.requiredForIngest,
            runId: authContext.runRowId,
            sha256: normalizeDigest(artifact.sha256),
            storageProvider: "cloudflare_r2"
          });
        }

        if (insertValues.length > 0) {
          const insertedArtifacts = await tx
            .insert(artifacts)
            .values(insertValues)
            .returning({
              artifactClassId: artifacts.artifactClassId,
              id: artifacts.id,
              relativePath: artifacts.relativePath
            });

          for (const insertedArtifact of insertedArtifacts) {
            responseArtifacts.push({
              artifactId: insertedArtifact.id,
              artifactRole: insertedArtifact.artifactClassId,
              relativePath: insertedArtifact.relativePath
            });
          }
        }

        await tx
          .update(attempts)
          .set({
            artifactManifestDigest: request.artifactManifestDigest,
            updatedAt: now
          })
          .where(eq(attempts.id, authContext.attemptRowId));

        await promoteExecutionToRunning(tx, authContext, lease, now);

        return {
          acceptedAt: now.toISOString(),
          artifactManifestDigest: request.artifactManifestDigest,
          artifacts: responseArtifacts.sort((left, right) =>
            left.relativePath.localeCompare(right.relativePath)
          )
        };
      });
    },
    async submitResult(
      request: WorkerResultMessageRequest,
      authContext: InternalWorkerJobAuthContext
    ): Promise<WorkerResultMessageResponse> {
      ensureScope(authContext, "result_finalize");
      ensureScope(authContext, "verifier_verdict_write");
      assertLeaseIdentity(request, authContext);
      assertRunIdentity(request.runId, authContext);
      parseTimestamp(request.completedAt, "completedAt");
      assertResultPayload(request);

      return db.transaction(async (tx) => {
        const lease = await loadLeaseState(tx, authContext.leaseRowId);

        if (!lease) {
          throw new InternalWorkerControlError({
            code: "worker_lease_not_found",
            statusCode: 404
          });
        }

        const now = new Date();
        ensureLeaseIsActive(lease, now);
        ensureSubmissionState(lease, {
          allowCancelRequested: false,
          path: "result submission"
        });

        const artifactRows = await loadArtifactsByIds(
          tx,
          authContext.attemptRowId,
          request.artifactIds
        );
        assertArtifactSelection(
          artifactRows,
          request.artifactIds,
          request.artifactManifestDigest,
          "artifactIds"
        );

        const completedAt = new Date(request.completedAt);

        await tx
          .update(attempts)
          .set({
            artifactManifestDigest: request.artifactManifestDigest,
            bundleDigest: request.bundleDigest,
            candidateDigest: request.candidateDigest,
            completedAt,
            environmentDigest: request.environmentDigest,
            failureClassification: null,
            primaryFailureCode: null,
            primaryFailureFamily: null,
            primaryFailureSummary: null,
            state: "succeeded",
            stopReason: "verifier_passed",
            updatedAt: now,
            usageSummary: request.usageSummary,
            verifierResult: request.verifierVerdict.result,
            verifierVerdict: request.verifierVerdict,
            verdictClass: "pass",
            verdictDigest: request.verdictDigest
          })
          .where(eq(attempts.id, authContext.attemptRowId));

        await tx
          .update(jobs)
          .set({
            completedAt,
            primaryFailureCode: null,
            primaryFailureFamily: null,
            primaryFailureSummary: null,
            state: "completed",
            stopReason: "verifier_passed",
            updatedAt: now,
            verdictClass: "pass"
          })
          .where(eq(jobs.id, authContext.jobRowId));

        await tx
          .update(runs)
          .set({
            completedAt,
            primaryFailureCode: null,
            primaryFailureFamily: null,
            primaryFailureSummary: null,
            state: "succeeded",
            stopReason: "verifier_passed",
            updatedAt: now,
            verdictClass: "pass"
          })
          .where(eq(runs.id, authContext.runRowId));

        await tx
          .update(workerJobLeases)
          .set({
            revokedAt: now,
            updatedAt: now
          })
          .where(eq(workerJobLeases.id, authContext.leaseRowId));

        return {
          acceptedAt: now.toISOString(),
          attemptState: "succeeded",
          jobState: "completed",
          runState: "succeeded"
        };
      });
    },
    async submitFailure(
      request: WorkerTerminalFailureRequest,
      authContext: InternalWorkerJobAuthContext
    ): Promise<WorkerTerminalFailureResponse> {
      ensureScope(authContext, "failure_finalize");
      if (request.verifierVerdict) {
        ensureScope(authContext, "verifier_verdict_write");
      }
      assertLeaseIdentity(request, authContext);
      assertRunIdentity(request.runId, authContext);
      parseTimestamp(request.failedAt, "failedAt");
      assertFailurePayload(request);

      return db.transaction(async (tx) => {
        const lease = await loadLeaseState(tx, authContext.leaseRowId);

        if (!lease) {
          throw new InternalWorkerControlError({
            code: "worker_lease_not_found",
            statusCode: 404
          });
        }

        const now = new Date();
        ensureLeaseIsActive(lease, now);
        ensureSubmissionState(lease, {
          allowCancelRequested: true,
          path: "failure submission"
        });

        const artifactIds = request.artifactIds ?? [];
        const artifactRows = await loadArtifactsByIds(tx, authContext.attemptRowId, artifactIds);
        assertArtifactSelection(
          artifactRows,
          artifactIds,
          request.artifactManifestDigest,
          "artifactIds"
        );

        const verdictClass = selectFailureVerdictClass(request);
        const completedAt = new Date(request.failedAt);
        const attemptState = request.terminalState === "cancelled" ? "cancelled" : "failed";
        const jobState = request.terminalState === "cancelled" ? "cancelled" : "failed";
        const runState = request.terminalState === "cancelled" ? "cancelled" : "failed";

        await tx
          .update(attempts)
          .set({
            artifactManifestDigest: request.artifactManifestDigest ?? lease.artifactManifestDigest,
            bundleDigest: request.bundleDigest ?? lease.bundleDigest,
            candidateDigest: request.candidateDigest ?? lease.candidateDigest,
            completedAt,
            failureClassification: request.failure,
            primaryFailureCode: request.failure.failureCode,
            primaryFailureFamily: request.failure.failureFamily,
            primaryFailureSummary: request.failure.summary,
            state: attemptState,
            stopReason: request.failure.failureCode,
            updatedAt: now,
            verifierResult: request.verifierVerdict?.result ?? "invalid_result",
            verifierVerdict: request.verifierVerdict ?? lease.verifierVerdict,
            verdictClass,
            verdictDigest: request.verdictDigest ?? lease.verdictDigest
          })
          .where(eq(attempts.id, authContext.attemptRowId));

        await tx
          .update(jobs)
          .set({
            completedAt,
            primaryFailureCode: request.failure.failureCode,
            primaryFailureFamily: request.failure.failureFamily,
            primaryFailureSummary: request.failure.summary,
            state: jobState,
            stopReason: request.failure.failureCode,
            updatedAt: now,
            verdictClass
          })
          .where(eq(jobs.id, authContext.jobRowId));

        await tx
          .update(runs)
          .set({
            completedAt,
            primaryFailureCode: request.failure.failureCode,
            primaryFailureFamily: request.failure.failureFamily,
            primaryFailureSummary: request.failure.summary,
            state: runState,
            stopReason: request.failure.failureCode,
            updatedAt: now,
            verdictClass
          })
          .where(eq(runs.id, authContext.runRowId));

        await tx
          .update(workerJobLeases)
          .set({
            revokedAt: now,
            updatedAt: now
          })
          .where(eq(workerJobLeases.id, authContext.leaseRowId));

        return {
          acceptedAt: now.toISOString(),
          attemptState,
          jobState,
          runState
        };
      });
    }
  };
}

export function readBearerToken(
  authorizationHeader: string | undefined
) {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(/\s+/, 2);

  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token;
}
