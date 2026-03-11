import type { PortalLiveViewFreshnessEntry } from "../types/portal-live-freshness.js";

export const portalLiveViewFreshnessCatalog = [
  {
    description:
      "Refresh the landing view in the background so recent benchmark activity and queue posture do not drift while an approved user keeps the portal open.",
    mode: "polling",
    pollIntervalMs: 30000,
    routeId: "portal.home",
    staleAfterMs: 120000,
    title: "Auto-refresh every 30 seconds"
  },
  {
    description:
      "Profile data only changes when the caller saves details or completes a linking handoff, so MVP keeps it manual instead of polling in the background.",
    mode: "manual",
    pollIntervalMs: null,
    routeId: "portal.profile",
    staleAfterMs: null,
    title: "Manual refresh in MVP"
  },
  {
    description:
      "Shared run history should keep queue and terminal-state changes visible without forcing repeated full-page reloads from approved users.",
    mode: "polling",
    pollIntervalMs: 15000,
    routeId: "portal.runs",
    staleAfterMs: 60000,
    title: "Auto-refresh every 15 seconds"
  },
  {
    description:
      "Run detail is the most time-sensitive execution surface, so it should poll faster than the broader run list and become stale quickly when updates stop.",
    mode: "polling",
    pollIntervalMs: 5000,
    routeId: "portal.run-detail",
    staleAfterMs: 20000,
    title: "Auto-refresh every 5 seconds"
  },
  {
    description:
      "Run launch remains form-driven in MVP and only needs explicit refresh after submit or navigation because no live launch queue is exposed yet.",
    mode: "manual",
    pollIntervalMs: null,
    routeId: "portal.launch-run",
    staleAfterMs: null,
    title: "Manual refresh in MVP"
  },
  {
    description:
      "Worker fleet posture is collaborative operational data, so it should refresh periodically while a contributor keeps the page open.",
    mode: "polling",
    pollIntervalMs: 15000,
    routeId: "portal.workers",
    staleAfterMs: 60000,
    title: "Auto-refresh every 15 seconds"
  },
  {
    description:
      "Contributor request intake changes asynchronously under admin review, so the queue should poll in the background without waiting for a manual reload.",
    mode: "polling",
    pollIntervalMs: 30000,
    routeId: "portal.admin.access-requests",
    staleAfterMs: 120000,
    title: "Auto-refresh every 30 seconds"
  },
  {
    description:
      "User-management data is intentionally non-live in MVP until the admin maintenance workflows exist beyond the initial portal shell.",
    mode: "manual",
    pollIntervalMs: null,
    routeId: "portal.admin.users",
    staleAfterMs: null,
    title: "Manual refresh in MVP"
  }
] satisfies PortalLiveViewFreshnessEntry[];

export function getPortalLiveViewFreshness(routeId: string) {
  return (
    portalLiveViewFreshnessCatalog.find((entry) => entry.routeId === routeId) ?? null
  );
}
