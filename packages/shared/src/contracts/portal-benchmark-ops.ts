import {
  portalLaunchViewResponseSchema,
  portalRunDetailResponseSchema,
  portalRunsListQuerySchema,
  portalRunsListResponseSchema,
  portalWorkersViewResponseSchema
} from "../schemas/portal-benchmark-ops.js";
import type {
  PortalRunsLifecycleBucketDefinition,
  PortalRunsSortOption
} from "../types/portal-benchmark-ops.js";

export const portalRunsLifecycleBuckets = [
  {
    description: "Created and queued runs that have not reached worker execution yet.",
    id: "pending",
    label: "Pending",
    runStates: ["created", "queued"]
  },
  {
    description: "Currently executing runs plus ones waiting for cancellation to finish.",
    id: "active",
    label: "Active",
    runStates: ["running", "cancel_requested"]
  },
  {
    description: "Runs that completed their control-plane lifecycle normally.",
    id: "terminal_success",
    label: "Terminal success",
    runStates: ["succeeded"]
  },
  {
    description: "Runs that ended with a terminal control-plane failure.",
    id: "terminal_failure",
    label: "Terminal failure",
    runStates: ["failed"]
  },
  {
    description: "Runs that ended intentionally by cancellation.",
    id: "terminal_cancelled",
    label: "Terminal cancelled",
    runStates: ["cancelled"]
  }
] satisfies PortalRunsLifecycleBucketDefinition[];

export const portalRunsSortOptions = [
  {
    description: "Newest started-at timestamp first for operational triage.",
    id: "started_at_desc",
    label: "Newest start"
  },
  {
    description: "Newest finished-at timestamp first for recent terminal outcomes.",
    id: "finished_at_desc",
    label: "Newest finish"
  },
  {
    description: "Longest duration first when isolating slow or stuck runs.",
    id: "duration_desc",
    label: "Longest duration"
  },
  {
    description: "Canonical run lifecycle id ascending for grouped state review.",
    id: "run_state_asc",
    label: "Run state"
  },
  {
    description: "Canonical verdict id ascending for released result comparisons.",
    id: "verdict_asc",
    label: "Verdict"
  }
] satisfies PortalRunsSortOption[];

// Shared contract for the portal benchmark-ops read models consumed by the API
// routes and the portal UI. Runs filter facets belong here so the UI does not
// infer option catalogs from a paginated row slice.
export const portalBenchmarkOpsReadModelsContract = {
  launchViewResponse: portalLaunchViewResponseSchema,
  runDetailResponse: portalRunDetailResponseSchema,
  runsListQuery: portalRunsListQuerySchema,
  runsListResponse: portalRunsListResponseSchema,
  workersViewResponse: portalWorkersViewResponseSchema
};
