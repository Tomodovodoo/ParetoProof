import { describe, expect, it } from "bun:test";
import {
  adminRepoSyncRecordStatusUpdateInputSchema,
  publicBenchmarkReleaseListResponseSchema
} from "../dist/index.js";

describe("shared benchmark workflow schemas", () => {
  it("accepts explicit null linkage clears on repo sync status updates", () => {
    expect(
      adminRepoSyncRecordStatusUpdateInputSchema.safeParse({
        pullRequestNumber: null,
        pullRequestUrl: null,
        status: "rejected"
      }).success
    ).toBe(true);
  });

  it("rejects partial repo sync linkage updates", () => {
    expect(
      adminRepoSyncRecordStatusUpdateInputSchema.safeParse({
        pullRequestNumber: null,
        status: "rejected"
      }).success
    ).toBe(false);
  });

  it("keeps the public benchmark release feed redacted", () => {
    expect(
      publicBenchmarkReleaseListResponseSchema.safeParse({
        generatedAt: "2026-04-02T20:20:00.000Z",
        items: [
          {
            benchmarkReleaseId: "problem9-apr-2026",
            benchmarkLabel: "firstproof/Problem9",
            benchmarkVersionId: "firstproof/Problem9@2026-04-02",
            benchmarkVersionLabel: "Problem 9 April 2026",
            includedModelCount: null,
            linkedPublicArtifactPresence: {
              hasMethodologyArtifacts: true,
              hasSummaryArtifacts: true
            },
            publicationStatus: "released",
            publishedAt: "2026-04-02T20:15:00.000Z",
            releaseLabel: "Problem 9 Release April 2026",
            topLineMetricSummary: {
              label: "release_summary",
              unitLabel: null,
              value: null,
              valueText: "Published release"
            }
          }
        ],
        publishedAt: "2026-04-02T20:15:00.000Z",
        recommendedRevalidateAfterSeconds: 300,
        snapshotVersion: "2026-04-02T20:15:00.000Z"
      }).success
    ).toBe(true);

    expect(
      publicBenchmarkReleaseListResponseSchema.safeParse({
        generatedAt: "2026-04-02T20:20:00.000Z",
        items: [
          {
            approvedByUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            benchmarkReleaseId: "problem9-apr-2026",
            benchmarkLabel: "firstproof/Problem9",
            benchmarkVersionId: "firstproof/Problem9@2026-04-02",
            benchmarkVersionLabel: "Problem 9 April 2026",
            includedModelCount: null,
            linkedPublicArtifactPresence: {
              hasMethodologyArtifacts: true,
              hasSummaryArtifacts: true
            },
            publicationStatus: "released",
            publishedAt: "2026-04-02T20:15:00.000Z",
            releaseLabel: "Problem 9 Release April 2026",
            topLineMetricSummary: {
              label: "release_summary",
              unitLabel: null,
              value: null,
              valueText: "Published release"
            }
          }
        ],
        publishedAt: "2026-04-02T20:15:00.000Z",
        recommendedRevalidateAfterSeconds: 300,
        snapshotVersion: "2026-04-02T20:15:00.000Z"
      }).success
    ).toBe(false);
  });
});
