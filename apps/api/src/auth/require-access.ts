import type { FastifyReply, FastifyRequest } from "fastify";
import type { HookHandlerDoneFunction } from "fastify/types/hooks";
import type { AccessRbacContext } from "./resolve-access-rbac-context.js";
import { resolveAccessRbacContext } from "./resolve-access-rbac-context.js";
import {
  createCloudflareAccessVerifierSet,
  createCloudflareAccessVerifierSetFromEnv,
  readAccessJwtAssertion,
  selectCloudflareAccessVerifier,
  verifyAccessProviderHint,
  type CloudflareAccessIdentity,
  type CloudflareAccessVerifierSet
} from "./cloudflare-access.js";
import {
  resolvePortalAccessSession,
  type ResolvedPortalAccessSession
} from "./portal-access-session.js";
import type { ApiRuntimeEnv } from "../config/runtime.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";

type RouteAccessRequirement =
  | "authenticated_access_identity"
  | "pending_or_approved"
  | "approved_helper_or_higher"
  | "approved_collaborator_or_higher"
  | "admin_only";

class AccessAssertionVerificationError extends Error {
  constructor(cause: unknown) {
    super("invalid_access_assertion", {
      cause
    });
    this.name = "AccessAssertionVerificationError";
  }
}

export function isAccessAssertionVerificationError(error: unknown) {
  return error instanceof AccessAssertionVerificationError;
}

export function resolveAccessIdentityProvider(
  identity: Pick<CloudflareAccessIdentity, "provider" | "subject">,
  cookieHeader: string | undefined,
  options?: {
    accessProviderStateSecret?: string;
  }
) {
  return verifyAccessProviderHint(cookieHeader, {
    expectedSubject: identity.subject,
    secret: options?.accessProviderStateSecret
  }) ?? identity.provider;
}

declare module "fastify" {
  interface FastifyRequest {
    accessIdentity: CloudflareAccessIdentity | null;
    accessRbacContext: AccessRbacContext | null;
    portalAccessSession: ResolvedPortalAccessSession | null;
  }
}

function hasRole(context: AccessRbacContext, role: "admin" | "collaborator" | "helper") {
  return context.status === "approved" && context.roles.includes(role);
}

function isAllowed(context: AccessRbacContext, requirement: RouteAccessRequirement) {
  if (requirement === "authenticated_access_identity") {
    return true;
  }

  if (requirement === "pending_or_approved") {
    return context.status === "pending" || context.status === "approved";
  }

  if (requirement === "approved_helper_or_higher") {
    return (
      hasRole(context, "helper") ||
      hasRole(context, "collaborator") ||
      hasRole(context, "admin")
    );
  }

  if (requirement === "approved_collaborator_or_higher") {
    return hasRole(context, "collaborator") || hasRole(context, "admin");
  }

  return hasRole(context, "admin");
}

async function resolveRequestAccess(
  db: ReturnTypeOfCreateDbClient,
  verifiers: CloudflareAccessVerifierSet,
  request: FastifyRequest,
  options?: {
    accessProviderStateSecret?: string;
    teamDomain?: string;
  }
) {
  if (request.accessRbacContext) {
    return request.accessRbacContext;
  }

  const assertion = readAccessJwtAssertion(request);
  const routePath = request.routeOptions?.url ?? request.raw.url ?? "";
  const cookieHeader =
    typeof request.headers.cookie === "string" ? request.headers.cookie : undefined;

  if (!assertion) {
    if (routePath.startsWith("/portal/")) {
      const cachedSession = await resolvePortalAccessSession(db, cookieHeader, {
        teamDomain: options?.teamDomain
      });

      if (cachedSession) {
        request.accessIdentity = cachedSession.identity;
        request.accessRbacContext = cachedSession.context;
        request.portalAccessSession = cachedSession;

        return cachedSession.context;
      }
    }

    return null;
  }

  let identity: CloudflareAccessIdentity;

  try {
    const verifier = selectCloudflareAccessVerifier(request, verifiers);
    identity = await verifier.verifyAssertion(assertion);
  } catch (error) {
    throw new AccessAssertionVerificationError(error);
  }

  identity = {
    ...identity,
    provider: resolveAccessIdentityProvider(identity, cookieHeader, {
      accessProviderStateSecret: options?.accessProviderStateSecret
    })
  };

  const context = await resolveAccessRbacContext(db, identity);

  request.accessIdentity = identity;
  request.accessRbacContext = context;
  request.portalAccessSession = null;

  return context;
}

export type AccessResolverOptions = {
  accessProviderStateSecret?: string;
  teamDomain?: string;
  verifiers?: CloudflareAccessVerifierSet;
};

export function createAccessResolver(
  db: ReturnTypeOfCreateDbClient,
  options?: AccessResolverOptions
) {
  const verifiers = options?.verifiers ?? createCloudflareAccessVerifierSetFromEnv();

  return (request: FastifyRequest) =>
    resolveRequestAccess(db, verifiers, request, options);
}

// Access proves identity at the edge, but the backend still decides whether that caller may use its DB-backed routes.
export function createAccessGuard(
  db: ReturnTypeOfCreateDbClient,
  options?: AccessResolverOptions
) {
  const resolveAccess = createAccessResolver(db, options);

  return (requirement: RouteAccessRequirement) => {
    return (
      request: FastifyRequest,
      reply: FastifyReply,
      done: HookHandlerDoneFunction
    ) => {
      void resolveAccess(request)
        .then((context) => {
          if (!context) {
            reply.code(401).send({
              error: "access_assertion_required"
            });

            return;
          }

          if (!isAllowed(context, requirement)) {
            reply.code(403).send({
              access: context,
              error: "insufficient_role"
            });

            return;
          }
          done();
        })
        .catch((error) => {
          if (error instanceof AccessAssertionVerificationError) {
            reply.code(401).send({
              error: "invalid_access_assertion"
            });

            return;
          }

          done(error);
        });
    };
  };
}

export function runtimeEnvToAccessResolverOptions(
  runtimeEnv: Pick<
    ApiRuntimeEnv,
    "accessProviderStateSecret" | "brandedAccessAudiences" | "internalAccessAudience" | "portalAccessAudience" | "teamDomain"
  >
): Required<AccessResolverOptions> {
  return {
    accessProviderStateSecret: runtimeEnv.accessProviderStateSecret,
    teamDomain: runtimeEnv.teamDomain,
    verifiers: createCloudflareAccessVerifierSet(runtimeEnv)
  };
}
