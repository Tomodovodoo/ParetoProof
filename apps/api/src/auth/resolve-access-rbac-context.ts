import { and, desc, eq, isNull } from "drizzle-orm";
import { createDbClient } from "../db/client.js";
import {
  accessRequests,
  roleGrants,
  userIdentities,
  users,
  type accessRoleEnum
} from "../db/schema.js";
import type { CloudflareAccessIdentity } from "./cloudflare-access.js";
import { normalizeOptionalEmail } from "../lib/email.js";

type DbClient = ReturnType<typeof createDbClient>;
type AccessRole = (typeof accessRoleEnum.enumValues)[number];

export type AccessRbacContext =
  | {
      email: string | null;
      reason:
        | "access_request_required"
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

// Email fallback only identifies pending users; it never grants access on its own.
async function getLatestAccessRequestByEmail(db: DbClient, email: string) {
  return db.query.accessRequests.findFirst({
    orderBy: [desc(accessRequests.createdAt)],
    where: eq(accessRequests.email, email)
  });
}

export async function resolveAccessRbacContext(
  db: DbClient,
  identity: CloudflareAccessIdentity
): Promise<AccessRbacContext> {
  const normalizedIdentityEmail = normalizeOptionalEmail(identity.email);
  const linkedIdentity = await db.query.userIdentities.findFirst({
    where: eq(userIdentities.providerSubject, identity.subject),
    with: {
      user: true
    }
  });

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
  const latestRequest = await getLatestAccessRequestByEmail(db, normalizedIdentityEmail);

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
