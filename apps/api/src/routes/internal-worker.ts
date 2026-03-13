import { timingSafeEqual } from "node:crypto";
import type {
  WorkerClaimRequest,
  WorkerClaimResponse,
  WorkerHeartbeatRequest,
  WorkerHeartbeatResponse
} from "@paretoproof/shared";
import {
  workerClaimRequestSchema,
  workerHeartbeatRequestSchema
} from "@paretoproof/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ApiRuntimeEnv } from "../config/runtime.js";
import {
  createInternalWorkerControlService,
  InternalWorkerControlError,
  readBearerToken,
  type InternalWorkerJobAuthContext
} from "../lib/internal-worker-control.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";

function zodIssuesToResponse(issues: Array<{ message: string; path: (string | number)[] }>) {
  return issues.map((issue) => ({
    message: issue.message,
    path: issue.path.join(".")
  }));
}

function hasMatchingBootstrapToken(providedToken: string | null, expectedToken: string) {
  if (!providedToken) {
    return false;
  }

  const providedBuffer = Buffer.from(providedToken);
  const expectedBuffer = Buffer.from(expectedToken);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function replyWithInternalWorkerError(
  reply: FastifyReply,
  error: InternalWorkerControlError
) {
  reply.code(error.statusCode).send({
    error: error.code,
    issues: error.issues
  });
}

export function registerInternalWorkerRoutes(
  app: FastifyInstance,
  db: ReturnTypeOfCreateDbClient,
  runtimeEnv: ApiRuntimeEnv,
  options?: {
    authenticateWorkerJob?: (
      jobId: string,
      jobToken: string
    ) => Promise<InternalWorkerJobAuthContext | null>;
    claimWorker?: (request: WorkerClaimRequest) => Promise<WorkerClaimResponse>;
    heartbeatWorker?: (
      request: WorkerHeartbeatRequest,
      authContext: InternalWorkerJobAuthContext
    ) => Promise<WorkerHeartbeatResponse>;
  }
) {
  const internalWorkerControl =
    options?.claimWorker && options?.heartbeatWorker && options?.authenticateWorkerJob
      ? null
      : createInternalWorkerControlService(db);
  const claimWorker = options?.claimWorker ?? internalWorkerControl!.claim;
  const heartbeatWorker = options?.heartbeatWorker ?? internalWorkerControl!.heartbeat;
  const authenticateWorkerJob =
    options?.authenticateWorkerJob ?? internalWorkerControl!.authenticateJobToken;

  app.post("/internal/worker/claims", async (request, reply) => {
    const bootstrapToken = readBearerToken(
      typeof request.headers.authorization === "string"
        ? request.headers.authorization
        : undefined
    );

    if (!hasMatchingBootstrapToken(bootstrapToken, runtimeEnv.workerBootstrapToken)) {
      reply.code(401).send({
        error: "invalid_worker_bootstrap_token"
      });
      return;
    }

    const parsedBody = workerClaimRequestSchema.safeParse(request.body ?? {});

    if (!parsedBody.success) {
      reply.code(400).send({
        error: "invalid_worker_claim_payload",
        issues: zodIssuesToResponse(parsedBody.error.issues)
      });
      return;
    }

    reply.send(await claimWorker(parsedBody.data));
  });

  app.post("/internal/worker/jobs/:jobId/heartbeat", async (request, reply) => {
    const parsedBody = workerHeartbeatRequestSchema.safeParse(request.body ?? {});

    if (!parsedBody.success) {
      reply.code(400).send({
        error: "invalid_worker_heartbeat_payload",
        issues: zodIssuesToResponse(parsedBody.error.issues)
      });
      return;
    }

    const routeJobId =
      typeof (request.params as { jobId?: string } | undefined)?.jobId === "string"
        ? (request.params as { jobId: string }).jobId
        : null;

    if (!routeJobId) {
      reply.code(400).send({
        error: "worker_job_id_required"
      });
      return;
    }

    if (routeJobId !== parsedBody.data.jobId) {
      reply.code(400).send({
        error: "worker_job_id_mismatch"
      });
      return;
    }

    const jobToken = readBearerToken(
      typeof request.headers.authorization === "string"
        ? request.headers.authorization
        : undefined
    );

    if (!jobToken) {
      reply.code(401).send({
        error: "invalid_worker_job_token"
      });
      return;
    }

    const authContext = await authenticateWorkerJob(routeJobId, jobToken);

    if (!authContext) {
      reply.code(401).send({
        error: "invalid_worker_job_token"
      });
      return;
    }

    try {
      reply.send(await heartbeatWorker(parsedBody.data, authContext));
    } catch (error) {
      if (error instanceof InternalWorkerControlError) {
        replyWithInternalWorkerError(reply, error);
        return;
      }

      throw error;
    }
  });
}
