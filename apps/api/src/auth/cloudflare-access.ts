import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { normalizeOptionalEmail } from "../lib/email.js";
import { parseApiRuntimeEnv, type ApiRuntimeEnv } from "../config/runtime.js";
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

function readAccessProviderStateSecret(secret?: string) {
  return secret ?? process.env.ACCESS_PROVIDER_STATE_SECRET;
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

export type CloudflareAccessRuntimeConfig = Pick<
  ApiRuntimeEnv,
  | "accessProviderStateSecret"
  | "brandedAccessAudiences"
  | "internalAccessAudience"
  | "portalAccessAudience"
  | "teamDomain"
>;

function normalizeTeamDomain(teamDomain: string) {
  return teamDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function usesBrandedFinalizeRelayAudiences(method: string, routePath: string) {
  return method === "POST" && routePath === "/portal/session/finalize/submit";
}

export function readCookieValue(cookieHeader: string | undefined, name: string) {
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
  options?: {
    expectedSubject?: string;
    secret?: string;
  }
) {
  const verifiedCookie = verifySignedAccessCookie(
    cookieHeader,
    "PortalAccessProvider",
    readAccessProviderStateSecret(options?.secret)
  );
  const parsedPayload = verifiedCookie?.payload
    ? parseVerifiedProviderHintPayload(verifiedCookie.payload)
    : null;

  if (!parsedPayload) {
    return null;
  }

  if (
    parsedPayload.boundSubject &&
    options?.expectedSubject &&
    parsedPayload.boundSubject !== options.expectedSubject
  ) {
    return null;
  }

  return parsedPayload.provider;
}

export function verifyAccessLinkIntent(
  cookieHeader: string | undefined,
  options?: {
    secret?: string;
  }
) {
  const verifiedCookie = verifySignedAccessCookie(
    cookieHeader,
    "PortalLinkIntent",
    readAccessProviderStateSecret(options?.secret)
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
  name: "PortalAccessProvider" | "PortalLinkIntent",
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
    secret?: string;
  }
) {
  const secret = readAccessProviderStateSecret(options?.secret);

  if (!secret) {
    throw new Error("ACCESS_PROVIDER_STATE_SECRET is not configured.");
  }

  return buildSignedCookie(name, value, secret, options);
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
  request: Pick<FastifyRequest, "method" | "raw" | "routeOptions">,
  verifiers: CloudflareAccessVerifierSet
) {
  const routePath = request.routeOptions?.url ?? request.raw.url ?? "";

  if (routePath.startsWith("/internal/")) {
    return verifiers.internal;
  }

  if (usesBrandedFinalizeRelayAudiences(request.method, routePath)) {
    return verifiers.brandedRelay;
  }

  return verifiers.portal;
}

export function createCloudflareAccessVerifierSetFromEnv() {
  const runtimeEnv = parseApiRuntimeEnv();
  return createCloudflareAccessVerifierSet(runtimeEnv);
}

export function createCloudflareAccessVerifierSet(
  runtimeEnv: CloudflareAccessRuntimeConfig
) {
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
