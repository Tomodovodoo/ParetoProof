import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { parseApiRuntimeEnv, type ApiRuntimeEnv } from "../config/runtime.js";
import { sessions, userIdentities } from "../db/schema.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";
import type { CloudflareAccessIdentity } from "./cloudflare-access.js";
import { matchesUserIdentityProviderSubject } from "../lib/identity-binding.js";
import { readCookieValue } from "./cloudflare-access.js";
import {
  resolveAccessRbacContext,
  type AccessRbacContext
} from "./resolve-access-rbac-context.js";

export const portalAccessSessionCookieName = "PortalAccessSession";
export const portalAccessSessionMaxAgeSeconds = 5 * 60;

export type ResolvedPortalAccessSession = {
  context: AccessRbacContext;
  identity: CloudflareAccessIdentity;
  sessionId: string;
  token: string;
};

function getPortalAccessSessionExpiry(now = Date.now()) {
  return new Date(now + portalAccessSessionMaxAgeSeconds * 1000);
}

function buildCloudflareAccessIssuer(teamDomain?: string) {
  return `https://${teamDomain ?? parseApiRuntimeEnv().teamDomain}`;
}

export function buildPortalAccessSessionCookie(token: string) {
  return [
    `${portalAccessSessionCookieName}=${token}`,
    "Domain=.paretoproof.com",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${portalAccessSessionMaxAgeSeconds}`,
    "Secure",
    "HttpOnly"
  ].join("; ");
}

export function readPortalAccessSessionToken(cookieHeader: string | undefined) {
  return readCookieValue(cookieHeader, portalAccessSessionCookieName);
}

export function hashPortalAccessSessionToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function createPortalAccessSessionToken() {
  return randomBytes(32).toString("base64url");
}

export async function createPortalAccessSession(
  db: ReturnTypeOfCreateDbClient,
  request: Pick<FastifyRequest, "headers" | "ip">,
  identity: CloudflareAccessIdentity,
  context: Extract<AccessRbacContext, { status: "approved" }>
) {
  const linkedIdentity = await db.query.userIdentities.findFirst({
    where: and(
      eq(userIdentities.id, context.identityId),
      eq(userIdentities.userId, context.userId)
    )
  });

  if (
    !identity.provider ||
    !linkedIdentity ||
    !matchesUserIdentityProviderSubject(
      linkedIdentity,
      identity.provider,
      identity.subject
    )
  ) {
    throw new Error("Approved portal session identity could not be resolved.");
  }

  const token = createPortalAccessSessionToken();
  const now = new Date();

  await db.insert(sessions).values({
    expiresAt: getPortalAccessSessionExpiry(now.getTime()),
    identityId: context.identityId,
    ipAddress: request.ip,
    tokenHash: hashPortalAccessSessionToken(token),
    userAgent:
      typeof request.headers["user-agent"] === "string"
        ? request.headers["user-agent"]
        : null,
    userId: context.userId
  });

  return token;
}

export async function resolvePortalAccessSession(
  db: ReturnTypeOfCreateDbClient,
  cookieHeader: string | undefined,
  options?: {
    teamDomain?: ApiRuntimeEnv["teamDomain"];
  }
): Promise<ResolvedPortalAccessSession | null> {
  const token = readPortalAccessSessionToken(cookieHeader);

  if (!token) {
    return null;
  }

  const sessionRow = await db.query.sessions.findFirst({
    where: eq(sessions.tokenHash, hashPortalAccessSessionToken(token)),
    with: {
      identity: {
        with: {
          user: true
        }
      }
    }
  });

  if (!sessionRow || !sessionRow.identity) {
    return null;
  }

  const now = new Date();

  if (sessionRow.revokedAt || sessionRow.expiresAt.getTime() <= now.getTime()) {
    return null;
  }

  const identity: CloudflareAccessIdentity = {
    email: sessionRow.identity.providerEmail ?? sessionRow.identity.user.email,
    issuer: buildCloudflareAccessIssuer(options?.teamDomain),
    provider: sessionRow.identity.provider,
    subject: sessionRow.identity.providerSubject
  };
  const context = await resolveAccessRbacContext(db, identity);

  await db
    .update(sessions)
    .set({
      lastSeenAt: now
    })
    .where(
      and(
        eq(sessions.id, sessionRow.id),
        gt(sessions.expiresAt, now),
        isNull(sessions.revokedAt)
      )
    );

  return {
    context,
    identity,
    sessionId: sessionRow.id,
    token
  };
}

export async function revokePortalAccessSession(
  db: ReturnTypeOfCreateDbClient,
  cookieHeader: string | undefined
) {
  const token = readPortalAccessSessionToken(cookieHeader);

  if (!token) {
    return false;
  }

  const now = new Date();
  const [revokedSession] = await db
    .update(sessions)
    .set({
      revokedAt: now
    })
    .where(
      and(
        eq(sessions.tokenHash, hashPortalAccessSessionToken(token)),
        gt(sessions.expiresAt, now),
        isNull(sessions.revokedAt)
      )
    )
    .returning({
      id: sessions.id
    });

  return Boolean(revokedSession);
}
