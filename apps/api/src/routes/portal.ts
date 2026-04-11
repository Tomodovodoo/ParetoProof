import {
  portalBenchmarkOpsReadModelsContract,
  portalBenchmarkDatasetParamsSchema,
  portalBenchmarkExportQuerySchema,
  portalHarnessRegistryReadContract,
  portalAccessRecoveryInputSchema,
  portalAccessRequestInputSchema,
  portalRunDetailParamsSchema,
  portalProfileLinkIntentInputSchema,
  portalProfileUpdateInputSchema,
  portalRunsListQuerySchema,
  type PortalBenchmarkDatasetResponse,
  type PortalProfile,
  type PortalProfileLinkIntent
} from "@paretoproof/shared";
import { and, desc, eq, isNull } from "drizzle-orm";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler
} from "fastify";
import {
  accessRequests,
  auditEvents,
  identityLinkIntents,
  roleGrants,
  userIdentities,
  users
} from "../db/schema.js";
import { toAccessRequestSummary } from "../lib/access-request-summary.js";
import { normalizeOptionalEmail } from "../lib/email.js";
import {
  buildRequestedIdentityProviderSubjectMatch,
  buildUserIdentityProviderSubjectMatch,
  filterUserIdentityProviderSubjectMatch,
  matchesUserIdentityProviderSubject
} from "../lib/identity-binding.js";
import {
  createPortalBenchmarkOpsReadModelService,
  type PortalBenchmarkOpsReadModelService
} from "../lib/portal-benchmark-ops.js";
import { createHarnessRegistryService } from "../lib/harness-registry.js";
import {
  buildSignedAccessCookie,
  verifyAccessProviderHint,
  verifyAccessLinkIntent
} from "../auth/cloudflare-access.js";
import {
  buildPortalAccessSessionCookie,
  createPortalAccessSession,
  revokePortalAccessSession
} from "../auth/portal-access-session.js";
import {
  createAccessResolver,
  isAccessAssertionVerificationError,
  type AccessResolverOptions
} from "../auth/require-access.js";
import { resolveAccessRbacContext } from "../auth/resolve-access-rbac-context.js";
import type { createRateLimitPreHandlers } from "../middleware/rate-limit.js";
import type { ReturnTypeOfCreateAccessGuard } from "../types/access-guard.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";

class PortalAccessRequestConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortalAccessRequestConflictError";
  }
}

function isPendingAccessRequestConflict(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const databaseCode = "code" in error ? String(error.code) : null;
  const constraintName =
    "constraint_name" in error
      ? String(error.constraint_name)
      : "constraint" in error
        ? String(error.constraint)
        : null;

  return (
    databaseCode === "23505" &&
    constraintName === "access_requests_active_pending_email_unique"
  );
}

function createSubmittedAuditPayload(options: {
  accessRequestId: string;
  actorUserId: string;
  requestKind: "access_request" | "identity_recovery";
  requestedRole: "admin" | "collaborator" | "helper";
  targetEmail: string;
}) {
  return {
    accessRequestId: options.accessRequestId,
    actorUserId: options.actorUserId,
    requestKind: options.requestKind,
    requestedRole: options.requestedRole,
    targetEmail: options.targetEmail
  };
}

function sanitizePortalRedirectPath(rawRedirectPath: string | null) {
  if (!rawRedirectPath || rawRedirectPath === "/") {
    return "/";
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawRedirectPath) || rawRedirectPath.startsWith("//")) {
    return "/";
  }

  try {
    const candidateUrl = new URL(
      rawRedirectPath.startsWith("/") ? rawRedirectPath : `/${rawRedirectPath}`,
      "https://portal.paretoproof.com"
    );

    if (candidateUrl.origin !== "https://portal.paretoproof.com") {
      return "/";
    }

    return `${candidateUrl.pathname}${candidateUrl.search}${candidateUrl.hash}` || "/";
  } catch {
    return "/";
  }
}

function clearSignedAccessCookie(
  name: "PortalAccessProvider" | "PortalLinkIntent" | "PortalAccessSession"
) {
  return `${name}=; Domain=.paretoproof.com; Path=/; SameSite=Strict; Max-Age=0; Secure; HttpOnly`;
}

function buildPortalAuthStartUrl(options: {
  provider: "cloudflare_github" | "cloudflare_google";
  redirectPath: string;
}) {
  const authUrl = new URL(
    options.provider === "cloudflare_github"
      ? "/api/access/start/github"
      : "/api/access/start/google",
    "https://auth.paretoproof.com"
  );

  if (options.redirectPath !== "/") {
    authUrl.searchParams.set("redirect", options.redirectPath);
  }

  authUrl.searchParams.set("flow", "link");

  return authUrl.toString();
}

function buildPortalAuthRetryUrl(redirectPath: string) {
  const authUrl = new URL("https://auth.paretoproof.com");

  if (redirectPath !== "/") {
    authUrl.searchParams.set("redirect", redirectPath);
  }

  authUrl.searchParams.set("handoff", "retry");

  return authUrl.toString();
}

const brandedAuthHosts = new Set([
  "auth.paretoproof.com",
  "github.auth.paretoproof.com",
  "google.auth.paretoproof.com"
]);

function readTrustedBrandedAuthOrigin(request: FastifyRequest) {
  const originHeader =
    typeof request.headers.origin === "string" ? request.headers.origin : null;

  if (originHeader) {
    try {
      const originUrl = new URL(originHeader);

      if (originUrl.protocol === "https:" && brandedAuthHosts.has(originUrl.hostname)) {
        return originUrl.origin;
      }
    } catch {
      return null;
    }
  }

  const refererHeader =
    typeof request.headers.referer === "string" ? request.headers.referer : null;

  if (!refererHeader) {
    return null;
  }

  try {
    const refererUrl = new URL(refererHeader);

    if (refererUrl.protocol === "https:" && brandedAuthHosts.has(refererUrl.hostname)) {
      return refererUrl.origin;
    }
  } catch {
    return null;
  }

  return null;
}

function buildBrandedFinalizeRelayUrl(origin: string, redirectPath: string) {
  const relayUrl = new URL("/api/access/finalize", origin);

  if (redirectPath !== "/") {
    relayUrl.searchParams.set("redirect", redirectPath);
  }

  return relayUrl.toString();
}

function toPortalProfile(options: {
  currentProvider: (typeof userIdentities.$inferSelect)["provider"] | null;
  currentSubject: string;
  fallbackEmail: string | null;
  linkedIdentityRows: (typeof userIdentities.$inferSelect)[];
  userRow: typeof users.$inferSelect | null;
}): PortalProfile {
  return {
    createdAt: options.userRow?.createdAt.toISOString() ?? null,
    displayName: options.userRow?.displayName ?? null,
    email: options.userRow?.email ?? normalizeOptionalEmail(options.fallbackEmail),
    identities: [...options.linkedIdentityRows]
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .map((identityRow) => ({
        createdAt: identityRow.createdAt.toISOString(),
        current:
          options.currentProvider !== null &&
          matchesUserIdentityProviderSubject(
            identityRow,
            options.currentProvider,
            options.currentSubject
          ),
        id: identityRow.id,
        lastSeenAt: identityRow.lastSeenAt.toISOString(),
        provider: identityRow.provider,
        providerEmail: identityRow.providerEmail
      })),
    linkedUserId: options.userRow?.id ?? null,
    updatedAt: options.userRow?.updatedAt.toISOString() ?? null
  };
}

function escapeCsvValue(value: string) {
  const safeValue = /^\s*[=+\-@]/.test(value) ? `'${value}` : value;

  if (/[",\n]/.test(safeValue)) {
    return `"${safeValue.replaceAll('"', '""')}"`;
  }

  return safeValue;
}

function sanitizeExportFilenameSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "benchmark";
}

function buildBenchmarkDatasetCsv(dataset: PortalBenchmarkDatasetResponse) {
  const runById = new Map(dataset.runs.map((run) => [run.runId, run]));
  const attemptsByRunId = new Map<string, typeof dataset.attempts>();

  for (const attempt of dataset.attempts) {
    const existing = attemptsByRunId.get(attempt.runId);

    if (existing) {
      existing.push(attempt);
      continue;
    }

    attemptsByRunId.set(attempt.runId, [attempt]);
  }

  const headers = [
    "benchmarkPackageId",
    "benchmarkVersions",
    "runId",
    "runState",
    "runVerdictClass",
    "providerFamily",
    "modelConfigId",
    "startedAt",
    "completedAt",
    "durationMs",
    "jobId",
    "attemptId",
    "attemptState",
    "attemptVerdictClass",
    "verifierResult",
    "failureFamily",
    "failureCode",
    "failureSummary"
  ];
  const rows = dataset.runs.flatMap((run) => {
    const attempts = attemptsByRunId.get(run.runId) ?? [null];

    return attempts.map((attempt) => [
      dataset.benchmark.benchmarkPackageId,
      dataset.benchmark.versions.join("|"),
      run.runId,
      run.runState,
      run.verdictClass ?? "",
      run.providerFamily,
      run.modelConfigId,
      run.startedAt,
      run.completedAt ?? "",
      run.durationMs === null ? "" : String(run.durationMs),
      attempt?.jobId ?? run.latestJobId ?? "",
      attempt?.attemptId ?? "",
      attempt?.state ?? "",
      attempt?.verdictClass ?? "",
      attempt?.verifierResult ?? "",
      attempt?.failure.family ?? run.failure.family ?? "",
      attempt?.failure.code ?? run.failure.code ?? "",
      attempt?.failure.summary ?? run.failure.summary ?? ""
    ]);
  });

  for (const runId of attemptsByRunId.keys()) {
    if (runById.has(runId)) {
      continue;
    }

    throw new Error(`Benchmark dataset export could not resolve run ${runId}.`);
  }

  return [headers, ...rows]
    .map((row) => row.map((value) => escapeCsvValue(String(value))).join(","))
    .join("\n");
}

async function loadPortalProfile(db: ReturnTypeOfCreateDbClient, options: {
  fallbackEmail: string | null;
  identityProvider: (typeof userIdentities.$inferSelect)["provider"] | null;
  identitySubject: string;
}) {
  const linkedIdentity =
    options.identityProvider === null
      ? null
      : filterUserIdentityProviderSubjectMatch(
          await db.query.userIdentities.findFirst({
            where: buildUserIdentityProviderSubjectMatch(
              options.identityProvider,
              options.identitySubject
            ),
            with: {
              user: {
                with: {
                  identities: true
                }
              }
            }
          }),
          options.identityProvider,
          options.identitySubject
        );

  return toPortalProfile({
    currentProvider: options.identityProvider,
    currentSubject: options.identitySubject,
    fallbackEmail: options.fallbackEmail,
    linkedIdentityRows: linkedIdentity?.user.identities ?? [],
    userRow: linkedIdentity?.user ?? null
  });
}

export function registerPortalRoutes(
  app: FastifyInstance,
  db: ReturnTypeOfCreateDbClient,
  requireAccess: ReturnTypeOfCreateAccessGuard,
  options?: {
    accessProviderStateSecret?: string;
    accessResolverOptions?: AccessResolverOptions;
    portalBenchmarkOpsReadModels?: PortalBenchmarkOpsReadModelService;
    rateLimitPreHandlers?: ReturnType<typeof createRateLimitPreHandlers>;
    resolvePortalAccess?: ReturnType<typeof createAccessResolver>;
  }
) {
  const accessResolverOptions = options?.accessResolverOptions;
  const accessProviderStateSecret =
    options?.accessProviderStateSecret ??
    accessResolverOptions?.accessProviderStateSecret;
  const resolvePortalAccess =
    options?.resolvePortalAccess ?? createAccessResolver(db, accessResolverOptions);
  const portalBenchmarkOpsReadModels =
    options?.portalBenchmarkOpsReadModels ?? createPortalBenchmarkOpsReadModelService(db);
  const harnessRegistry = createHarnessRegistryService();
  const rateLimitPreHandlers = options?.rateLimitPreHandlers;
  const withAuthenticatedRateLimit = (guard: preHandlerHookHandler) =>
    rateLimitPreHandlers?.authenticated
      ? [guard, rateLimitPreHandlers.authenticated]
      : [guard];

  const handlePortalSessionRetryRedirect = (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const redirectPath = sanitizePortalRedirectPath(
      (request.query as { redirect?: string } | undefined)?.redirect ?? null
    );

    reply.header("set-cookie", clearSignedAccessCookie("PortalAccessSession"));
    reply.redirect(buildPortalAuthRetryUrl(redirectPath));
  };

  const handlePortalSessionCompletion = async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const cookieHeader =
      typeof request.headers.cookie === "string" ? request.headers.cookie : undefined;
    const identity = request.accessIdentity;
    const accessContext = request.accessRbacContext;
    const parsedBody =
      typeof request.body === "object" && request.body !== null
        ? (request.body as { redirect?: string })
        : undefined;
    const redirectPath = sanitizePortalRedirectPath(
      parsedBody?.redirect ??
        (request.query as { redirect?: string } | undefined)?.redirect ??
        null
    );
    const portalUrl = new URL(redirectPath, "https://portal.paretoproof.com");
    const linkIntent = verifyAccessLinkIntent(cookieHeader, {
      secret: accessProviderStateSecret
    });
    const providerHint = verifyAccessProviderHint(cookieHeader, {
      expectedSubject: identity?.subject,
      secret: accessProviderStateSecret
    });
    let resolvedAccessContext = accessContext;

    if (identity && linkIntent) {
      const linkStatus = await db.transaction(async (tx) => {
        const intentRow = await tx.query.identityLinkIntents.findFirst({
          where: eq(identityLinkIntents.id, linkIntent.intentId)
        });

        if (!intentRow || intentRow.usedAt || intentRow.expiresAt.getTime() <= Date.now()) {
          return "invalid";
        }

        if (providerHint !== intentRow.targetProvider) {
          return "provider_mismatch";
        }

        const existingSubjectOwner = filterUserIdentityProviderSubjectMatch(
          await tx.query.userIdentities.findFirst({
            where: buildUserIdentityProviderSubjectMatch(
              intentRow.targetProvider,
              identity.subject
            )
          }),
          intentRow.targetProvider,
          identity.subject
        );

        if (existingSubjectOwner && existingSubjectOwner.userId !== intentRow.userId) {
          return "conflict";
        }

        const now = new Date();

        if (!existingSubjectOwner) {
          await tx.insert(userIdentities).values({
            provider: intentRow.targetProvider,
            providerEmail: normalizeOptionalEmail(identity.email),
            providerSubject: identity.subject,
            userId: intentRow.userId
          });
        } else {
          await tx
            .update(userIdentities)
            .set({
              lastSeenAt: now,
              providerEmail: normalizeOptionalEmail(identity.email)
            })
            .where(eq(userIdentities.id, existingSubjectOwner.id));
        }

        await tx
          .update(identityLinkIntents)
          .set({
            usedAt: now
          })
          .where(eq(identityLinkIntents.id, intentRow.id));

        await tx.insert(auditEvents).values({
          actorKind: "portal_user",
          actorUserId: intentRow.userId,
          eventId: "user_identity.linked",
          payload: {
            identityProvider: intentRow.targetProvider,
            identitySubject: identity.subject,
            targetUserId: intentRow.userId
          },
          severity: "critical",
          subjectKind: "user_identity",
          targetUserId: intentRow.userId
        });

        return "linked";
      });

      portalUrl.searchParams.set("link", linkStatus);

      if (linkStatus === "linked") {
        resolvedAccessContext = await resolveAccessRbacContext(db, identity);
        request.accessRbacContext = resolvedAccessContext;
      }
    }

    const responseCookies = [
      identity && resolvedAccessContext?.status === "approved"
        ? buildPortalAccessSessionCookie(
            await createPortalAccessSession(
              db,
              request,
              identity,
              resolvedAccessContext
            )
          )
        : clearSignedAccessCookie("PortalAccessSession"),
      identity && providerHint
        ? buildSignedAccessCookie(
            "PortalAccessProvider",
            `${providerHint}|${identity.subject}`,
            {
              maxAgeSeconds: 24 * 60 * 60,
              secret: accessProviderStateSecret
            }
          )
        : clearSignedAccessCookie("PortalAccessProvider"),
      clearSignedAccessCookie("PortalLinkIntent")
    ];

    reply.header("set-cookie", responseCookies);

    if (
      typeof request.headers.accept === "string" &&
      request.headers.accept.includes("application/json")
    ) {
      return reply.send({
        redirectTo: portalUrl.toString()
      });
    }

    reply.redirect(portalUrl.toString());
  };

  const handlePortalSessionFinalizeGet = async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const cookieHeader =
      typeof request.headers.cookie === "string" ? request.headers.cookie : undefined;

    // Cross-site GETs must not be enough to consume a pending identity-link intent.
    if (verifyAccessLinkIntent(cookieHeader, { secret: accessProviderStateSecret })) {
      handlePortalSessionRetryRedirect(request, reply);
      return;
    }

    try {
      const accessContext = await resolvePortalAccess(request);

      if (!accessContext) {
        handlePortalSessionRetryRedirect(request, reply);
        return;
      }
    } catch (error) {
      if (isAccessAssertionVerificationError(error)) {
        handlePortalSessionRetryRedirect(request, reply);
        return;
      }

      throw error;
    }

    return handlePortalSessionCompletion(request, reply);
  };

  const handlePortalSessionFinalizeSubmit = async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const parsedBody =
      typeof request.body === "object" && request.body !== null
        ? (request.body as { redirect?: string })
        : undefined;
    const redirectPath = sanitizePortalRedirectPath(
      parsedBody?.redirect ??
        (request.query as { redirect?: string } | undefined)?.redirect ??
        null
    );

    try {
      const accessContext = await resolvePortalAccess(request);

      if (!accessContext) {
        const brandedOrigin = readTrustedBrandedAuthOrigin(request);

        if (brandedOrigin) {
          reply.code(307).header(
            "location",
            buildBrandedFinalizeRelayUrl(brandedOrigin, redirectPath)
          );
          return reply.send();
        }

        reply.code(401).send({
          error: "access_assertion_required"
        });
        return;
      }
    } catch (error) {
      if (isAccessAssertionVerificationError(error)) {
        const brandedOrigin = readTrustedBrandedAuthOrigin(request);

        if (brandedOrigin) {
          reply.code(307).header(
            "location",
            buildBrandedFinalizeRelayUrl(brandedOrigin, redirectPath)
          );
          return reply.send();
        }

        reply.code(401).send({
          error: "invalid_access_assertion"
        });
        return;
      }

      throw error;
    }

    return handlePortalSessionCompletion(request, reply);
  };

  app.get(
    "/portal/me",
    {
      preHandler: [
        ...withAuthenticatedRateLimit(requireAccess("authenticated_access_identity"))
      ]
    },
    async (request) => {
      return {
        identity: request.accessIdentity,
        access: request.accessRbacContext
      };
    }
  );

  app.get("/portal/session/complete", {
    preHandler: rateLimitPreHandlers?.public
  }, handlePortalSessionRetryRedirect);
  app.get("/portal/session/finalize", {
    preHandler: rateLimitPreHandlers?.public
  }, handlePortalSessionRetryRedirect);
  app.get("/portal/session/finalize/submit", {
    preHandler: rateLimitPreHandlers?.public
  }, handlePortalSessionFinalizeGet);

  app.post(
    "/portal/session/complete",
    {
      preHandler: [
        ...withAuthenticatedRateLimit(requireAccess("authenticated_access_identity"))
      ]
    },
    handlePortalSessionCompletion
  );

  app.post(
    "/portal/session/finalize",
    {
      preHandler: [
        ...withAuthenticatedRateLimit(requireAccess("authenticated_access_identity"))
      ]
    },
    handlePortalSessionCompletion
  );

  app.post(
    "/portal/session/finalize/submit",
    {
      preHandler: rateLimitPreHandlers?.public
    },
    handlePortalSessionFinalizeSubmit
  );

  app.post("/portal/session/sign-out", {
    preHandler: rateLimitPreHandlers?.public
  }, async (request, reply) => {
    const cookieHeader =
      typeof request.headers.cookie === "string" ? request.headers.cookie : undefined;

    await revokePortalAccessSession(db, cookieHeader);
    reply.code(204).header("set-cookie", [
      clearSignedAccessCookie("PortalAccessSession"),
      clearSignedAccessCookie("PortalAccessProvider"),
      clearSignedAccessCookie("PortalLinkIntent")
    ]);
    return reply.send();
  });

  app.get(
    "/portal/access-requests/me",
    {
      preHandler: [
        ...withAuthenticatedRateLimit(requireAccess("authenticated_access_identity"))
      ]
    },
    async (request) => {
      const identity = request.accessIdentity;
      const accessContext = request.accessRbacContext;
      const pendingUserId =
        accessContext?.status === "pending" ? accessContext.userId : null;
      const canUsePendingFallback = accessContext?.status === "pending";
      const accessEmail = normalizeOptionalEmail(identity?.email);

      if (!identity) {
        throw new Error("Authenticated Access identity was not attached to the request.");
      }

      const linkedIdentity =
        identity.provider === null
          ? null
          : filterUserIdentityProviderSubjectMatch(
              await db.query.userIdentities.findFirst({
                where: buildUserIdentityProviderSubjectMatch(
                  identity.provider,
                  identity.subject
                )
              }),
              identity.provider,
              identity.subject
            );

      const latestRequest =
        (linkedIdentity
          ? await db.query.accessRequests.findFirst({
              orderBy: [desc(accessRequests.createdAt)],
              where: eq(accessRequests.requestedByUserId, linkedIdentity.userId)
            })
          : null) ??
        (pendingUserId
          ? await db.query.accessRequests.findFirst({
              orderBy: [desc(accessRequests.createdAt)],
              where: eq(accessRequests.requestedByUserId, pendingUserId)
            })
          : null) ??
        (canUsePendingFallback && accessEmail
          ? await db.query.accessRequests.findFirst({
              orderBy: [desc(accessRequests.createdAt)],
              where: and(
                eq(accessRequests.email, accessEmail),
                eq(accessRequests.status, "pending")
              )
            })
          : null) ??
        (accessEmail
          ? await db.query.accessRequests.findFirst({
              orderBy: [desc(accessRequests.createdAt)],
              where: eq(accessRequests.email, accessEmail)
            })
          : null);

      return {
        item: latestRequest ? toAccessRequestSummary(latestRequest) : null
      };
    }
  );

  app.get(
    "/portal/profile",
    {
      preHandler: [
        ...withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
      ]
    },
    async (request) => {
      const identity = request.accessIdentity;

      if (!identity) {
        throw new Error("Authenticated Access identity was not attached to the request.");
      }

      return {
        profile: await loadPortalProfile(db, {
          fallbackEmail: normalizeOptionalEmail(identity.email),
          identityProvider: identity.provider,
          identitySubject: identity.subject
        })
      };
    }
  );

  app.get(
    "/portal/benchmarks",
    {
      config: {
        contract: portalBenchmarkOpsReadModelsContract.benchmarksListResponse
      },
      preHandler: [
        ...withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
      ]
    },
    async () => portalBenchmarkOpsReadModels.getBenchmarksList()
  );

  app.get(
    "/portal/benchmarks/:packageId/dataset",
    {
      config: {
        contract: portalBenchmarkOpsReadModelsContract.benchmarkDatasetResponse
      },
      preHandler: [
        ...withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
      ]
    },
    async (request, reply) => {
      const parsedParams = portalBenchmarkDatasetParamsSchema.safeParse(request.params ?? {});

      if (!parsedParams.success) {
        reply.code(400).send({
          error: "invalid_portal_benchmark_dataset_params",
          issues: parsedParams.error.issues
        });
        return;
      }

      const dataset = await portalBenchmarkOpsReadModels.getBenchmarkDataset(
        parsedParams.data.packageId
      );

      if (!dataset) {
        reply.code(404).send({
          error: "portal_benchmark_dataset_not_found"
        });
        return;
      }

      return dataset;
    }
  );

  app.get(
    "/portal/benchmarks/:packageId/export",
    {
      preHandler: [
        ...withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
      ]
    },
    async (request, reply) => {
      const parsedParams = portalBenchmarkDatasetParamsSchema.safeParse(request.params ?? {});

      if (!parsedParams.success) {
        reply.code(400).send({
          error: "invalid_portal_benchmark_export_params",
          issues: parsedParams.error.issues
        });
        return;
      }

      const parsedQuery = portalBenchmarkExportQuerySchema.safeParse(request.query ?? {});

      if (!parsedQuery.success) {
        reply.code(400).send({
          error: "invalid_portal_benchmark_export_query",
          issues: parsedQuery.error.issues
        });
        return;
      }

      const dataset = await portalBenchmarkOpsReadModels.getBenchmarkDataset(
        parsedParams.data.packageId
      );

      if (!dataset) {
        reply.code(404).send({
          error: "portal_benchmark_dataset_not_found"
        });
        return;
      }

      const filenameRoot = sanitizeExportFilenameSegment(parsedParams.data.packageId);

      if (parsedQuery.data.format === "csv") {
        reply
          .header("content-disposition", `attachment; filename="${filenameRoot}-dataset.csv"`)
          .type("text/csv; charset=utf-8");
        return reply.send(buildBenchmarkDatasetCsv(dataset));
      }

      reply
        .header("content-disposition", `attachment; filename="${filenameRoot}-dataset.json"`)
        .type("application/json; charset=utf-8");
      return reply.send(dataset);
    }
  );

  app.get(
    "/portal/runs",
    {
      config: {
        contract: portalBenchmarkOpsReadModelsContract.runsListResponse
      },
      preHandler: [
        ...withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
      ]
    },
    async (request, reply) => {
      const parsedQuery = portalRunsListQuerySchema.safeParse(request.query ?? {});

      if (!parsedQuery.success) {
        reply.code(400).send({
          error: "invalid_portal_runs_query",
          issues: parsedQuery.error.issues
        });
        return;
      }

      return portalBenchmarkOpsReadModels.getRunsList(parsedQuery.data);
    }
  );

  app.get(
    "/portal/runs/:runId",
    {
      config: {
        contract: portalBenchmarkOpsReadModelsContract.runDetailResponse
      },
      preHandler: [
        ...withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
      ]
    },
    async (request, reply) => {
      const parsedParams = portalRunDetailParamsSchema.safeParse(request.params ?? {});

      if (!parsedParams.success) {
        reply.code(400).send({
          error: "invalid_portal_run_detail_params",
          issues: parsedParams.error.issues
        });
        return;
      }

      const detail = await portalBenchmarkOpsReadModels.getRunDetail(parsedParams.data.runId);

      if (!detail) {
        reply.code(404).send({
          error: "portal_run_not_found"
        });
        return;
      }

      return detail;
    }
  );

  app.get(
    "/portal/harnesses",
    {
      config: {
        contract: portalHarnessRegistryReadContract.catalogResponse
      },
      preHandler: [
        ...withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
      ]
    },
    async () => harnessRegistry.getCatalog()
  );

  app.get(
    "/portal/launch",
    {
      config: {
        contract: portalBenchmarkOpsReadModelsContract.launchViewResponse
      },
      preHandler: [
        ...withAuthenticatedRateLimit(requireAccess("approved_collaborator_or_higher"))
      ]
    },
    async () => portalBenchmarkOpsReadModels.getLaunchView()
  );

  app.get(
    "/portal/workers",
    {
      config: {
        contract: portalBenchmarkOpsReadModelsContract.workersViewResponse
      },
      preHandler: [
        ...withAuthenticatedRateLimit(requireAccess("approved_collaborator_or_higher"))
      ]
    },
    async () => portalBenchmarkOpsReadModels.getWorkersView()
  );

  const handlePortalProfileUpdate = async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const parsedBody = portalProfileUpdateInputSchema.safeParse(request.body ?? {});

    if (!parsedBody.success) {
      reply.code(400).send({
        error: "invalid_profile_payload",
        issues: parsedBody.error.issues
      });
      return;
    }

    const identity = request.accessIdentity;

    if (!identity) {
      throw new Error("Authenticated Access identity was not attached to the request.");
    }

    const linkedIdentity =
      identity.provider === null
        ? null
        : filterUserIdentityProviderSubjectMatch(
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
          );

    if (!linkedIdentity) {
      reply.code(409).send({
        error: "profile_not_initialized"
      });
      return;
    }

    await db
      .update(users)
      .set({
        displayName: parsedBody.data.displayName,
        updatedAt: new Date()
      })
      .where(eq(users.id, linkedIdentity.user.id));

    return {
      profile: await loadPortalProfile(db, {
        fallbackEmail: normalizeOptionalEmail(identity.email),
        identityProvider: identity.provider,
        identitySubject: identity.subject
      })
    };
  };

  app.patch(
    "/portal/profile",
    {
      preHandler: [
        ...withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
      ]
    },
    handlePortalProfileUpdate
  );

  app.post(
    "/portal/profile",
    {
      preHandler: [
        ...withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
      ]
    },
    handlePortalProfileUpdate
  );

  app.post(
    "/portal/profile/link-intents",
    {
      preHandler: [
        ...withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
      ]
    },
    async (request, reply) => {
      const parsedBody = portalProfileLinkIntentInputSchema.safeParse(request.body ?? {});

      if (!parsedBody.success) {
        reply.code(400).send({
          error: "invalid_profile_link_intent_payload",
          issues: parsedBody.error.issues
        });
        return;
      }

      const identity = request.accessIdentity;
      const accessContext = request.accessRbacContext;

      if (!identity || accessContext?.status !== "approved") {
        throw new Error("Approved Access identity was not attached to the request.");
      }

      const linkedIdentity =
        identity.provider === null
          ? null
          : filterUserIdentityProviderSubjectMatch(
              await db.query.userIdentities.findFirst({
                where: buildUserIdentityProviderSubjectMatch(
                  identity.provider,
                  identity.subject
                ),
                with: {
                  user: {
                    with: {
                      identities: true
                    }
                  }
                }
              }),
              identity.provider,
              identity.subject
            );

      if (!linkedIdentity) {
        reply.code(409).send({
          error: "profile_not_initialized"
        });
        return;
      }

      const targetProvider = parsedBody.data.provider;
      const redirectPath = sanitizePortalRedirectPath(
        parsedBody.data.redirectPath ?? "/profile"
      );

      if (linkedIdentity.user.identities.some((candidate) => candidate.provider === targetProvider)) {
        reply.code(409).send({
          error: "identity_provider_already_linked"
        });
        return;
      }

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      const intent = await db.transaction(async (tx) => {
        await tx
          .update(identityLinkIntents)
          .set({
            usedAt: new Date()
          })
          .where(
            and(
              eq(identityLinkIntents.userId, linkedIdentity.user.id),
              eq(identityLinkIntents.targetProvider, targetProvider),
              isNull(identityLinkIntents.usedAt)
            )
          );

        const [createdIntent] = await tx
          .insert(identityLinkIntents)
          .values({
            expiresAt,
            redirectPath,
            targetProvider,
            userId: linkedIdentity.user.id
          })
          .returning();

        if (!createdIntent) {
          throw new Error("Failed to create the identity-link intent.");
        }

        await tx.insert(auditEvents).values({
          actorKind: "portal_user",
          actorUserId: linkedIdentity.user.id,
          eventId: "user_identity.link_intent_created",
          payload: {
            expiresAt: createdIntent.expiresAt.toISOString(),
            intentId: createdIntent.id,
            targetProvider,
            targetUserId: linkedIdentity.user.id
          },
          severity: "info",
          subjectKind: "user_identity",
          targetUserId: linkedIdentity.user.id
        });

        return createdIntent;
      });

      const responseBody: PortalProfileLinkIntent = {
        expiresAt: intent.expiresAt.toISOString(),
        provider: targetProvider,
        startUrl: buildPortalAuthStartUrl({
          provider: targetProvider,
          redirectPath: intent.redirectPath
        })
      };

      reply.header(
        "set-cookie",
        buildSignedAccessCookie("PortalLinkIntent", intent.id, {
          secret: accessProviderStateSecret
        })
      );

      return {
        intent: responseBody
      };
    }
  );

  app.post(
    "/portal/access-requests",
    {
      preHandler: [
        ...withAuthenticatedRateLimit(requireAccess("authenticated_access_identity"))
      ]
    },
    async (request, reply) => {
      const parsedBody = portalAccessRequestInputSchema.safeParse(request.body ?? {});

      if (!parsedBody.success) {
        reply.code(400).send({
          error: "invalid_access_request_payload",
          issues: parsedBody.error.issues
        });
        return;
      }

      const identity = request.accessIdentity;

      if (!identity?.email) {
        reply.code(400).send({
          error: "access_email_required"
        });
        return;
      }

      const accessEmail = normalizeOptionalEmail(identity.email);

      if (!accessEmail) {
        reply.code(400).send({
          error: "access_email_required"
        });
        return;
      }

      if (!identity.provider) {
        reply.code(409).send({
          error: "identity_provider_required"
        });
        return;
      }

      const accessProvider = identity.provider;

      let latestRequest;

      try {
        latestRequest = await db.transaction(async (tx) => {
          const existingIdentity = filterUserIdentityProviderSubjectMatch(
            await tx.query.userIdentities.findFirst({
              where: buildUserIdentityProviderSubjectMatch(
                accessProvider,
                identity.subject
              )
            }),
            accessProvider,
            identity.subject
          );

          const linkedUser = existingIdentity
            ? await tx.query.users.findFirst({
                where: eq(users.id, existingIdentity.userId),
                with: {
                  identities: true
                }
              })
            : null;

          const matchingUser = await tx.query.users.findFirst({
            where: eq(users.email, accessEmail),
            with: {
              identities: true
            }
          });

          if (
            existingIdentity &&
            matchingUser &&
            existingIdentity.userId !== matchingUser.id
          ) {
            throw new PortalAccessRequestConflictError("access_identity_already_linked");
          }

          if (
            !existingIdentity &&
            matchingUser &&
            matchingUser.identities.length > 0
          ) {
            throw new PortalAccessRequestConflictError("identity_link_required");
          }

          const user =
            linkedUser ??
            matchingUser ??
            (
              await tx
                .insert(users)
                .values({
                  email: accessEmail
                })
                .returning({
                  email: users.email,
                  id: users.id
                })
            )[0];

          if (!user) {
            throw new Error("Failed to persist the access-request user record.");
          }

          if (existingIdentity) {
            if (user.email !== accessEmail) {
              await tx
                .update(users)
                .set({
                  email: accessEmail,
                  updatedAt: new Date()
                })
                .where(eq(users.id, user.id));
            }

            await tx
              .update(userIdentities)
              .set({
                lastSeenAt: new Date(),
                providerEmail: accessEmail
              })
              .where(eq(userIdentities.id, existingIdentity.id));
          } else {
            // A new Access subject may only link itself to a user record that has never
            // been linked before. Multi-provider recovery and explicit linking live elsewhere.
            await tx.insert(userIdentities).values({
              provider: accessProvider,
              providerEmail: accessEmail,
              providerSubject: identity.subject,
              userId: user.id
            });
          }

          const activeRoleRows = await tx
            .select({
              role: roleGrants.role
            })
            .from(roleGrants)
            .where(and(eq(roleGrants.userId, user.id), isNull(roleGrants.revokedAt)));

          if (activeRoleRows.length > 0) {
            throw new PortalAccessRequestConflictError("already_approved");
          }

          const existingRequest = await tx.query.accessRequests.findFirst({
            orderBy: [desc(accessRequests.createdAt)],
            where: eq(accessRequests.email, accessEmail)
          });

          if (
            existingRequest &&
            (existingRequest.status === "rejected" ||
              existingRequest.status === "withdrawn")
          ) {
            throw new PortalAccessRequestConflictError("access_request_reentry_not_allowed");
          }

          if (existingRequest?.status === "pending") {
            const payloadChanged =
              existingRequest.rationale !== parsedBody.data.rationale ||
              existingRequest.requestedRole !== parsedBody.data.requestedRole ||
              existingRequest.requestKind !== "access_request";

            if (!payloadChanged) {
              return existingRequest;
            }

            const [updatedRequest] = await tx
              .update(accessRequests)
              .set({
                rationale: parsedBody.data.rationale,
                requestedRole: parsedBody.data.requestedRole
              })
              .where(eq(accessRequests.id, existingRequest.id))
              .returning();

            await tx.insert(auditEvents).values({
              actorKind: "portal_user",
              actorUserId: user.id,
              eventId: "access_request.submitted",
              payload: createSubmittedAuditPayload({
                accessRequestId: (updatedRequest ?? existingRequest).id,
                actorUserId: user.id,
                requestKind: "access_request",
                requestedRole: parsedBody.data.requestedRole,
                targetEmail: accessEmail
              }),
              severity: "info",
              subjectKind: "access_request",
              targetUserId: user.id
            });

            return updatedRequest ?? existingRequest;
          }

          const [createdRequest] = await tx
            .insert(accessRequests)
            .values({
              email: accessEmail,
              rationale: parsedBody.data.rationale,
              requestKind: "access_request",
              requestedByUserId: user.id,
              requestedRole: parsedBody.data.requestedRole
            })
            .returning();

          if (!createdRequest) {
            throw new Error("Failed to create the contributor access request.");
          }

          await tx.insert(auditEvents).values({
            actorKind: "portal_user",
            actorUserId: user.id,
            eventId: "access_request.submitted",
            payload: createSubmittedAuditPayload({
              accessRequestId: createdRequest.id,
              actorUserId: user.id,
              requestKind: "access_request",
              requestedRole: parsedBody.data.requestedRole,
              targetEmail: accessEmail
            }),
            severity: "info",
            subjectKind: "access_request",
            targetUserId: user.id
          });

          return createdRequest;
        });
      } catch (error) {
        if (isPendingAccessRequestConflict(error)) {
          latestRequest = await db.query.accessRequests.findFirst({
            orderBy: [desc(accessRequests.createdAt)],
            where: and(
              eq(accessRequests.email, accessEmail),
              eq(accessRequests.status, "pending")
            )
          });

          if (!latestRequest) {
            throw error;
          }
        } else if (error instanceof PortalAccessRequestConflictError) {
          reply.code(409).send({
            error: error.message
          });
          return;
        }

        throw error;
      }

      if (!latestRequest) {
        throw new Error("The access-request flow completed without returning a request.");
      }

      return {
        item: toAccessRequestSummary(latestRequest)
      };
    }
  );

  app.post(
    "/portal/access-recovery",
    {
      preHandler: [
        ...withAuthenticatedRateLimit(requireAccess("authenticated_access_identity"))
      ]
    },
    async (request, reply) => {
      const parsedBody = portalAccessRecoveryInputSchema.safeParse(request.body ?? {});

      if (!parsedBody.success) {
        reply.code(400).send({
          error: "invalid_access_recovery_payload",
          issues: parsedBody.error.issues
        });
        return;
      }

      const identity = request.accessIdentity;

      if (!identity?.email) {
        reply.code(400).send({
          error: "access_email_required"
        });
        return;
      }

      const accessEmail = normalizeOptionalEmail(identity.email);

      if (!accessEmail) {
        reply.code(400).send({
          error: "access_email_required"
        });
        return;
      }

      if (!identity.provider) {
        reply.code(409).send({
          error: "identity_provider_required"
        });
        return;
      }

      const accessProvider = identity.provider;

      let latestRequest;

      try {
        latestRequest = await db.transaction(async (tx) => {
          const existingIdentity = filterUserIdentityProviderSubjectMatch(
            await tx.query.userIdentities.findFirst({
              where: buildUserIdentityProviderSubjectMatch(
                accessProvider,
                identity.subject
              )
            }),
            accessProvider,
            identity.subject
          );

          if (existingIdentity) {
            throw new PortalAccessRequestConflictError("identity_already_linked");
          }

          const matchingUser = await tx.query.users.findFirst({
            where: eq(users.email, accessEmail)
          });

          if (!matchingUser) {
            throw new PortalAccessRequestConflictError("identity_recovery_not_available");
          }

          const activeRoleRows = await tx
            .select({
              role: roleGrants.role
            })
            .from(roleGrants)
            .where(and(eq(roleGrants.userId, matchingUser.id), isNull(roleGrants.revokedAt)));

          if (activeRoleRows.length === 0) {
            throw new PortalAccessRequestConflictError("identity_recovery_not_available");
          }

          const recoveryRole = activeRoleRows[0]?.role ?? "helper";
          const existingRequest = await tx.query.accessRequests.findFirst({
            orderBy: [desc(accessRequests.createdAt)],
            where: eq(accessRequests.email, accessEmail)
          });

          if (
            existingRequest &&
            (existingRequest.status === "rejected" ||
              existingRequest.status === "withdrawn")
          ) {
            throw new PortalAccessRequestConflictError(
              "identity_recovery_reentry_not_allowed"
            );
          }

          if (existingRequest?.status === "pending") {
            const payloadChanged =
              existingRequest.requestKind !== "identity_recovery" ||
              existingRequest.rationale !== parsedBody.data.rationale ||
              existingRequest.requestedIdentityProvider !== accessProvider ||
              existingRequest.requestedIdentitySubject !== identity.subject ||
              existingRequest.requestedRole !== recoveryRole;

            if (!payloadChanged) {
              return existingRequest;
            }

            const [updatedRequest] = await tx
              .update(accessRequests)
              .set({
                rationale: parsedBody.data.rationale,
                requestKind: "identity_recovery",
                requestedIdentityProvider: accessProvider,
                requestedIdentitySubject: identity.subject,
                requestedByUserId: matchingUser.id,
                requestedRole: recoveryRole
              })
              .where(eq(accessRequests.id, existingRequest.id))
              .returning();

            await tx.insert(auditEvents).values({
              actorKind: "portal_user",
              actorUserId: matchingUser.id,
              eventId: "access_request.submitted",
              payload: createSubmittedAuditPayload({
                accessRequestId: (updatedRequest ?? existingRequest).id,
                actorUserId: matchingUser.id,
                requestKind: "identity_recovery",
                requestedRole: recoveryRole,
                targetEmail: accessEmail
              }),
              severity: "info",
              subjectKind: "access_request",
              targetUserId: matchingUser.id
            });

            return updatedRequest ?? existingRequest;
          }

          const [createdRequest] = await tx
            .insert(accessRequests)
            .values({
              email: accessEmail,
              rationale: parsedBody.data.rationale,
              requestKind: "identity_recovery",
              requestedIdentityProvider: accessProvider,
              requestedIdentitySubject: identity.subject,
              requestedByUserId: matchingUser.id,
              requestedRole: recoveryRole
            })
            .returning();

          if (!createdRequest) {
            throw new Error("Failed to create the identity recovery request.");
          }

          await tx.insert(auditEvents).values({
            actorKind: "portal_user",
            actorUserId: matchingUser.id,
            eventId: "access_request.submitted",
            payload: createSubmittedAuditPayload({
              accessRequestId: createdRequest.id,
              actorUserId: matchingUser.id,
              requestKind: "identity_recovery",
              requestedRole: recoveryRole,
              targetEmail: accessEmail
            }),
            severity: "info",
            subjectKind: "access_request",
            targetUserId: matchingUser.id
          });

          return createdRequest;
        });
      } catch (error) {
        if (isPendingAccessRequestConflict(error)) {
          latestRequest = await db.query.accessRequests.findFirst({
            orderBy: [desc(accessRequests.createdAt)],
            where: and(
              eq(accessRequests.email, accessEmail),
              eq(accessRequests.status, "pending")
            )
          });

          if (!latestRequest) {
            throw error;
          }
        } else if (error instanceof PortalAccessRequestConflictError) {
          reply.code(409).send({
            error: error.message
          });
          return;
        }

        throw error;
      }

      if (!latestRequest) {
        throw new Error("The access-recovery flow completed without returning a request.");
      }

      return {
        item: toAccessRequestSummary(latestRequest)
      };
    }
  );
}
