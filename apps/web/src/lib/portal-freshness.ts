import {
  getPortalLiveViewFreshness,
  type PortalLiveViewFreshnessEntry
} from "@paretoproof/shared";
import { useEffect, useMemo, useRef, useState } from "react";

export type PortalFreshnessState = "fresh" | "manual" | "planned" | "stale";

type UsePortalPollingOptions = {
  enabled?: boolean;
  onPoll: () => Promise<void>;
  routeId: string;
};

export function canPortalRefreshOnDemand(policy: PortalLiveViewFreshnessEntry | null) {
  return policy !== null;
}

export function shouldPortalAutoPoll(policy: PortalLiveViewFreshnessEntry | null) {
  return Boolean(policy && policy.mode === "polling" && policy.pollIntervalMs);
}

function formatDuration(ms: number) {
  if (ms < 1000) {
    return "under 1 second";
  }

  if (ms % 60000 === 0) {
    const minutes = ms / 60000;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  const seconds = ms / 1000;
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

export function describePortalFreshness(
  policy: PortalLiveViewFreshnessEntry | null,
  lastUpdatedAt: string | null,
  now = Date.now()
) {
  if (!policy) {
    return "This view does not refresh in the background yet.";
  }

  if (policy.mode === "manual") {
    if (!lastUpdatedAt) {
      return "This view refreshes when you reload it or complete an action here.";
    }

    return `This view refreshes when you reload it or complete an action here. Last refreshed ${formatTimestamp(lastUpdatedAt)}.`;
  }

  if (!lastUpdatedAt) {
    return `This view refreshes in the background. If fresh data stops arriving for ${formatDuration(policy.staleAfterMs ?? policy.pollIntervalMs ?? 0)} or longer, it will be marked stale.`;
  }

  const ageMs = Math.max(0, now - Date.parse(lastUpdatedAt));
  return `Last refreshed ${formatTimestamp(lastUpdatedAt)}. This view refreshes in the background and will be marked stale if no fresh data arrives for ${formatDuration(policy.staleAfterMs ?? policy.pollIntervalMs ?? 0)}. Current age: ${formatDuration(Math.round(ageMs / 1000) * 1000)}.`;
}

export function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export function getPortalFreshnessState(
  policy: PortalLiveViewFreshnessEntry | null,
  lastUpdatedAt: string | null,
  now = Date.now()
): PortalFreshnessState {
  if (!policy) {
    return "manual";
  }

  if (policy.mode === "manual") {
    return "manual";
  }

  if (!lastUpdatedAt) {
    return "planned";
  }

  const ageMs = Math.max(0, now - Date.parse(lastUpdatedAt));
  return ageMs > (policy.staleAfterMs ?? policy.pollIntervalMs ?? 0) ? "stale" : "fresh";
}

export function getPortalFreshnessStateLabel(state: PortalFreshnessState) {
  switch (state) {
    case "fresh":
      return "Fresh";
    case "manual":
      return "Manual";
    case "planned":
      return "Planned";
    case "stale":
      return "Stale";
    default:
      return "Manual";
  }
}

export function usePortalPolling({
  enabled = true,
  onPoll,
  routeId
}: UsePortalPollingOptions) {
  const policy = useMemo(() => getPortalLiveViewFreshness(routeId), [routeId]);
  const [isPolling, setIsPolling] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const isPollingRef = useRef(false);
  const onPollRef = useRef(onPoll);

  onPollRef.current = onPoll;

  async function pollNow() {
    if (!canPortalRefreshOnDemand(policy) || isPollingRef.current) {
      return;
    }

    isPollingRef.current = true;
    setIsPolling(true);

    try {
      await onPollRef.current();
      setLastUpdatedAt(new Date().toISOString());
    } finally {
      isPollingRef.current = false;
      setIsPolling(false);
    }
  }

  useEffect(() => {
    if (!enabled || !policy || !shouldPortalAutoPoll(policy)) {
      return;
    }

    const pollIntervalMs = policy.pollIntervalMs;

    if (!pollIntervalMs) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (typeof navigator !== "undefined" && "onLine" in navigator && !navigator.onLine) {
        return;
      }

      void pollNow().catch(() => {
        // The owning view already controls its error state.
      });
    }, pollIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, policy]);

  return {
    lastUpdatedAt,
    markUpdated(timestamp = new Date().toISOString()) {
      setLastUpdatedAt(timestamp);
    },
    policy,
    pollNow,
    isPolling
  };
}
