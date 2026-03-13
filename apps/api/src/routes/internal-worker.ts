import { timingSafeEqual } from "node:crypto";
import type {
  WorkerArtifactManifestRequest,
  WorkerArtifactManifestResponse,
  WorkerClaimRequest,
  WorkerClaimResponse,
  WorkerExecutionEvent,
  WorkerExecutionEventResponse,
  WorkerHeartbeatRequest,
  WorkerHeartbeatResponse,
  WorkerResultMessageRequest,
  WorkerResultMessageResponse,
  WorkerTerminalFailureRequest,
  WorkerTerminalFailureResponse
} from "@paretoproof/shared";
import {
  workerArtifactManifestRequestSchema,
  workerClaimRequestSchema,
  workerExecutionEventSchema,
  workerHeartbeatRequestSchema,
  workerResultMessageRequestSchema,
  workerTerminalFailureRequestSchema
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

function readRouteJobId(request: {
  params?: { jobId?: string };
}) {
  return typeof request.params?.jobId === "string" ? request.params.jobId : null;
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
    eventWorker?: (
      request: WorkerExecutionEvent,
      authContext: InternalWorkerJobAuthContext
    ) => Promise<WorkerExecutionEventResponse>;
    artifactManifestWorker?: (
      request: WorkerArtifactManifestRequest,
      authContext: InternalWorkerJobAuthContext
    ) => Promise<WorkerArtifactManifestResponse>;
    heartbeatWorker?: (
      request: WorkerHeartbeatRequest,
      authContext: InternalWorkerJobAuthContext
    ) => Promise<WorkerHeartbeatResponse>;
    resultWorker?: (
      request: WorkerResultMessageRequest,
      authContext: InternalWorkerJobAuthContext
    ) => Promise<WorkerResultMessageResponse>;
    failureWorker?: (
      request: WorkerTerminalFailureRequest,
      authContext: InternalWorkerJobAuthContext
    ) => Promise<WorkerTerminalFailureResponse>;
  }
) {
  const internalWorkerControl = createInternalWorkerControlService(db);
  const claimWorker = options?.claimWorker ?? internalWorkerControl!.claim;
  const eventWorker = options?.eventWorker ?? internalWorkerControl!.reportEvent;
  const artifactManifestWorker =
    options?.artifactManifestWorker ?? internalWorkerControl!.submitArtifactManifest;
  const heartbeatWorker = options?.heartbeatWorker ?? internalWorkerControl!.heartbeat;
  const resultWorker = options?.resultWorker ?? internalWorkerControl!.submitResult;
  const failureWorker = options?.failureWorker ?? internalWorkerControl!.submitFailure;
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

    const routeJobId = readRouteJobId(request as { params?: { jobId?: string } });

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

  app.post("/internal/worker/jobs/:jobId/events", async (request, reply) => {
    const parsedBody = workerExecutionEventSchema.safeParse(request.body ?? {});

    if (!parsedBody.success) {
      reply.code(400).send({
        error: "invalid_worker_event_payload",
        issues: zodIssuesToResponse(parsedBody.error.issues)
      });
      return;
    }

    const routeJobId = readRouteJobId(request as { params?: { jobId?: string } });

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
      reply.send(await eventWorker(parsedBody.data, authContext));
    } catch (error) {
      if (error instanceof InternalWorkerControlError) {
        replyWithInternalWorkerError(reply, error);
        return;
      }

      throw error;
    }
  });

  app.post("/internal/worker/jobs/:jobId/artifacts", async (request, reply) => {
    const parsedBody = workerArtifactManifestRequestSchema.safeParse(request.body ?? {});

    if (!parsedBody.success) {
      reply.code(400).send({
        error: "invalid_worker_artifact_manifest_payload",
        issues: zodIssuesToResponse(parsedBody.error.issues)
      });
      return;
    }

    const routeJobId = readRouteJobId(request as { params?: { jobId?: string } });

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
      reply.send(await artifactManifestWorker(parsedBody.data, authContext));
    } catch (error) {
      if (error instanceof InternalWorkerControlError) {
        replyWithInternalWorkerError(reply, error);
        return;
      }

      throw error;
    }
  });

  app.post("/internal/worker/jobs/:jobId/result", async (request, reply) => {
    const parsedBody = workerResultMessageRequestSchema.safeParse(request.body ?? {});

    if (!parsedBody.success) {
      reply.code(400).send({
        error: "invalid_worker_result_payload",
        issues: zodIssuesToResponse(parsedBody.error.issues)
      });
      return;
    }

    const routeJobId = readRouteJobId(request as { params?: { jobId?: string } });

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
      reply.send(await resultWorker(parsedBody.data, authContext));
    } catch (error) {
      if (error instanceof InternalWorkerControlError) {
        replyWithInternalWorkerError(reply, error);
        return;
      }

      throw error;
    }
  });

  app.post("/internal/worker/jobs/:jobId/failure", async (request, reply) => {
    const parsedBody = workerTerminalFailureRequestSchema.safeParse(request.body ?? {});

    if (!parsedBody.success) {
      reply.code(400).send({
        error: "invalid_worker_failure_payload",
        issues: zodIssuesToResponse(parsedBody.error.issues)
      });
      return;
    }

    const routeJobId = readRouteJobId(request as { params?: { jobId?: string } });

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
      reply.send(await failureWorker(parsedBody.data, authContext));
    } catch (error) {
      if (error instanceof InternalWorkerControlError) {
        replyWithInternalWorkerError(reply, error);
        return;
      }

      throw error;
    }
  });
}
