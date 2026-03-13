import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { normalizeOptionalEmail } from "../lib/email.js";
import type { PortalIdentityProvider } from "@paretoproof/shared";

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

export type VerifiedAccessLinkIntent = {
  expiresAt: number;
  intentId: string;
};

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

export type CloudflareAccessVerifier = {
  issuer: string;
  verifyAssertion: (assertion: string) => Promise<CloudflareAccessIdentity>;
};

export type CloudflareAccessVerifierSet = {
  internal: CloudflareAccessVerifier;
  portal: CloudflareAccessVerifier;
};

function normalizeTeamDomain(teamDomain: string) {
  return teamDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
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

function verifySignedAccessCookie(cookieHeader: string | undefined, cookieName: string) {
  const secret = process.env.ACCESS_PROVIDER_STATE_SECRET;
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
  const verifiedCookie = verifySignedAccessCookie(cookieHeader, "PortalAccessProvider");
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
  const verifiedCookie = verifySignedAccessCookie(cookieHeader, "PortalLinkIntent");

  if (!verifiedCookie?.payload) {
    return null;
  }

  return {
    expiresAt: verifiedCookie.expiresAt,
    intentId: verifiedCookie.payload
  } satisfies VerifiedAccessLinkIntent;
}

export function buildSignedAccessCookie(
  name: "PortalAccessProvider" | "PortalLinkIntent",
  value: string,
  options?: {
    maxAgeSeconds?: number;
    sameSite?: "Strict" | "Lax";
  }
) {
  const secret = process.env.ACCESS_PROVIDER_STATE_SECRET;

  if (!secret) {
    throw new Error("ACCESS_PROVIDER_STATE_SECRET is not configured.");
  }

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
  audience: string;
  teamDomain: string;
}): CloudflareAccessVerifier {
  const normalizedTeamDomain = normalizeTeamDomain(options.teamDomain);
  const issuer = `https://${normalizedTeamDomain}`;
  const jwks = createRemoteJWKSet(
    new URL(`${issuer}/cdn-cgi/access/certs`)
  );

  return {
    issuer,
    async verifyAssertion(assertion) {
      const { payload } = await jwtVerify<CloudflareAccessTokenClaims>(
        assertion,
        jwks,
        {
          audience: options.audience,
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

  return routePath.startsWith("/internal/") ? verifiers.internal : verifiers.portal;
}

export function createCloudflareAccessVerifierSetFromEnv() {
  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN;
  const portalAudience =
    process.env.CF_ACCESS_PORTAL_AUD ?? process.env.CF_ACCESS_AUD;
  const internalAudience =
    process.env.CF_ACCESS_INTERNAL_AUD ?? portalAudience;

  if (!teamDomain || !portalAudience || !internalAudience) {
    throw new Error(
      "CF_ACCESS_TEAM_DOMAIN plus CF_ACCESS_PORTAL_AUD/CF_ACCESS_AUD are required for Access JWT validation."
    );
  }

  return {
    internal: createCloudflareAccessVerifier({
      audience: internalAudience,
      teamDomain
    }),
    portal: createCloudflareAccessVerifier({
      audience: portalAudience,
      teamDomain
    })
  };
}
