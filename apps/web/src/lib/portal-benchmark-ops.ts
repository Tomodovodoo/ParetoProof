import {
  evaluationVerdictLabels,
  portalBenchmarkDatasetResponseSchema,
  portalBenchmarksListResponseSchema,
  getPortalRunsLifecycleBucketLabel,
  getRunLifecycleStateLabel,
  portalLaunchViewResponseSchema,
  portalRunDetailResponseSchema,
  portalRunsLifecycleBuckets,
  portalRunsListQuerySchema,
  portalRunsListResponseSchema,
  portalWorkersViewResponseSchema,
  type PortalBenchmarkDatasetResponse,
  type PortalBenchmarkExportFormat,
  type PortalBenchmarksListResponse,
  type EvaluationVerdictClass,
  type PortalLaunchViewResponse,
  type PortalRunsAvailableFilters,
  type PortalRunsModelConfigFilterOption,
  type PortalRunsProviderFilterOption,
  type PortalRunDetailResponse,
  type PortalRunListItem,
  type PortalRunsListQuery,
  type PortalRunsListResponse,
  type PortalRunsSortId,
  type PortalWorkerIncidentSeverity,
  type PortalWorkersViewResponse,
  runKindSchema,
  type RunLifecycleState
} from "@paretoproof/shared";
import { getApiBaseUrl } from "./api-base-url";
import { fetchApi } from "./api-fetch";
import { portalResultsExportHeaders } from "./results-state";

const portalRunsSortIds: PortalRunsSortId[] = [
  "started_at_desc",
  "finished_at_desc",
  "duration_desc",
  "run_state_asc",
  "verdict_asc"
];

export const defaultPortalRunsQuery: PortalRunsListQuery = {
  attemptId: null,
  authMode: null,
  benchmarkPackageDigest: null,
  benchmarkPackageId: null,
  benchmarkPackageVersion: null,
  failureCode: null,
  failureFamily: null,
  jobId: null,
  lifecycleBucket: null,
  limit: 25,
  modelConfigId: null,
  providerFamily: null,
  q: null,
  runId: null,
  runKind: null,
  runLifecycle: [],
  runMode: null,
  sort: "started_at_desc",
  toolProfile: null,
  verdict: []
};

const portalRunsQueryParamKeys = Object.keys(defaultPortalRunsQuery) as Array<
  keyof PortalRunsListQuery
>;

function parseNullableParam(value: string | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function parseQueryField<TValue>(
  parser: { safeParse: (value: unknown) => { success: true; data: TValue } | { success: false } },
  value: unknown,
  fallback: TValue
) {
  const result = parser.safeParse(value);
  return result.success ? result.data : fallback;
}

async function fetchPortalBenchmarkOpsJson<T>(
  path: string,
  schema: { parse: (value: unknown) => T }
): Promise<T> {
  const response = await fetchApi(`${getApiBaseUrl()}${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}.`);
  }

  return schema.parse(await response.json());
}

export function parsePortalRunsQuery(search: string): PortalRunsListQuery {
  const params = new URLSearchParams(search);
  const sortCandidate = params.get("sort");
  const lifecycleCandidate = params.get("lifecycleBucket");
  const lifecycleBucket = portalRunsLifecycleBuckets.some((bucket) => bucket.id === lifecycleCandidate)
    ? (lifecycleCandidate as PortalRunsListQuery["lifecycleBucket"])
    : null;
  const sort = portalRunsSortIds.includes((sortCandidate ?? "") as PortalRunsSortId)
    ? (sortCandidate as PortalRunsSortId)
    : defaultPortalRunsQuery.sort;
  const candidateQuery = {
    attemptId: parseNullableParam(params.get("attemptId")),
    authMode: parseNullableParam(params.get("authMode")),
    benchmarkPackageDigest: parseNullableParam(params.get("benchmarkPackageDigest")),
    benchmarkPackageId: parseNullableParam(params.get("benchmarkPackageId")),
    benchmarkPackageVersion: parseNullableParam(params.get("benchmarkPackageVersion")),
    failureCode: parseNullableParam(params.get("failureCode")),
    failureFamily: parseNullableParam(params.get("failureFamily")),
    jobId: parseNullableParam(params.get("jobId")),
    lifecycleBucket,
    limit: parseQueryField(
      portalRunsListQuerySchema.shape.limit,
      parseNullableParam(params.get("limit")) ?? undefined,
      defaultPortalRunsQuery.limit
    ),
    modelConfigId: parseNullableParam(params.get("modelConfigId")),
    providerFamily: parseNullableParam(params.get("providerFamily")),
    q: parseNullableParam(params.get("q")),
    runId: parseNullableParam(params.get("runId")),
    runKind: parseQueryField(
      runKindSchema.nullable(),
      parseNullableParam(params.get("runKind")),
      defaultPortalRunsQuery.runKind
    ),
    runLifecycle: parseQueryField(
      portalRunsListQuerySchema.shape.runLifecycle,
      params.get("runLifecycle") ?? undefined,
      defaultPortalRunsQuery.runLifecycle
    ),
    runMode: parseNullableParam(params.get("runMode")),
    sort,
    toolProfile: parseNullableParam(params.get("toolProfile")),
    verdict: parseQueryField(
      portalRunsListQuerySchema.shape.verdict,
      params.get("verdict") ?? undefined,
      defaultPortalRunsQuery.verdict
    )
  } satisfies PortalRunsListQuery;

  const parsedQuery = portalRunsListQuerySchema.safeParse(candidateQuery);
  return parsedQuery.success ? parsedQuery.data : defaultPortalRunsQuery;
}

export function extractPortalRunsQueryString(search: string) {
  const sourceParams = new URLSearchParams(search);
  const runsParams = new URLSearchParams();

  for (const key of portalRunsQueryParamKeys) {
    const rawValue = sourceParams.get(key);

    if (rawValue === null) {
      continue;
    }

    const trimmedValue = rawValue.trim();

    if (!trimmedValue) {
      continue;
    }

    runsParams.set(key, trimmedValue);
  }

  return runsParams.toString();
}

export function sanitizePortalRunsQueryString(search: string) {
  return buildPortalRunsQueryString(parsePortalRunsQuery(search));
}

export function buildPortalRunsQueryString(query: PortalRunsListQuery) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value == null) {
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length > 0) {
        params.set(key, value.join(","));
      }
      continue;
    }

    if (key === "limit") {
      if (value !== defaultPortalRunsQuery.limit) {
        params.set(key, String(value));
      }
      continue;
    }

    if (key === "sort") {
      if (value !== defaultPortalRunsQuery.sort) {
        params.set(key, String(value));
      }
      continue;
    }

    params.set(key, String(value));
  }

  return params.toString();
}

export function buildRunsCsv(items: PortalRunListItem[]) {
  const rows = items.map((item) => [
    item.runId,
    item.latestJobId ?? "",
    item.latestAttemptId ?? "",
    item.benchmarkVersionId,
    item.modelConfigId,
    item.modelConfigLabel,
    item.runState,
    getRunLifecycleStateLabel(item.runState),
    item.runLifecycleBucket,
    getPortalRunsLifecycleBucketLabel(item.runLifecycleBucket),
    item.verdictClass ?? "",
    item.verdictClass ? evaluationVerdictLabels[item.verdictClass] : "",
    item.failure.family ?? "",
    item.failure.code ?? "",
    item.startedAt,
    item.completedAt ?? "",
    item.durationMs === null ? "" : String(item.durationMs)
  ]);

  return [portalResultsExportHeaders, ...rows]
    .map((row) => row.map((value) => escapeCsvValue(value)).join(","))
    .join("\n");
}

export function buildPortalBenchmarkDatasetCsv(dataset: PortalBenchmarkDatasetResponse) {
  const attemptsByRunId = new Map<string, PortalBenchmarkDatasetResponse["attempts"]>();

  for (const attempt of dataset.attempts) {
    const existing = attemptsByRunId.get(attempt.runId);

    if (existing) {
      existing.push(attempt);
      continue;
    }

    attemptsByRunId.set(attempt.runId, [attempt]);
  }

  const headers = [
    "benchmarkPackageId",
    "benchmarkVersions",
    "runId",
    "runState",
    "runVerdictClass",
    "providerFamily",
    "modelConfigId",
    "startedAt",
    "completedAt",
    "durationMs",
    "jobId",
    "attemptId",
    "attemptState",
    "attemptVerdictClass",
    "verifierResult",
    "failureFamily",
    "failureCode",
    "failureSummary"
  ];
  const rows = dataset.runs.flatMap((run) => {
    const attempts = attemptsByRunId.get(run.runId) ?? [null];

    return attempts.map((attempt) => [
      dataset.benchmark.benchmarkPackageId,
      dataset.benchmark.versions.join("|"),
      run.runId,
      run.runState,
      run.verdictClass ?? "",
      run.providerFamily,
      run.modelConfigId,
      run.startedAt,
      run.completedAt ?? "",
      run.durationMs === null ? "" : String(run.durationMs),
      attempt?.jobId ?? run.latestJobId ?? "",
      attempt?.attemptId ?? "",
      attempt?.state ?? "",
      attempt?.verdictClass ?? "",
      attempt?.verifierResult ?? "",
      attempt?.failure.family ?? run.failure.family ?? "",
      attempt?.failure.code ?? run.failure.code ?? "",
      attempt?.failure.summary ?? run.failure.summary ?? ""
    ]);
  });

  return [headers, ...rows]
    .map((row) => row.map((value) => escapeCsvValue(String(value))).join(","))
    .join("\n");
}

function sanitizeExportFilenameSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "benchmark";
}

export function buildPortalBenchmarkDatasetExportFileName(
  packageId: string,
  format: PortalBenchmarkExportFormat,
  now = new Date()
) {
  const timestamp = now.toISOString().slice(0, 19).replaceAll(":", "-");
  return `paretoproof-${sanitizeExportFilenameSegment(packageId)}-dataset-${timestamp}.${format}`;
}

function readContentDispositionFilename(headerValue: string | null) {
  if (!headerValue) {
    return null;
  }

  const encodedMatch = /filename\*=UTF-8''([^;]+)/i.exec(headerValue);

  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return encodedMatch[1];
    }
  }

  const plainMatch = /filename="([^"]+)"/i.exec(headerValue) ?? /filename=([^;]+)/i.exec(headerValue);
  return plainMatch?.[1]?.trim() ?? null;
}

export type PortalRunsModelFilterOption = {
  count: number;
  label: string;
  modelConfigId: string;
  providerFamily: string;
};

export function buildRunsProviderOptions(
  filters: PortalRunsAvailableFilters,
  selectedProviderFamily: string | null
) {
  const providerOptions = filters.providerFamilies.map((entry) => entry.providerFamily);

  if (selectedProviderFamily && !providerOptions.includes(selectedProviderFamily)) {
    providerOptions.push(selectedProviderFamily);
  }

  return providerOptions;
}

export function buildRunsModelOptions(
  filters: PortalRunsAvailableFilters,
  selectedModelConfigId: string | null
): PortalRunsModelFilterOption[] {
  const modelOptions = new Map(
    filters.modelConfigs.map((entry) => [
      entry.modelConfigId,
      {
        count: entry.count,
        label: entry.modelConfigLabel,
        modelConfigId: entry.modelConfigId,
        providerFamily: entry.providerFamily
      }
    ] as const)
  );

  if (selectedModelConfigId && !modelOptions.has(selectedModelConfigId)) {
    modelOptions.set(selectedModelConfigId, {
      count: 0,
      label: selectedModelConfigId,
      modelConfigId: selectedModelConfigId,
      providerFamily: ""
    });
  }

  return Array.from(modelOptions.values());
}

function escapeCsvValue(value: string) {
  const safeValue = /^\s*[=+\-@]/.test(value) ? `'${value}` : value;

  if (/[",\n]/.test(safeValue)) {
    return `"${safeValue.replaceAll('"', '""')}"`;
  }

  return safeValue;
}

export function getWorkerIncidentTone(severity: PortalWorkerIncidentSeverity) {
  return `portal-severity-${severity}`;
}

export async function fetchPortalRunsView(query: PortalRunsListQuery) {
  const queryString = buildPortalRunsQueryString(query);
  return fetchPortalBenchmarkOpsJson(
    `/portal/runs${queryString ? `?${queryString}` : ""}`,
    portalRunsListResponseSchema
  );
}

export async function fetchPortalBenchmarksList() {
  return fetchPortalBenchmarkOpsJson(
    "/portal/benchmarks",
    portalBenchmarksListResponseSchema
  );
}

export async function fetchPortalBenchmarkDataset(packageId: string) {
  return fetchPortalBenchmarkOpsJson(
    `/portal/benchmarks/${encodeURIComponent(packageId)}/dataset`,
    portalBenchmarkDatasetResponseSchema
  );
}

export async function fetchPortalBenchmarkDatasetExport(
  packageId: string,
  format: PortalBenchmarkExportFormat
) {
  const fallbackFileName = buildPortalBenchmarkDatasetExportFileName(packageId, format);

  const response = await fetchApi(
    `${getApiBaseUrl()}/portal/benchmarks/${encodeURIComponent(packageId)}/export?format=${format}`,
    {
      credentials: "include",
      headers: {
        Accept: format === "json" ? "application/json" : "text/csv"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}.`);
  }

  return {
    blob: await response.blob(),
    fileName:
      readContentDispositionFilename(response.headers.get("content-disposition")) ??
      fallbackFileName
  };
}

export async function fetchPortalRunDetail(runId: string) {
  return fetchPortalBenchmarkOpsJson(
    `/portal/runs/${encodeURIComponent(runId)}`,
    portalRunDetailResponseSchema
  );
}

export async function fetchPortalLaunchView() {
  return fetchPortalBenchmarkOpsJson("/portal/launch", portalLaunchViewResponseSchema);
}

export async function fetchPortalWorkersView() {
  return fetchPortalBenchmarkOpsJson("/portal/workers", portalWorkersViewResponseSchema);
}

