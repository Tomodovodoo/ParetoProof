import {
  adminBenchmarkReleaseCreateInputSchema,
  adminBenchmarkVersionCreateInputSchema,
  adminBenchmarkVersionLaunchabilityUpdateInputSchema,
  adminBenchmarkWorkflowActionInputSchema,
  adminPackageFreezeCreateInputSchema,
  benchmarkReleaseParamsSchema,
  benchmarkVersionParamsSchema,
  packageFreezeParamsSchema,
  repoSyncRecordParamsSchema,
  adminRepoSyncRecordCreateInputSchema,
  adminRepoSyncRecordStatusUpdateInputSchema,
  benchmarkReleaseDetailResponseSchema,
  benchmarkReleaseListResponseSchema,
  benchmarkVersionDetailResponseSchema,
  benchmarkVersionListResponseSchema,
  packageFreezeDetailResponseSchema,
  packageFreezeListResponseSchema,
  repoSyncRecordDetailResponseSchema,
  repoSyncRecordListResponseSchema
} from "../schemas/benchmark-workflow.js";

export const benchmarkWorkflowContract = {
  adminBenchmarkReleaseCreateInput: adminBenchmarkReleaseCreateInputSchema,
  adminBenchmarkReleaseDetailResponse: benchmarkReleaseDetailResponseSchema,
  adminBenchmarkReleaseListResponse: benchmarkReleaseListResponseSchema,
  adminBenchmarkVersionCreateInput: adminBenchmarkVersionCreateInputSchema,
  adminBenchmarkVersionDetailResponse: benchmarkVersionDetailResponseSchema,
  adminBenchmarkVersionLaunchabilityUpdateInput:
    adminBenchmarkVersionLaunchabilityUpdateInputSchema,
  adminBenchmarkVersionListResponse: benchmarkVersionListResponseSchema,
  benchmarkReleaseParams: benchmarkReleaseParamsSchema,
  benchmarkVersionParams: benchmarkVersionParamsSchema,
  packageFreezeParams: packageFreezeParamsSchema,
  repoSyncRecordParams: repoSyncRecordParamsSchema,
  adminBenchmarkWorkflowActionInput: adminBenchmarkWorkflowActionInputSchema,
  adminPackageFreezeCreateInput: adminPackageFreezeCreateInputSchema,
  adminPackageFreezeDetailResponse: packageFreezeDetailResponseSchema,
  adminPackageFreezeListResponse: packageFreezeListResponseSchema,
  adminRepoSyncRecordCreateInput: adminRepoSyncRecordCreateInputSchema,
  adminRepoSyncRecordDetailResponse: repoSyncRecordDetailResponseSchema,
  adminRepoSyncRecordListResponse: repoSyncRecordListResponseSchema,
  adminRepoSyncRecordStatusUpdateInput: adminRepoSyncRecordStatusUpdateInputSchema
};
