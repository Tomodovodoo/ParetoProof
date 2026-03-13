import { createHash, randomBytes } from "node:crypto";
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  or,
  type SQL
} from "drizzle-orm";
import type {
  WorkerBundleArtifactRole,
  WorkerClaimRequest,
  WorkerClaimResponse,
  WorkerHeartbeatRequest,
  WorkerHeartbeatResponse,
  WorkerJobTokenScope
} from "@paretoproof/shared";
import {
  attempts,
  jobs,
  runs,
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
type RequeueExecutor = Pick<DbClient, "select" | "update">;

type CandidateClaimRow = {
  attemptId: string;
  attemptRowId: string;
  jobId: string;
  jobRowId: string;
  runId: string;
  runKind: typeof runs.$inferSelect.runKind;
  runRowId: string;
  benchmarkItemId: string;
  modelConfigId: string;
  runState: typeof runs.$inferSelect.state;
};

export type InternalWorkerJobAuthContext = {
  attemptId: string;
  attemptRowId: string;
  heartbeatTimeoutSeconds: number;
  jobId: string;
  jobToken: string;
  jobRowId: string;
  lastEventSequence: number;
  leaseExpiresAt: Date;
  leaseId: string;
  leaseRowId: string;
  jobState: typeof jobs.$inferSelect.state;
  runId: string;
  runRowId: string;
  runState: typeof runs.$inferSelect.state;
  attemptState: typeof attempts.$inferSelect.state;
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

function toIsoString(value: Date | null) {
  return value ? value.toISOString() : null;
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
    .where(
      and(
        queuedJobWhereClause(),
        isNull(workerJobLeases.id),
      )
    )
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

async function requeueExpiredUnstartedLeases(tx: RequeueExecutor, now: Date) {
  const staleLeases = await tx
    .select({
      jobRowId: jobs.id,
      leaseRowId: workerJobLeases.id,
      runRowId: runs.id
    })
    .from(workerJobLeases)
    .innerJoin(jobs, eq(workerJobLeases.jobId, jobs.id))
    .innerJoin(runs, eq(workerJobLeases.runId, runs.id))
    .innerJoin(attempts, eq(workerJobLeases.attemptId, attempts.id))
    .where(
      and(
        eq(jobs.state, "claimed"),
        eq(attempts.state, "prepared"),
        or(eq(runs.state, "queued"), eq(runs.state, "running")),
        lte(workerJobLeases.leaseExpiresAt, now),
        isNull(workerJobLeases.revokedAt)
      )
    );

  if (staleLeases.length === 0) {
    return;
  }

  const leaseRowIds = staleLeases.map((lease) => lease.leaseRowId);
  const revokedLeases = await tx
    .update(workerJobLeases)
    .set({
      revokedAt: now,
      updatedAt: now
    })
    .where(
      and(
        inArray(workerJobLeases.id, leaseRowIds),
        lte(workerJobLeases.leaseExpiresAt, now),
        isNull(workerJobLeases.revokedAt)
      )
    )
    .returning({
      jobRowId: workerJobLeases.jobId
    });

  if (revokedLeases.length === 0) {
    return;
  }

  const revokedJobRowIds = revokedLeases.map((lease) => lease.jobRowId);

  const requeuedJobs = await tx
    .update(jobs)
    .set({
      state: "queued",
      updatedAt: now
    })
    .where(and(inArray(jobs.id, revokedJobRowIds), eq(jobs.state, "claimed")))
    .returning({
      runRowId: jobs.runId
    });

  if (requeuedJobs.length === 0) {
    return;
  }

  const runRowIds = [...new Set(requeuedJobs.map((job) => job.runRowId))];

  await tx
    .update(runs)
    .set({
      state: "queued",
      updatedAt: now
    })
    .where(and(inArray(runs.id, runRowIds), eq(runs.state, "running")));
}

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
        jobToken,
        jobRowId: lease.jobRowId,
        jobState: lease.jobState,
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
        const now = new Date();
        await requeueExpiredUnstartedLeases(tx, now);
        const candidate = await selectNextClaimCandidate(tx);

        if (!candidate) {
          return buildIdleClaimResponse();
        }

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
      if (request.jobId !== authContext.jobId) {
        throw new InternalWorkerControlError({
          code: "worker_job_id_mismatch",
          issues: [{ message: "Path jobId does not match heartbeat payload.", path: "jobId" }],
          statusCode: 400
        });
      }

      if (request.attemptId !== authContext.attemptId) {
        throw new InternalWorkerControlError({
          code: "worker_attempt_id_mismatch",
          issues: [{ message: "Heartbeat payload attemptId does not match the active lease.", path: "attemptId" }],
          statusCode: 409
        });
      }

      if (request.leaseId !== authContext.leaseId) {
        throw new InternalWorkerControlError({
          code: "worker_lease_id_mismatch",
          issues: [{ message: "Heartbeat payload leaseId does not match the active lease.", path: "leaseId" }],
          statusCode: 409
        });
      }

      return db.transaction(async (tx) => {
        const [lease] = await tx
          .select({
            attemptState: attempts.state,
            heartbeatTimeoutSeconds: workerJobLeases.heartbeatTimeoutSeconds,
            jobState: jobs.state,
            lastEventSequence: workerJobLeases.lastEventSequence,
            leaseExpiresAt: workerJobLeases.leaseExpiresAt,
            revokedAt: workerJobLeases.revokedAt,
            runState: runs.state
          })
          .from(workerJobLeases)
          .innerJoin(jobs, eq(workerJobLeases.jobId, jobs.id))
          .innerJoin(runs, eq(workerJobLeases.runId, runs.id))
          .innerJoin(attempts, eq(workerJobLeases.attemptId, attempts.id))
          .where(eq(workerJobLeases.id, authContext.leaseRowId))
          .limit(1);

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

        if (
          lease.revokedAt ||
          lease.leaseExpiresAt.getTime() <= now.getTime()
        ) {
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

        await tx
          .update(workerJobLeases)
          .set({
            jobTokenExpiresAt: nextJobTokenExpiresAt,
            lastEventSequence: acknowledgedEventSequence,
            lastHeartbeatAt: now,
            leaseExpiresAt: nextLeaseExpiresAt,
            updatedAt: now
          })
          .where(eq(workerJobLeases.id, authContext.leaseRowId));

        if (lease.jobState === "claimed") {
          await tx
            .update(jobs)
            .set({
              state: "running",
              updatedAt: now
            })
            .where(eq(jobs.id, authContext.jobRowId));
        }

        if (lease.attemptState === "prepared") {
          await tx
            .update(attempts)
            .set({
              state: "active",
              updatedAt: now
            })
            .where(eq(attempts.id, authContext.attemptRowId));
        }

        if (lease.runState === "queued") {
          await tx
            .update(runs)
            .set({
              state: "running",
              updatedAt: now
            })
            .where(eq(runs.id, authContext.runRowId));
        }

        return {
          acknowledgedEventSequence,
          cancelRequested: false,
          jobToken: authContext.jobToken,
          jobTokenExpiresAt: nextJobTokenExpiresAt.toISOString(),
          leaseExpiresAt: nextLeaseExpiresAt.toISOString(),
          leaseStatus: "active"
        } satisfies WorkerHeartbeatResponse;
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
