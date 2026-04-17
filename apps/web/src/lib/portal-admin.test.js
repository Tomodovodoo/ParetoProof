import { afterEach, describe, expect, it } from "bun:test";
import {
  approvePortalAdminAccessRequest,
  loadPortalAdminAccessRequestDetail,
  loadPortalAdminAccessRequests,
  loadPortalAdminUserDetail,
  loadPortalAdminUsers,
  revokePortalAdminUserRole,
  summarizeAccessRequestStatus,
  summarizeUserPosture
} from "./portal-admin.ts";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

afterEach(() => {
  globalThis.fetch = originalFetch;

  if (originalWindow) {
    globalThis.window = originalWindow;
    return;
  }

  delete globalThis.window;
});

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

  it("loads the admin user directory from the API instead of reviving local demo state", async () => {
    globalThis.window = {
      location: {
        origin: "http://127.0.0.1:4273"
      },
      setTimeout(callback) {
        callback();
        return 0;
      }
    };
    globalThis.fetch = async (input) => {
      expect(input).toBe("http://127.0.0.1:3000/portal/admin/users");

      return new Response(
        JSON.stringify({
          items: [
            {
              accessPosture: "approved",
              activeRole: null,
              displayName: "Ada",
              email: "ada@example.com",
              lastReviewedRequestStatus: null,
              linkedIdentityProviders: ["cloudflare_google"],
              pendingRequest: null,
              userId: "11111111-1111-4111-8111-111111111111"
            }
          ]
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        }
      );
    };

    await expect(loadPortalAdminUsers("http://127.0.0.1:3000")).resolves.toEqual([
      {
        accessPosture: "approved",
        activeRole: null,
        displayName: "Ada",
        email: "ada@example.com",
        lastReviewedRequestStatus: null,
        linkedIdentityProviders: ["cloudflare_google"],
        pendingRequest: null,
        userId: "11111111-1111-4111-8111-111111111111"
      }
    ]);
  });

  it("surfaces admin access-request load failures instead of falling back to placeholder data", async () => {
    globalThis.window = {
      location: {
        origin: "http://127.0.0.1:4273"
      },
      setTimeout(callback) {
        callback();
        return 0;
      }
    };
    globalThis.fetch = async (input) => {
      expect(input).toBe("http://127.0.0.1:3000/portal/admin/access-requests");

      return new Response(JSON.stringify({ error: "access_assertion_required" }), {
        headers: {
          "Content-Type": "application/json"
        },
        status: 403
      });
    };

    await expect(
      loadPortalAdminAccessRequests("http://127.0.0.1:3000")
    ).rejects.toThrow("This workspace is restricted to portal admins.");
  });

  it("loads user detail from the API instead of reviving local admin fixtures", async () => {
    globalThis.window = {
      location: {
        origin: "http://127.0.0.1:4273"
      },
      setTimeout(callback) {
        callback();
        return 0;
      }
    };
    globalThis.fetch = async (input) => {
      expect(input).toBe(
        "http://127.0.0.1:3000/portal/admin/users/11111111-1111-4111-8111-111111111111"
      );

      return new Response(
        JSON.stringify({
          item: {
            accessPosture: "approved",
            activeRole: null,
            auditHistory: [],
            displayName: "Ada",
            email: "ada@example.com",
            lastReviewedRequestStatus: null,
            linkedIdentities: [],
            linkedIdentityProviders: ["cloudflare_google"],
            pendingRequest: null,
            requestHistory: [],
            roleGrantHistory: [],
            sessionPosture: {
              activeSessionCount: 0,
              latestSessionExpiresAt: null
            },
            userId: "11111111-1111-4111-8111-111111111111"
          }
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        }
      );
    };

    await expect(
      loadPortalAdminUserDetail(
        "http://127.0.0.1:3000",
        "11111111-1111-4111-8111-111111111111"
      )
    ).resolves.toMatchObject({
      displayName: "Ada",
      email: "ada@example.com",
      userId: "11111111-1111-4111-8111-111111111111"
    });
  });

  it("loads access-request detail from the API instead of reviving local review fixtures", async () => {
    globalThis.window = {
      location: {
        origin: "http://127.0.0.1:4273"
      },
      setTimeout(callback) {
        callback();
        return 0;
      }
    };
    globalThis.fetch = async (input) => {
      expect(input).toBe(
        "http://127.0.0.1:3000/portal/admin/access-requests/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      );

      return new Response(
        JSON.stringify({
          item: {
            activeRole: null,
            auditEchoes: [],
            createdAt: "2026-04-17T08:00:00.000Z",
            decisionNote: null,
            email: "ada@example.com",
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            linkedIdentities: [],
            matchedUser: null,
            matchedUserPosture: null,
            rationale: "Need contributor access.",
            recovery: null,
            relatedRequests: [],
            requestKind: "access_request",
            requestedRole: "helper",
            reviewedAt: null,
            reviewer: null,
            sessionPosture: {
              activeSessionCount: 0,
              latestSessionExpiresAt: null
            },
            status: "pending"
          }
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        }
      );
    };

    await expect(
      loadPortalAdminAccessRequestDetail(
        "http://127.0.0.1:3000",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      )
    ).resolves.toMatchObject({
      email: "ada@example.com",
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      requestedRole: "helper",
      status: "pending"
    });
  });

  it("surfaces API error messages for approval mutations instead of reviving local mutation state", async () => {
    globalThis.window = {
      location: {
        origin: "http://127.0.0.1:4273"
      },
      setTimeout(callback) {
        callback();
        return 0;
      }
    };
    globalThis.fetch = async (input, init) => {
      expect(input).toBe(
        "http://127.0.0.1:3000/portal/admin/access-requests/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/approve"
      );
      expect(init?.method).toBe("POST");

      return new Response(JSON.stringify({ error: "access_request_not_pending" }), {
        headers: {
          "Content-Type": "application/json"
        },
        status: 409
      });
    };

    await expect(
      approvePortalAdminAccessRequest(
        "http://127.0.0.1:3000",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        {
          approvedRole: "helper",
          decisionNote: "Checked by admin."
        }
      )
    ).resolves.toEqual({
      code: "access_request_not_pending",
      conflictUserId: null,
      message: "This request has already been reviewed or withdrawn.",
      ok: false
    });
  });

  it("surfaces API error messages for role revocation mutations instead of reviving local mutation state", async () => {
    globalThis.window = {
      location: {
        origin: "http://127.0.0.1:4273"
      },
      setTimeout(callback) {
        callback();
        return 0;
      }
    };
    globalThis.fetch = async (input, init) => {
      expect(input).toBe(
        "http://127.0.0.1:3000/portal/admin/users/11111111-1111-4111-8111-111111111111/revoke-role"
      );
      expect(init?.method).toBe("POST");

      return new Response(JSON.stringify({ error: "admin_user_no_active_role" }), {
        headers: {
          "Content-Type": "application/json"
        },
        status: 409
      });
    };

    await expect(
      revokePortalAdminUserRole(
        "http://127.0.0.1:3000",
        "11111111-1111-4111-8111-111111111111",
        {
          reason: "Remove stale contributor access."
        }
      )
    ).resolves.toEqual({
      code: "admin_user_no_active_role",
      conflictUserId: null,
      message: "There is no active contributor role left to revoke for this user.",
      ok: false
    });
  });
});
