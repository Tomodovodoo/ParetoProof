export type PortalLiveViewMode = "manual" | "polling";

export type PortalLiveViewFreshnessEntry = {
  description: string;
  mode: PortalLiveViewMode;
  pollIntervalMs: number | null;
  routeId: string;
  staleAfterMs: number | null;
  title: string;
};
