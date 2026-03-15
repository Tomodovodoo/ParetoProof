import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";
import { sessions, userIdentities } from "../db/schema.js";

const SESSION_TOKEN_BYTES = 32;
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const SESSION_COOKIE_NAME = "PortalSession";

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function readCookieValue(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...valueParts] = part.trim().split("=");

    if (rawName === name) {
      return valueParts.join("=") || null;
    }
  }

  return null;
}

export function readPortalSessionToken(cookieHeader: string | undefined) {
  return readCookieValue(cookieHeader, SESSION_COOKIE_NAME);
}

export function buildPortalSessionCookie(token: string) {
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Domain=.paretoproof.com",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    "Secure",
    "HttpOnly"
  ].join("; ");
}

export function clearPortalSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Domain=.paretoproof.com; Path=/; SameSite=Lax; Max-Age=0; Secure; HttpOnly`;
}

export async function createPortalSession(
  db: ReturnTypeOfCreateDbClient,
  options: {
    userId: string;
    identityId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }
) {
  const token = randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await db.insert(sessions).values({
    userId: options.userId,
    identityId: options.identityId,
    tokenHash,
    expiresAt,
    ipAddress: options.ipAddress ?? null,
    userAgent: options.userAgent ?? null
  });

  return { token, expiresAt };
}

export async function resolvePortalSession(
  db: ReturnTypeOfCreateDbClient,
  cookieHeader: string | undefined
) {
  const token = readPortalSessionToken(cookieHeader);

  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);
  const now = new Date();

  const session = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.tokenHash, tokenHash),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, now)
    ),
    with: {
      user: true
    }
  });

  if (!session) {
    return null;
  }

  const identity = await db.query.userIdentities.findFirst({
    where: and(
      eq(userIdentities.id, session.identityId),
      eq(userIdentities.userId, session.userId)
    )
  });

  if (!identity) {
    return null;
  }

  await db
    .update(sessions)
    .set({ lastSeenAt: now })
    .where(eq(sessions.id, session.id));

  return {
    sessionId: session.id,
    userId: session.userId,
    identityId: session.identityId,
    identity: {
      subject: identity.providerSubject,
      email: session.user.email,
      provider: identity.provider
    }
  };
}
