import {
  portalLaunchViewResponseSchema,
  portalRunDetailResponseSchema,
  portalRunListResponseSchema,
  portalWorkersViewResponseSchema
} from "../schemas/portal-benchmark-ops.js";

export const portalBenchmarkOperationsContract = {
  launchViewResponse: portalLaunchViewResponseSchema,
  runDetailResponse: portalRunDetailResponseSchema,
  runListResponse: portalRunListResponseSchema,
  workersViewResponse: portalWorkersViewResponseSchema
};
