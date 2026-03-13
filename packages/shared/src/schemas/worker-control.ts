import { z } from "zod";
import { runKindSchema } from "./run-control.js";

const timestampSchema = z.string().min(1);
const sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/i);
const recordValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(recordValueSchema),
    z.record(z.string(), recordValueSchema)
  ])
);
const metadataSchema = z.record(z.string(), recordValueSchema);

export const workerControlEndpointIdSchema = z.enum([
  "internal.worker.claim",
  "internal.worker.heartbeat",
  "internal.worker.event.report",
  "internal.worker.artifact-manifest.submit",
  "internal.worker.result.submit",
  "internal.worker.failure.submit"
]);

export const workerExecutionEventTypeSchema = z.enum([
  "started",
  "progress",
  "warning",
  "log",
  "checkpoint"
]);

export const workerTerminalFailureCodeSchema = z.enum([
  "runtime_error",
  "harness_error",
  "model_provider_error",
  "artifact_error",
  "lease_lost",
  "cancelled"
]);

export const workerLeaseStatusSchema = z.enum([
  "active",
  "cancel_requested",
  "expired"
]);

export const workerRunTargetSchema = z.discriminatedUnion("runKind", [
  z.object({
    benchmarkVersionId: z.string().min(1),
    modelConfigId: z.string().min(1),
    runKind: z.literal("full_benchmark")
  }),
  z.object({
    benchmarkVersionId: z.string().min(1),
    modelConfigId: z.string().min(1),
    runKind: z.literal("benchmark_slice"),
    sliceDefinition: z.string().min(1)
  }),
  z.object({
    benchmarkItemId: z.string().min(1),
    modelConfigId: z.string().min(1),
    runKind: z.literal("single_run")
  }),
  z.object({
    benchmarkTargetId: z.string().min(1),
    modelConfigId: z.string().min(1),
    repeatCount: z.number().int().positive(),
    runKind: z.literal("repeated_n")
  })
]);

export const workerClaimRequestSchema = z.object({
  activeJobCount: z.number().int().min(0),
  availableRunKinds: z.array(runKindSchema),
  maxConcurrentJobs: z.number().int().positive(),
  supportsArtifactUploads: z.boolean(),
  supportsTraceUploads: z.boolean(),
  workerId: z.string().min(1),
  workerPool: z.string().min(1),
  workerRuntime: z.enum(["local_docker", "modal"]),
  workerVersion: z.string().min(1)
});

export const workerClaimResponseSchema = z.union([
  z.object({
    leaseStatus: z.literal("idle"),
    pollAfterSeconds: z.number().int().min(0),
    workerJob: z.null()
  }),
  z.object({
    leaseStatus: z.literal("active"),
    pollAfterSeconds: z.number().int().min(0),
    workerJob: z.object({
      attemptId: z.string().min(1),
      heartbeatIntervalSeconds: z.number().int().positive(),
      jobId: z.string().min(1),
      leaseId: z.string().min(1),
      jobToken: z.string().min(1),
      jobTokenExpiresAt: timestampSchema,
      leaseExpiresAt: timestampSchema,
      runId: z.string().min(1),
      target: workerRunTargetSchema
    })
  })
]);

export const workerHeartbeatRequestSchema = z.object({
  attemptId: z.string().min(1),
  jobId: z.string().min(1),
  leaseId: z.string().min(1),
  observedAt: timestampSchema,
  progressMessage: z.string().min(1).nullable()
});

export const workerHeartbeatResponseSchema = z.object({
  jobToken: z.string().min(1).nullable(),
  jobTokenExpiresAt: timestampSchema.nullable(),
  leaseExpiresAt: timestampSchema.nullable(),
  leaseStatus: workerLeaseStatusSchema
});

export const workerExecutionEventSchema = z.object({
  attemptId: z.string().min(1),
  details: metadataSchema,
  eventType: workerExecutionEventTypeSchema,
  jobId: z.string().min(1),
  leaseId: z.string().min(1),
  message: z.string().min(1),
  recordedAt: timestampSchema,
  sequence: z.number().int().nonnegative()
});

export const workerArtifactManifestEntrySchema = z.object({
  artifactClassId: z.string().min(1),
  byteSize: z.number().int().nonnegative().nullable(),
  contentEncoding: z.string().min(1).nullable(),
  fileName: z.string().min(1),
  mediaType: z.string().min(1).nullable(),
  relativePath: z.string().min(1),
  sha256: sha256Schema.nullable()
});

export const workerArtifactManifestRequestSchema = z.object({
  artifacts: z.array(workerArtifactManifestEntrySchema).min(1),
  attemptId: z.string().min(1),
  jobId: z.string().min(1),
  leaseId: z.string().min(1),
  recordedAt: timestampSchema
});

export const workerArtifactManifestResponseSchema = z.object({
  acceptedAt: timestampSchema,
  artifacts: z.array(
    z.object({
      artifactClassId: z.string().min(1),
      artifactId: z.string().min(1),
      relativePath: z.string().min(1)
    })
  )
});

export const workerResultMessageRequestSchema = z.object({
  attemptId: z.string().min(1),
  completedAt: timestampSchema,
  jobId: z.string().min(1),
  leaseId: z.string().min(1),
  resultArtifacts: z.array(z.string().min(1)),
  resultData: metadataSchema,
  status: z.literal("succeeded"),
  summary: z.string().min(1)
});

export const workerTerminalFailureRequestSchema = z.object({
  attemptId: z.string().min(1),
  code: workerTerminalFailureCodeSchema,
  details: metadataSchema,
  failedAt: timestampSchema,
  jobId: z.string().min(1),
  leaseId: z.string().min(1),
  message: z.string().min(1)
});

export const workerExecutionEventCatalogEntrySchema = z.object({
  id: workerExecutionEventTypeSchema,
  purpose: z.string()
});

export const workerTerminalFailureCatalogEntrySchema = z.object({
  id: workerTerminalFailureCodeSchema,
  purpose: z.string()
});
