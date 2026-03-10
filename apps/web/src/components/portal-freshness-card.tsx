import { getPortalLiveViewFreshness } from "@paretoproof/shared";
import { useEffect, useMemo, useState } from "react";
import {
  describePortalFreshness,
  getPortalFreshnessState,
  getPortalFreshnessStateLabel
} from "../lib/portal-freshness";

type PortalFreshnessCardProps = {
  isRefreshing?: boolean;
  lastUpdatedAt: string | null;
  onRefresh?: () => void;
  routeId: string;
};

export function PortalFreshnessCard({
  isRefreshing = false,
  lastUpdatedAt,
  onRefresh,
  routeId
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

  return (
    <section className="portal-freshness-card">
      <div>
        <p className="eyebrow">View freshness</p>
        <h3>{policy?.title ?? "Manual refresh in MVP"}</h3>
        <p className="portal-panel-muted">
          {describePortalFreshness(policy, lastUpdatedAt, clockNow)}
        </p>
      </div>
      <div className="portal-freshness-actions">
        <span
          className={`portal-action-badge portal-freshness-badge portal-freshness-${freshnessState}`}
        >
          {getPortalFreshnessStateLabel(freshnessState)}
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
