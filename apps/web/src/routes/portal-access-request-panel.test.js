import { describe, expect, it } from "bun:test";
import {
  describeAccessRequestActionState,
  describeAccessRequestTransition,
  getCompactAccessRequestSectionOrder,
  isSelectedAccessRequestDetailCurrent,
  sortAccessRequestsForDisplay,
  resolveSelectedAccessRequestId
} from "./portal-access-request-panel.tsx";

const pendingRequest = {
  id: "request-pending"
};

const rejectedRequest = {
  id: "request-rejected"
};

const approvedRequest = {
  createdAt: "2026-03-13T09:00:00.000Z",
  id: "request-approved",
  reviewedAt: "2026-03-13T09:30:00.000Z",
  status: "approved"
};

const olderPendingRequest = {
  createdAt: "2026-03-12T09:00:00.000Z",
  id: "request-pending-older",
  reviewedAt: null,
  status: "pending"
};

const newerPendingRequest = {
  createdAt: "2026-03-14T09:00:00.000Z",
  id: "request-pending-newer",
  reviewedAt: null,
  status: "pending"
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

describe("sortAccessRequestsForDisplay", () => {
  it("keeps pending work ahead of reviewed rows before applying date order", () => {
    expect(
      sortAccessRequestsForDisplay(
        [
          approvedRequest,
          olderPendingRequest,
          newerPendingRequest
        ],
        {
          requestedRole: "all",
          requestKind: "all",
          reviewerState: "all",
          sortOrder: "oldest",
          status: "all"
        }
      ).map((item) => item.id)
    ).toEqual([
      "request-pending-older",
      "request-pending-newer",
      "request-approved"
    ]);
  });
});

describe("isSelectedAccessRequestDetailCurrent", () => {
  it("returns false when the loaded detail does not match the current selection", () => {
    expect(
      isSelectedAccessRequestDetailCurrent(
        {
          id: "request-approved"
        },
        "request-pending"
      )
    ).toBe(false);
  });

  it("returns true when the loaded detail matches the current selection", () => {
    expect(
      isSelectedAccessRequestDetailCurrent(
        {
          id: "request-pending"
        },
        "request-pending"
      )
    ).toBe(true);
  });
});

describe("describeAccessRequestTransition", () => {
  it("describes unresolved requests as still pending review", () => {
    expect(
      describeAccessRequestTransition({
        reviewedAt: null,
        reviewer: null,
        status: "pending"
      })
    ).toBe("Pending review. No admin decision has been recorded yet.");
  });

  it("describes approved requests with reviewer and timestamp context", () => {
    expect(
      describeAccessRequestTransition({
        reviewedAt: "2026-03-13T09:30:00.000Z",
        reviewer: {
          label: "Portal Admin"
        },
        status: "approved"
      })
    ).toContain("Approved by Portal Admin");
  });
});

describe("describeAccessRequestActionState", () => {
  it("explains that resolved requests are locked against further actions", () => {
    expect(
      describeAccessRequestActionState({
        matchedUser: {
          email: "ada@paretoproof.local"
        },
        recovery: null,
        requestKind: "access_request",
        status: "approved"
      })
    ).toBe(
      "This request is already resolved. Actions stay locked so the review history remains stable."
    );
  });

  it("explains identity-recovery conflicts explicitly", () => {
    expect(
      describeAccessRequestActionState({
        matchedUser: {
          email: "ada@paretoproof.local"
        },
        recovery: {
          conflictingUser: {
            email: "lin@paretoproof.local"
          },
          requestedIdentityAlreadyLinked: false
        },
        requestKind: "identity_recovery",
        status: "pending"
      })
    ).toBe(
      "Approval is blocked until the identity conflict for lin@paretoproof.local is resolved."
    );
  });

  it("explains standard approvals as immediate role grants when the request is actionable", () => {
    expect(
      describeAccessRequestActionState({
        matchedUser: {
          email: "ada@paretoproof.local"
        },
        recovery: null,
        requestKind: "access_request",
        status: "pending"
      })
    ).toBe("Approving will grant the selected contributor role immediately.");
  });
});
