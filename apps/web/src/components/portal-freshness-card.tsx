import {
  getPortalLiveViewFreshness,
  type PortalRouteId,
  type PortalWorkerOpsFreshness
} from "@paretoproof/shared";
import { useEffect, useMemo, useState } from "react";
import {
  describePortalFreshness,
  formatTimestamp,
  getPortalFreshnessState,
  getPortalFreshnessStateLabel
} from "../lib/portal-freshness";

type PortalFreshnessCardProps = {
  isRefreshing?: boolean;
  lastUpdatedAt: string | null;
  onRefresh?: () => void;
  routeId: PortalRouteId;
  workerOpsFreshness?: PortalWorkerOpsFreshness | null;
};

function getWorkerOpsFreshnessLabel(freshness: PortalWorkerOpsFreshness) {
  switch (freshness.freshnessStatus) {
    case "live":
      return "Live";
    case "stale":
      return "Stale";
    case "degraded":
      return "Degraded";
    default:
      return "Live";
  }
}

function getWorkerOpsFreshnessClassName(freshness: PortalWorkerOpsFreshness) {
  return freshness.freshnessStatus === "live" ? "fresh" : freshness.freshnessStatus;
}

function describeWorkerOpsFreshness(freshness: PortalWorkerOpsFreshness) {
  const observedCopy = freshness.observedThrough
    ? `Observed through ${formatTimestamp(freshness.observedThrough)}.`
    : "No worker observations are visible yet.";
  const statusCopy =
    freshness.freshnessStatus === "degraded"
      ? `Snapshot is degraded: ${freshness.degradationReason}.`
      : freshness.freshnessStatus === "stale"
        ? "The API marked this worker snapshot stale."
        : "The API marked this worker snapshot live.";

  return `${statusCopy} ${observedCopy} Generated ${formatTimestamp(freshness.generatedAt)}. Recommended refresh: ${freshness.recommendedPollAfterSeconds}s; stale after ${freshness.staleAfterSeconds}s.`;
}

export function PortalFreshnessCard({
  isRefreshing = false,
  lastUpdatedAt,
  onRefresh,
  routeId,
  workerOpsFreshness = null
}: PortalFreshnessCardProps) {
  const policy = useMemo(() => getPortalLiveViewFreshness(routeId), [routeId]);
  const [clockNow, setClockNow] = useState(() => Date.now());

  useEffect(() => {
    setClockNow(Date.now());

    if (!policy || policy.mode !== "polling" || !lastUpdatedAt) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setClockNow(Date.now());
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [lastUpdatedAt, policy]);

  const freshnessState = getPortalFreshnessState(policy, lastUpdatedAt, clockNow);
  const badgeLabel = workerOpsFreshness
    ? getWorkerOpsFreshnessLabel(workerOpsFreshness)
    : getPortalFreshnessStateLabel(freshnessState);
  const badgeClassName = workerOpsFreshness
    ? getWorkerOpsFreshnessClassName(workerOpsFreshness)
    : freshnessState;

  return (
    <section className="portal-freshness-card">
      <div>
        <p className="eyebrow">Refresh behavior</p>
        <h3>{policy?.title ?? "Refresh on demand"}</h3>
        <p className="portal-panel-muted">
          {workerOpsFreshness
            ? describeWorkerOpsFreshness(workerOpsFreshness)
            : describePortalFreshness(policy, lastUpdatedAt, clockNow)}
        </p>
      </div>
      <div className="portal-freshness-actions">
        <span
          className={`portal-action-badge portal-freshness-badge portal-freshness-${badgeClassName}`}
        >
          {badgeLabel}
        </span>
        {onRefresh ? (
          <button
            className="button button-secondary"
            disabled={isRefreshing}
            onClick={onRefresh}
            type="button"
          >
            {isRefreshing ? "Refreshing..." : "Refresh now"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
