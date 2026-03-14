import { describe, expect, it } from "bun:test";
import {
  buildRunsModelOptions,
  buildRunsProviderOptions,
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
      q: "PP-318",
      runLifecycle: ["queued"],
      verdict: ["pass"]
    });
  });

  it("drops malformed csv fragments while preserving valid unique entries", () => {
    const query = parsePortalRunsQuery(
      "?verdict=invalid_result,pass,invalid_result,wrong&runLifecycle=running,,queued,broken,running"
    );

    expect(query.verdict).toEqual([
      "invalid_result",
      "pass"
    ]);
    expect(query.runLifecycle).toEqual([
      "running",
      "queued"
    ]);
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

describe("buildRunsProviderOptions", () => {
  it("preserves the active provider when the current result set is empty", () => {
    expect(buildRunsProviderOptions([], "google")).toEqual(["google"]);
  });
});

describe("buildRunsModelOptions", () => {
  it("preserves the active model config when the current result set is empty", () => {
    expect(buildRunsModelOptions([], "google-gemini-pro")).toEqual([
      {
        label: "google-gemini-pro",
        modelConfigId: "google-gemini-pro"
      }
    ]);
  });
});
