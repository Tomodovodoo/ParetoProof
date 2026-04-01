import { describe, expect, it } from "bun:test";
import {
  findAppRouteBySurface,
  matchesAppRoutePath,
  appRouteAccessMatrix,
  getPortalActionsForRoles,
  portalLiveViewFreshnessCatalog,
  portalSectionDefinitions
} from "../dist/index.js";

describe("route ownership matrix helpers", () => {
  it("matches exact and parameterized route paths without allowing deeper unmatched paths", () => {
    expect(matchesAppRoutePath("/project", "/project")).toBe(true);
    expect(matchesAppRoutePath("/reports/:benchmarkVersionId", "/reports/problem-9-v1")).toBe(
      true
    );
    expect(matchesAppRoutePath("/reports/:benchmarkVersionId", "/reports/problem-9-v1/files")).toBe(
      false
    );
  });

  it("finds only routes owned by the requested surface", () => {
    expect(findAppRouteBySurface("public_site", "/project")?.id).toBe("public.project");
    expect(findAppRouteBySurface("public_site", "/reports/problem-9-v1")?.id).toBe(
      "public.benchmark-report"
    );
    expect(findAppRouteBySurface("public_site", "/profile")).toBeNull();
    expect(findAppRouteBySurface("portal", "/runs/run-123")?.id).toBe(
      "portal.run-detail"
    );
  });

  it("keeps portal route-linked catalogs aligned with the portal route matrix", () => {
    expect(
      appRouteAccessMatrix.every((entry) =>
        entry.surface === "portal"
          ? entry.id.startsWith("portal.")
          : entry.id.startsWith("public.")
      )
    ).toBe(true);

    const portalRouteIds = appRouteAccessMatrix
      .filter((entry) => entry.surface === "portal")
      .map((entry) => entry.id);
    const navigationRouteIds = portalSectionDefinitions.map((section) => section.routeId);
    const freshnessRouteIds = portalLiveViewFreshnessCatalog.map((entry) => entry.routeId);
    const actionRouteIds = getPortalActionsForRoles(["admin"]).map((action) => action.routeId);
    const coveredRouteIds = new Set([...navigationRouteIds, ...freshnessRouteIds]);

    expect(new Set(navigationRouteIds).size).toBe(navigationRouteIds.length);
    expect(new Set(freshnessRouteIds).size).toBe(freshnessRouteIds.length);
    expect(new Set(actionRouteIds).size).toBe(actionRouteIds.length);
    expect(navigationRouteIds.every((routeId) => portalRouteIds.includes(routeId))).toBe(true);
    expect(freshnessRouteIds.every((routeId) => portalRouteIds.includes(routeId))).toBe(true);
    expect(actionRouteIds.every((routeId) => portalRouteIds.includes(routeId))).toBe(true);
    expect(
      portalRouteIds.filter((routeId) => !coveredRouteIds.has(routeId)).sort()
    ).toEqual(["portal.access-request", "portal.denied", "portal.pending"]);
  });
});
