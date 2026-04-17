import { describe, expect, it } from "bun:test";
import {
  summarizeAccessRequestStatus,
  summarizeUserPosture
} from "./portal-admin.ts";

describe("portal admin summaries", () => {
  it("describes identity recovery requests without local preview wording", () => {
    expect(
      summarizeAccessRequestStatus({
        requestKind: "identity_recovery",
        requestedRole: "collaborator",
        status: "pending"
      })
    ).toBe("Recovery review pending · preserve collaborator");
  });

  it("summarizes active role and pending request posture from live admin records", () => {
    expect(
      summarizeUserPosture({
        accessPosture: "approved",
        activeRole: {
          grantedAt: "2026-04-17T08:00:00.000Z",
          grantedBy: null,
          revokedAt: null,
          revokedBy: null,
          role: "admin"
        },
        displayName: "Ada",
        email: "ada@example.com",
        lastReviewedRequestStatus: "approved",
        linkedIdentityProviders: ["cloudflare_google"],
        pendingRequest: {
          createdAt: "2026-04-17T09:00:00.000Z",
          id: "request-1",
          requestKind: "identity_recovery"
        },
        userId: "user-1"
      })
    ).toBe("admin active + recovery request pending");
  });
});
