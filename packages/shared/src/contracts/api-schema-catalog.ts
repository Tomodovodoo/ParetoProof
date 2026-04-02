import {
  portalAccessRecoveryInputSchema,
  portalAccessRequestInputSchema,
  portalAccessRequestReadResponseSchema,
  portalAccessRequestSummaryResponseSchema,
  portalAdminAccessRequestApproveInputSchema,
  portalAdminAccessRequestRejectInputSchema
} from "../schemas/access-request.js";
import { healthResponseSchema } from "../schemas/health.js";
import { harnessRegistryCatalogSchema } from "../schemas/harness-registry.js";
import {
  adminBenchmarkReleaseCreateInputSchema,
  adminBenchmarkVersionCreateInputSchema,
  adminBenchmarkVersionLaunchabilityUpdateInputSchema,
  adminBenchmarkWorkflowActionInputSchema,
  adminPackageFreezeCreateInputSchema,
  adminRepoSyncRecordCreateInputSchema,
  adminRepoSyncRecordStatusUpdateInputSchema,
  benchmarkReleaseDetailResponseSchema,
  benchmarkReleaseListResponseSchema,
  benchmarkReleaseParamsSchema,
  benchmarkVersionDetailResponseSchema,
  benchmarkVersionListResponseSchema,
  benchmarkVersionParamsSchema,
  packageFreezeDetailResponseSchema,
  packageFreezeListResponseSchema,
  packageFreezeParamsSchema,
  repoSyncRecordDetailResponseSchema,
  repoSyncRecordListResponseSchema,
  repoSyncRecordParamsSchema
} from "../schemas/benchmark-workflow.js";
import {
  portalAdminAccessRequestParamsSchema,
  portalAdminAccessRequestDetailResponseSchema,
  portalAdminAccessRequestListResponseSchema,
  portalAdminUserParamsSchema,
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
  problem9OfflineIngestRequestSchema,
  problem9OfflineIngestResponseSchema
} from "../schemas/problem9-offline-ingest.js";
import {
  portalProfileLinkIntentInputSchema,
  portalProfileLinkIntentResponseSchema,
  portalProfileResponseSchema,
  portalSessionRedirectInputSchema,
  portalSessionRedirectRequestBodySchema,
  portalProfileUpdateInputSchema
} from "../schemas/profile.js";
import type { ApiEndpointId } from "./api-catalog.js";
import {
  workerArtifactManifestRequestSchema,
  workerArtifactManifestResponseSchema,
  workerClaimRequestSchema,
  workerClaimResponseSchema,
  workerExecutionEventResponseSchema,
  workerExecutionEventSchema,
  workerHeartbeatRequestSchema,
  workerHeartbeatResponseSchema,
  workerJobParamsSchema,
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
    requestQuery: portalSessionRedirectInputSchema,
    responseBody: null
  },
  "portal.session.retry.finalize": {
    requestBody: null,
    requestParams: null,
    requestQuery: portalSessionRedirectInputSchema,
    responseBody: null
  },
  "portal.session.finalize.read": {
    requestBody: null,
    requestParams: null,
    requestQuery: portalSessionRedirectInputSchema,
    responseBody: null
  },
  "portal.session.complete.submit": {
    requestBody: portalSessionRedirectRequestBodySchema,
    requestParams: null,
    requestQuery: portalSessionRedirectInputSchema,
    responseBody: null
  },
  "portal.session.finalize.submit": {
    requestBody: portalSessionRedirectRequestBodySchema,
    requestParams: null,
    requestQuery: portalSessionRedirectInputSchema,
    responseBody: null
  },
  "portal.session.complete": {
    requestBody: portalSessionRedirectRequestBodySchema,
    requestParams: null,
    requestQuery: portalSessionRedirectInputSchema,
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
  "portal.benchmarks.list": {
    requestBody: null,
    requestParams: null,
    requestQuery: null,
    responseBody: portalBenchmarksListResponseSchema
  },
  "portal.benchmark-dataset.read": {
    requestBody: null,
    requestParams: portalBenchmarkDatasetParamsSchema,
    requestQuery: null,
    responseBody: portalBenchmarkDatasetResponseSchema
  },
  "portal.benchmark-export.read": {
    requestBody: null,
    requestParams: portalBenchmarkDatasetParamsSchema,
    requestQuery: portalBenchmarkExportQuerySchema,
    responseBody: null
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
  "portal.harnesses.read": {
    requestBody: null,
    requestParams: null,
    requestQuery: null,
    responseBody: harnessRegistryCatalogSchema
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
    requestParams: portalAdminAccessRequestParamsSchema,
    requestQuery: null,
    responseBody: portalAdminAccessRequestDetailResponseSchema
  },
  "admin.access-request.approve": {
    requestBody: portalAdminAccessRequestApproveInputSchema,
    requestParams: portalAdminAccessRequestParamsSchema,
    requestQuery: null,
    responseBody: portalAccessRequestSummaryResponseSchema
  },
  "admin.access-request.reject": {
    requestBody: portalAdminAccessRequestRejectInputSchema,
    requestParams: portalAdminAccessRequestParamsSchema,
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
    requestParams: portalAdminUserParamsSchema,
    requestQuery: null,
    responseBody: portalAdminUserDetailResponseSchema
  },
  "admin.user.revoke": {
    requestBody: portalAdminUserRevokeInputSchema,
    requestParams: portalAdminUserParamsSchema,
    requestQuery: null,
    responseBody: portalAdminUserDetailResponseSchema
  },
  "admin.repo-sync-record.create": {
    requestBody: adminRepoSyncRecordCreateInputSchema,
    requestParams: null,
    requestQuery: null,
    responseBody: repoSyncRecordDetailResponseSchema
  },
  "admin.repo-sync-record.list": {
    requestBody: null,
    requestParams: null,
    requestQuery: null,
    responseBody: repoSyncRecordListResponseSchema
  },
  "admin.repo-sync-record.detail": {
    requestBody: null,
    requestParams: repoSyncRecordParamsSchema,
    requestQuery: null,
    responseBody: repoSyncRecordDetailResponseSchema
  },
  "admin.repo-sync-record.status.update": {
    requestBody: adminRepoSyncRecordStatusUpdateInputSchema,
    requestParams: repoSyncRecordParamsSchema,
    requestQuery: null,
    responseBody: repoSyncRecordDetailResponseSchema
  },
  "admin.package-freeze.create": {
    requestBody: adminPackageFreezeCreateInputSchema,
    requestParams: null,
    requestQuery: null,
    responseBody: packageFreezeDetailResponseSchema
  },
  "admin.package-freeze.list": {
    requestBody: null,
    requestParams: null,
    requestQuery: null,
    responseBody: packageFreezeListResponseSchema
  },
  "admin.package-freeze.detail": {
    requestBody: null,
    requestParams: packageFreezeParamsSchema,
    requestQuery: null,
    responseBody: packageFreezeDetailResponseSchema
  },
  "admin.benchmark-version.create": {
    requestBody: adminBenchmarkVersionCreateInputSchema,
    requestParams: packageFreezeParamsSchema,
    requestQuery: null,
    responseBody: benchmarkVersionDetailResponseSchema
  },
  "admin.benchmark-version.list": {
    requestBody: null,
    requestParams: null,
    requestQuery: null,
    responseBody: benchmarkVersionListResponseSchema
  },
  "admin.benchmark-version.detail": {
    requestBody: null,
    requestParams: benchmarkVersionParamsSchema,
    requestQuery: null,
    responseBody: benchmarkVersionDetailResponseSchema
  },
  "admin.benchmark-version.launchability.update": {
    requestBody: adminBenchmarkVersionLaunchabilityUpdateInputSchema,
    requestParams: benchmarkVersionParamsSchema,
    requestQuery: null,
    responseBody: benchmarkVersionDetailResponseSchema
  },
  "admin.benchmark-release.create": {
    requestBody: adminBenchmarkReleaseCreateInputSchema,
    requestParams: benchmarkVersionParamsSchema,
    requestQuery: null,
    responseBody: benchmarkReleaseDetailResponseSchema
  },
  "admin.benchmark-release.list": {
    requestBody: null,
    requestParams: null,
    requestQuery: null,
    responseBody: benchmarkReleaseListResponseSchema
  },
  "admin.benchmark-release.detail": {
    requestBody: null,
    requestParams: benchmarkReleaseParamsSchema,
    requestQuery: null,
    responseBody: benchmarkReleaseDetailResponseSchema
  },
  "admin.benchmark-release.approve": {
    requestBody: adminBenchmarkWorkflowActionInputSchema,
    requestParams: benchmarkReleaseParamsSchema,
    requestQuery: null,
    responseBody: benchmarkReleaseDetailResponseSchema
  },
  "admin.benchmark-release.publish": {
    requestBody: adminBenchmarkWorkflowActionInputSchema,
    requestParams: benchmarkReleaseParamsSchema,
    requestQuery: null,
    responseBody: benchmarkReleaseDetailResponseSchema
  },
  "internal.worker.claim": {
    requestBody: workerClaimRequestSchema,
    requestParams: null,
    requestQuery: null,
    responseBody: workerClaimResponseSchema
  },
  "internal.worker.heartbeat": {
    requestBody: workerHeartbeatRequestSchema,
    requestParams: workerJobParamsSchema,
    requestQuery: null,
    responseBody: workerHeartbeatResponseSchema
  },
  "internal.worker.event.report": {
    requestBody: workerExecutionEventSchema,
    requestParams: workerJobParamsSchema,
    requestQuery: null,
    responseBody: workerExecutionEventResponseSchema
  },
  "internal.worker.artifact-manifest.submit": {
    requestBody: workerArtifactManifestRequestSchema,
    requestParams: workerJobParamsSchema,
    requestQuery: null,
    responseBody: workerArtifactManifestResponseSchema
  },
  "internal.worker.result.submit": {
    requestBody: workerResultMessageRequestSchema,
    requestParams: workerJobParamsSchema,
    requestQuery: null,
    responseBody: workerResultMessageResponseSchema
  },
  "internal.worker.failure.submit": {
    requestBody: workerTerminalFailureRequestSchema,
    requestParams: workerJobParamsSchema,
    requestQuery: null,
    responseBody: workerTerminalFailureResponseSchema
  }
} satisfies Record<ApiEndpointId, ApiEndpointSchemaCatalogEntry>;
