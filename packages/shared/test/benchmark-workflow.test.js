import { describe, expect, it } from "bun:test";
import {
  adminRepoSyncRecordStatusUpdateInputSchema,
  benchmarkReleaseParamsSchema,
  benchmarkVersionParamsSchema
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

  it("rejects benchmark version params padded with whitespace", () => {
    expect(
      benchmarkVersionParamsSchema.safeParse({
        benchmarkVersionId: " firstproof/Problem9@2026-04-02 "
      }).success
    ).toBe(false);
  });

  it("rejects benchmark release params padded with whitespace", () => {
    expect(
      benchmarkReleaseParamsSchema.safeParse({
        benchmarkReleaseId: " problem9-apr-2026 "
      }).success
    ).toBe(false);
  });
});
