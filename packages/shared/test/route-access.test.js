import { describe, expect, it } from "bun:test";
import {
  findAppRouteBySurface,
  matchesAppRoutePath
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
});
