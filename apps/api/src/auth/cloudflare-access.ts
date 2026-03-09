import type { FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { normalizeOptionalEmail } from "../lib/email.js";

type CloudflareAccessTokenClaims = JWTPayload & {
  email?: string;
  sub?: string;
};

export type CloudflareAccessIdentity = {
  email: string | null;
  issuer: string;
  subject: string;
};

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

export function readAccessJwtAssertion(
  request: Pick<FastifyRequest, "headers">
) {
  const assertion = request.headers["cf-access-jwt-assertion"];

  return typeof assertion === "string" && assertion.length > 0 ? assertion : null;
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
