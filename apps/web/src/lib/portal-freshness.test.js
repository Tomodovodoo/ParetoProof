import { describe, expect, it } from "bun:test";
import { getPortalLiveViewFreshness } from "@paretoproof/shared";
import {
  canPortalRefreshOnDemand,
  shouldPortalAutoPoll
} from "./portal-freshness.ts";

describe("portal freshness polling helpers", () => {
  it("allows manual refresh for manual routes without enabling background polling", () => {
    const policy = getPortalLiveViewFreshness("portal.admin.users");

    expect(canPortalRefreshOnDemand(policy)).toBe(true);
    expect(shouldPortalAutoPoll(policy)).toBe(false);
  });

  it("keeps polling routes eligible for both manual refresh and interval polling", () => {
    const policy = getPortalLiveViewFreshness("portal.admin.access-requests");

    expect(canPortalRefreshOnDemand(policy)).toBe(true);
    expect(shouldPortalAutoPoll(policy)).toBe(true);
  });
});
