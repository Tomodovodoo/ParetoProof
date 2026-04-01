import {
  portalAccessRecoveryInputSchema,
  portalAccessRequestInputSchema,
  portalAccessRequestMutationResponseSchema,
  portalAccessRequestReadResponseSchema,
  portalAdminAccessRequestApproveInputSchema,
  portalAdminAccessRequestRejectInputSchema
} from "../schemas/access-request.js";
import { healthResponseSchema } from "../schemas/health.js";
import {
  portalAdminAccessRequestDetailResponseSchema,
  portalAdminAccessRequestListResponseSchema,
  portalAdminUserDetailResponseSchema,
  portalAdminUserListResponseSchema,
  portalAdminUserRevokeInputSchema
} from "../schemas/portal-admin.js";
import {
  portalBenchmarkDatasetParamsSchema,
  portalBenchmarkDatasetResponseSchema,
  portalBenchmarkExportQuerySchema,
  portalBenchmarksListResponseSchema,
  portalLaunchViewResponseSchema,
  portalRunDetailParamsSchema,
  portalRunDetailResponseSchema,
  portalRunsListQuerySchema,
  portalRunsListResponseSchema,
  portalWorkersViewResponseSchema
} from "../schemas/portal-benchmark-ops.js";
import {
  portalProfileLinkIntentInputSchema,
  portalProfileLinkIntentResponseSchema,
  portalProfileResponseSchema,
  portalProfileUpdateInputSchema
} from "../schemas/profile.js";
import {
  problem9OfflineIngestRequestSchema,
  problem9OfflineIngestResponseSchema
} from "../schemas/problem9-offline-ingest.js";
import {
  workerArtifactManifestRequestSchema,
  workerArtifactManifestResponseSchema,
  workerClaimRequestSchema,
  workerClaimResponseSchema,
  workerExecutionEventResponseSchema,
  workerExecutionEventSchema,
  workerHeartbeatRequestSchema,
  workerHeartbeatResponseSchema,
  workerResultMessageRequestSchema,
  workerResultMessageResponseSchema,
  workerTerminalFailureRequestSchema,
  workerTerminalFailureResponseSchema
} from "../schemas/worker-control.js";
import type { ApiEndpointSchemaContract } from "../types/api-endpoint-schema-contract.js";

// One endpoint-keyed contract registry keeps the API catalog aligned with the
// shared request/query/params/response schemas that already exist in this package.
export const apiEndpointSchemaContract = {
  "health.read": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: null,
    responseBodySchema: healthResponseSchema
  },
  "portal.me.read": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: null,
    responseBodySchema: null
  },
  "portal.session.retry.complete": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: null,
    responseBodySchema: null
  },
  "portal.session.retry.finalize": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: null,
    responseBodySchema: null
  },
  "portal.session.complete": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: null,
    responseBodySchema: null
  },
  "portal.access-request.create": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: portalAccessRequestInputSchema,
    responseBodySchema: portalAccessRequestMutationResponseSchema
  },
  "portal.access-request.read": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: null,
    responseBodySchema: portalAccessRequestReadResponseSchema
  },
  "portal.access-recovery.create": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: portalAccessRecoveryInputSchema,
    responseBodySchema: portalAccessRequestMutationResponseSchema
  },
  "portal.profile.read": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: null,
    responseBodySchema: portalProfileResponseSchema
  },
  "portal.benchmarks.list": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: null,
    responseBodySchema: portalBenchmarksListResponseSchema
  },
  "portal.benchmark-dataset.read": {
    paramsSchema: portalBenchmarkDatasetParamsSchema,
    querySchema: null,
    requestBodySchema: null,
    responseBodySchema: portalBenchmarkDatasetResponseSchema
  },
  "portal.benchmark-export.read": {
    paramsSchema: portalBenchmarkDatasetParamsSchema,
    querySchema: portalBenchmarkExportQuerySchema,
    requestBodySchema: null,
    responseBodySchema: null
  },
  "portal.runs.list": {
    paramsSchema: null,
    querySchema: portalRunsListQuerySchema,
    requestBodySchema: null,
    responseBodySchema: portalRunsListResponseSchema
  },
  "portal.run-detail.read": {
    paramsSchema: portalRunDetailParamsSchema,
    querySchema: null,
    requestBodySchema: null,
    responseBodySchema: portalRunDetailResponseSchema
  },
  "portal.launch.read": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: null,
    responseBodySchema: portalLaunchViewResponseSchema
  },
  "portal.workers.read": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: null,
    responseBodySchema: portalWorkersViewResponseSchema
  },
  "portal.profile.update": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: portalProfileUpdateInputSchema,
    responseBodySchema: portalProfileResponseSchema
  },
  "portal.profile.link-intent.create": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: portalProfileLinkIntentInputSchema,
    responseBodySchema: portalProfileLinkIntentResponseSchema
  },
  "admin.problem9-offline-ingest.create": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: problem9OfflineIngestRequestSchema,
    responseBodySchema: problem9OfflineIngestResponseSchema
  },
  "admin.access-request.list": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: null,
    responseBodySchema: portalAdminAccessRequestListResponseSchema
  },
  "admin.access-request.detail": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: null,
    responseBodySchema: portalAdminAccessRequestDetailResponseSchema
  },
  "admin.access-request.approve": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: portalAdminAccessRequestApproveInputSchema,
    responseBodySchema: portalAccessRequestMutationResponseSchema
  },
  "admin.access-request.reject": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: portalAdminAccessRequestRejectInputSchema,
    responseBodySchema: portalAccessRequestMutationResponseSchema
  },
  "admin.user.list": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: null,
    responseBodySchema: portalAdminUserListResponseSchema
  },
  "admin.user.detail": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: null,
    responseBodySchema: portalAdminUserDetailResponseSchema
  },
  "admin.user.revoke": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: portalAdminUserRevokeInputSchema,
    responseBodySchema: portalAdminUserDetailResponseSchema
  },
  "internal.worker.claim": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: workerClaimRequestSchema,
    responseBodySchema: workerClaimResponseSchema
  },
  "internal.worker.heartbeat": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: workerHeartbeatRequestSchema,
    responseBodySchema: workerHeartbeatResponseSchema
  },
  "internal.worker.event.report": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: workerExecutionEventSchema,
    responseBodySchema: workerExecutionEventResponseSchema
  },
  "internal.worker.artifact-manifest.submit": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: workerArtifactManifestRequestSchema,
    responseBodySchema: workerArtifactManifestResponseSchema
  },
  "internal.worker.result.submit": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: workerResultMessageRequestSchema,
    responseBodySchema: workerResultMessageResponseSchema
  },
  "internal.worker.failure.submit": {
    paramsSchema: null,
    querySchema: null,
    requestBodySchema: workerTerminalFailureRequestSchema,
    responseBodySchema: workerTerminalFailureResponseSchema
  }
} satisfies ApiEndpointSchemaContract;
