import assert from "node:assert/strict";
import test from "node:test";
import util from "node:util";
import Fastify from "fastify";
import { registerAdminRoutes } from "../src/routes/admin.ts";

const adminContext = {
  email: "admin@paretoproof.com",
  identityId: "00000000-0000-4000-8000-000000000099",
  roles: ["admin"],
  status: "approved" as const,
  subject: "subject-admin",
  userId: "00000000-0000-4000-8000-000000000001"
};

function createAdminOnlyGuard() {
  return () => (request: Record<string, unknown>, _reply: unknown, done: () => void) => {
    request.accessRbacContext = adminContext;
    done();
  };
}

test("GET /portal/admin/access-requests returns enriched admin queue items", async (t) => {
  const app = Fastify();
  let usersFindManyCallCount = 0;
  const targetUser = {
    accessRequests: [
      {
        createdAt: new Date("2026-03-13T09:00:00.000Z"),
        decisionNote: null,
        email: "helper@example.com",
        id: "00000000-0000-4000-8000-000000000101",
        rationale: "Please approve",
        requestKind: "access_request",
        requestedByUserId: "00000000-0000-4000-8000-000000000201",
        requestedIdentityProvider: null,
        requestedIdentitySubject: null,
        requestedRole: "helper",
        reviewedAt: null,
        reviewedByUserId: null,
        reviewedByUser: null,
        status: "pending"
      },
      {
        createdAt: new Date("2026-03-10T09:00:00.000Z"),
        decisionNote: "Approved yesterday",
        email: "helper@example.com",
        id: "00000000-0000-4000-8000-000000000102",
        rationale: null,
        requestKind: "access_request",
        requestedByUserId: "00000000-0000-4000-8000-000000000201",
        requestedIdentityProvider: null,
        requestedIdentitySubject: null,
        requestedRole: "helper",
        reviewedAt: new Date("2026-03-13T12:30:00.000Z"),
        reviewedByUserId: "00000000-0000-4000-8000-000000000001",
        reviewedByUser: {
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          displayName: "Admin",
          email: "admin@paretoproof.com",
          id: "00000000-0000-4000-8000-000000000001",
          updatedAt: new Date("2026-03-01T00:00:00.000Z")
        },
        status: "approved"
      }
    ],
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    displayName: "Helpful Person",
    email: "helper@example.com",
    id: "00000000-0000-4000-8000-000000000201",
    identities: [
      {
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        id: "00000000-0000-4000-8000-000000000301",
        lastSeenAt: new Date("2026-03-13T08:00:00.000Z"),
        provider: "cloudflare_github",
        providerEmail: "helper@example.com",
        providerSubject: "subject-helper",
        userId: "00000000-0000-4000-8000-000000000201"
      }
    ],
    roleGrants: [
      {
        grantedAt: new Date("2026-03-12T10:00:00.000Z"),
        grantedByUser: {
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          displayName: "Admin",
          email: "admin@paretoproof.com",
          id: "00000000-0000-4000-8000-000000000001",
          updatedAt: new Date("2026-03-01T00:00:00.000Z")
        },
        grantedByUserId: "00000000-0000-4000-8000-000000000001",
        id: "00000000-0000-4000-8000-000000000401",
        revokedAt: null,
        revokedByUser: null,
        revokedByUserId: null,
        role: "helper",
        userId: "00000000-0000-4000-8000-000000000201"
      }
    ],
    sessions: [
      {
        createdAt: new Date("2026-03-13T08:30:00.000Z"),
        expiresAt: new Date("2026-03-14T08:30:00.000Z"),
        id: "00000000-0000-4000-8000-000000000501",
        identityId: "00000000-0000-4000-8000-000000000301",
        ipAddress: null,
        lastSeenAt: new Date("2026-03-13T08:35:00.000Z"),
        revokedAt: null,
        tokenHash: "token-hash-1",
        userAgent: null,
        userId: "00000000-0000-4000-8000-000000000201"
      },
      {
        createdAt: new Date("2026-03-10T08:30:00.000Z"),
        expiresAt: new Date("2026-03-11T08:30:00.000Z"),
        id: "00000000-0000-4000-8000-000000000502",
        identityId: "00000000-0000-4000-8000-000000000301",
        ipAddress: null,
        lastSeenAt: new Date("2026-03-10T08:35:00.000Z"),
        revokedAt: null,
        tokenHash: "token-hash-2",
        userAgent: null,
        userId: "00000000-0000-4000-8000-000000000201"
      }
    ],
    updatedAt: new Date("2026-03-01T00:00:00.000Z")
  };
  const recoveryUser = {
    ...targetUser,
    accessRequests: [],
    displayName: "Recovered Person",
    email: "recover@example.com",
    id: "00000000-0000-4000-8000-000000000202",
    identities: [
      {
        createdAt: new Date("2026-03-02T00:00:00.000Z"),
        id: "00000000-0000-4000-8000-000000000302",
        lastSeenAt: new Date("2026-03-13T07:00:00.000Z"),
        provider: "cloudflare_google",
        providerEmail: "recover@example.com",
        providerSubject: "subject-recover",
        userId: "00000000-0000-4000-8000-000000000202"
      }
    ],
    roleGrants: [
      {
        grantedAt: new Date("2026-03-11T10:00:00.000Z"),
        grantedByUser: null,
        grantedByUserId: null,
        id: "00000000-0000-4000-8000-000000000402",
        revokedAt: null,
        revokedByUser: null,
        revokedByUserId: null,
        role: "collaborator",
        userId: "00000000-0000-4000-8000-000000000202"
      }
    ],
    sessions: [],
    updatedAt: new Date("2026-03-02T00:00:00.000Z")
  };
  const conflictingIdentityOwner = {
    accessRequests: [],
    createdAt: new Date("2026-03-03T00:00:00.000Z"),
    displayName: "Conflict Owner",
    email: "owner@example.com",
    id: "00000000-0000-4000-8000-000000000203",
    identities: [
      {
        createdAt: new Date("2026-03-03T00:00:00.000Z"),
        id: "00000000-0000-4000-8000-000000000303",
        lastSeenAt: new Date("2026-03-13T06:00:00.000Z"),
        provider: "cloudflare_google",
        providerEmail: "owner@example.com",
        providerSubject: "subject-conflict",
        userId: "00000000-0000-4000-8000-000000000203"
      }
    ],
    roleGrants: [],
    sessions: [],
    updatedAt: new Date("2026-03-03T00:00:00.000Z")
  };
  const requestRows = [
    {
      createdAt: new Date("2026-03-13T09:00:00.000Z"),
      decisionNote: null,
      email: "helper@example.com",
      id: "00000000-0000-4000-8000-000000000101",
      rationale: "Please approve",
      requestKind: "access_request",
      requestedByUserId: "00000000-0000-4000-8000-000000000201",
      requestedIdentityProvider: null,
      requestedIdentitySubject: null,
      requestedRole: "helper",
      reviewedAt: null,
      reviewedByUserId: null,
      reviewedByUser: null,
      status: "pending"
    },
    {
      createdAt: new Date("2026-03-13T11:00:00.000Z"),
      decisionNote: "Recovered",
      email: "recover@example.com",
      id: "00000000-0000-4000-8000-000000000103",
      rationale: "Need relink",
      requestKind: "identity_recovery",
      requestedByUserId: "00000000-0000-4000-8000-000000000202",
      requestedIdentityProvider: "cloudflare_google",
      requestedIdentitySubject: "subject-conflict",
      requestedRole: "collaborator",
      reviewedAt: new Date("2026-03-13T12:00:00.000Z"),
      reviewedByUserId: "00000000-0000-4000-8000-000000000001",
      reviewedByUser: {
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        displayName: "Admin",
        email: "admin@paretoproof.com",
        id: "00000000-0000-4000-8000-000000000001",
        updatedAt: new Date("2026-03-01T00:00:00.000Z")
      },
      status: "approved"
    }
  ];

  t.after(async () => {
    await app.close();
  });

  registerAdminRoutes(
    app,
    {
      query: {
        accessRequests: {
          findMany: async () => requestRows
        },
        userIdentities: {
          findMany: async () => [
            {
              createdAt: new Date("2026-03-03T00:00:00.000Z"),
              id: "00000000-0000-4000-8000-000000000303",
              lastSeenAt: new Date("2026-03-13T06:00:00.000Z"),
              provider: "cloudflare_google",
              providerEmail: "owner@example.com",
              providerSubject: "subject-conflict",
              userId: "00000000-0000-4000-8000-000000000203"
            }
          ]
        },
        users: {
          findMany: async () => {
            usersFindManyCallCount += 1;
            return usersFindManyCallCount === 1
              ? [targetUser, recoveryUser]
              : [conflictingIdentityOwner];
          }
        }
      }
    } as never,
    createAdminOnlyGuard() as never
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/admin/access-requests"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(usersFindManyCallCount, 2);
  assert.deepEqual(response.json(), {
    items: [
      {
        approvalIdentityLinkRequired: false,
        createdAt: "2026-03-13T09:00:00.000Z",
        decisionNote: null,
        email: "helper@example.com",
        id: "00000000-0000-4000-8000-000000000101",
        matchedUser: {
          activeRole: "helper",
          activeSessionCount: 1,
          displayName: "Helpful Person",
          email: "helper@example.com",
          id: "00000000-0000-4000-8000-000000000201",
          latestReviewedRequestStatus: "approved",
          linkedIdentityCount: 1,
          pendingRequestId: "00000000-0000-4000-8000-000000000101"
        },
        rationale: "Please approve",
        recoveryRequestedIdentityAlreadyLinked: false,
        recoveryRequestedIdentityConflicts: false,
        recoveryRequestedIdentityProvider: null,
        requestKind: "access_request",
        requestedRole: "helper",
        reviewedAt: null,
        reviewedByUserEmail: null,
        reviewedByUserId: null,
        staleForApprovedUser: true,
        status: "pending"
      },
      {
        approvalIdentityLinkRequired: false,
        createdAt: "2026-03-13T11:00:00.000Z",
        decisionNote: "Recovered",
        email: "recover@example.com",
        id: "00000000-0000-4000-8000-000000000103",
        matchedUser: {
          activeRole: "collaborator",
          activeSessionCount: 0,
          displayName: "Recovered Person",
          email: "recover@example.com",
          id: "00000000-0000-4000-8000-000000000202",
          latestReviewedRequestStatus: null,
          linkedIdentityCount: 1,
          pendingRequestId: null
        },
        rationale: "Need relink",
        recoveryRequestedIdentityAlreadyLinked: false,
        recoveryRequestedIdentityConflicts: true,
        recoveryRequestedIdentityProvider: "cloudflare_google",
        requestKind: "identity_recovery",
        requestedRole: "collaborator",
        reviewedAt: "2026-03-13T12:00:00.000Z",
        reviewedByUserEmail: "admin@paretoproof.com",
        reviewedByUserId: "00000000-0000-4000-8000-000000000001",
        staleForApprovedUser: false,
        status: "approved"
      }
    ]
  });
});

test("GET /portal/admin/access-requests/:id returns the scoped detail payload", async (t) => {
  const app = Fastify();
  const requestRow = {
    createdAt: new Date("2026-03-13T09:00:00.000Z"),
    decisionNote: null,
    email: "helper@example.com",
    id: "00000000-0000-4000-8000-000000000101",
    rationale: "Please approve",
    requestKind: "access_request",
    requestedByUserId: "00000000-0000-4000-8000-000000000201",
    requestedIdentityProvider: null,
    requestedIdentitySubject: null,
    requestedRole: "helper",
    reviewedAt: null,
    reviewedByUserId: null,
    reviewedByUser: null,
    status: "pending"
  };
  const userRow = {
    accessRequests: [
      requestRow,
      {
        createdAt: new Date("2026-03-12T09:00:00.000Z"),
        decisionNote: "Approved before",
        email: "helper@example.com",
        id: "00000000-0000-4000-8000-000000000102",
        rationale: null,
        requestKind: "access_request",
        requestedByUserId: "00000000-0000-4000-8000-000000000201",
        requestedIdentityProvider: null,
        requestedIdentitySubject: null,
        requestedRole: "helper",
        reviewedAt: new Date("2026-03-12T10:00:00.000Z"),
        reviewedByUserId: "00000000-0000-4000-8000-000000000001",
        reviewedByUser: {
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          displayName: "Admin",
          email: "admin@paretoproof.com",
          id: "00000000-0000-4000-8000-000000000001",
          updatedAt: new Date("2026-03-01T00:00:00.000Z")
        },
        status: "approved"
      }
    ],
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    displayName: "Helpful Person",
    email: "helper@example.com",
    id: "00000000-0000-4000-8000-000000000201",
    identities: [
      {
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        id: "00000000-0000-4000-8000-000000000301",
        lastSeenAt: new Date("2026-03-13T08:00:00.000Z"),
        provider: "cloudflare_github",
        providerEmail: "helper@example.com",
        providerSubject: "subject-helper",
        userId: "00000000-0000-4000-8000-000000000201"
      }
    ],
    roleGrants: [
      {
        grantedAt: new Date("2026-03-12T10:00:00.000Z"),
        grantedByUser: {
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          displayName: "Admin",
          email: "admin@paretoproof.com",
          id: "00000000-0000-4000-8000-000000000001",
          updatedAt: new Date("2026-03-01T00:00:00.000Z")
        },
        grantedByUserId: "00000000-0000-4000-8000-000000000001",
        id: "00000000-0000-4000-8000-000000000401",
        revokedAt: null,
        revokedByUser: null,
        revokedByUserId: null,
        role: "helper",
        userId: "00000000-0000-4000-8000-000000000201"
      }
    ],
    sessions: [
      {
        createdAt: new Date("2026-03-13T08:30:00.000Z"),
        expiresAt: new Date("2026-03-14T08:30:00.000Z"),
        id: "00000000-0000-4000-8000-000000000501",
        identityId: "00000000-0000-4000-8000-000000000301",
        ipAddress: null,
        lastSeenAt: new Date("2026-03-13T08:35:00.000Z"),
        revokedAt: null,
        tokenHash: "token-hash-1",
        userAgent: null,
        userId: "00000000-0000-4000-8000-000000000201"
      },
      {
        createdAt: new Date("2026-03-10T08:30:00.000Z"),
        expiresAt: new Date("2026-03-11T08:30:00.000Z"),
        id: "00000000-0000-4000-8000-000000000502",
        identityId: "00000000-0000-4000-8000-000000000301",
        ipAddress: null,
        lastSeenAt: new Date("2026-03-10T08:35:00.000Z"),
        revokedAt: null,
        tokenHash: "token-hash-2",
        userAgent: null,
        userId: "00000000-0000-4000-8000-000000000201"
      }
    ],
    updatedAt: new Date("2026-03-01T00:00:00.000Z")
  };
  const auditRows = [
    {
      actorKind: "portal_user",
      actorUser: {
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        displayName: "Admin",
        email: "admin@paretoproof.com",
        id: "00000000-0000-4000-8000-000000000001",
        updatedAt: new Date("2026-03-01T00:00:00.000Z")
      },
      actorUserId: "00000000-0000-4000-8000-000000000001",
      createdAt: new Date("2026-03-13T09:10:00.000Z"),
      eventId: "access_request.submitted",
      id: "00000000-0000-4000-8000-000000000601",
      payload: {
        accessRequestId: "00000000-0000-4000-8000-000000000101"
      },
      severity: "info",
      subjectKind: "access_request",
      targetUserId: "00000000-0000-4000-8000-000000000201"
    },
    {
      actorKind: "portal_user",
      actorUser: {
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        displayName: "Admin",
        email: "admin@paretoproof.com",
        id: "00000000-0000-4000-8000-000000000001",
        updatedAt: new Date("2026-03-01T00:00:00.000Z")
      },
      actorUserId: "00000000-0000-4000-8000-000000000001",
      createdAt: new Date("2026-03-13T09:15:00.000Z"),
      eventId: "role_grant.granted",
      id: "00000000-0000-4000-8000-000000000602",
      payload: {
        grantedRole: "helper"
      },
      severity: "critical",
      subjectKind: "role_grant",
      targetUserId: "00000000-0000-4000-8000-000000000201"
    }
  ];

  t.after(async () => {
    await app.close();
  });

  registerAdminRoutes(
    app,
    {
      query: {
        accessRequests: {
          findFirst: async () => requestRow
        },
        auditEvents: {
          findMany: async (options: { limit?: number; where?: unknown }) => {
            assert.equal(options.limit, 20);
            const whereText = util.inspect(options.where, { depth: 20 });
            assert.equal(whereText.includes("access_request.submitted"), true);
            assert.equal(whereText.includes("role_grant.granted"), true);

            return auditRows;
          }
        },
        userIdentities: {
          findMany: async () => []
        },
        users: {
          findMany: async () => [userRow]
        }
      }
    } as never,
    createAdminOnlyGuard() as never
  );

  const response = await app.inject({
    method: "GET",
    url: "/portal/admin/access-requests/00000000-0000-4000-8000-000000000101"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    item: {
      activeRoleGrant: {
        grantedAt: "2026-03-12T10:00:00.000Z",
        grantedByUserEmail: "admin@paretoproof.com",
        grantedByUserId: "00000000-0000-4000-8000-000000000001",
        id: "00000000-0000-4000-8000-000000000401",
        revokedAt: null,
        revokedByUserEmail: null,
        revokedByUserId: null,
        role: "helper"
      },
      item: {
        approvalIdentityLinkRequired: false,
        createdAt: "2026-03-13T09:00:00.000Z",
        decisionNote: null,
        email: "helper@example.com",
        id: "00000000-0000-4000-8000-000000000101",
        matchedUser: {
          activeRole: "helper",
          activeSessionCount: 1,
          displayName: "Helpful Person",
          email: "helper@example.com",
          id: "00000000-0000-4000-8000-000000000201",
          latestReviewedRequestStatus: "approved",
          linkedIdentityCount: 1,
          pendingRequestId: "00000000-0000-4000-8000-000000000101"
        },
        rationale: "Please approve",
        recoveryRequestedIdentityAlreadyLinked: false,
        recoveryRequestedIdentityConflicts: false,
        recoveryRequestedIdentityProvider: null,
        requestKind: "access_request",
        requestedRole: "helper",
        reviewedAt: null,
        reviewedByUserEmail: null,
        reviewedByUserId: null,
        staleForApprovedUser: true,
        status: "pending"
      },
      matchedUserIdentities: [
        {
          createdAt: "2026-03-01T00:00:00.000Z",
          id: "00000000-0000-4000-8000-000000000301",
          lastSeenAt: "2026-03-13T08:00:00.000Z",
          provider: "cloudflare_github",
          providerEmail: "helper@example.com"
        }
      ],
      recentAuditEvents: [
        {
          actorUserEmail: "admin@paretoproof.com",
          actorUserId: "00000000-0000-4000-8000-000000000001",
          createdAt: "2026-03-13T09:10:00.000Z",
          eventId: "access_request.submitted",
          id: "00000000-0000-4000-8000-000000000601",
          payload: {
            accessRequestId: "00000000-0000-4000-8000-000000000101"
          },
          severity: "info",
          targetUserId: "00000000-0000-4000-8000-000000000201"
        },
        {
          actorUserEmail: "admin@paretoproof.com",
          actorUserId: "00000000-0000-4000-8000-000000000001",
          createdAt: "2026-03-13T09:15:00.000Z",
          eventId: "role_grant.granted",
          id: "00000000-0000-4000-8000-000000000602",
          payload: {
            grantedRole: "helper"
          },
          severity: "critical",
          targetUserId: "00000000-0000-4000-8000-000000000201"
        }
      ],
      relatedRequests: [
        {
          createdAt: "2026-03-12T09:00:00.000Z",
          decisionNote: "Approved before",
          email: "helper@example.com",
          id: "00000000-0000-4000-8000-000000000102",
          rationale: null,
          requestKind: "access_request",
          requestedRole: "helper",
          reviewedAt: "2026-03-12T10:00:00.000Z",
          status: "approved"
        }
      ],
      sessionImpact: {
        activeSessionCount: 1,
        requiresSessionRefresh: true
      }
    }
  });
});

test("GET /portal/admin/users and /portal/admin/users/:userId return admin user read models", async (t) => {
  const app = Fastify();
  const userRow = {
    accessRequests: [
      {
        createdAt: new Date("2026-03-13T09:00:00.000Z"),
        decisionNote: null,
        email: "helper@example.com",
        id: "00000000-0000-4000-8000-000000000101",
        rationale: "Please approve",
        requestKind: "access_request",
        requestedByUserId: "00000000-0000-4000-8000-000000000201",
        requestedIdentityProvider: null,
        requestedIdentitySubject: null,
        requestedRole: "helper",
        reviewedAt: null,
        reviewedByUserId: null,
        reviewedByUser: null,
        status: "pending"
      },
      {
        createdAt: new Date("2026-03-12T09:00:00.000Z"),
        decisionNote: "Reviewed earlier",
        email: "helper@example.com",
        id: "00000000-0000-4000-8000-000000000102",
        rationale: null,
        requestKind: "access_request",
        requestedByUserId: "00000000-0000-4000-8000-000000000201",
        requestedIdentityProvider: null,
        requestedIdentitySubject: null,
        requestedRole: "helper",
        reviewedAt: new Date("2026-03-12T11:00:00.000Z"),
        reviewedByUserId: "00000000-0000-4000-8000-000000000001",
        reviewedByUser: {
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          displayName: "Admin",
          email: "admin@paretoproof.com",
          id: "00000000-0000-4000-8000-000000000001",
          updatedAt: new Date("2026-03-01T00:00:00.000Z")
        },
        status: "approved"
      },
      {
        createdAt: new Date("2026-03-10T09:00:00.000Z"),
        decisionNote: "Reviewed later",
        email: "helper@example.com",
        id: "00000000-0000-4000-8000-000000000103",
        rationale: null,
        requestKind: "access_request",
        requestedByUserId: "00000000-0000-4000-8000-000000000201",
        requestedIdentityProvider: null,
        requestedIdentitySubject: null,
        requestedRole: "helper",
        reviewedAt: new Date("2026-03-13T12:00:00.000Z"),
        reviewedByUserId: "00000000-0000-4000-8000-000000000001",
        reviewedByUser: {
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          displayName: "Admin",
          email: "admin@paretoproof.com",
          id: "00000000-0000-4000-8000-000000000001",
          updatedAt: new Date("2026-03-01T00:00:00.000Z")
        },
        status: "rejected"
      }
    ],
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    displayName: "Helpful Person",
    email: "helper@example.com",
    id: "00000000-0000-4000-8000-000000000201",
    identities: [
      {
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        id: "00000000-0000-4000-8000-000000000301",
        lastSeenAt: new Date("2026-03-13T08:00:00.000Z"),
        provider: "cloudflare_github",
        providerEmail: "helper@example.com",
        providerSubject: "subject-helper",
        userId: "00000000-0000-4000-8000-000000000201"
      }
    ],
    roleGrants: [
      {
        grantedAt: new Date("2026-03-12T10:00:00.000Z"),
        grantedByUser: {
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          displayName: "Admin",
          email: "admin@paretoproof.com",
          id: "00000000-0000-4000-8000-000000000001",
          updatedAt: new Date("2026-03-01T00:00:00.000Z")
        },
        grantedByUserId: "00000000-0000-4000-8000-000000000001",
        id: "00000000-0000-4000-8000-000000000401",
        revokedAt: null,
        revokedByUser: null,
        revokedByUserId: null,
        role: "helper",
        userId: "00000000-0000-4000-8000-000000000201"
      }
    ],
    sessions: [
      {
        createdAt: new Date("2026-03-13T08:30:00.000Z"),
        expiresAt: new Date("2026-03-14T08:30:00.000Z"),
        id: "00000000-0000-4000-8000-000000000501",
        identityId: "00000000-0000-4000-8000-000000000301",
        ipAddress: null,
        lastSeenAt: new Date("2026-03-13T08:35:00.000Z"),
        revokedAt: null,
        tokenHash: "token-hash-1",
        userAgent: null,
        userId: "00000000-0000-4000-8000-000000000201"
      },
      {
        createdAt: new Date("2026-03-10T08:30:00.000Z"),
        expiresAt: new Date("2026-03-11T08:30:00.000Z"),
        id: "00000000-0000-4000-8000-000000000502",
        identityId: "00000000-0000-4000-8000-000000000301",
        ipAddress: null,
        lastSeenAt: new Date("2026-03-10T08:35:00.000Z"),
        revokedAt: null,
        tokenHash: "token-hash-2",
        userAgent: null,
        userId: "00000000-0000-4000-8000-000000000201"
      }
    ],
    updatedAt: new Date("2026-03-01T00:00:00.000Z")
  };
  const auditRows = [
    {
      actorKind: "portal_user",
      actorUser: {
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        displayName: "Admin",
        email: "admin@paretoproof.com",
        id: "00000000-0000-4000-8000-000000000001",
        updatedAt: new Date("2026-03-01T00:00:00.000Z")
      },
      actorUserId: "00000000-0000-4000-8000-000000000001",
      createdAt: new Date("2026-03-13T09:15:00.000Z"),
      eventId: "role_grant.granted",
      id: "00000000-0000-4000-8000-000000000602",
      payload: {
        grantedRole: "helper"
      },
      severity: "critical",
      subjectKind: "role_grant",
      targetUserId: "00000000-0000-4000-8000-000000000201"
    }
  ];

  t.after(async () => {
    await app.close();
  });

  registerAdminRoutes(
    app,
    {
      query: {
        auditEvents: {
          findMany: async () => auditRows
        },
        users: {
          findFirst: async () => userRow,
          findMany: async () => [userRow]
        }
      }
    } as never,
    createAdminOnlyGuard() as never
  );

  const listResponse = await app.inject({
    method: "GET",
    url: "/portal/admin/users"
  });
  const detailResponse = await app.inject({
    method: "GET",
    url: "/portal/admin/users/00000000-0000-4000-8000-000000000201"
  });

  assert.equal(listResponse.statusCode, 200);
  assert.deepEqual(listResponse.json(), {
    items: [
      {
        activeRole: "helper",
        activeRoleGrantedAt: "2026-03-12T10:00:00.000Z",
        activeSessionCount: 1,
        displayName: "Helpful Person",
        email: "helper@example.com",
        id: "00000000-0000-4000-8000-000000000201",
        latestReviewedAt: "2026-03-13T12:00:00.000Z",
        latestReviewedRequestStatus: "rejected",
        linkedIdentityProviders: ["cloudflare_github"],
        pendingRequestCreatedAt: "2026-03-13T09:00:00.000Z",
        pendingRequestId: "00000000-0000-4000-8000-000000000101",
        pendingRequestKind: "access_request"
      }
    ]
  });

  assert.equal(detailResponse.statusCode, 200);
  assert.deepEqual(detailResponse.json(), {
    item: {
      activeRole: "helper",
      activeRoleGrantedAt: "2026-03-12T10:00:00.000Z",
      activeSessionCount: 1,
      displayName: "Helpful Person",
      email: "helper@example.com",
      id: "00000000-0000-4000-8000-000000000201",
      latestReviewedAt: "2026-03-13T12:00:00.000Z",
      latestReviewedRequestStatus: "rejected",
      linkedIdentities: [
        {
          createdAt: "2026-03-01T00:00:00.000Z",
          id: "00000000-0000-4000-8000-000000000301",
          lastSeenAt: "2026-03-13T08:00:00.000Z",
          provider: "cloudflare_github",
          providerEmail: "helper@example.com"
        }
      ],
      linkedIdentityProviders: ["cloudflare_github"],
      pendingRequestCreatedAt: "2026-03-13T09:00:00.000Z",
      pendingRequestId: "00000000-0000-4000-8000-000000000101",
      pendingRequestKind: "access_request",
      recentAuditEvents: [
        {
          actorUserEmail: "admin@paretoproof.com",
          actorUserId: "00000000-0000-4000-8000-000000000001",
          createdAt: "2026-03-13T09:15:00.000Z",
          eventId: "role_grant.granted",
          id: "00000000-0000-4000-8000-000000000602",
          payload: {
            grantedRole: "helper"
          },
          severity: "critical",
          targetUserId: "00000000-0000-4000-8000-000000000201"
        }
      ],
      requestHistory: [
        {
          createdAt: "2026-03-13T09:00:00.000Z",
          decisionNote: null,
          email: "helper@example.com",
          id: "00000000-0000-4000-8000-000000000101",
          rationale: "Please approve",
          requestKind: "access_request",
          requestedRole: "helper",
          reviewedAt: null,
          status: "pending"
        },
        {
          createdAt: "2026-03-12T09:00:00.000Z",
          decisionNote: "Reviewed earlier",
          email: "helper@example.com",
          id: "00000000-0000-4000-8000-000000000102",
          rationale: null,
          requestKind: "access_request",
          requestedRole: "helper",
          reviewedAt: "2026-03-12T11:00:00.000Z",
          status: "approved"
        },
        {
          createdAt: "2026-03-10T09:00:00.000Z",
          decisionNote: "Reviewed later",
          email: "helper@example.com",
          id: "00000000-0000-4000-8000-000000000103",
          rationale: null,
          requestKind: "access_request",
          requestedRole: "helper",
          reviewedAt: "2026-03-13T12:00:00.000Z",
          status: "rejected"
        }
      ],
      roleGrantHistory: [
        {
          grantedAt: "2026-03-12T10:00:00.000Z",
          grantedByUserEmail: "admin@paretoproof.com",
          grantedByUserId: "00000000-0000-4000-8000-000000000001",
          id: "00000000-0000-4000-8000-000000000401",
          revokedAt: null,
          revokedByUserEmail: null,
          revokedByUserId: null,
          role: "helper"
        }
      ]
    }
  });
});

test("POST /portal/admin/access-requests/:id/approve emits user_identity.linked for new recovery links", async (t) => {
  const app = Fastify();
  const insertedAuditEvents: unknown[] = [];
  const insertedIdentities: unknown[] = [];

  t.after(async () => {
    await app.close();
  });

  registerAdminRoutes(
    app,
    {
      transaction: async (callback: (tx: Record<string, unknown>) => Promise<unknown>) =>
        callback({
          insert: (table: unknown) => ({
            values: async (value: unknown) => {
              if (table === undefined) {
                return [];
              }

              if (Array.isArray(value)) {
                insertedAuditEvents.push(...value);
              } else if (
                value &&
                typeof value === "object" &&
                "providerSubject" in (value as Record<string, unknown>)
              ) {
                insertedIdentities.push(value);
              }

              return [];
            }
          }),
          query: {
            accessRequests: {
              findFirst: async () => ({
                createdAt: new Date("2026-03-13T09:00:00.000Z"),
                decisionNote: null,
                email: "recover@example.com",
                id: "00000000-0000-4000-8000-000000000103",
                rationale: "Need relink",
                requestKind: "identity_recovery",
                requestedByUserId: "00000000-0000-4000-8000-000000000202",
                requestedIdentityProvider: "cloudflare_google",
                requestedIdentitySubject: "subject-recover-new",
                requestedRole: "collaborator",
                reviewedAt: null,
                reviewedByUserId: null,
                status: "pending"
              })
            },
            userIdentities: {
              findFirst: async () => null
            },
            users: {
              findFirst: async () => ({
                createdAt: new Date("2026-03-02T00:00:00.000Z"),
                displayName: "Recovered Person",
                email: "recover@example.com",
                id: "00000000-0000-4000-8000-000000000202",
                updatedAt: new Date("2026-03-02T00:00:00.000Z")
              })
            }
          },
          select: () => ({
            from: () => ({
              where: async () => [
                {
                  id: "00000000-0000-4000-8000-000000000402",
                  role: "collaborator"
                }
              ]
            })
          }),
          update: () => ({
            set: () => ({
              where: () => ({
                returning: async () => [
                  {
                    createdAt: new Date("2026-03-13T09:00:00.000Z"),
                    decisionNote: null,
                    email: "recover@example.com",
                    id: "00000000-0000-4000-8000-000000000103",
                    rationale: "Need relink",
                    requestKind: "identity_recovery",
                    requestedByUserId: "00000000-0000-4000-8000-000000000202",
                    requestedIdentityProvider: "cloudflare_google",
                    requestedIdentitySubject: "subject-recover-new",
                    requestedRole: "collaborator",
                    reviewedAt: new Date("2026-03-13T09:30:00.000Z"),
                    reviewedByUserId: "00000000-0000-4000-8000-000000000001",
                    status: "approved"
                  }
                ]
              })
            })
          })
        })
    } as never,
    createAdminOnlyGuard() as never
  );

  const response = await app.inject({
    method: "POST",
    payload: {
      approvedRole: "collaborator",
      decisionNote: ""
    },
    url: "/portal/admin/access-requests/00000000-0000-4000-8000-000000000103/approve"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(insertedIdentities.length, 1);
  assert.equal(
    insertedAuditEvents.some(
      (event) =>
        event &&
        typeof event === "object" &&
        (event as Record<string, unknown>).eventId === "user_identity.linked"
    ),
    true
  );
});
