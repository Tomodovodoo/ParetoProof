import type { FastifyReply, FastifyRequest } from "fastify";
import type { HookHandlerDoneFunction } from "fastify/types/hooks";
import type { AccessRbacContext } from "./resolve-access-rbac-context.js";
import { resolveAccessRbacContext } from "./resolve-access-rbac-context.js";
import {
  createCloudflareAccessVerifierSetFromEnv,
  readAccessJwtAssertion,
  selectCloudflareAccessVerifier,
  verifyAccessProviderHint,
  type CloudflareAccessIdentity,
  type CloudflareAccessVerifierSet
} from "./cloudflare-access.js";
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

declare module "fastify" {
  interface FastifyRequest {
    accessIdentity: CloudflareAccessIdentity | null;
    accessRbacContext: AccessRbacContext | null;
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
  request: FastifyRequest
) {
  if (request.accessRbacContext) {
    return request.accessRbacContext;
  }

  const assertion = readAccessJwtAssertion(request);

  if (!assertion) {
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
    provider: verifyAccessProviderHint(
      typeof request.headers.cookie === "string" ? request.headers.cookie : undefined,
      identity.subject
    ) ?? identity.provider
  };

  const context = await resolveAccessRbacContext(db, identity);

  request.accessIdentity = identity;
  request.accessRbacContext = context;

  return context;
}

export function createAccessResolver(db: ReturnTypeOfCreateDbClient) {
  const verifiers = createCloudflareAccessVerifierSetFromEnv();

  return (request: FastifyRequest) => resolveRequestAccess(db, verifiers, request);
}

// Access proves identity at the edge, but the backend still decides whether that caller may use its DB-backed routes.
export function createAccessGuard(db: ReturnTypeOfCreateDbClient) {
  const resolveAccess = createAccessResolver(db);

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
