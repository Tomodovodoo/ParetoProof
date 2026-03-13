import { describe, expect, it } from "bun:test";
import {
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
