import type {
  AttemptLifecycleState,
  EvaluationVerdictClass,
  JobLifecycleState,
  RunLifecycleState
} from "@paretoproof/shared";

export type PortalRunLifecycleBucket =
  | "pending"
  | "active"
  | "terminal_success"
  | "terminal_failure"
  | "terminal_cancelled";

export type PortalResultsSort =
  | "startedAt.desc"
  | "finishedAt.desc"
  | "duration.desc"
  | "runState.asc"
  | "verdictClass.asc";

export type PortalRunRerunLineage = "original" | `retry_${number}` | "manual_rerun";

export type PortalResultsQueryState = {
  rerunLineage?: PortalRunRerunLineage[];
  runLifecycleBucket?: PortalRunLifecycleBucket[];
  runState?: RunLifecycleState[];
  sort?: PortalResultsSort;
  verdictClass?: EvaluationVerdictClass[];
};

export type PortalRunResultRow = {
  attemptState: AttemptLifecycleState;
  benchmarkVersionId: string;
  branch: string;
  durationSeconds: number | null;
  evaluationBatchId: string;
  failureCode: string | null;
  failureFamily: string | null;
  finishedAt: string | null;
  jobState: JobLifecycleState;
  modelConfigId: string;
  modelLabel: string;
  rerunLineage: PortalRunRerunLineage;
  runId: string;
  runLifecycleBucket: PortalRunLifecycleBucket;
  runState: RunLifecycleState;
  startedAt: string;
  target: string;
  verdictClass: EvaluationVerdictClass | null;
};

const runStateLabels: Record<RunLifecycleState, string> = {
  cancel_requested: "Cancelling",
  cancelled: "Cancelled",
  created: "Created",
  failed: "Failed",
  queued: "Queued",
  running: "Running",
  succeeded: "Completed"
};

const jobStateLabels: Record<JobLifecycleState, string> = {
  cancel_requested: "Cancelling",
  cancelled: "Cancelled",
  claimed: "Claimed",
  completed: "Completed",
  failed: "Failed",
  queued: "Queued",
  running: "Running"
};

const attemptStateLabels: Record<AttemptLifecycleState, string> = {
  active: "Running",
  cancelled: "Cancelled",
  failed: "Failed",
  prepared: "Prepared",
  succeeded: "Completed"
};

const verdictLabels: Record<EvaluationVerdictClass, string> = {
  fail: "Fail",
  invalid_result: "Invalid result",
  pass: "Pass"
};

export const portalResultsExportHeaders = [
  "runId",
  "evaluationBatchId",
  "benchmarkVersionId",
  "modelConfigId",
  "modelLabel",
  "runState",
  "runStateLabel",
  "jobState",
  "jobStateLabel",
  "attemptState",
  "attemptStateLabel",
  "runLifecycleBucket",
  "verdictClass",
  "verdictLabel",
  "rerunLineage",
  "startedAt",
  "finishedAt",
  "durationSeconds",
  "failureFamily",
  "failureCode"
] as const;

export function deriveRunLifecycleBucket(
  runState: RunLifecycleState
): PortalRunLifecycleBucket {
  switch (runState) {
    case "created":
    case "queued":
      return "pending";
    case "running":
    case "cancel_requested":
      return "active";
    case "succeeded":
      return "terminal_success";
    case "failed":
      return "terminal_failure";
    case "cancelled":
      return "terminal_cancelled";
  }
}

export function getRunStateLabel(runState: RunLifecycleState) {
  return runStateLabels[runState];
}

export function getJobStateLabel(jobState: JobLifecycleState) {
  return jobStateLabels[jobState];
}

export function getAttemptStateLabel(attemptState: AttemptLifecycleState) {
  return attemptStateLabels[attemptState];
}

export function getVerdictLabel(verdictClass: EvaluationVerdictClass | null) {
  return verdictClass ? verdictLabels[verdictClass] : "Pending";
}

export function serializePortalResultsQuery(queryState: PortalResultsQueryState) {
  const searchParams = new URLSearchParams();

  if (queryState.runLifecycleBucket?.length) {
    searchParams.set("runLifecycleBucket", queryState.runLifecycleBucket.join(","));
  }

  if (queryState.runState?.length) {
    searchParams.set("runState", queryState.runState.join(","));
  }

  if (queryState.verdictClass?.length) {
    searchParams.set("verdictClass", queryState.verdictClass.join(","));
  }

  if (queryState.rerunLineage?.length) {
    searchParams.set("rerunLineage", queryState.rerunLineage.join(","));
  }

  if (queryState.sort) {
    searchParams.set("sort", queryState.sort);
  }

  return `?${searchParams.toString()}`;
}

export const portalRunResults: PortalRunResultRow[] = [
  {
    attemptState: "succeeded",
    benchmarkVersionId: "problem9-v2026-03-12",
    branch: "main",
    durationSeconds: 814,
    evaluationBatchId: "eval-2026-03-13-a",
    failureCode: null,
    failureFamily: null,
    finishedAt: "2026-03-13T10:22:00Z",
    jobState: "completed",
    modelConfigId: "gpt-5-codex-high",
    modelLabel: "GPT-5 Codex High",
    rerunLineage: "original",
    runId: "PP-488",
    runLifecycleBucket: deriveRunLifecycleBucket("succeeded"),
    runState: "succeeded",
    startedAt: "2026-03-13T10:08:26Z",
    target: "Problem 9 / simplification lane",
    verdictClass: "pass"
  },
  {
    attemptState: "active",
    benchmarkVersionId: "problem9-v2026-03-12",
    branch: "worker-claim-loop",
    durationSeconds: null,
    evaluationBatchId: "eval-2026-03-13-b",
    failureCode: null,
    failureFamily: null,
    finishedAt: null,
    jobState: "running",
    modelConfigId: "claude-sonnet-4",
    modelLabel: "Claude Sonnet 4",
    rerunLineage: "retry_1",
    runId: "PP-489",
    runLifecycleBucket: deriveRunLifecycleBucket("running"),
    runState: "running",
    startedAt: "2026-03-13T11:01:12Z",
    target: "Problem 9 / worker retry slice",
    verdictClass: null
  },
  {
    attemptState: "failed",
    benchmarkVersionId: "problem9-v2026-03-12",
    branch: "offline-ingest",
    durationSeconds: 251,
    evaluationBatchId: "eval-2026-03-13-b",
    failureCode: "bundle_schema_unsupported",
    failureFamily: "evaluation_contract",
    finishedAt: "2026-03-13T11:16:09Z",
    jobState: "failed",
    modelConfigId: "gemini-2.5-pro",
    modelLabel: "Gemini 2.5 Pro",
    rerunLineage: "manual_rerun",
    runId: "PP-490",
    runLifecycleBucket: deriveRunLifecycleBucket("failed"),
    runState: "failed",
    startedAt: "2026-03-13T11:11:58Z",
    target: "Problem 9 / ingest validation",
    verdictClass: "invalid_result"
  },
  {
    attemptState: "cancelled",
    benchmarkVersionId: "problem9-v2026-03-12",
    branch: "api-timeouts",
    durationSeconds: 99,
    evaluationBatchId: "eval-2026-03-13-c",
    failureCode: "manual_cancelled",
    failureFamily: "operator_intent",
    finishedAt: "2026-03-13T12:03:54Z",
    jobState: "cancelled",
    modelConfigId: "gpt-4.1-mini",
    modelLabel: "GPT-4.1 Mini",
    rerunLineage: "original",
    runId: "PP-491",
    runLifecycleBucket: deriveRunLifecycleBucket("cancelled"),
    runState: "cancelled",
    startedAt: "2026-03-13T12:02:15Z",
    target: "Problem 9 / queue smoke check",
    verdictClass: null
  }
];

export const portalResultsFilterPresets = [
  {
    description: "Use the active bucket without inventing a new pseudo-status field.",
    id: "active_runs",
    label: "Active runs",
    queryState: {
      runLifecycleBucket: ["active"],
      runState: ["running", "cancel_requested"],
      sort: "startedAt.desc"
    } satisfies PortalResultsQueryState
  },
  {
    description: "Separate terminal lifecycle from mathematical verdict review.",
    id: "invalid_results",
    label: "Invalid results",
    queryState: {
      runState: ["failed"],
      sort: "finishedAt.desc",
      verdictClass: ["invalid_result"]
    } satisfies PortalResultsQueryState
  },
  {
    description: "Keep rerun lineage explicit instead of hiding it inside a label.",
    id: "retry_watch",
    label: "Retry watch",
    queryState: {
      rerunLineage: ["retry_1", "manual_rerun"],
      runLifecycleBucket: ["active", "terminal_failure"],
      sort: "duration.desc"
    } satisfies PortalResultsQueryState
  }
] as const;

export function buildPortalResultsCsvPreview(rows = portalRunResults.slice(0, 2)) {
  const headerRow = portalResultsExportHeaders.join(",");
  const valueRows = rows.map((row) =>
    [
      row.runId,
      row.evaluationBatchId,
      row.benchmarkVersionId,
      row.modelConfigId,
      row.modelLabel,
      row.runState,
      getRunStateLabel(row.runState),
      row.jobState,
      getJobStateLabel(row.jobState),
      row.attemptState,
      getAttemptStateLabel(row.attemptState),
      row.runLifecycleBucket,
      row.verdictClass ?? "",
      row.verdictClass ? getVerdictLabel(row.verdictClass) : "",
      row.rerunLineage,
      row.startedAt,
      row.finishedAt ?? "",
      row.durationSeconds ?? "",
      row.failureFamily ?? "",
      row.failureCode ?? ""
    ].join(",")
  );

  return [headerRow, ...valueRows].join("\n");
}
