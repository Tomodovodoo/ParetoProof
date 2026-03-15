import {
  evaluationVerdictLabels,
  portalRunsLifecycleBuckets,
  portalRunsSortOptions,
  runLifecycleStateLabels,
  type EvaluationVerdictClass,
  type PortalRunsLifecycleBucket,
  type PortalRunsSortId,
  type RunLifecycleState
} from "@paretoproof/shared";

export type PortalResultsLifecycleBucket = PortalRunsLifecycleBucket;

export type PortalResultsSortId = PortalRunsSortId;

export type PortalResultsQueryState = {
  lifecycleBucket: PortalResultsLifecycleBucket | null;
  runLifecycle: RunLifecycleState[];
  sort: PortalResultsSortId;
  verdict: EvaluationVerdictClass[];
};

export { evaluationVerdictLabels, portalRunsLifecycleBuckets as portalResultsLifecycleBuckets, portalRunsSortOptions as portalResultsSortOptions, runLifecycleStateLabels };

export const portalResultsExportHeaders = [
  "runId",
  "jobId",
  "attemptId",
  "benchmarkVersionId",
  "modelConfigId",
  "modelConfigLabel",
  "runState",
  "runStateLabel",
  "runLifecycleBucket",
  "runLifecycleBucketLabel",
  "verdictClass",
  "verdictLabel",
  "failureFamily",
  "failureCode",
  "startedAt",
  "finishedAt",
  "durationMs"
] as const;

export const examplePortalResultsQueryState: PortalResultsQueryState = {
  lifecycleBucket: "active",
  runLifecycle: ["running", "cancel_requested"],
  sort: "started_at_desc",
  verdict: ["fail", "invalid_result"]
};

export function buildPortalResultsQueryString(state: PortalResultsQueryState) {
  const params = new URLSearchParams();

  if (state.lifecycleBucket) {
    params.set("lifecycleBucket", state.lifecycleBucket);
  }

  if (state.runLifecycle.length > 0) {
    params.set("runLifecycle", state.runLifecycle.join(","));
  }

  if (state.verdict.length > 0) {
    params.set("verdict", state.verdict.join(","));
  }

  params.set("sort", state.sort);

  return params.toString();
}
