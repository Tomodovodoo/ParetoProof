import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { normalizeOptionalEmail } from "../lib/email.js";
import { parseApiRuntimeEnv } from "../config/runtime.js";
import type { PortalIdentityProvider } from "@paretoproof/shared";
import type { AccessRbacContext } from "./resolve-access-rbac-context.js";

type CloudflareAccessTokenClaims = JWTPayload & {
  email?: string;
  sub?: string;
};

export type CloudflareAccessIdentity = {
  email: string | null;
  issuer: string;
  provider: PortalIdentityProvider | null;
  subject: string;
};

export type PortalAccessSession = {
  context: AccessRbacContext;
  identity: CloudflareAccessIdentity;
};

export type VerifiedAccessLinkIntent = {
  expiresAt: number;
  intentId: string;
};

function readAccessProviderStateSecret() {
  return process.env.ACCESS_PROVIDER_STATE_SECRET;
}

function readPortalAccessSessionSecret() {
  return process.env.PORTAL_SESSION_SECRET ?? readAccessProviderStateSecret();
}

function createSignedAccessValue(value: string, secret: string, maxAgeSeconds = 600) {
  const expiresAt = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const payload = `${value}.${expiresAt}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");

  return `${payload}.${signature}`;
}

function parseVerifiedProviderHintPayload(payload: string) {
  const [provider, ...subjectParts] = payload.split("|");

  if (
    provider !== "cloudflare_github" &&
    provider !== "cloudflare_google"
  ) {
    return null;
  }

  const boundSubject = subjectParts.join("|") || null;

  return {
    boundSubject,
    provider
  } satisfies {
    boundSubject: string | null;
    provider: PortalIdentityProvider;
  };
}

function parsePortalAccessSessionPayload(payload: string) {
  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!parsedPayload || typeof parsedPayload !== "object") {
    return null;
  }

  const { context, identity } = parsedPayload as {
    context?: unknown;
    identity?: unknown;
  };

  if (
    !identity ||
    typeof identity !== "object" ||
    typeof (identity as { issuer?: unknown }).issuer !== "string" ||
    typeof (identity as { subject?: unknown }).subject !== "string"
  ) {
    return null;
  }

  const identityEmail = (identity as { email?: unknown }).email;
  const identityProvider = (identity as { provider?: unknown }).provider;

  if (identityEmail !== null && typeof identityEmail !== "string") {
    return null;
  }

  if (
    identityProvider !== null &&
    identityProvider !== undefined &&
    identityProvider !== "cloudflare_google" &&
    identityProvider !== "cloudflare_github" &&
    identityProvider !== "cloudflare_one_time_pin"
  ) {
    return null;
  }

  if (!context || typeof context !== "object") {
    return null;
  }

  const status = (context as { status?: unknown }).status;
  const email = (context as { email?: unknown }).email;
  const subject = (context as { subject?: unknown }).subject;

  if (
    (email !== null && typeof email !== "string") ||
    typeof subject !== "string"
  ) {
    return null;
  }

  if (status === "approved") {
    const roles = (context as { roles?: unknown }).roles;
    const identityId = (context as { identityId?: unknown }).identityId;
    const userId = (context as { userId?: unknown }).userId;

    if (
      !Array.isArray(roles) ||
      roles.some(
        (role) => role !== "admin" && role !== "collaborator" && role !== "helper"
      ) ||
      typeof identityId !== "string" ||
      typeof userId !== "string" ||
      typeof email !== "string"
    ) {
      return null;
    }

    return {
      context: {
        email,
        identityId,
        roles: [...roles],
        status,
        subject,
        userId
      },
      identity: {
        email: identityEmail ?? null,
        issuer: (identity as { issuer: string }).issuer,
        provider: identityProvider ?? null,
        subject: (identity as { subject: string }).subject
      }
    } satisfies PortalAccessSession;
  }

  if (status === "pending") {
    const requestId = (context as { requestId?: unknown }).requestId;
    const userId = (context as { userId?: unknown }).userId;

    if (
      requestId !== null &&
      requestId !== undefined &&
      typeof requestId !== "string"
    ) {
      return null;
    }

    if (userId !== null && userId !== undefined && typeof userId !== "string") {
      return null;
    }

    return {
      context: {
        email,
        requestId: requestId ?? null,
        status,
        subject,
        userId: userId ?? null
      },
      identity: {
        email: identityEmail ?? null,
        issuer: (identity as { issuer: string }).issuer,
        provider: identityProvider ?? null,
        subject: (identity as { subject: string }).subject
      }
    } satisfies PortalAccessSession;
  }

  if (status === "denied") {
    const reason = (context as { reason?: unknown }).reason;

    if (
      reason !== "access_request_required" &&
      reason !== "identity_recovery_required" &&
      reason !== "rejected_or_withdrawn" &&
      reason !== "unknown_identity"
    ) {
      return null;
    }

    return {
      context: {
        email,
        reason,
        status,
        subject
      },
      identity: {
        email: identityEmail ?? null,
        issuer: (identity as { issuer: string }).issuer,
        provider: identityProvider ?? null,
        subject: (identity as { subject: string }).subject
      }
    } satisfies PortalAccessSession;
  }

  return null;
}

export type CloudflareAccessVerifier = {
  audiences: string[];
  issuer: string;
  verifyAssertion: (assertion: string) => Promise<CloudflareAccessIdentity>;
};

export type CloudflareAccessVerifierSet = {
  brandedRelay: CloudflareAccessVerifier;
  internal: CloudflareAccessVerifier;
  portal: CloudflareAccessVerifier;
};

function normalizeTeamDomain(teamDomain: string) {
  return teamDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function usesBrandedFinalizeRelayAudiences(routePath: string) {
  return (
    routePath === "/portal/session/finalize" ||
    routePath === "/portal/session/finalize/submit"
  );
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

function verifySignedAccessCookie(
  cookieHeader: string | undefined,
  cookieName: string,
  secret: string | undefined
) {
  const rawValue = readCookieValue(cookieHeader, cookieName);

  if (!secret || !rawValue) {
    return null;
  }

  const parts = rawValue.split(".");
  const signature = parts.at(-1);
  const expiresAt = parts.at(-2);
  const payloadParts = parts.slice(0, -2);

  if (!signature || !expiresAt || payloadParts.length === 0) {
    return null;
  }

  const expiresAtNumber = Number.parseInt(expiresAt, 10);

  if (!Number.isFinite(expiresAtNumber) || expiresAtNumber < Math.floor(Date.now() / 1000)) {
    return null;
  }

  const payload = `${payloadParts.join(".")}.${expiresAt}`;
  const expectedSignature = createHmac("sha256", secret).update(payload).digest("base64url");
  const providedSignature = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    providedSignature.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(providedSignature, expectedSignatureBuffer)
  ) {
    return null;
  }

  return {
    expiresAt: expiresAtNumber,
    payload: payloadParts.join(".")
  };
}

export function verifyAccessProviderHint(
  cookieHeader: string | undefined,
  expectedSubject?: string
) {
  const verifiedCookie = verifySignedAccessCookie(
    cookieHeader,
    "PortalAccessProvider",
    readAccessProviderStateSecret()
  );
  const parsedPayload = verifiedCookie?.payload
    ? parseVerifiedProviderHintPayload(verifiedCookie.payload)
    : null;

  if (!parsedPayload) {
    return null;
  }

  if (parsedPayload.boundSubject && expectedSubject && parsedPayload.boundSubject !== expectedSubject) {
    return null;
  }

  return parsedPayload.provider;
}

export function verifyAccessLinkIntent(cookieHeader: string | undefined) {
  const verifiedCookie = verifySignedAccessCookie(
    cookieHeader,
    "PortalLinkIntent",
    readAccessProviderStateSecret()
  );

  if (!verifiedCookie?.payload) {
    return null;
  }

  return {
    expiresAt: verifiedCookie.expiresAt,
    intentId: verifiedCookie.payload
  } satisfies VerifiedAccessLinkIntent;
}

function buildSignedCookie(
  name: "PortalAccessProvider" | "PortalLinkIntent" | "PortalAccessSession",
  value: string,
  secret: string,
  options?: {
    maxAgeSeconds?: number;
    sameSite?: "Strict" | "Lax";
  }
) {
  const maxAgeSeconds = options?.maxAgeSeconds ?? 600;
  const sameSite = options?.sameSite ?? "Strict";

  return [
    `${name}=${createSignedAccessValue(value, secret, maxAgeSeconds)}`,
    "Domain=.paretoproof.com",
    "Path=/",
    `SameSite=${sameSite}`,
    `Max-Age=${maxAgeSeconds}`,
    "Secure",
    "HttpOnly"
  ].join("; ");
}

export function buildSignedAccessCookie(
  name: "PortalAccessProvider" | "PortalLinkIntent",
  value: string,
  options?: {
    maxAgeSeconds?: number;
    sameSite?: "Strict" | "Lax";
  }
) {
  const secret = readAccessProviderStateSecret();

  if (!secret) {
    throw new Error("ACCESS_PROVIDER_STATE_SECRET is not configured.");
  }

  return buildSignedCookie(name, value, secret, options);
}

export function buildSignedPortalAccessSessionCookie(
  identity: CloudflareAccessIdentity,
  context: AccessRbacContext,
  options?: {
    maxAgeSeconds?: number;
  }
) {
  const secret = readPortalAccessSessionSecret();

  if (!secret) {
    throw new Error(
      "PORTAL_SESSION_SECRET or ACCESS_PROVIDER_STATE_SECRET is required."
    );
  }

  return buildSignedCookie(
    "PortalAccessSession",
    Buffer.from(
      JSON.stringify({
        context,
        identity
      }),
      "utf8"
    ).toString("base64url"),
    secret,
    {
      maxAgeSeconds: options?.maxAgeSeconds ?? 5 * 60,
      sameSite: "Lax"
    }
  );
}

export function verifyPortalAccessSession(cookieHeader: string | undefined) {
  const verifiedCookie = verifySignedAccessCookie(
    cookieHeader,
    "PortalAccessSession",
    readPortalAccessSessionSecret()
  );

  if (!verifiedCookie?.payload) {
    return null;
  }

  return parsePortalAccessSessionPayload(verifiedCookie.payload);
}

export function readAccessJwtAssertion(
  request: Pick<FastifyRequest, "headers">
) {
  const assertion = request.headers["cf-access-jwt-assertion"];

  if (typeof assertion === "string" && assertion.length > 0) {
    return assertion;
  }

  const cookieHeader = typeof request.headers.cookie === "string" ? request.headers.cookie : undefined;
  const cookieAssertion = readCookieValue(cookieHeader, "CF_Authorization");

  return cookieAssertion && cookieAssertion.length > 0 ? cookieAssertion : null;
}

export function createCloudflareAccessVerifier(options: {
  audiences: string[];
  teamDomain: string;
}): CloudflareAccessVerifier {
  const normalizedTeamDomain = normalizeTeamDomain(options.teamDomain);
  const issuer = `https://${normalizedTeamDomain}`;
  const jwks = createRemoteJWKSet(
    new URL(`${issuer}/cdn-cgi/access/certs`)
  );

  return {
    audiences: [...options.audiences],
    issuer,
    async verifyAssertion(assertion) {
      const { payload } = await jwtVerify<CloudflareAccessTokenClaims>(
        assertion,
        jwks,
        {
          audience: options.audiences,
          issuer
        }
      );

      if (!payload.sub) {
        throw new Error(
          "Cf-Access-Jwt-Assertion is missing the subject claim."
        );
      }

      return {
        email: normalizeOptionalEmail(payload.email),
        issuer,
        provider: null,
        subject: payload.sub
      };
    }
  };
}

export function selectCloudflareAccessVerifier(
  request: Pick<FastifyRequest, "raw" | "routeOptions">,
  verifiers: CloudflareAccessVerifierSet
) {
  const routePath = request.routeOptions?.url ?? request.raw.url ?? "";

  if (routePath.startsWith("/internal/")) {
    return verifiers.internal;
  }

  if (usesBrandedFinalizeRelayAudiences(routePath)) {
    return verifiers.brandedRelay;
  }

  return verifiers.portal;
}

export function createCloudflareAccessVerifierSetFromEnv() {
  const runtimeEnv = parseApiRuntimeEnv();
  const brandedRelayAudiences = [
    runtimeEnv.portalAccessAudience,
    ...runtimeEnv.brandedAccessAudiences
  ];

  return {
    brandedRelay: createCloudflareAccessVerifier({
      audiences: [...new Set(brandedRelayAudiences)],
      teamDomain: runtimeEnv.teamDomain
    }),
    internal: createCloudflareAccessVerifier({
      audiences: [runtimeEnv.internalAccessAudience],
      teamDomain: runtimeEnv.teamDomain
    }),
    portal: createCloudflareAccessVerifier({
      audiences: [runtimeEnv.portalAccessAudience],
      teamDomain: runtimeEnv.teamDomain
    })
  };
}
