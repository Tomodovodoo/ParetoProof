import { describe, expect, it } from "bun:test";
import {
  defaultPortalRunsQuery,
  parsePortalRunsQuery
} from "./portal-benchmark-ops.ts";

describe("parsePortalRunsQuery", () => {
  it("falls back on malformed query params without discarding valid filters", () => {
    const query = parsePortalRunsQuery(
      "?providerFamily=openai&q=%20PP-318%20&limit=9999&sort=bad&runKind=nope&verdict=pass,wrong&runLifecycle=queued,broken"
    );

    expect(query).toEqual({
      ...defaultPortalRunsQuery,
      providerFamily: "openai",
      q: "PP-318"
    });
  });

  it("keeps valid enum and csv params when they parse cleanly", () => {
    const query = parsePortalRunsQuery(
      "?limit=50&sort=duration_desc&runKind=single_run&verdict=pass,fail&runLifecycle=queued,running"
    );

    expect(query.limit).toBe(50);
    expect(query.sort).toBe("duration_desc");
    expect(query.runKind).toBe("single_run");
    expect(query.verdict).toEqual(["pass", "fail"]);
    expect(query.runLifecycle).toEqual(["queued", "running"]);
  });
});
