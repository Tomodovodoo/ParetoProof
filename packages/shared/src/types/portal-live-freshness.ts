import type { PortalRouteId } from "./route-access.js";

export type PortalLiveViewMode = "manual" | "polling";

export type PortalLiveViewFreshnessEntry = {
  description: string;
  mode: PortalLiveViewMode;
  pollIntervalMs: number | null;
  routeId: PortalRouteId;
  staleAfterMs: number | null;
  title: string;
};
