import {
  portalRunsLifecycleBuckets,
  portalRunsSortOptions,
  type PortalBenchmarkExportFormat,
  type EvaluationVerdictClass,
  type PortalRouteId,
  type PortalRunsLifecycleBucket,
  type PortalLaunchViewResponse,
  type PortalRunDetailResponse,
  type PortalRunsListQuery,
  type PortalRunsListResponse,
  type PortalWorkerOpsFreshness,
  type PortalWorkersViewResponse,
  type RunKind
} from "@paretoproof/shared";
import {
  type Dispatch,
  Fragment,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { PortalFreshnessCard } from "../components/portal-freshness-card";
import {
  buildRunsModelOptions,
  buildPortalRunsQueryString,
  buildRunsProviderOptions,
  buildRunsCsv,
  defaultPortalRunsQuery,
  extractPortalRunsQueryString,
  fetchPortalBenchmarkDatasetExport,
  fetchPortalLaunchView,
  fetchPortalRunDetail,
  fetchPortalRunsView,
  fetchPortalWorkersView,
  getWorkerIncidentTone,
  parsePortalRunsQuery,
  sanitizePortalRunsQueryString
} from "../lib/portal-benchmark-ops";
import { usePortalPolling } from "../lib/portal-freshness";
import { evaluationVerdictLabels, runLifecycleStateLabels } from "../lib/results-state";
import { buildPortalUrl } from "../lib/surface";
import { useCompactLayout } from "../lib/use-compact-layout";

type PortalBenchmarkOpsSurfaceProps = {
  activeRouteId: PortalRouteId;
  activeSectionId: "launch" | "runs" | "workers";
  activeRunId: string | null;
  pathname: string;
  search: string;
  onReplaceLocation: (path: string, search: string) => void;
};

type LoadState<TData> = {
  data: TData | null;
  error: string | null;
  isLoading: boolean;
  lastUpdatedAt: string | null;
};

type LaunchSelectionState = {
  benchmarkVersionId: string;
  modelConfigId: string;
  runKind: RunKind;
};

function createLoadState<TData>(): LoadState<TData> {
  return {
    data: null,
    error: null,
    isLoading: false,
    lastUpdatedAt: null
  };
}

function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString([], {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  });
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) {
    return "In progress";
  }

  if (durationMs <= 0) {
    return "Queued";
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function getVerdictLabel(verdict: EvaluationVerdictClass | null) {
  return verdict ? evaluationVerdictLabels[verdict] : "In progress";
}

function formatRunKind(value: string) {
  return value.replaceAll("_", " ");
}

function formatSubmissionMode(value: string) {
  return value.replaceAll("_", " ");
}

const launchPreflightSupportedFieldIds = new Set([
  "benchmarkVersionId",
  "modelConfigId"
]);

function getSupportedLaunchRunKinds(data: PortalLaunchViewResponse | null) {
  return (data?.runKinds ?? []).filter((item) =>
    item.requiredFields.every((fieldId) => launchPreflightSupportedFieldIds.has(fieldId))
  );
}

function getUnsupportedLaunchRunKinds(data: PortalLaunchViewResponse | null) {
  return (data?.runKinds ?? []).filter((item) =>
    item.requiredFields.some((fieldId) => !launchPreflightSupportedFieldIds.has(fieldId))
  );
}

function getEffectiveLaunchConcurrencyCap(
  data: PortalLaunchViewResponse | null,
  runKind: RunKind
) {
  const override = data?.governance.runKindConcurrencyOverrides.find((item) => item.id === runKind);

  return override?.maxConcurrentJobsPerRun ?? data?.governance.defaultPolicy.concurrency.maxConcurrentJobsPerRun;
}

function formatLaunchFieldLabel(fieldId: string) {
  switch (fieldId) {
    case "benchmarkVersionId":
      return "benchmark version";
    case "modelConfigId":
      return "model config";
    case "benchmarkItemId":
      return "benchmark item";
    case "sliceDefinition":
      return "slice definition";
    case "benchmarkTargetId":
      return "benchmark target";
    case "repeatCount":
      return "repeat count";
    default:
      return fieldId;
  }
}

function toDisplayError(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

function normalizeRouteSearch(search: string) {
  if (!search) {
    return "";
  }

  return search.startsWith("?") ? search : `?${search}`;
}

export function buildRunsIndexTargetPath(search = "") {
  return `/runs${normalizeRouteSearch(search)}`;
}

export function buildRunsIndexHref(search = "") {
  return buildPortalUrl(buildRunsIndexTargetPath(search));
}

export function buildRunDetailTargetPath(runId: string, search = "") {
  return `/runs/${encodeURIComponent(runId)}${normalizeRouteSearch(search)}`;
}

export function buildRunDetailHref(runId: string, search = "") {
  return buildPortalUrl(buildRunDetailTargetPath(runId, search));
}

export function getCompactRunsSectionOrder() {
  return ["resultsPanel", "quickFilters", "supportPanel", "runsSlice"] as const;
}

export function isCurrentPortalRequest(requestId: number, latestRequestId: number) {
  return requestId === latestRequestId;
}

export function getPortalBenchmarkOpsUnavailableTitle(
  activeSectionId: PortalBenchmarkOpsSurfaceProps["activeSectionId"],
  activeRunId: string | null
) {
  if (activeSectionId === "runs") {
    return activeRunId ? "Run evidence is unavailable." : "Run index is unavailable.";
  }

  if (activeSectionId === "workers") {
    return "Worker operations are unavailable.";
  }

  return "Launch options are not ready yet.";
}

function isAwaitingFirstLoad<TData>(loadState: LoadState<TData>) {
  return !loadState.data && !loadState.error && loadState.lastUpdatedAt === null;
}

function hasLaunchOptions(data: PortalLaunchViewResponse | null) {
  return Boolean(
    data &&
      data.benchmarks.length > 0 &&
      data.modelConfigs.length > 0 &&
      getSupportedLaunchRunKinds(data).length > 0
  );
}

function updateRunsQuery(
  pathname: string,
  currentQuery: PortalRunsListQuery,
  onReplaceLocation: PortalBenchmarkOpsSurfaceProps["onReplaceLocation"],
  partial: Partial<PortalRunsListQuery>
) {
  const nextQuery: PortalRunsListQuery = {
    ...currentQuery,
    ...partial
  };
  const nextSearch = buildPortalRunsQueryString(nextQuery);
  onReplaceLocation(pathname, nextSearch ? `?${nextSearch}` : "");
}

function downloadRunsCsv(items: PortalRunsListResponse["items"]) {
  const blob = new Blob([buildRunsCsv(items)], {
    type: "text/csv;charset=utf-8"
  });
  downloadBlob(blob, `paretoproof-runs-${new Date().toISOString().slice(0, 19)}.csv`);
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}

export function PortalBenchmarkOpsSurface({
  activeRouteId,
  activeSectionId,
  activeRunId,
  pathname,
  search,
  onReplaceLocation
}: PortalBenchmarkOpsSurfaceProps) {
  const runsQuery = useMemo(() => parsePortalRunsQuery(search), [search]);
  const [runsState, setRunsState] = useState<LoadState<PortalRunsListResponse>>(createLoadState);
  const [runDetailState, setRunDetailState] = useState<LoadState<PortalRunDetailResponse>>(createLoadState);
  const [launchState, setLaunchState] = useState<LoadState<PortalLaunchViewResponse>>(createLoadState);
  const [workersState, setWorkersState] = useState<LoadState<PortalWorkersViewResponse>>(createLoadState);
  const runsListRequestIdRef = useRef(0);
  const runDetailRequestIdRef = useRef(0);
  const [launchSelection, setLaunchSelection] = useState<LaunchSelectionState>({
    benchmarkVersionId: "",
    modelConfigId: "",
    runKind: "single_run"
  });
  const sanitizedRunsQueryString = useMemo(
    () => sanitizePortalRunsQueryString(search),
    [search]
  );

  const loadRuns = useCallback(async () => {
    setRunsState((current) => ({ ...current, error: null, isLoading: true }));
    runsListRequestIdRef.current += 1;
    const requestId = runsListRequestIdRef.current;

    try {
      const data = await fetchPortalRunsView(runsQuery);

      if (!isCurrentPortalRequest(requestId, runsListRequestIdRef.current)) {
        return;
      }

      setRunsState({
        data,
        error: null,
        isLoading: false,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (error) {
      if (!isCurrentPortalRequest(requestId, runsListRequestIdRef.current)) {
        return;
      }

      setRunsState((current) => ({
        ...current,
        error: toDisplayError(error),
        isLoading: false
      }));
    }
  }, [runsQuery]);

  const loadRunDetail = useCallback(async () => {
    if (!activeRunId) {
      return;
    }

    setRunDetailState((current) => ({ ...current, error: null, isLoading: true }));
    runDetailRequestIdRef.current += 1;
    const requestId = runDetailRequestIdRef.current;

    try {
      const data = await fetchPortalRunDetail(activeRunId);

      if (!isCurrentPortalRequest(requestId, runDetailRequestIdRef.current)) {
        return;
      }

      setRunDetailState({
        data,
        error: null,
        isLoading: false,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (error) {
      if (!isCurrentPortalRequest(requestId, runDetailRequestIdRef.current)) {
        return;
      }

      setRunDetailState((current) => ({
        ...current,
        error: toDisplayError(error),
        isLoading: false
      }));
    }
  }, [activeRunId]);

  const loadLaunch = useCallback(async () => {
    setLaunchState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await fetchPortalLaunchView();
      setLaunchState({
        data,
        error: null,
        isLoading: false,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (error) {
      setLaunchState((current) => ({
        ...current,
        error: toDisplayError(error),
        isLoading: false
      }));
    }
  }, []);

  const loadWorkers = useCallback(async () => {
    setWorkersState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await fetchPortalWorkersView();
      setWorkersState({
        data,
        error: null,
        isLoading: false,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (error) {
      setWorkersState((current) => ({
        ...current,
        error: toDisplayError(error),
        isLoading: false
      }));
    }
  }, []);

  const pollCurrentView = useCallback(async () => {
    if (activeSectionId === "runs" && activeRunId) {
      await loadRunDetail();
      return;
    }
    if (activeSectionId === "runs") {
      await loadRuns();
      return;
    }
    if (activeSectionId === "launch") {
      await loadLaunch();
      return;
    }
    await loadWorkers();
  }, [activeRunId, activeSectionId, loadLaunch, loadRunDetail, loadRuns, loadWorkers]);

  usePortalPolling({
    enabled: activeSectionId === "runs" || activeSectionId === "launch" || activeSectionId === "workers",
    onPoll: pollCurrentView,
    routeId: activeRouteId
  });

  useEffect(() => {
    if (activeSectionId !== "runs") {
      return;
    }

    if (extractPortalRunsQueryString(search) === sanitizedRunsQueryString) {
      return;
    }

    onReplaceLocation(
      pathname,
      sanitizedRunsQueryString ? `?${sanitizedRunsQueryString}` : ""
    );
  }, [activeSectionId, onReplaceLocation, pathname, sanitizedRunsQueryString, search]);

  useEffect(() => {
    if (activeSectionId === "runs" && activeRunId) {
      void loadRunDetail();
      return;
    }
    if (activeSectionId === "runs") {
      void loadRuns();
      return;
    }
    if (activeSectionId === "launch") {
      void loadLaunch();
      return;
    }
    void loadWorkers();
  }, [activeRunId, activeSectionId, loadLaunch, loadRunDetail, loadRuns, loadWorkers]);

  useEffect(() => {
    if (!launchState.data) {
      return;
    }

    const supportedRunKinds = getSupportedLaunchRunKinds(launchState.data);
    setLaunchSelection((current) => ({
      benchmarkVersionId:
        current.benchmarkVersionId || launchState.data?.benchmarks[0]?.benchmarkVersionId || "",
      modelConfigId: current.modelConfigId || launchState.data?.modelConfigs[0]?.modelConfigId || "",
      runKind:
        supportedRunKinds.find((item) => item.id === current.runKind)?.id ??
        supportedRunKinds[0]?.id ??
        "full_benchmark"
    }));
  }, [launchState.data]);

  if (activeSectionId === "runs" && activeRunId) {
    return (
      <PortalRunDetailSurface
        activeRouteId={activeRouteId}
        loadState={runDetailState}
        onRefresh={loadRunDetail}
        search={search}
      />
    );
  }

  if (activeSectionId === "runs") {
    return (
      <PortalRunsSurface
        activeRouteId={activeRouteId}
        loadState={runsState}
        onRefresh={loadRuns}
        onReplaceLocation={onReplaceLocation}
        pathname={pathname}
        query={runsQuery}
        search={search}
      />
    );
  }

  if (activeSectionId === "launch") {
    return (
      <PortalLaunchSurface
        activeRouteId={activeRouteId}
        loadState={launchState}
        onRefresh={loadLaunch}
        selection={launchSelection}
        setSelection={setLaunchSelection}
      />
    );
  }

  return (
    <PortalWorkersSurface
      activeRouteId={activeRouteId}
      loadState={workersState}
      onRefresh={loadWorkers}
    />
  );
}

type SurfaceProps<TData> = {
  activeRouteId: PortalRouteId;
  loadState: LoadState<TData>;
  onRefresh: () => Promise<void>;
};

export function PortalRunsSurface({
  activeRouteId,
  loadState,
  onRefresh,
  onReplaceLocation,
  pathname,
  query,
  search
}: SurfaceProps<PortalRunsListResponse> & {
  onReplaceLocation: PortalBenchmarkOpsSurfaceProps["onReplaceLocation"];
  pathname: string;
  query: PortalRunsListQuery;
  search: string;
}) {
  const awaitingFirstLoad = isAwaitingFirstLoad(loadState);
  const [datasetExportState, setDatasetExportState] = useState<{
    error: string | null;
    format: PortalBenchmarkExportFormat | null;
  }>({
    error: null,
    format: null
  });
  const providerOptions = buildRunsProviderOptions(
    loadState.data?.filters ?? { modelConfigs: [], providerFamilies: [] },
    query.providerFamily
  );
  const modelOptions = buildRunsModelOptions(
    loadState.data?.filters ?? { modelConfigs: [], providerFamilies: [] },
    query.modelConfigId
  );
  const benchmarkPackageOptions = useMemo(() => {
    const values = new Set(
      (loadState.data?.items ?? []).map((item) => item.benchmarkPackageId)
    );

    if (query.benchmarkPackageId) {
      values.add(query.benchmarkPackageId);
    }

    return [...values].sort((left, right) => left.localeCompare(right));
  }, [loadState.data?.items, query.benchmarkPackageId]);
  const selectedBenchmarkPackageId =
    query.benchmarkPackageId ??
    (benchmarkPackageOptions.length === 1 ? benchmarkPackageOptions[0] : null);
  const isCompactLayout = useCompactLayout(480);

  async function handleDatasetExport(format: PortalBenchmarkExportFormat) {
    if (!selectedBenchmarkPackageId) {
      return;
    }

    setDatasetExportState({
      error: null,
      format
    });

    try {
      const download = await fetchPortalBenchmarkDatasetExport(
        selectedBenchmarkPackageId,
        format
      );
      downloadBlob(download.blob, download.fileName);
      setDatasetExportState({
        error: null,
        format: null
      });
    } catch (error) {
      setDatasetExportState({
        error: toDisplayError(error),
        format: null
      });
    }
  }

  const runsSlice = (
    <article
      className={`portal-panel-table-flat${isCompactLayout ? " portal-run-slice-compact" : ""}`}
    >
      <div className="portal-panel-header">
        <div>
          <p className="section-tag">Current run slice</p>
          <h2>
            {isCompactLayout
              ? "Open one run's evidence from the current slice."
              : "Open one run's evidence from the current filtered slice."}
          </h2>
        </div>
        <span className="role-chip role-chip-muted">
          {loadState.data?.summary.returnedCount ?? 0} shown
        </span>
      </div>
      {awaitingFirstLoad ? (
        <PortalLoadingState
          description="Fetching the current benchmark-operations run slice."
          title="Loading run index."
        />
      ) : loadState.data?.items.length ? (
        isCompactLayout ? (
          <div className="portal-run-card-list" aria-label="Runs">
            {loadState.data.items.map((item) => (
              <article className="portal-run-card" key={item.runId}>
                <div className="portal-run-card-header">
                  <a
                    className="portal-inline-link portal-run-card-link"
                    href={buildRunDetailHref(item.runId, search)}
                  >
                    {item.runId}
                  </a>
                  <span className={`portal-state-badge portal-state-${item.runState}`}>
                    {runLifecycleStateLabels[item.runState]}
                  </span>
                </div>
                <p className="portal-run-card-title">{item.benchmarkLabel}</p>
                <p className="portal-run-card-meta">{item.modelConfigLabel}</p>
                <div className="portal-run-card-footer">
                  {item.verdictClass ? (
                    <span className={`portal-verdict-badge portal-verdict-${item.verdictClass}`}>
                      {evaluationVerdictLabels[item.verdictClass]}
                    </span>
                  ) : (
                    <span className="role-chip role-chip-muted">In progress</span>
                  )}
                  <span className="portal-run-card-timestamp">
                    {formatTimestamp(item.startedAt)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="portal-table-shell" role="table" aria-label="Runs">
            <div className="portal-table-head" role="row">
              <span>Run</span>
              <span>Benchmark</span>
              <span>Model</span>
              <span>Started</span>
              <span>Lifecycle</span>
              <span>Verdict</span>
            </div>
            {loadState.data.items.map((item) => (
              <div className="portal-table-row" key={item.runId} role="row">
                <span>
                  <a className="portal-inline-link" href={buildRunDetailHref(item.runId, search)}>
                    {item.runId}
                  </a>
                </span>
                <span>{item.benchmarkLabel}</span>
                <span>{item.modelConfigLabel}</span>
                <span>{formatTimestamp(item.startedAt)}</span>
                <span className={`portal-state-badge portal-state-${item.runState}`}>
                  {runLifecycleStateLabels[item.runState]}
                </span>
                {item.verdictClass ? (
                  <span className={`portal-verdict-badge portal-verdict-${item.verdictClass}`}>
                    {evaluationVerdictLabels[item.verdictClass]}
                  </span>
                ) : (
                  <span className="role-chip role-chip-muted">In progress</span>
                )}
              </div>
            ))}
          </div>
        )
      ) : loadState.data ? (
        <PortalEmptyState
          description="Broaden the current filters or clear them to repopulate the shared run index."
          title="No runs matched this filter set."
        />
      ) : (
        <PortalEmptyState
          description="Refresh the route to reload the current benchmark-operations run index."
          title={getPortalBenchmarkOpsUnavailableTitle("runs", null)}
        />
      )}
    </article>
  );

  const quickFiltersPanel = (
    <article className="portal-panel portal-runs-quick-filter-panel">
      <div className="portal-panel-header">
        <div>
          <p className="section-tag">Slice controls</p>
          <h2>Refine the current slice before opening one run&apos;s evidence.</h2>
        </div>
      </div>
      <div className="portal-form-grid portal-runs-quick-filter-grid">
        <label className="portal-field">
          <span>Search</span>
          <input
            className="input"
            onChange={(event) => {
              updateRunsQuery(pathname, query, onReplaceLocation, { q: event.target.value || null });
            }}
            placeholder="run id, package, model, failure"
            type="search"
            value={query.q ?? ""}
          />
        </label>
        <label className="portal-field">
          <span>Lifecycle bucket</span>
          <select
            className="input"
            onChange={(event) => {
              updateRunsQuery(pathname, query, onReplaceLocation, {
                lifecycleBucket: (event.target.value || null) as PortalRunsLifecycleBucket | null
              });
            }}
            value={query.lifecycleBucket ?? ""}
          >
            <option value="">All buckets</option>
            {portalRunsLifecycleBuckets.map((bucket) => (
              <option key={bucket.id} value={bucket.id}>
                {bucket.label}
              </option>
            ))}
          </select>
        </label>
        <label className="portal-field">
          <span>Benchmark package</span>
          <select
            className="input"
            onChange={(event) => {
              updateRunsQuery(pathname, query, onReplaceLocation, {
                benchmarkPackageId: event.target.value || null
              });
            }}
            value={query.benchmarkPackageId ?? ""}
          >
            <option value="">All packages</option>
            {benchmarkPackageOptions.map((packageId) => (
              <option key={packageId} value={packageId}>
                {packageId}
              </option>
            ))}
          </select>
        </label>
        <label className="portal-field">
          <span>Verdict</span>
          <select
            className="input"
            onChange={(event) => {
              updateRunsQuery(pathname, query, onReplaceLocation, {
                verdict: event.target.value ? [event.target.value as EvaluationVerdictClass] : []
              });
            }}
            value={query.verdict[0] ?? ""}
          >
            <option value="">All verdicts</option>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
            <option value="invalid_result">Invalid result</option>
          </select>
        </label>
        <label className="portal-field">
          <span>Sort</span>
          <select
            className="input"
            onChange={(event) => {
              updateRunsQuery(pathname, query, onReplaceLocation, {
                sort: event.target.value as PortalRunsListQuery["sort"]
              });
            }}
            value={query.sort}
          >
            {portalRunsSortOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="portal-field">
          <span>Provider</span>
          <select
            className="input"
            onChange={(event) => {
              updateRunsQuery(pathname, query, onReplaceLocation, {
                providerFamily: event.target.value || null
              });
            }}
            value={query.providerFamily ?? ""}
          >
            <option value="">All providers</option>
            {providerOptions.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>
        <label className="portal-field">
          <span>Model config</span>
          <select
            className="input"
            onChange={(event) => {
              updateRunsQuery(pathname, query, onReplaceLocation, {
                modelConfigId: event.target.value || null
              });
            }}
            value={query.modelConfigId ?? ""}
          >
            <option value="">All configs</option>
            {modelOptions.map((entry) => (
              <option key={entry.modelConfigId} value={entry.modelConfigId}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="portal-chip-row">
        <button
          className="portal-inline-button"
          onClick={() => {
            onReplaceLocation(pathname, "");
          }}
          type="button"
        >
          Reset filters
        </button>
      </div>
    </article>
  );

  const resultsPanel = (
    <article className="portal-panel portal-results-panel portal-results-panel-compact">
      <div className="portal-panel-header">
        <div>
          <p className="section-tag">Benchmark operations</p>
          <h2>Runs keeps search, export, and evidence drill-down on the portal.</h2>
        </div>
        <div className="portal-toolbar">
          <button
            className="button button-secondary"
            disabled={!loadState.data?.items.length}
            onClick={() => {
              if (loadState.data) {
                downloadRunsCsv(loadState.data.items);
              }
            }}
            type="button"
          >
            Export CSV
          </button>
          <button
            className="button button-secondary"
            disabled={!selectedBenchmarkPackageId || datasetExportState.format !== null}
            onClick={() => {
              void handleDatasetExport("json");
            }}
            type="button"
          >
            {datasetExportState.format === "json" ? "Exporting JSON" : "Export package JSON"}
          </button>
          <button
            className="button button-secondary"
            disabled={!selectedBenchmarkPackageId || datasetExportState.format !== null}
            onClick={() => {
              void handleDatasetExport("csv");
            }}
            type="button"
          >
            {datasetExportState.format === "csv" ? "Exporting CSV" : "Export package CSV"}
          </button>
          <a className="button button-secondary" href={buildPortalUrl("/")}>
            Overview
          </a>
        </div>
      </div>
      <div className="portal-chip-row">
        <span className="role-chip role-chip-tonal">
          {loadState.data?.summary.totalMatches ?? 0} matches
        </span>
        <span className="role-chip role-chip-muted">
          {loadState.data?.summary.activeRuns ?? 0} active
        </span>
        <span className="role-chip role-chip-muted">
          {loadState.data?.summary.failedRuns ?? 0} failed
        </span>
        {selectedBenchmarkPackageId ? (
          <span className="role-chip role-chip-muted">
            package {selectedBenchmarkPackageId}
          </span>
        ) : null}
      </div>
      {datasetExportState.error ? <PortalErrorState error={datasetExportState.error} /> : null}
    </article>
  );

  const supportPanel = (
    <article className="portal-panel portal-runs-support-panel">
      <div className="portal-panel-header">
        <div>
          <p className="section-tag">Freshness</p>
          <h2>Keep the current slice grounded before drilling into one run.</h2>
        </div>
      </div>
      <p className="portal-panel-muted">
        Filter and export from the portal, then open one run&apos;s evidence in
        <code className="portal-inline-code"> /runs/:runId</code>.
      </p>
      <p className="portal-panel-muted">
        Package dataset export unlocks once one benchmark package is selected in the current slice.
      </p>
      <PortalFreshnessCard
        isRefreshing={loadState.isLoading}
        lastUpdatedAt={loadState.lastUpdatedAt}
        onRefresh={() => {
          void onRefresh();
        }}
        routeId={activeRouteId}
      />
    </article>
  );

  if (isCompactLayout) {
    const compactSections = {
      quickFilters: quickFiltersPanel,
      resultsPanel,
      runsSlice,
      supportPanel
    };

    return (
      <section className="portal-grid portal-grid-stack">
        {loadState.error ? <PortalErrorState error={loadState.error} /> : null}
        {getCompactRunsSectionOrder().map((sectionId) => (
          <Fragment key={sectionId}>{compactSections[sectionId]}</Fragment>
        ))}
      </section>
    );
  }

  return (
    <section className="portal-grid portal-grid-stack">
      <article className="portal-panel portal-results-panel">
        <div className="portal-panel-header">
          <div>
            <p className="section-tag">Benchmark operations</p>
            <h2>Runs keeps search, export, and evidence drill-down on the portal.</h2>
          </div>
          <div className="portal-toolbar">
            <button
              className="button button-secondary"
              disabled={!loadState.data?.items.length}
              onClick={() => {
                if (loadState.data) {
                  downloadRunsCsv(loadState.data.items);
                }
              }}
              type="button"
            >
              Export CSV
            </button>
            <a className="button button-secondary" href={buildPortalUrl("/")}>
              Overview
            </a>
          </div>
        </div>
        <p className="portal-panel-muted">
          Filter, export, and triage runs here, then open one run&apos;s evidence in
          <code className="portal-inline-code"> /runs/:runId</code>.
        </p>
        <PortalFreshnessCard
          isRefreshing={loadState.isLoading}
          lastUpdatedAt={loadState.lastUpdatedAt}
          onRefresh={() => {
            void onRefresh();
          }}
          routeId={activeRouteId}
        />
        <div className="portal-form-grid">
          <label className="portal-field">
            <span>Search</span>
            <input
              className="input"
              onChange={(event) => {
                updateRunsQuery(pathname, query, onReplaceLocation, { q: event.target.value || null });
              }}
              placeholder="run id, package, model, failure"
              type="search"
              value={query.q ?? ""}
            />
          </label>
          <label className="portal-field">
            <span>Lifecycle bucket</span>
            <select
              className="input"
              onChange={(event) => {
                updateRunsQuery(pathname, query, onReplaceLocation, {
                  lifecycleBucket: (event.target.value || null) as PortalRunsLifecycleBucket | null
                });
              }}
              value={query.lifecycleBucket ?? ""}
            >
              <option value="">All buckets</option>
              {portalRunsLifecycleBuckets.map((bucket) => (
                <option key={bucket.id} value={bucket.id}>
                  {bucket.label}
                </option>
              ))}
            </select>
          </label>
          <label className="portal-field">
            <span>Verdict</span>
            <select
              className="input"
              onChange={(event) => {
                updateRunsQuery(pathname, query, onReplaceLocation, {
                  verdict: event.target.value ? [event.target.value as EvaluationVerdictClass] : []
                });
              }}
              value={query.verdict[0] ?? ""}
            >
              <option value="">All verdicts</option>
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
              <option value="invalid_result">Invalid result</option>
            </select>
          </label>
          <label className="portal-field">
            <span>Sort</span>
            <select
              className="input"
              onChange={(event) => {
                updateRunsQuery(pathname, query, onReplaceLocation, {
                  sort: event.target.value as PortalRunsListQuery["sort"]
                });
              }}
              value={query.sort}
            >
              {portalRunsSortOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="portal-field">
            <span>Provider</span>
            <select
              className="input"
              onChange={(event) => {
                updateRunsQuery(pathname, query, onReplaceLocation, {
                  providerFamily: event.target.value || null
                });
              }}
              value={query.providerFamily ?? ""}
            >
              <option value="">All providers</option>
              {providerOptions.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </label>
          <label className="portal-field">
            <span>Model config</span>
            <select
              className="input"
              onChange={(event) => {
                updateRunsQuery(pathname, query, onReplaceLocation, {
                  modelConfigId: event.target.value || null
                });
              }}
              value={query.modelConfigId ?? ""}
            >
              <option value="">All configs</option>
              {modelOptions.map((entry) => (
                <option key={entry.modelConfigId} value={entry.modelConfigId}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="portal-chip-row">
          <span className="role-chip role-chip-tonal">
            {loadState.data?.summary.totalMatches ?? 0} matches
          </span>
          <span className="role-chip role-chip-muted">
            {loadState.data?.summary.activeRuns ?? 0} active
          </span>
          <span className="role-chip role-chip-muted">
            {loadState.data?.summary.failedRuns ?? 0} failed
          </span>
          <button
            className="portal-inline-button"
            onClick={() => {
              onReplaceLocation(pathname, "");
            }}
            type="button"
          >
            Reset filters
          </button>
        </div>
      </article>

      {loadState.error ? <PortalErrorState error={loadState.error} /> : null}

      {runsSlice}
    </section>
  );
}

export function PortalRunDetailSurface({
  activeRouteId,
  loadState,
  onRefresh,
  search
}: SurfaceProps<PortalRunDetailResponse> & {
  search: string;
}) {
  const detail = loadState.data;
  const awaitingFirstLoad = isAwaitingFirstLoad(loadState);
  const runsIndexHref = buildRunsIndexHref(search);
  const isCompactLayout = useCompactLayout(480);
  const latestTimelineEntry = detail?.timeline.at(-1) ?? null;
  const freshnessCard = (
    <PortalFreshnessCard
      isRefreshing={loadState.isLoading}
      lastUpdatedAt={loadState.lastUpdatedAt}
      onRefresh={() => {
        void onRefresh();
      }}
      routeId={activeRouteId}
    />
  );

  return (
    <section
      className={`portal-workspace-grid${
        isCompactLayout ? " portal-run-detail-workspace-compact" : ""
      }`}
    >
      <article
        className={`portal-panel portal-surface-main${
          isCompactLayout ? " portal-run-detail-main-compact" : ""
        }`}
      >
        <div className="portal-panel-header">
          <div>
            {!isCompactLayout ? <p className="section-tag">Run evidence</p> : null}
            <h2>{detail ? `${detail.item.runId} evidence` : "Run evidence"}</h2>
          </div>
          <a className="button button-secondary" href={runsIndexHref}>
            Back to runs
          </a>
        </div>
        {!isCompactLayout ? freshnessCard : null}
        {loadState.error ? <PortalErrorState error={loadState.error} /> : null}
        {awaitingFirstLoad ? (
          <PortalLoadingState
            description="Fetching the current run timeline, lineage, and worker-linked evidence."
            title="Loading run evidence."
          />
        ) : detail ? (
          <>
            {isCompactLayout && latestTimelineEntry ? (
              <article className="portal-panel-table-flat portal-run-detail-quick-evidence">
                <div className="portal-panel-header">
                  <div>
                    <p className="section-tag">Current evidence</p>
                    <h2>Latest run signal stays in the first viewport.</h2>
                  </div>
                </div>
                <article className="portal-timeline-item portal-run-detail-highlight">
                  <strong>{latestTimelineEntry.label}</strong>
                  <p>
                    {latestTimelineEntry.scope}
                    {latestTimelineEntry.sourceId ? ` - ${latestTimelineEntry.sourceId}` : ""}
                  </p>
                  <small>{formatTimestamp(latestTimelineEntry.occurredAt)}</small>
                </article>
              </article>
            ) : null}
            <div className="portal-summary-grid">
              <article className="portal-summary-card">
                <span>Benchmark</span>
                <strong>{detail.item.benchmarkLabel}</strong>
                <small>{detail.item.benchmarkVersionId}</small>
              </article>
              <article className="portal-summary-card">
                <span>Model</span>
                <strong>{detail.item.modelConfigLabel}</strong>
                <small>{detail.item.providerFamily}</small>
              </article>
              <article className="portal-summary-card">
                <span>Lifecycle</span>
                <strong>{runLifecycleStateLabels[detail.item.runState]}</strong>
                <small>{formatDuration(detail.item.durationMs)}</small>
              </article>
              <article className="portal-summary-card">
                <span>Verdict</span>
                <strong>{getVerdictLabel(detail.item.verdictClass)}</strong>
                <small>{detail.item.failure.summary ?? "No terminal failure summary."}</small>
              </article>
            </div>
            {isCompactLayout ? freshnessCard : null}
            <div className="portal-detail-grid">
              <article className="portal-filter-card">
                <p className="section-tag">Lineage</p>
                <div className="portal-kv-grid">
                  <div><span>Latest job</span><strong>{detail.item.latestJobId ?? "none"}</strong></div>
                  <div><span>Latest attempt</span><strong>{detail.item.latestAttemptId ?? "none"}</strong></div>
                  <div><span>Attempts</span><strong>{detail.item.lineage.attemptCount}</strong></div>
                  <div><span>Jobs</span><strong>{detail.item.lineage.jobCount}</strong></div>
                </div>
              </article>
              <article className="portal-filter-card">
                <p className="section-tag">Failure</p>
                <div className="portal-kv-grid">
                  <div><span>Family</span><strong>{detail.item.failure.family ?? "none"}</strong></div>
                  <div><span>Code</span><strong>{detail.item.failure.code ?? "none"}</strong></div>
                  <div><span>Lane</span><strong>{detail.item.laneId}</strong></div>
                  <div><span>Tool profile</span><strong>{detail.item.toolProfile}</strong></div>
                </div>
              </article>
            </div>
            <article className="portal-panel-table-flat">
              <div className="portal-panel-header">
                <div>
                  <p className="section-tag">Timeline</p>
                  <h2>Run and worker evidence stay together in this detail view.</h2>
                </div>
              </div>
              <div className="portal-timeline">
                {detail.timeline.map((entry) => (
                  <article className="portal-timeline-item" key={`${entry.scope}-${entry.occurredAt}-${entry.label}`}>
                    <strong>{entry.label}</strong>
                    <p>{entry.scope}{entry.sourceId ? ` - ${entry.sourceId}` : ""}</p>
                    <small>{formatTimestamp(entry.occurredAt)}</small>
                  </article>
                ))}
              </div>
            </article>
          </>
        ) : (
          <PortalEmptyState
            description="Refresh the route or return to the shared run index to reopen evidence."
            title={getPortalBenchmarkOpsUnavailableTitle("runs", "__detail__")}
          />
        )}
      </article>

      <aside className="portal-surface-rail">
        <p className="section-tag">Next routes</p>
        <h2>Stay inside the benchmark-ops cluster.</h2>
        <div className="portal-action-list">
          <PortalLinkCard
            copy="Return to the shared filtered run index."
            href={runsIndexHref}
            title="Runs"
          />
          <PortalLinkCard
            copy="Check queue, lease, and incident posture against this run."
            href={buildPortalUrl("/workers")}
            title="Workers"
          />
          <PortalLinkCard
            copy="Stage the next benchmark run without leaving the portal cluster."
            href={buildPortalUrl("/launch")}
            title="Launch"
          />
        </div>
      </aside>
    </section>
  );
}

export function PortalLaunchSurface({
  activeRouteId,
  loadState,
  onRefresh,
  selection,
  setSelection
}: SurfaceProps<PortalLaunchViewResponse> & {
  selection: LaunchSelectionState;
  setSelection: Dispatch<SetStateAction<LaunchSelectionState>>;
}) {
  const isCompactLayout = useCompactLayout(480);
  const awaitingFirstLoad = isAwaitingFirstLoad(loadState);
  const benchmark = loadState.data?.benchmarks.find(
    (item) => item.benchmarkVersionId === selection.benchmarkVersionId
  );
  const modelConfig = loadState.data?.modelConfigs.find(
    (item) => item.modelConfigId === selection.modelConfigId
  );
  const supportedRunKinds = getSupportedLaunchRunKinds(loadState.data);
  const unsupportedRunKinds = getUnsupportedLaunchRunKinds(loadState.data);
  const selectedRunKind =
    supportedRunKinds.find((item) => item.id === selection.runKind) ?? supportedRunKinds[0] ?? null;
  const effectiveConcurrencyCap = selectedRunKind
    ? getEffectiveLaunchConcurrencyCap(loadState.data, selectedRunKind.id)
    : loadState.data?.governance.defaultPolicy.concurrency.maxConcurrentJobsPerRun ?? null;
  const unsupportedRequiredFields = [
    ...new Set(
      unsupportedRunKinds.flatMap((item) =>
        item.requiredFields.filter((fieldId) => !launchPreflightSupportedFieldIds.has(fieldId))
      )
    )
  ].map(formatLaunchFieldLabel);
  const launchEvidenceHref = benchmark
    ? buildRunDetailHref(benchmark.lastSeenRunId)
    : buildPortalUrl("/runs");

  return (
    <section className="portal-workspace-grid">
      <article
        className={`portal-panel portal-surface-main${
          isCompactLayout ? " portal-launch-panel-compact" : ""
        }`}
      >
        <div className="portal-panel-header">
          <div>
            {!isCompactLayout ? <p className="section-tag">Launch preflight</p> : null}
            <h2>Launch keeps benchmark selection, run shape, and guardrails on the portal.</h2>
          </div>
          <span className="role-chip role-chip-tonal">
            {formatSubmissionMode(loadState.data?.submissionMode ?? "preflight_only")}
          </span>
        </div>
        {!isCompactLayout ? (
          <PortalFreshnessCard
            isRefreshing={loadState.isLoading}
            lastUpdatedAt={loadState.lastUpdatedAt}
            onRefresh={() => {
              void onRefresh();
            }}
            routeId={activeRouteId}
          />
        ) : null}
        {loadState.error ? <PortalErrorState error={loadState.error} /> : null}
        {awaitingFirstLoad ? (
          <PortalLoadingState
            description="Fetching launch metadata, benchmark packages, and current governance guidance."
            title="Loading launch preflight."
          />
        ) : hasLaunchOptions(loadState.data) ? (
          <>
            <div className="portal-form-grid">
              <label className="portal-field">
                <span>Benchmark package</span>
                <select
                  className="input"
                  onChange={(event) => {
                    setSelection((current) => ({ ...current, benchmarkVersionId: event.target.value }));
                  }}
                  value={selection.benchmarkVersionId}
                >
                  {(loadState.data?.benchmarks ?? []).map((item) => (
                    <option key={item.benchmarkVersionId} value={item.benchmarkVersionId}>
                      {item.benchmarkLabel}
                    </option>
                  ))}
                </select>
              </label>
              <label className="portal-field">
                <span>Model config</span>
                <select
                  className="input"
                  onChange={(event) => {
                    setSelection((current) => ({ ...current, modelConfigId: event.target.value }));
                  }}
                  value={selection.modelConfigId}
                >
                  {(loadState.data?.modelConfigs ?? []).map((item) => (
                    <option key={item.modelConfigId} value={item.modelConfigId}>
                      {item.modelConfigLabel}
                    </option>
                  ))}
                </select>
              </label>
              <label className="portal-field">
                <span>Run kind</span>
                <select
                  className="input"
                  onChange={(event) => {
                    setSelection((current) => ({ ...current, runKind: event.target.value as RunKind }));
                  }}
                  value={selection.runKind}
                >
                  {supportedRunKinds.map((item) => (
                    <option key={item.id} value={item.id}>
                      {formatRunKind(item.id)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {unsupportedRunKinds.length > 0 ? (
              <div className="portal-results-contract-card">
                <p className="section-tag">Unavailable run shapes</p>
                <h3>Additional run kinds stay out of this preflight until target inputs land.</h3>
                <p>
                  {unsupportedRunKinds.map((item) => formatRunKind(item.id)).join(", ")} still need{" "}
                  {unsupportedRequiredFields.join(", ")}
                  .
                </p>
              </div>
            ) : null}
            {isCompactLayout ? (
              <PortalFreshnessCard
                isRefreshing={loadState.isLoading}
                lastUpdatedAt={loadState.lastUpdatedAt}
                onRefresh={() => {
                  void onRefresh();
                }}
                routeId={activeRouteId}
              />
            ) : null}
            {isCompactLayout ? (
              <div className="portal-launch-quick-actions" aria-label="Launch next steps">
                <a className="button button-secondary" href={launchEvidenceHref}>
                  Open evidence
                </a>
                <a className="button button-secondary" href={buildPortalUrl("/runs")}>
                  Review runs
                </a>
              </div>
            ) : null}
            {benchmark && modelConfig ? (
              <div className="portal-results-contract-grid">
                <article className="portal-results-contract-card">
                  <p className="section-tag">Benchmark</p>
                  <h3>{benchmark.benchmarkLabel}</h3>
                  <p>
                    Observed in {benchmark.benchmarkItemCount} prior runs across {benchmark.laneIds.join(", ")}.
                  </p>
                  <a className="portal-inline-link" href={buildRunDetailHref(benchmark.lastSeenRunId)}>
                    Open last seen run
                  </a>
                </article>
                <article className="portal-results-contract-card">
                  <p className="section-tag">Model config</p>
                  <h3>{modelConfig.modelConfigLabel}</h3>
                  <p>{modelConfig.providerFamily} / {modelConfig.toolProfiles.join(", ")}</p>
                  <p>Auth: {modelConfig.authModes.join(", ")}</p>
                </article>
                <article className="portal-results-contract-card">
                  <p className="section-tag">Governance</p>
                  <h3>{selectedRunKind ? formatRunKind(selectedRunKind.id) : formatRunKind(selection.runKind)}</h3>
                  <p>
                    Max per run: {effectiveConcurrencyCap}
                    {" "}jobs
                  </p>
                  <p>
                    Budget cap: ${loadState.data?.governance.defaultPolicy.budget.maxEstimatedUsdPerRun}
                  </p>
                  {selectedRunKind ? (
                    <p>
                      Required preflight fields:{" "}
                      {selectedRunKind.requiredFields.map(formatLaunchFieldLabel).join(", ")}
                    </p>
                  ) : null}
                </article>
              </div>
            ) : (
              <PortalEmptyState
                description="Refresh launch preflight to restore the selected benchmark package and model config."
                title="Launch selection is incomplete."
              />
            )}
          </>
        ) : (
          <PortalEmptyState
            description="Refresh the route once benchmark packages, model configs, and run kinds are available again."
            title={getPortalBenchmarkOpsUnavailableTitle("launch", null)}
          />
        )}
      </article>

      <aside className="portal-surface-rail">
        <p className="section-tag">Current evidence trail</p>
        <h2>Use launch to stage the next run, then continue into evidence and operations.</h2>
        <div className="portal-action-list">
          <PortalLinkCard
            copy="Compare the selected benchmark package against current run evidence."
            href={buildPortalUrl("/runs")}
            title="Review runs"
          />
          <PortalLinkCard
            copy="Open the most recent evidence linked to the selected benchmark package."
            href={launchEvidenceHref}
            title="Open current evidence"
          />
          <PortalLinkCard
            copy="Check queue pressure and worker posture before the next run leaves preflight."
            href={buildPortalUrl("/workers")}
            title="Workers"
          />
        </div>
      </aside>
    </section>
  );
}

export function PortalWorkersSurface({
  activeRouteId,
  loadState,
  onRefresh
}: SurfaceProps<PortalWorkersViewResponse>) {
  const data = loadState.data;
  const workerOpsFreshness = data?.freshness ?? null;
  const awaitingFirstLoad = isAwaitingFirstLoad(loadState);
  const isCompactLayout = useCompactLayout(480);
  const compactEvidenceCards = buildWorkersCompactEvidenceCards(data);
  const freshnessCard = (
    <PortalFreshnessCard
      isRefreshing={loadState.isLoading}
      lastUpdatedAt={workerOpsFreshness?.generatedAt ?? loadState.lastUpdatedAt}
      onRefresh={() => {
        void onRefresh();
      }}
      routeId={activeRouteId}
      workerOpsFreshness={workerOpsFreshness}
    />
  );

  return (
    <section
      className={`portal-workspace-grid${
        isCompactLayout ? " portal-workers-workspace-compact" : ""
      }`}
    >
      <article
        className={`portal-panel portal-surface-main${
          isCompactLayout ? " portal-workers-main-compact" : ""
        }`}
      >
        <div className="portal-panel-header">
          <div>
            {!isCompactLayout ? <p className="section-tag">Worker operations</p> : null}
            <h2>Workers gives the current fleet overview, pool posture, and recovery signals.</h2>
          </div>
          <a className="button button-secondary" href={buildPortalUrl("/runs")}>
            Jump to runs
          </a>
        </div>
        {!isCompactLayout ? freshnessCard : null}
        {loadState.error ? <PortalErrorState error={loadState.error} /> : null}
        {awaitingFirstLoad ? (
          <PortalLoadingState
            description="Fetching queue posture, worker pools, active leases, and current incidents."
            title="Loading worker operations."
          />
        ) : data ? (
          <>
            {isCompactLayout && compactEvidenceCards.length ? (
              <article className="portal-panel-table-flat portal-workers-quick-evidence">
                <div className="portal-panel-header">
                  <div>
                    <p className="section-tag">Concrete evidence</p>
                    <h2>Jump straight into the current worker-linked runs.</h2>
                  </div>
                </div>
                <div className="portal-action-list">
                  {compactEvidenceCards.map((card) => (
                    <PortalLinkCard copy={card.copy} href={card.href} key={card.title} title={card.title} />
                  ))}
                </div>
              </article>
            ) : null}
            <PortalWorkerOpsFreshnessBanner freshness={data.freshness} />
            <div className="portal-summary-grid">
              <article className="portal-summary-card">
                <span>Queued jobs</span>
                <strong>{data.queueSummary.queuedJobs}</strong>
                <small>{data.queueSummary.queuedRuns} queued runs</small>
              </article>
              <article className="portal-summary-card">
                <span>Running jobs</span>
                <strong>{data.queueSummary.runningJobs}</strong>
                <small>{data.queueSummary.activeRuns} active runs</small>
              </article>
              <article className="portal-summary-card">
                <span>Claimed jobs</span>
                <strong>{data.queueSummary.claimedJobs}</strong>
                <small>{data.queueSummary.cancelRequestedJobs} cancel requested</small>
              </article>
              <article className="portal-summary-card">
                <span>Observed through</span>
                <strong>
                  {data.freshness.observedThrough
                    ? formatTimestamp(data.freshness.observedThrough)
                    : "No observations"}
                </strong>
                <small>API-owned worker freshness</small>
              </article>
            </div>
            {isCompactLayout ? freshnessCard : null}
            {data.workerPools.length ? (
              <article className="portal-panel-table-flat">
                <div className="portal-panel-header">
                  <div>
                    <p className="section-tag">Pool posture</p>
                    <h2>Worker pools stay bounded to fields the API exposes today.</h2>
                  </div>
                </div>
                <div className="portal-results-contract-grid">
                  {data.workerPools.map((pool) => (
                    <article
                      className="portal-results-contract-card"
                      key={`${pool.workerPool}:${pool.workerRuntime}:${pool.workerVersion ?? "unseen"}`}
                    >
                      <p className="section-tag">Worker pool</p>
                      <h3>{pool.workerPool}</h3>
                      <p>{pool.workerRuntime} / {pool.workerVersion ?? "no workers seen yet"}</p>
                      <p>
                        Active leases: {pool.activeLeaseCount} / stale leases: {pool.staleLeaseCount}
                      </p>
                      {pool.activeRunIds.length ? (
                        <a className="portal-inline-link" href={buildRunDetailHref(pool.activeRunIds[0])}>
                          Open {pool.activeRunIds[0]}
                        </a>
                      ) : null}
                    </article>
                  ))}
                </div>
              </article>
            ) : (
              <PortalEmptyState
                description="Refresh the worker operations view to reload current pool and lease posture."
                title="No worker pools are reporting yet."
              />
            )}
            <article className="portal-panel-table-flat">
              <div className="portal-panel-header">
                <div>
                  <p className="section-tag">Incidents</p>
                  <h2>Active incidents route operators to concrete runs.</h2>
                </div>
              </div>
              {data.incidents.length ? (
                <div className="portal-action-list">
                  {data.incidents.map((incident) => (
                    <article className="portal-action-card" key={`${incident.kind}-${incident.observedAt}`}>
                      <div>
                        <p className="portal-action-title">
                          <span className={`role-chip ${getWorkerIncidentTone(incident.severity)}`}>
                            {incident.severity}
                          </span>
                          {incident.summary}
                        </p>
                        <p className="portal-action-copy">
                          {incident.workerPool ?? "all pools"} / {formatTimestamp(incident.observedAt)}
                        </p>
                      </div>
                      {incident.affectedRunIds[0] ? (
                        <a
                          className="button button-secondary"
                          href={buildRunDetailHref(incident.affectedRunIds[0])}
                        >
                          Open run
                        </a>
                      ) : (
                        <span className="portal-action-badge">No run linked</span>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <PortalEmptyState
                  description="No worker incidents are currently linked to this read model snapshot."
                  title="No worker incidents are active."
                />
              )}
            </article>
          </>
        ) : (
          <PortalEmptyState
            description="Refresh the route to reload queue posture, worker pools, and active leases."
            title={getPortalBenchmarkOpsUnavailableTitle("workers", null)}
          />
        )}
      </article>

      <aside className="portal-surface-rail">
        <p className="section-tag">Stale leases and active runs</p>
        <h2>Lease posture stays tied to run evidence until worker-ops detail routes land.</h2>
        {(data?.activeLeases ?? []).length ? (
          <div className="portal-action-list">
            {(data?.activeLeases ?? []).map((lease) => (
              <PortalLinkCard
                copy={`${lease.workerPool} / ${lease.health} / heartbeat ${lease.heartbeatIntervalSeconds}s`}
                href={buildRunDetailHref(lease.runId)}
                key={`${lease.runId}-${lease.workerId}`}
                title={`${lease.runId} on ${lease.workerId}`}
              />
            ))}
          </div>
        ) : (
          <PortalEmptyState
            description="Active leases will appear here once workers claim jobs from the shared queue."
            title="No active leases are visible."
          />
        )}
      </aside>
    </section>
  );
}

function PortalLinkCard({
  copy,
  href,
  title
}: {
  copy: string;
  href: string;
  title: string;
}) {
  return (
    <article className="portal-action-card portal-action-enabled">
      <div>
        <p className="portal-action-title">{title}</p>
        <p className="portal-action-copy">{copy}</p>
      </div>
      <a className="button button-secondary" href={href}>
        Open
      </a>
    </article>
  );
}

function buildWorkersCompactEvidenceCards(data: PortalWorkersViewResponse | null) {
  if (!data) {
    return [];
  }

  const cards: Array<{ copy: string; href: string; title: string }> = [];
  const seenHrefs = new Set<string>();

  const pushCard = (title: string, copy: string, runId: string | null | undefined) => {
    if (!runId) {
      return;
    }

    const href = buildRunDetailHref(runId);
    if (seenHrefs.has(href)) {
      return;
    }

    seenHrefs.add(href);
    cards.push({ copy, href, title });
  };

  const primaryLease = data.activeLeases[0];
  pushCard(
    primaryLease ? `${primaryLease.runId} lease` : "Active lease",
    primaryLease
      ? `${primaryLease.workerPool} on ${primaryLease.workerId} / ${primaryLease.health}`
      : "Open the first active lease run detail.",
    primaryLease?.runId ?? data.workerPools.find((pool) => pool.activeRunIds[0])?.activeRunIds[0]
  );

  const primaryIncident = data.incidents.find((incident) => incident.affectedRunIds[0]);
  pushCard(
    primaryIncident ? `${primaryIncident.affectedRunIds[0]} incident` : "Incident run",
    primaryIncident
      ? `${primaryIncident.severity} / ${primaryIncident.workerPool ?? "all pools"}`
      : "Open the first incident-linked run detail.",
    primaryIncident?.affectedRunIds[0]
  );

  return cards;
}

function PortalWorkerOpsFreshnessBanner({
  freshness
}: {
  freshness: PortalWorkerOpsFreshness;
}) {
  if (freshness.freshnessStatus === "live") {
    return null;
  }

  if (freshness.freshnessStatus === "degraded") {
    return (
      <article className="portal-feedback-card portal-feedback-error">
        <strong>Worker snapshot is degraded</strong>
        <p>
          The API returned a partial worker-operations snapshot: {freshness.degradationReason}.
        </p>
      </article>
    );
  }

  return (
    <article className="portal-feedback-card">
      <strong>Worker snapshot is stale</strong>
      <p>
        The API last observed worker data through{" "}
        {freshness.observedThrough ? formatTimestamp(freshness.observedThrough) : "an unknown time"}.
        Keep existing rows visible, but confirm current posture before taking operator action.
      </p>
    </article>
  );
}

function PortalErrorState({ error }: { error: string }) {
  return (
    <article className="portal-feedback-card portal-feedback-error">
      <strong>Request failed</strong>
      <p>{error}</p>
    </article>
  );
}

function PortalLoadingState({
  description,
  title
}: {
  description: string;
  title: string;
}) {
  return (
    <article className="portal-feedback-card">
      <strong>{title}</strong>
      <p>{description}</p>
    </article>
  );
}

function PortalEmptyState({
  description,
  title
}: {
  description: string;
  title: string;
}) {
  return (
    <article className="portal-feedback-card">
      <strong>{title}</strong>
      <p>{description}</p>
    </article>
  );
}
