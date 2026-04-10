import { describe, expect, it } from "bun:test";
import {
  adminRepoSyncRecordStatusUpdateInputSchema
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
});
