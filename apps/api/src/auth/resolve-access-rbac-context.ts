import { and, desc, eq, isNull } from "drizzle-orm";
import { createDbClient } from "../db/client.js";
import {
  accessRequests,
  roleGrants,
  users,
  type accessRoleEnum
} from "../db/schema.js";
import type { CloudflareAccessIdentity } from "./cloudflare-access.js";
import type { PortalIdentityProvider } from "@paretoproof/shared";
import { normalizeOptionalEmail } from "../lib/email.js";
import {
  buildRequestedIdentityProviderSubjectMatch,
  buildUserIdentityProviderSubjectMatch,
  filterUserIdentityProviderSubjectMatch
} from "../lib/identity-binding.js";

type DbClient = ReturnType<typeof createDbClient>;
type AccessRole = (typeof accessRoleEnum.enumValues)[number];

export type AccessRbacContext =
  | {
      email: string | null;
      reason:
        | "access_request_required"
        | "identity_recovery_required"
        | "rejected_or_withdrawn"
        | "unknown_identity";
      status: "denied";
      subject: string;
    }
  | {
      email: string | null;
      requestId: string | null;
      status: "pending";
      subject: string;
      userId: string | null;
    }
  | {
      email: string;
      identityId: string;
      roles: AccessRole[];
      status: "approved";
      subject: string;
      userId: string;
    };

async function getActiveRoles(db: DbClient, userId: string) {
  const grants = await db
    .select({
      role: roleGrants.role
    })
    .from(roleGrants)
    .where(and(eq(roleGrants.userId, userId), isNull(roleGrants.revokedAt)));

  return grants.map(({ role }) => role);
}

async function getLatestAccessRequestByEmail(db: DbClient, email: string) {
  return db.query.accessRequests.findFirst({
    orderBy: [desc(accessRequests.createdAt)],
    where: eq(accessRequests.email, email)
  });
}

async function getPendingRecoveryRequestForSubject(
  db: DbClient,
  email: string,
  provider: PortalIdentityProvider,
  subject: string
) {
  return db.query.accessRequests.findFirst({
    orderBy: [desc(accessRequests.createdAt)],
    where: and(
      eq(accessRequests.email, email),
      eq(accessRequests.requestKind, "identity_recovery"),
      buildRequestedIdentityProviderSubjectMatch(provider, subject),
      eq(accessRequests.status, "pending")
    )
  });
}

async function getLatestRecoveryRequestForSubject(
  db: DbClient,
  email: string,
  provider: PortalIdentityProvider,
  subject: string
) {
  return db.query.accessRequests.findFirst({
    orderBy: [desc(accessRequests.createdAt)],
    where: and(
      eq(accessRequests.email, email),
      eq(accessRequests.requestKind, "identity_recovery"),
      buildRequestedIdentityProviderSubjectMatch(provider, subject)
    )
  });
}

export async function resolveAccessRbacContext(
  db: DbClient,
  identity: CloudflareAccessIdentity
): Promise<AccessRbacContext> {
  const normalizedIdentityEmail = normalizeOptionalEmail(identity.email);
  const linkedIdentity = identity.provider
    ? filterUserIdentityProviderSubjectMatch(
        await db.query.userIdentities.findFirst({
          where: buildUserIdentityProviderSubjectMatch(
            identity.provider,
            identity.subject
          ),
          with: {
            user: true
          }
        }),
        identity.provider,
        identity.subject
      )
    : null;

  if (linkedIdentity) {
    const roles = await getActiveRoles(db, linkedIdentity.user.id);

    if (roles.length > 0) {
      return {
        email: linkedIdentity.user.email,
        identityId: linkedIdentity.id,
        roles,
        status: "approved",
        subject: identity.subject,
        userId: linkedIdentity.user.id
      };
    }

    const latestRequest = await getLatestAccessRequestByEmail(
      db,
      linkedIdentity.user.email
    );

    if (
      latestRequest &&
      (latestRequest.status === "rejected" || latestRequest.status === "withdrawn")
    ) {
      return {
        email: linkedIdentity.user.email,
        reason: "rejected_or_withdrawn",
        status: "denied",
        subject: identity.subject
      };
    }

    if (latestRequest?.status === "pending") {
      return {
        email: linkedIdentity.user.email,
        requestId: latestRequest.id,
        status: "pending",
        subject: identity.subject,
        userId: linkedIdentity.user.id
      };
    }

    return {
      email: linkedIdentity.user.email,
      reason: "access_request_required",
      status: "denied",
      subject: identity.subject
    };
  }

  if (!normalizedIdentityEmail) {
    return {
      email: null,
      reason: "unknown_identity",
      status: "denied",
      subject: identity.subject
    };
  }

  const matchingUser = await db.query.users.findFirst({
    where: eq(users.email, normalizedIdentityEmail)
  });
  const activeMatchingUserRoles = matchingUser
    ? await getActiveRoles(db, matchingUser.id)
    : [];
  const latestRequest = await getLatestAccessRequestByEmail(db, normalizedIdentityEmail);

  if (matchingUser && activeMatchingUserRoles.length > 0) {
    const pendingRecoveryRequest = identity.provider
      ? await getPendingRecoveryRequestForSubject(
          db,
          normalizedIdentityEmail,
          identity.provider,
          identity.subject
        )
      : null;

    if (pendingRecoveryRequest) {
      return {
        email: normalizedIdentityEmail,
        requestId: pendingRecoveryRequest.id,
        status: "pending",
        subject: identity.subject,
        userId: matchingUser.id
      };
    }

    const latestRecoveryRequest = identity.provider
      ? await getLatestRecoveryRequestForSubject(
          db,
          normalizedIdentityEmail,
          identity.provider,
          identity.subject
        )
      : null;

    if (
      latestRecoveryRequest &&
      (latestRecoveryRequest.status === "rejected" ||
        latestRecoveryRequest.status === "withdrawn")
    ) {
      return {
        email: normalizedIdentityEmail,
        reason: "rejected_or_withdrawn",
        status: "denied",
        subject: identity.subject
      };
    }

    return {
      email: normalizedIdentityEmail,
      reason: "identity_recovery_required",
      status: "denied",
      subject: identity.subject
    };
  }

  if (
    latestRequest &&
    (latestRequest.status === "rejected" || latestRequest.status === "withdrawn")
  ) {
    return {
      email: normalizedIdentityEmail,
      reason: "rejected_or_withdrawn",
      status: "denied",
      subject: identity.subject
    };
  }

  if (!latestRequest || latestRequest.status !== "pending") {
    return {
      email: normalizedIdentityEmail,
      reason: "access_request_required",
      status: "denied",
      subject: identity.subject
    };
  }

  return {
    email: normalizedIdentityEmail,
    requestId: latestRequest.id,
    status: "pending",
    subject: identity.subject,
    userId: matchingUser?.id ?? null
  };
}
