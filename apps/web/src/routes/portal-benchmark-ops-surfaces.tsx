import {
  portalRunsLifecycleBuckets,
  portalRunsSortOptions,
  type EvaluationVerdictClass,
  type PortalRunsLifecycleBucket,
  type PortalLaunchViewResponse,
  type PortalRunDetailResponse,
  type PortalRunsListQuery,
  type PortalRunsListResponse,
  type PortalWorkersViewResponse,
  type RunKind
} from "@paretoproof/shared";
import {
  type Dispatch,
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
  fetchPortalLaunchView,
  fetchPortalRunDetail,
  fetchPortalRunsView,
  fetchPortalWorkersView,
  getWorkerIncidentTone,
  parsePortalRunsQuery
} from "../lib/portal-benchmark-ops";
import { usePortalPolling } from "../lib/portal-freshness";
import { evaluationVerdictLabels, runLifecycleStateLabels } from "../lib/results-state";
import { buildPortalUrl } from "../lib/surface";
import { useCompactLayout } from "../lib/use-compact-layout";

type PortalBenchmarkOpsSurfaceProps = {
  activeRouteId: string;
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

function formatDuration(durationMs: number) {
  if (durationMs <= 0) {
    return "Queued";
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatRunKind(value: string) {
  return value.replaceAll("_", " ");
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
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = `paretoproof-runs-${new Date().toISOString().slice(0, 19)}.csv`;
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
  const runDetailRequestIdRef = useRef(0);
  const [launchSelection, setLaunchSelection] = useState<LaunchSelectionState>({
    benchmarkVersionId: "",
    modelConfigId: "",
    runKind: "single_run"
  });

  const loadRuns = useCallback(async () => {
    setRunsState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await fetchPortalRunsView(runsQuery);
      setRunsState({
        data,
        error: null,
        isLoading: false,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (error) {
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

      if (requestId !== runDetailRequestIdRef.current) {
        return;
      }

      setRunDetailState({
        data,
        error: null,
        isLoading: false,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (error) {
      if (requestId !== runDetailRequestIdRef.current) {
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

    setLaunchSelection((current) => ({
      benchmarkVersionId:
        current.benchmarkVersionId || launchState.data?.benchmarks[0]?.benchmarkVersionId || "",
      modelConfigId: current.modelConfigId || launchState.data?.modelConfigs[0]?.modelConfigId || "",
      runKind: current.runKind || launchState.data?.runKinds[0]?.id || "single_run"
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
  activeRouteId: string;
  loadState: LoadState<TData>;
  onRefresh: () => Promise<void>;
};

function PortalRunsSurface({
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
  const providerOptions = buildRunsProviderOptions(
    loadState.data?.items ?? [],
    query.providerFamily
  );
  const modelOptions = buildRunsModelOptions(
    loadState.data?.items ?? [],
    query.modelConfigId
  );
  const isCompactLayout = useCompactLayout(480);

  const runsSlice = (
    <article
      className={`portal-panel-table-flat${isCompactLayout ? " portal-run-slice-compact" : ""}`}
    >
      <div className="portal-panel-header">
        <div>
          <p className="section-tag">Run slice</p>
          <h2>
            {isCompactLayout
              ? "Runs route into canonical detail pages."
              : "Filtered rows route into canonical detail pages."}
          </h2>
        </div>
        <span className="role-chip role-chip-muted">
          {loadState.data?.summary.returnedCount ?? 0} shown
        </span>
      </div>
      {loadState.data?.items.length ? (
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
                  <span className={`portal-verdict-badge portal-verdict-${item.verdictClass}`}>
                    {evaluationVerdictLabels[item.verdictClass]}
                  </span>
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
                <span className={`portal-verdict-badge portal-verdict-${item.verdictClass}`}>
                  {evaluationVerdictLabels[item.verdictClass]}
                </span>
              </div>
            ))}
          </div>
        )
      ) : (
        <PortalEmptyState
          description="Broaden the current filters or clear them to return to the canonical slice."
          title="No runs matched this filter set."
        />
      )}
    </article>
  );

  if (isCompactLayout) {
    return (
      <section className="portal-grid portal-grid-stack">
        {loadState.error ? <PortalErrorState error={loadState.error} /> : null}

        <article className="portal-panel portal-runs-quick-filter-panel">
          <div className="portal-panel-header">
            <div>
              <p className="section-tag">Quick filters</p>
              <h2>Refine the slice before dropping into the full list.</h2>
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
          </div>
        </article>

        <article className="portal-panel portal-results-panel portal-results-panel-compact">
          <div className="portal-panel-header">
            <div>
              <p className="section-tag">Canonical private index</p>
              <h2>Runs is the benchmark-operations entry point for approved contributors.</h2>
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
          </div>
        </article>

        <article className="portal-panel portal-runs-support-panel">
          <div className="portal-panel-header">
            <div>
              <p className="section-tag">Refine the slice</p>
              <h2>Filter and refresh the full private index.</h2>
            </div>
          </div>
          <p className="portal-panel-muted">
            Filter, export, and triage runs here. Route into one run&apos;s evidence at
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

        {runsSlice}
      </section>
    );
  }

  return (
    <section className="portal-grid portal-grid-stack">
      <article className="portal-panel portal-results-panel">
        <div className="portal-panel-header">
          <div>
            <p className="section-tag">Canonical private index</p>
            <h2>Runs is the benchmark-operations entry point for approved contributors.</h2>
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
          Filter, export, and triage runs here. Route into one run&apos;s evidence at
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

function PortalRunDetailSurface({
  activeRouteId,
  loadState,
  onRefresh,
  search
}: SurfaceProps<PortalRunDetailResponse> & {
  search: string;
}) {
  const detail = loadState.data;
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
            {!isCompactLayout ? <p className="section-tag">Canonical run detail</p> : null}
            <h2>{detail?.item.runId ?? "Run detail"}</h2>
          </div>
          <a className="button button-secondary" href={runsIndexHref}>
            Back to runs
          </a>
        </div>
        {!isCompactLayout ? freshnessCard : null}
        {loadState.error ? <PortalErrorState error={loadState.error} /> : null}
        {detail ? (
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
                <strong>{evaluationVerdictLabels[detail.item.verdictClass]}</strong>
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
                  <h2>Run and worker evidence stay on this route.</h2>
                </div>
              </div>
              <div className="portal-timeline">
                {detail.timeline.map((entry) => (
                  <article className="portal-timeline-item" key={`${entry.scope}-${entry.occurredAt}-${entry.label}`}>
                    <strong>{entry.label}</strong>
                    <p>{entry.scope} {entry.sourceId ? `· ${entry.sourceId}` : ""}</p>
                    <small>{formatTimestamp(entry.occurredAt)}</small>
                  </article>
                ))}
              </div>
            </article>
          </>
        ) : (
          <PortalEmptyState
            description="Refresh the view or route back to the runs index."
            title="No run detail is loaded yet."
          />
        )}
      </article>

      <aside className="portal-surface-rail">
        <p className="section-tag">Route flows</p>
        <h2>Continue through the benchmark-ops cluster.</h2>
        <div className="portal-action-list">
          <PortalLinkCard
            copy="Return to the canonical filtered run index."
            href={runsIndexHref}
            title="Runs"
          />
          <PortalLinkCard
            copy="Check worker lease posture against this run."
            href={buildPortalUrl("/workers")}
            title="Workers"
          />
          <PortalLinkCard
            copy="Use launch for the next execution intent, not this detail console."
            href={buildPortalUrl("/launch")}
            title="Launch"
          />
        </div>
      </aside>
    </section>
  );
}

function PortalLaunchSurface({
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
  const benchmark = loadState.data?.benchmarks.find(
    (item) => item.benchmarkVersionId === selection.benchmarkVersionId
  );
  const modelConfig = loadState.data?.modelConfigs.find(
    (item) => item.modelConfigId === selection.modelConfigId
  );
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
            {!isCompactLayout ? <p className="section-tag">Create run intent</p> : null}
            <h2>Launch stays focused on preflight, not history.</h2>
          </div>
          <span className="role-chip role-chip-tonal">
            {loadState.data?.submissionMode ?? "preflight_only"}
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
              {(loadState.data?.runKinds ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {formatRunKind(item.id)}
                </option>
              ))}
            </select>
          </label>
        </div>
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
        {benchmark && modelConfig ? (
          <div className="portal-results-contract-grid">
            <article className="portal-results-contract-card">
              <p className="section-tag">Benchmark</p>
              <h3>{benchmark.benchmarkLabel}</h3>
              <p>{benchmark.benchmarkItemCount} items across {benchmark.laneIds.join(", ")}.</p>
              <a className="portal-inline-link" href={buildRunDetailHref(benchmark.lastSeenRunId)}>
                Open last seen run
              </a>
            </article>
            <article className="portal-results-contract-card">
              <p className="section-tag">Model config</p>
              <h3>{modelConfig.modelConfigLabel}</h3>
              <p>{modelConfig.providerFamily} · {modelConfig.toolProfiles.join(", ")}</p>
              <p>Auth: {modelConfig.authModes.join(", ")}</p>
            </article>
            <article className="portal-results-contract-card">
              <p className="section-tag">Governance</p>
              <h3>{formatRunKind(selection.runKind)}</h3>
              <p>
                Max per run: {loadState.data?.governance.defaultPolicy.concurrency.maxConcurrentJobsPerRun}
                {" "}jobs
              </p>
              <p>
                Budget cap: ${loadState.data?.governance.defaultPolicy.budget.maxEstimatedUsdPerRun}
              </p>
            </article>
          </div>
        ) : null}
      </article>

      <aside className="portal-surface-rail">
        <p className="section-tag">Current handoff</p>
        <h2>Submit will redirect into run detail once create-run exists.</h2>
        <div className="portal-action-list">
          <PortalLinkCard
            copy="Inspect the current benchmark slice or benchmark-wide activity."
            href={buildPortalUrl("/runs")}
            title="Review runs"
          />
          <PortalLinkCard
            copy="Preflight is currently read-only; use the last seen run as the concrete evidence target."
            href={launchEvidenceHref}
            title="Open current evidence"
          />
        </div>
      </aside>
    </section>
  );
}

function PortalWorkersSurface({
  activeRouteId,
  loadState,
  onRefresh
}: SurfaceProps<PortalWorkersViewResponse>) {
  const data = loadState.data;
  const isCompactLayout = useCompactLayout(480);
  const compactEvidenceCards = buildWorkersCompactEvidenceCards(data);
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
            {!isCompactLayout ? <p className="section-tag">Execution posture</p> : null}
            <h2>Workers owns queue and lease health.</h2>
          </div>
          <a className="button button-secondary" href={buildPortalUrl("/runs")}>
            Jump to runs
          </a>
        </div>
        {!isCompactLayout ? freshnessCard : null}
        {loadState.error ? <PortalErrorState error={loadState.error} /> : null}
        {data ? (
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
                <span>Generated</span>
                <strong>{formatTimestamp(data.generatedAt)}</strong>
                <small>Route refresh evidence</small>
              </article>
            </div>
            {isCompactLayout ? freshnessCard : null}
            <div className="portal-results-contract-grid">
              {data.workerPools.map((pool) => (
                <article className="portal-results-contract-card" key={pool.workerPool}>
                  <p className="section-tag">Worker pool</p>
                  <h3>{pool.workerPool}</h3>
                  <p>{pool.workerRuntime} · {pool.workerVersion}</p>
                  <p>
                    Active leases: {pool.activeLeaseCount} · stale leases: {pool.staleLeaseCount}
                  </p>
                  {pool.activeRunIds.length ? (
                    <a className="portal-inline-link" href={buildRunDetailHref(pool.activeRunIds[0])}>
                      Open {pool.activeRunIds[0]}
                    </a>
                  ) : null}
                </article>
              ))}
            </div>
            <article className="portal-panel-table-flat">
              <div className="portal-panel-header">
                <div>
                  <p className="section-tag">Incidents</p>
                  <h2>Operational incidents route back into concrete runs.</h2>
                </div>
              </div>
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
                        {incident.workerPool ?? "all pools"} · {formatTimestamp(incident.observedAt)}
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
            </article>
          </>
        ) : (
          <PortalEmptyState
            description="Refresh the workers view to reload queue and lease posture."
            title="No worker posture is loaded yet."
          />
        )}
      </article>

      <aside className="portal-surface-rail">
        <p className="section-tag">Current leases</p>
        <h2>Lease posture stays tied to run detail.</h2>
        <div className="portal-action-list">
          {(data?.activeLeases ?? []).map((lease) => (
            <PortalLinkCard
              copy={`${lease.workerPool} · ${lease.health} · heartbeat ${lease.heartbeatIntervalSeconds}s`}
              href={buildRunDetailHref(lease.runId)}
              key={`${lease.runId}-${lease.workerId}`}
              title={`${lease.runId} on ${lease.workerId}`}
            />
          ))}
        </div>
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
      ? `${primaryLease.workerPool} on ${primaryLease.workerId} · ${primaryLease.health}`
      : "Open the first active lease run detail.",
    primaryLease?.runId ?? data.workerPools.find((pool) => pool.activeRunIds[0])?.activeRunIds[0]
  );

  const primaryIncident = data.incidents.find((incident) => incident.affectedRunIds[0]);
  pushCard(
    primaryIncident ? `${primaryIncident.affectedRunIds[0]} incident` : "Incident run",
    primaryIncident
      ? `${primaryIncident.severity} · ${primaryIncident.workerPool ?? "all pools"}`
      : "Open the first incident-linked run detail.",
    primaryIncident?.affectedRunIds[0]
  );

  return cards;
}

function PortalErrorState({ error }: { error: string }) {
  return (
    <article className="portal-feedback-card portal-feedback-error">
      <strong>Request failed</strong>
      <p>{error}</p>
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
