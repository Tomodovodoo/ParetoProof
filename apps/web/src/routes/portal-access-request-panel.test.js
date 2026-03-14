import { describe, expect, it } from "bun:test";
import {
  getCompactAccessRequestSectionOrder,
  getVisibleAccessRequests,
  hasCurrentAccessRequestDetail,
  resolveSelectedAccessRequestId
} from "./portal-access-request-panel.tsx";

const pendingRequest = {
  id: "request-pending"
};

const rejectedRequest = {
  id: "request-rejected"
};

describe("resolveSelectedAccessRequestId", () => {
  it("keeps the current selection when it remains visible", () => {
    expect(
      resolveSelectedAccessRequestId("request-pending", [
        pendingRequest,
        rejectedRequest
      ])
    ).toBe("request-pending");
  });

  it("switches to the first visible request when the current selection is filtered out", () => {
    expect(
      resolveSelectedAccessRequestId("request-pending", [
        rejectedRequest
      ])
    ).toBe("request-rejected");
  });

  it("clears the selection when the current filter slice is empty", () => {
    expect(resolveSelectedAccessRequestId("request-pending", [])).toBeNull();
  });
});

describe("getCompactAccessRequestSectionOrder", () => {
  it("shows the review queue before filters on compact layouts", () => {
    expect(getCompactAccessRequestSectionOrder()).toEqual([
      "queueContent",
      "filterFields"
    ]);
  });
});

describe("getVisibleAccessRequests", () => {
  it("keeps pending requests ahead of reviewed rows before timestamp sorting", () => {
    const visibleIds = getVisibleAccessRequests(
      [
        {
          createdAt: "2026-03-14T12:00:00.000Z",
          id: "approved-newer",
          requestKind: "access_request",
          requestedRole: "helper",
          reviewedAt: "2026-03-14T12:05:00.000Z",
          reviewer: {
            label: "Admin"
          },
          status: "approved"
        },
        {
          createdAt: "2026-03-14T09:00:00.000Z",
          id: "pending-older",
          requestKind: "access_request",
          requestedRole: "helper",
          reviewedAt: null,
          reviewer: null,
          status: "pending"
        },
        {
          createdAt: "2026-03-14T10:00:00.000Z",
          id: "pending-newer",
          requestKind: "access_request",
          requestedRole: "helper",
          reviewedAt: null,
          reviewer: null,
          status: "pending"
        }
      ],
      {
        requestKind: "all",
        requestedRole: "all",
        reviewerState: "all",
        sortOrder: "oldest",
        status: "all"
      }
    ).map((item) => item.id);

    expect(visibleIds).toEqual([
      "pending-older",
      "pending-newer",
      "approved-newer"
    ]);
  });
});

describe("hasCurrentAccessRequestDetail", () => {
  it("rejects stale request detail payloads after selection changes", () => {
    expect(
      hasCurrentAccessRequestDetail("request-pending", {
        id: "request-rejected"
      })
    ).toBe(false);
  });

  it("accepts detail payloads that match the selected request", () => {
    expect(
      hasCurrentAccessRequestDetail("request-pending", {
        id: "request-pending"
      })
    ).toBe(true);
  });
});
