import {
  portalAccessRecoveryInputSchema,
  portalAccessRequestInputSchema,
  portalAccessRequestReadResponseSchema,
  portalAccessRequestSummaryResponseSchema,
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
  portalLaunchViewResponseSchema,
  portalRunDetailParamsSchema,
  portalRunDetailResponseSchema,
  portalRunsListQuerySchema,
  portalRunsListResponseSchema,
  portalWorkersViewResponseSchema
} from "../schemas/portal-benchmark-ops.js";
import {
  problem9OfflineIngestRequestSchema,
  problem9OfflineIngestResponseSchema
} from "../schemas/problem9-offline-ingest.js";
import {
  portalProfileLinkIntentInputSchema,
  portalProfileLinkIntentResponseSchema,
  portalProfileResponseSchema,
  portalProfileUpdateInputSchema
} from "../schemas/profile.js";
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
import type { ApiEndpointSchemaCatalogEntry } from "../types/api-schema-catalog.js";

export const apiEndpointSchemaCatalog = {
  "health.read": {
    requestBody: null,
    requestParams: null,
    requestQuery: null,
    responseBody: healthResponseSchema
  },
  "portal.me.read": {
    requestBody: null,
    requestParams: null,
    requestQuery: null,
    responseBody: null
  },
  "portal.session.retry.complete": {
    requestBody: null,
    requestParams: null,
    requestQuery: null,
    responseBody: null
  },
  "portal.session.retry.finalize": {
    requestBody: null,
    requestParams: null,
    requestQuery: null,
    responseBody: null
  },
  "portal.session.complete": {
    requestBody: null,
    requestParams: null,
    requestQuery: null,
    responseBody: null
  },
  "portal.access-request.create": {
    requestBody: portalAccessRequestInputSchema,
    requestParams: null,
    requestQuery: null,
    responseBody: portalAccessRequestSummaryResponseSchema
  },
  "portal.access-request.read": {
    requestBody: null,
    requestParams: null,
    requestQuery: null,
    responseBody: portalAccessRequestReadResponseSchema
  },
  "portal.access-recovery.create": {
    requestBody: portalAccessRecoveryInputSchema,
    requestParams: null,
    requestQuery: null,
    responseBody: portalAccessRequestSummaryResponseSchema
  },
  "portal.profile.read": {
    requestBody: null,
    requestParams: null,
    requestQuery: null,
    responseBody: portalProfileResponseSchema
  },
  "portal.runs.list": {
    requestBody: null,
    requestParams: null,
    requestQuery: portalRunsListQuerySchema,
    responseBody: portalRunsListResponseSchema
  },
  "portal.run-detail.read": {
    requestBody: null,
    requestParams: portalRunDetailParamsSchema,
    requestQuery: null,
    responseBody: portalRunDetailResponseSchema
  },
  "portal.launch.read": {
    requestBody: null,
    requestParams: null,
    requestQuery: null,
    responseBody: portalLaunchViewResponseSchema
  },
  "portal.workers.read": {
    requestBody: null,
    requestParams: null,
    requestQuery: null,
    responseBody: portalWorkersViewResponseSchema
  },
  "portal.profile.update": {
    requestBody: portalProfileUpdateInputSchema,
    requestParams: null,
    requestQuery: null,
    responseBody: portalProfileResponseSchema
  },
  "portal.profile.link-intent.create": {
    requestBody: portalProfileLinkIntentInputSchema,
    requestParams: null,
    requestQuery: null,
    responseBody: portalProfileLinkIntentResponseSchema
  },
  "admin.problem9-offline-ingest.create": {
    requestBody: problem9OfflineIngestRequestSchema,
    requestParams: null,
    requestQuery: null,
    responseBody: problem9OfflineIngestResponseSchema
  },
  "admin.access-request.list": {
    requestBody: null,
    requestParams: null,
    requestQuery: null,
    responseBody: portalAdminAccessRequestListResponseSchema
  },
  "admin.access-request.detail": {
    requestBody: null,
    requestParams: null,
    requestQuery: null,
    responseBody: portalAdminAccessRequestDetailResponseSchema
  },
  "admin.access-request.approve": {
    requestBody: portalAdminAccessRequestApproveInputSchema,
    requestParams: null,
    requestQuery: null,
    responseBody: portalAccessRequestSummaryResponseSchema
  },
  "admin.access-request.reject": {
    requestBody: portalAdminAccessRequestRejectInputSchema,
    requestParams: null,
    requestQuery: null,
    responseBody: portalAccessRequestSummaryResponseSchema
  },
  "admin.user.list": {
    requestBody: null,
    requestParams: null,
    requestQuery: null,
    responseBody: portalAdminUserListResponseSchema
  },
  "admin.user.detail": {
    requestBody: null,
    requestParams: null,
    requestQuery: null,
    responseBody: portalAdminUserDetailResponseSchema
  },
  "admin.user.revoke": {
    requestBody: portalAdminUserRevokeInputSchema,
    requestParams: null,
    requestQuery: null,
    responseBody: portalAdminUserDetailResponseSchema
  },
  "internal.worker.claim": {
    requestBody: workerClaimRequestSchema,
    requestParams: null,
    requestQuery: null,
    responseBody: workerClaimResponseSchema
  },
  "internal.worker.heartbeat": {
    requestBody: workerHeartbeatRequestSchema,
    requestParams: null,
    requestQuery: null,
    responseBody: workerHeartbeatResponseSchema
  },
  "internal.worker.event.report": {
    requestBody: workerExecutionEventSchema,
    requestParams: null,
    requestQuery: null,
    responseBody: workerExecutionEventResponseSchema
  },
  "internal.worker.artifact-manifest.submit": {
    requestBody: workerArtifactManifestRequestSchema,
    requestParams: null,
    requestQuery: null,
    responseBody: workerArtifactManifestResponseSchema
  },
  "internal.worker.result.submit": {
    requestBody: workerResultMessageRequestSchema,
    requestParams: null,
    requestQuery: null,
    responseBody: workerResultMessageResponseSchema
  },
  "internal.worker.failure.submit": {
    requestBody: workerTerminalFailureRequestSchema,
    requestParams: null,
    requestQuery: null,
    responseBody: workerTerminalFailureResponseSchema
  }
} satisfies Record<string, ApiEndpointSchemaCatalogEntry>;
