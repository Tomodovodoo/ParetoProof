import type { EvaluationVerdictClass, RunLifecycleState } from "@paretoproof/shared";

export type PortalResultsLifecycleBucket =
  | "pending"
  | "active"
  | "terminal_success"
  | "terminal_failure"
  | "terminal_cancelled";

export type PortalResultsSortId =
  | "started_at_desc"
  | "finished_at_desc"
  | "duration_desc"
  | "run_state_asc"
  | "verdict_asc";

export type PortalResultsQueryState = {
  lifecycleBucket: PortalResultsLifecycleBucket | null;
  runLifecycle: RunLifecycleState[];
  sort: PortalResultsSortId;
  verdict: EvaluationVerdictClass[];
};

export const runLifecycleStateLabels: Record<RunLifecycleState, string> = {
  cancel_requested: "Cancelling",
  cancelled: "Cancelled",
  created: "Created",
  failed: "Failed",
  queued: "Queued",
  running: "Running",
  succeeded: "Completed"
};

export const evaluationVerdictLabels: Record<EvaluationVerdictClass, string> = {
  fail: "Fail",
  invalid_result: "Invalid result",
  pass: "Pass"
};

export const portalResultsLifecycleBuckets: Array<{
  description: string;
  id: PortalResultsLifecycleBucket;
  label: string;
  runStates: RunLifecycleState[];
}> = [
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
];

export const portalResultsSortOptions: Array<{
  description: string;
  id: PortalResultsSortId;
  label: string;
}> = [
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
];

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
