import type {
  BenchmarkRelease,
  BenchmarkVersion,
  BenchmarkVersionLaunchability,
  PackageFreeze,
  RepoSyncRecord,
  RepoSyncRecordStatus
} from "@paretoproof/shared";
import {
  benchmarkWorkflowContract,
  type AdminBenchmarkReleaseCreateInput,
  type AdminBenchmarkVersionCreateInput,
  type AdminPackageFreezeCreateInput
} from "@paretoproof/shared";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler
} from "fastify";
import {
  auditEvents,
  benchmarkReleases,
  benchmarkVersions,
  packageFreezes,
  repoSyncRecords
} from "../db/schema.js";
import type { createRateLimitPreHandlers } from "../middleware/rate-limit.js";
import type { ReturnTypeOfCreateAccessGuard } from "../types/access-guard.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";

type DbRepoSyncRecordRow = typeof repoSyncRecords.$inferSelect;
type DbPackageFreezeRow = typeof packageFreezes.$inferSelect;
type DbBenchmarkVersionRow = typeof benchmarkVersions.$inferSelect;
type DbBenchmarkReleaseRow = typeof benchmarkReleases.$inferSelect;
const repoSyncStatusTransitions: Record<RepoSyncRecordStatus, RepoSyncRecordStatus[]> = {
  merged: ["merged", "superseded"],
  pr_open: ["pr_open", "merged", "rejected", "superseded"],
  proposed: ["proposed", "pr_open", "merged", "rejected", "superseded"],
  rejected: ["rejected"],
  superseded: ["superseded"]
};

const benchmarkVersionLaunchabilityTransitions: Record<
  BenchmarkVersionLaunchability,
  BenchmarkVersionLaunchability[]
> = {
  internal_only: ["internal_only", "launchable"],
  launchable: ["launchable"]
};

function readDatabaseConstraintName(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  return "constraint_name" in error
    ? String(error.constraint_name)
    : "constraint" in error
      ? String(error.constraint)
      : null;
}

function isDatabaseUniqueConstraintError(error: unknown, constraintNames: string[]) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const databaseCode = "code" in error ? String(error.code) : null;
  const constraintName = readDatabaseConstraintName(error);

  return (
    databaseCode === "23505" &&
    constraintName !== null &&
    constraintNames.includes(constraintName)
  );
}

function getAdminActorUserId(request: FastifyRequest) {
  const context = request.accessRbacContext;

  if (context?.status !== "approved" || !context.roles.includes("admin")) {
    throw new Error("Admin access context was not attached to the benchmark workflow request.");
  }

  return context.userId;
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function parseRepoSyncRecordParams(request: FastifyRequest, reply: FastifyReply) {
  const parsedParams = benchmarkWorkflowContract.repoSyncRecordParams.safeParse(
    request.params ?? {}
  );

  if (!parsedParams.success) {
    reply.code(400).send({
      error: "invalid_repo_sync_record_params",
      issues: parsedParams.error.issues
    });
    return null;
  }

  return parsedParams.data;
}

function parsePackageFreezeParams(request: FastifyRequest, reply: FastifyReply) {
  const parsedParams = benchmarkWorkflowContract.packageFreezeParams.safeParse(
    request.params ?? {}
  );

  if (!parsedParams.success) {
    reply.code(400).send({
      error: "invalid_package_freeze_params",
      issues: parsedParams.error.issues
    });
    return null;
  }

  return parsedParams.data;
}

function parseBenchmarkVersionParams(request: FastifyRequest, reply: FastifyReply) {
  const parsedParams = benchmarkWorkflowContract.benchmarkVersionParams.safeParse(
    request.params ?? {}
  );

  if (!parsedParams.success) {
    reply.code(400).send({
      error: "invalid_benchmark_version_params",
      issues: parsedParams.error.issues
    });
    return null;
  }

  return parsedParams.data;
}

function parseBenchmarkReleaseParams(request: FastifyRequest, reply: FastifyReply) {
  const parsedParams = benchmarkWorkflowContract.benchmarkReleaseParams.safeParse(
    request.params ?? {}
  );

  if (!parsedParams.success) {
    reply.code(400).send({
      error: "invalid_benchmark_release_params",
      issues: parsedParams.error.issues
    });
    return null;
  }

  return parsedParams.data;
}

function getDefaultBenchmarkDisplayLabel(packageId: string, packageVersion: string) {
  return `${packageId} @ ${packageVersion}`;
}

function hasRepoPullRequestLink(value: {
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
}) {
  return value.pullRequestNumber !== null && value.pullRequestUrl !== null;
}

function toRepoSyncRecord(row: DbRepoSyncRecordRow): RepoSyncRecord {
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    lastUpdatedByUserId: row.lastUpdatedByUserId,
    mathPackageCandidateId: row.mathPackageCandidateId,
    mergeCommitSha: row.mergeCommitSha,
    note: row.note,
    pullRequestNumber: row.pullRequestNumber,
    pullRequestUrl: row.pullRequestUrl,
    recordedByUserId: row.recordedByUserId,
    repoName: row.repoName,
    repoOwner: row.repoOwner,
    status: row.status,
    targetRepoPath: row.targetRepoPath,
    updatedAt: row.updatedAt.toISOString()
  };
}

function toPackageFreeze(row: DbPackageFreezeRow): PackageFreeze {
  return {
    benchmarkFamily: row.benchmarkFamily,
    createdAt: row.createdAt.toISOString(),
    createdByUserId: row.createdByUserId,
    id: row.id,
    mathPackageCandidateId: row.mathPackageCandidateId,
    note: row.note,
    packageDigest: row.packageDigest,
    packageId: row.packageId,
    packageVersion: row.packageVersion,
    repoCommitSha: row.repoCommitSha,
    repoSyncRecordId: row.repoSyncRecordId,
    repoTreePath: row.repoTreePath,
    status: row.status,
    updatedAt: row.updatedAt.toISOString()
  };
}

function toBenchmarkVersion(row: DbBenchmarkVersionRow): BenchmarkVersion {
  return {
    benchmarkFamily: row.benchmarkFamily,
    benchmarkVersionId: row.benchmarkVersionId,
    createdAt: row.createdAt.toISOString(),
    createdByUserId: row.createdByUserId,
    displayLabel: row.displayLabel,
    itemSetDefinition: row.itemSetDefinition,
    launchability: row.launchability,
    packageDigest: row.packageDigest,
    packageFreezeId: row.packageFreezeId,
    packageId: row.packageId,
    packageVersion: row.packageVersion,
    scopeLabel: row.scopeLabel,
    updatedAt: row.updatedAt.toISOString()
  };
}

function toBenchmarkRelease(row: DbBenchmarkReleaseRow): BenchmarkRelease {
  return {
    approvedAt: toIso(row.approvedAt),
    approvedByUserId: row.approvedByUserId,
    benchmarkReleaseId: row.benchmarkReleaseId,
    benchmarkVersionId: row.benchmarkVersionId,
    createdAt: row.createdAt.toISOString(),
    createdByUserId: row.createdByUserId,
    methodologyArtifactRefs: row.methodologyArtifactRefs,
    publishedAt: toIso(row.publishedAt),
    releaseLabel: row.releaseLabel,
    status: row.status,
    summaryArtifactRefs: row.summaryArtifactRefs,
    summaryPayload: row.summaryPayload,
    updatedAt: row.updatedAt.toISOString(),
    visibility: row.visibility
  };
}

function canTransitionRepoSyncStatus(
  currentStatus: RepoSyncRecordStatus,
  nextStatus: RepoSyncRecordStatus
) {
  return repoSyncStatusTransitions[currentStatus].includes(nextStatus);
}

function canTransitionBenchmarkVersionLaunchability(
  currentLaunchability: BenchmarkVersionLaunchability,
  nextLaunchability: BenchmarkVersionLaunchability
) {
  return benchmarkVersionLaunchabilityTransitions[currentLaunchability].includes(
    nextLaunchability
  );
}

function createBenchmarkWorkflowAuditEvent(options: {
  actorUserId: string;
  eventId: string;
  payload: Record<string, unknown>;
  severity: "info" | "warning" | "critical";
  subjectKind: "benchmark_release" | "benchmark_version" | "benchmark_workflow";
}) {
  return {
    actorKind: "portal_user" as const,
    actorUserId: options.actorUserId,
    eventId: options.eventId,
    payload: options.payload,
    severity: options.severity,
    subjectKind: options.subjectKind,
    targetUserId: null
  };
}

export const benchmarkWorkflowRouteTestUtils = {
  canTransitionBenchmarkVersionLaunchability,
  canTransitionRepoSyncStatus
};

export function registerBenchmarkWorkflowRoutes(
  app: FastifyInstance,
  db: ReturnTypeOfCreateDbClient,
  requireAccess: ReturnTypeOfCreateAccessGuard,
  options?: {
    rateLimitPreHandlers?: ReturnType<typeof createRateLimitPreHandlers>;
  }
) {
  const rateLimitPreHandlers = options?.rateLimitPreHandlers;
  const withAuthenticatedRateLimit = (guard: preHandlerHookHandler) =>
    rateLimitPreHandlers?.authenticated
      ? [guard, rateLimitPreHandlers.authenticated]
      : [guard];

  app.get(
    "/portal/admin/repo-sync-records",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("admin_only"))
    },
    async () => {
      const rows = await db.query.repoSyncRecords.findMany({
        orderBy: [desc(repoSyncRecords.createdAt)]
      });

      return {
        items: rows.map((row) => toRepoSyncRecord(row))
      };
    }
  );

  app.get(
    "/portal/admin/repo-sync-records/:repoSyncRecordId",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("admin_only"))
    },
    async (request, reply) => {
      const parsedParams = parseRepoSyncRecordParams(request, reply);

      if (!parsedParams) {
        return;
      }

      const row = await db.query.repoSyncRecords.findFirst({
        where: eq(repoSyncRecords.id, parsedParams.repoSyncRecordId)
      });

      if (!row) {
        reply.code(404).send({
          error: "repo_sync_record_not_found"
        });
        return;
      }

      return {
        item: toRepoSyncRecord(row)
      };
    }
  );

  app.post(
    "/portal/admin/repo-sync-records",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("admin_only"))
    },
    async (request, reply) => {
      const parsedBody = benchmarkWorkflowContract.adminRepoSyncRecordCreateInput.safeParse(
        request.body ?? {}
      );

      if (!parsedBody.success) {
        reply.code(400).send({
          error: "invalid_repo_sync_record_payload",
          issues: parsedBody.error.issues
        });
        return;
      }

      const input = parsedBody.data;

      if (input.status === "merged" && !input.mergeCommitSha) {
        reply.code(400).send({
          error: "repo_sync_record_merge_commit_required"
        });
        return;
      }

      if ((input.status === "pr_open" || input.status === "merged") &&
        !hasRepoPullRequestLink(input)) {
        reply.code(400).send({
          error: "repo_sync_record_pr_link_required"
        });
        return;
      }

      const actorUserId = getAdminActorUserId(request);
      const now = new Date();

      const existingRow =
        input.pullRequestNumber === null
          ? null
          : await db.query.repoSyncRecords.findFirst({
              where: and(
                eq(repoSyncRecords.repoOwner, input.repoOwner),
                eq(repoSyncRecords.repoName, input.repoName),
                eq(repoSyncRecords.pullRequestNumber, input.pullRequestNumber)
              )
            });

      if (existingRow) {
        reply.code(409).send({
          error: "repo_sync_record_already_exists",
          item: toRepoSyncRecord(existingRow)
        });
        return;
      }

      let result:
        | {
            item: DbRepoSyncRecordRow;
            kind: "created";
          }
        | {
            existingRow: DbRepoSyncRecordRow;
            kind: "already_exists";
          };

      try {
        result = await db.transaction(async (tx) => {
          const [insertedRow] = await tx
            .insert(repoSyncRecords)
            .values({
              lastUpdatedByUserId: actorUserId,
              mathPackageCandidateId: input.mathPackageCandidateId,
              mergeCommitSha: input.mergeCommitSha,
              note: input.note,
              pullRequestNumber: input.pullRequestNumber,
              pullRequestUrl: input.pullRequestUrl,
              recordedByUserId: actorUserId,
              repoName: input.repoName,
              repoOwner: input.repoOwner,
              status: input.status,
              targetRepoPath: input.targetRepoPath,
              updatedAt: now
            })
            .returning();

          await tx.insert(auditEvents).values(
            createBenchmarkWorkflowAuditEvent({
              actorUserId,
              eventId: "benchmark_workflow.repo_sync_recorded",
              payload: {
                actorUserId,
                repoName: input.repoName,
                repoOwner: input.repoOwner,
                repoSyncRecordId: insertedRow.id,
                status: insertedRow.status
              },
              severity: "info",
              subjectKind: "benchmark_workflow"
            })
          );

          return {
            item: insertedRow,
            kind: "created" as const
          };
        });
      } catch (error) {
        if (
          input.pullRequestNumber !== null &&
          isDatabaseUniqueConstraintError(error, ["repo_sync_records_repo_pr_unique"])
        ) {
          const conflictingRow =
            (await db.query.repoSyncRecords.findFirst({
              where: and(
                eq(repoSyncRecords.repoOwner, input.repoOwner),
                eq(repoSyncRecords.repoName, input.repoName),
                eq(repoSyncRecords.pullRequestNumber, input.pullRequestNumber)
              )
            })) ?? null;

          if (!conflictingRow) {
            throw error;
          }

          result = {
            existingRow: conflictingRow,
            kind: "already_exists"
          };
        } else {
          throw error;
        }
      }

      if (result.kind === "already_exists") {
        reply.code(409).send({
          error: "repo_sync_record_already_exists",
          item: toRepoSyncRecord(result.existingRow)
        });
        return;
      }

      return {
        item: toRepoSyncRecord(result.item)
      };
    }
  );

  app.post(
    "/portal/admin/repo-sync-records/:repoSyncRecordId/status",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("admin_only"))
    },
    async (request, reply) => {
      const parsedBody =
        benchmarkWorkflowContract.adminRepoSyncRecordStatusUpdateInput.safeParse(
          request.body ?? {}
        );

      if (!parsedBody.success) {
        reply.code(400).send({
          error: "invalid_repo_sync_record_status_payload",
          issues: parsedBody.error.issues
        });
        return;
      }

      const actorUserId = getAdminActorUserId(request);
      const parsedParams = parseRepoSyncRecordParams(request, reply);
      const input = parsedBody.data;

      if (!parsedParams) {
        return;
      }

      let result:
        | { kind: "not_found" }
        | { kind: "invalid_transition"; currentRow: DbRepoSyncRecordRow }
        | { kind: "merge_commit_required"; currentRow: DbRepoSyncRecordRow }
        | { kind: "pull_request_link_required"; currentRow: DbRepoSyncRecordRow }
        | { kind: "pull_request_conflict"; conflictingRow: DbRepoSyncRecordRow }
        | { kind: "updated"; item: DbRepoSyncRecordRow };

      try {
        result = await db.transaction(async (tx) => {
          const initialRow =
            (await tx.query.repoSyncRecords.findFirst({
              where: eq(repoSyncRecords.id, parsedParams.repoSyncRecordId)
            })) ?? null;

          if (!initialRow) {
            return {
              kind: "not_found" as const
            };
          }

          let currentRow: DbRepoSyncRecordRow = initialRow;

          for (;;) {
            const seenRow: DbRepoSyncRecordRow = currentRow;

          if (!canTransitionRepoSyncStatus(seenRow.status, input.status)) {
            return {
              currentRow: seenRow,
              kind: "invalid_transition" as const
            };
          }

          const mergeCommitSha =
            input.mergeCommitSha === undefined
              ? seenRow.mergeCommitSha
              : input.mergeCommitSha;
          const pullRequestNumber =
            input.pullRequestNumber === undefined
              ? seenRow.pullRequestNumber
              : input.pullRequestNumber;
          const pullRequestUrl =
            input.pullRequestUrl === undefined
              ? seenRow.pullRequestUrl
              : input.pullRequestUrl;

          if (input.status === "merged" && !mergeCommitSha) {
            return {
              currentRow: seenRow,
              kind: "merge_commit_required" as const
            };
          }

          if (
            (input.status === "pr_open" || input.status === "merged") &&
            !hasRepoPullRequestLink({
              pullRequestNumber,
              pullRequestUrl
            })
          ) {
            return {
              currentRow: seenRow,
              kind: "pull_request_link_required" as const
            };
          }

          if (
            seenRow.status === "merged" &&
            (mergeCommitSha !== seenRow.mergeCommitSha ||
              pullRequestNumber !== seenRow.pullRequestNumber ||
              pullRequestUrl !== seenRow.pullRequestUrl)
          ) {
            return {
              currentRow: seenRow,
              kind: "invalid_transition" as const
            };
          }

          if (pullRequestNumber !== null) {
            const conflictingRow = await tx.query.repoSyncRecords.findFirst({
              where: and(
                eq(repoSyncRecords.repoOwner, seenRow.repoOwner),
                eq(repoSyncRecords.repoName, seenRow.repoName),
                eq(repoSyncRecords.pullRequestNumber, pullRequestNumber)
              )
            });

            if (conflictingRow && conflictingRow.id !== seenRow.id) {
              return {
                conflictingRow,
                kind: "pull_request_conflict" as const
              };
            }
          }

            const now = new Date();
            const previousStatus = seenRow.status;
            const [updatedRow] = await tx
              .update(repoSyncRecords)
              .set({
                lastUpdatedByUserId: actorUserId,
                mergeCommitSha,
                note: input.note === undefined ? seenRow.note : input.note,
                pullRequestNumber,
                pullRequestUrl,
                status: input.status,
                updatedAt: now
              })
              .where(
                and(
                  eq(repoSyncRecords.id, seenRow.id),
                  eq(repoSyncRecords.updatedAt, seenRow.updatedAt)
                )
              )
              .returning();

            if (!updatedRow) {
              const latestRow =
                (await tx.query.repoSyncRecords.findFirst({
                  where: eq(repoSyncRecords.id, seenRow.id)
                })) ?? null;

              if (!latestRow) {
                return {
                  kind: "not_found" as const
                };
              }

              currentRow = latestRow;
              continue;
            }

            await tx.insert(auditEvents).values(
              createBenchmarkWorkflowAuditEvent({
                actorUserId,
                eventId: "benchmark_workflow.repo_sync_status_updated",
                payload: {
                  actorUserId,
                  previousStatus,
                  repoSyncRecordId: updatedRow.id,
                  status: updatedRow.status
                },
                severity: "warning",
                subjectKind: "benchmark_workflow"
              })
            );

            return {
              item: updatedRow,
              kind: "updated" as const
            };
          }
        });
      } catch (error) {
        if (isDatabaseUniqueConstraintError(error, ["repo_sync_records_repo_pr_unique"])) {
          const latestRow =
            (await db.query.repoSyncRecords.findFirst({
              where: eq(repoSyncRecords.id, parsedParams.repoSyncRecordId)
            })) ?? null;
          const effectivePullRequestNumber =
            input.pullRequestNumber === undefined
              ? (latestRow?.pullRequestNumber ?? null)
              : input.pullRequestNumber;

          if (!latestRow || effectivePullRequestNumber === null) {
            throw error;
          }

          const conflictingRow =
            (await db.query.repoSyncRecords.findFirst({
              where: and(
                eq(repoSyncRecords.repoOwner, latestRow.repoOwner),
                eq(repoSyncRecords.repoName, latestRow.repoName),
                eq(repoSyncRecords.pullRequestNumber, effectivePullRequestNumber)
              )
            })) ?? null;

          if (!conflictingRow || conflictingRow.id === latestRow.id) {
            throw error;
          }

          result = {
            conflictingRow,
            kind: "pull_request_conflict"
          };
        } else {
          throw error;
        }
      }

      if (result.kind === "not_found") {
        reply.code(404).send({
          error: "repo_sync_record_not_found"
        });
        return;
      }

      if (result.kind === "invalid_transition") {
        reply.code(409).send({
          error: "repo_sync_record_invalid_transition",
          item: toRepoSyncRecord(result.currentRow)
        });
        return;
      }

      if (result.kind === "merge_commit_required") {
        reply.code(400).send({
          error: "repo_sync_record_merge_commit_required",
          item: toRepoSyncRecord(result.currentRow)
        });
        return;
      }

      if (result.kind === "pull_request_link_required") {
        reply.code(400).send({
          error: "repo_sync_record_pr_link_required",
          item: toRepoSyncRecord(result.currentRow)
        });
        return;
      }

      if (result.kind === "pull_request_conflict") {
        reply.code(409).send({
          error: "repo_sync_record_pr_conflict",
          item: toRepoSyncRecord(result.conflictingRow)
        });
        return;
      }

      return {
        item: toRepoSyncRecord(result.item)
      };
    }
  );

  app.get(
    "/portal/admin/package-freezes",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("admin_only"))
    },
    async () => {
      const rows = await db.query.packageFreezes.findMany({
        orderBy: [desc(packageFreezes.createdAt)]
      });

      return {
        items: rows.map((row) => toPackageFreeze(row))
      };
    }
  );

  app.get(
    "/portal/admin/package-freezes/:packageFreezeId",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("admin_only"))
    },
    async (request, reply) => {
      const parsedParams = parsePackageFreezeParams(request, reply);

      if (!parsedParams) {
        return;
      }

      const row = await db.query.packageFreezes.findFirst({
        where: eq(packageFreezes.id, parsedParams.packageFreezeId)
      });

      if (!row) {
        reply.code(404).send({
          error: "package_freeze_not_found"
        });
        return;
      }

      return {
        item: toPackageFreeze(row)
      };
    }
  );

  app.post(
    "/portal/admin/package-freezes",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("admin_only"))
    },
    async (request, reply) => {
      const parsedBody = benchmarkWorkflowContract.adminPackageFreezeCreateInput.safeParse(
        request.body ?? {}
      );

      if (!parsedBody.success) {
        reply.code(400).send({
          error: "invalid_package_freeze_payload",
          issues: parsedBody.error.issues
        });
        return;
      }

      const actorUserId = getAdminActorUserId(request);
      const input = parsedBody.data as AdminPackageFreezeCreateInput;

      let result:
        | { kind: "repo_sync_not_found" }
        | { kind: "repo_sync_not_merged"; repoSyncRecordRow: DbRepoSyncRecordRow }
        | { kind: "repo_sync_pr_link_missing"; repoSyncRecordRow: DbRepoSyncRecordRow }
        | { kind: "commit_mismatch"; repoSyncRecordRow: DbRepoSyncRecordRow }
        | { kind: "already_exists"; existingFreeze: DbPackageFreezeRow }
        | { kind: "created"; item: DbPackageFreezeRow };

      try {
        result = await db.transaction(async (tx) => {
          const repoSyncRecordRow = await tx.query.repoSyncRecords.findFirst({
            where: eq(repoSyncRecords.id, input.repoSyncRecordId)
          });

        if (!repoSyncRecordRow) {
          return {
            kind: "repo_sync_not_found" as const
          };
        }

        if (repoSyncRecordRow.status !== "merged" || !repoSyncRecordRow.mergeCommitSha) {
          return {
            kind: "repo_sync_not_merged" as const,
            repoSyncRecordRow
          };
        }

        if (!hasRepoPullRequestLink(repoSyncRecordRow)) {
          return {
            kind: "repo_sync_pr_link_missing" as const,
            repoSyncRecordRow
          };
        }

        if (repoSyncRecordRow.mergeCommitSha !== input.repoCommitSha) {
          return {
            kind: "commit_mismatch" as const,
            repoSyncRecordRow
          };
        }

        const repoSyncPullRequestNumberMatches =
          repoSyncRecordRow.pullRequestNumber === null
            ? isNull(repoSyncRecords.pullRequestNumber)
            : eq(repoSyncRecords.pullRequestNumber, repoSyncRecordRow.pullRequestNumber);
        const repoSyncPullRequestUrlMatches =
          repoSyncRecordRow.pullRequestUrl === null
            ? isNull(repoSyncRecords.pullRequestUrl)
            : eq(repoSyncRecords.pullRequestUrl, repoSyncRecordRow.pullRequestUrl);

        const lockedRepoSyncRows = await tx.execute(sql`
          select ${repoSyncRecords.id}
          from ${repoSyncRecords}
          where ${repoSyncRecords.id} = ${repoSyncRecordRow.id}
            and ${repoSyncRecords.status} = ${repoSyncRecordRow.status}
            and ${repoSyncRecords.mergeCommitSha} = ${repoSyncRecordRow.mergeCommitSha}
            and ${repoSyncPullRequestNumberMatches}
            and ${repoSyncPullRequestUrlMatches}
          for update
        `);

        if (lockedRepoSyncRows.length === 0) {
          const latestRepoSyncRecordRow =
            (await tx.query.repoSyncRecords.findFirst({
              where: eq(repoSyncRecords.id, input.repoSyncRecordId)
            })) ?? null;

          if (!latestRepoSyncRecordRow) {
            return {
              kind: "repo_sync_not_found" as const
            };
          }

          if (
            latestRepoSyncRecordRow.status !== "merged" ||
            !latestRepoSyncRecordRow.mergeCommitSha
          ) {
            return {
              kind: "repo_sync_not_merged" as const,
              repoSyncRecordRow: latestRepoSyncRecordRow
            };
          }

          if (!hasRepoPullRequestLink(latestRepoSyncRecordRow)) {
            return {
              kind: "repo_sync_pr_link_missing" as const,
              repoSyncRecordRow: latestRepoSyncRecordRow
            };
          }

          if (latestRepoSyncRecordRow.mergeCommitSha !== input.repoCommitSha) {
            return {
              kind: "commit_mismatch" as const,
              repoSyncRecordRow: latestRepoSyncRecordRow
            };
          }
        }

        const existingFreeze =
          (await tx.query.packageFreezes.findFirst({
            where: eq(packageFreezes.packageDigest, input.packageDigest)
          })) ??
          (await tx.query.packageFreezes.findFirst({
            where: eq(packageFreezes.repoSyncRecordId, input.repoSyncRecordId)
          }));

        if (existingFreeze) {
          return {
            existingFreeze,
            kind: "already_exists" as const
          };
        }

          const now = new Date();
          const [insertedRow] = await tx
            .insert(packageFreezes)
            .values({
              benchmarkFamily: input.benchmarkFamily,
              createdByUserId: actorUserId,
              mathPackageCandidateId: repoSyncRecordRow.mathPackageCandidateId,
              note: input.note,
              packageDigest: input.packageDigest,
              packageId: input.packageId,
              packageVersion: input.packageVersion,
              repoCommitSha: input.repoCommitSha,
              repoSyncRecordId: input.repoSyncRecordId,
              repoTreePath: repoSyncRecordRow.targetRepoPath,
              updatedAt: now
            })
            .returning();

        await tx.insert(auditEvents).values(
          createBenchmarkWorkflowAuditEvent({
            actorUserId,
            eventId: "benchmark_workflow.package_frozen",
            payload: {
              actorUserId,
              packageDigest: insertedRow.packageDigest,
              packageFreezeId: insertedRow.id,
              repoSyncRecordId: insertedRow.repoSyncRecordId
            },
            severity: "critical",
            subjectKind: "benchmark_workflow"
          })
        );

          return {
            item: insertedRow,
            kind: "created" as const
          };
        });
      } catch (error) {
        if (
          isDatabaseUniqueConstraintError(error, [
            "package_freezes_package_digest_unique",
            "package_freezes_repo_sync_record_id_unique"
          ])
        ) {
          const conflictingFreeze =
            (await db.query.packageFreezes.findFirst({
              where: eq(packageFreezes.packageDigest, input.packageDigest)
            })) ??
            (await db.query.packageFreezes.findFirst({
              where: eq(packageFreezes.repoSyncRecordId, input.repoSyncRecordId)
            })) ??
            null;

          if (!conflictingFreeze) {
            throw error;
          }

          result = {
            existingFreeze: conflictingFreeze,
            kind: "already_exists"
          };
        } else {
          throw error;
        }
      }

      if (result.kind === "repo_sync_not_found") {
        reply.code(404).send({
          error: "repo_sync_record_not_found"
        });
        return;
      }

      if (result.kind === "repo_sync_not_merged") {
        reply.code(409).send({
          error: "repo_sync_record_not_merged",
          item: toRepoSyncRecord(result.repoSyncRecordRow)
        });
        return;
      }

      if (result.kind === "commit_mismatch") {
        reply.code(409).send({
          error: "package_freeze_commit_mismatch",
          item: toRepoSyncRecord(result.repoSyncRecordRow)
        });
        return;
      }

      if (result.kind === "repo_sync_pr_link_missing") {
        reply.code(409).send({
          error: "repo_sync_record_pr_link_required",
          item: toRepoSyncRecord(result.repoSyncRecordRow)
        });
        return;
      }

      if (result.kind === "already_exists") {
        reply.code(409).send({
          error: "package_freeze_already_exists",
          item: toPackageFreeze(result.existingFreeze)
        });
        return;
      }

      return {
        item: toPackageFreeze(result.item)
      };
    }
  );

  app.get(
    "/portal/admin/benchmark-versions",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("admin_only"))
    },
    async () => {
      const rows = await db.query.benchmarkVersions.findMany({
        orderBy: [desc(benchmarkVersions.createdAt)]
      });

      return {
        items: rows.map((row) => toBenchmarkVersion(row))
      };
    }
  );

  app.get(
    "/portal/admin/benchmark-versions/:benchmarkVersionId",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("admin_only"))
    },
    async (request, reply) => {
      const parsedParams = parseBenchmarkVersionParams(request, reply);

      if (!parsedParams) {
        return;
      }

      const row = await db.query.benchmarkVersions.findFirst({
        where: eq(benchmarkVersions.benchmarkVersionId, parsedParams.benchmarkVersionId)
      });

      if (!row) {
        reply.code(404).send({
          error: "benchmark_version_not_found"
        });
        return;
      }

      return {
        item: toBenchmarkVersion(row)
      };
    }
  );

  app.post(
    "/portal/admin/package-freezes/:packageFreezeId/benchmark-versions",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("admin_only"))
    },
    async (request, reply) => {
      const parsedBody = benchmarkWorkflowContract.adminBenchmarkVersionCreateInput.safeParse(
        request.body ?? {}
      );

      if (!parsedBody.success) {
        reply.code(400).send({
          error: "invalid_benchmark_version_payload",
          issues: parsedBody.error.issues
        });
        return;
      }

      const actorUserId = getAdminActorUserId(request);
      const parsedParams = parsePackageFreezeParams(request, reply);

      if (!parsedParams) {
        return;
      }

      const input = parsedBody.data as AdminBenchmarkVersionCreateInput;

      let result:
        | { kind: "package_freeze_not_found" }
        | { kind: "package_freeze_not_active"; packageFreezeRow: DbPackageFreezeRow }
        | { kind: "already_exists"; existingVersion: DbBenchmarkVersionRow }
        | { kind: "created"; item: DbBenchmarkVersionRow };

      try {
        result = await db.transaction(async (tx) => {
          const packageFreezeRow = await tx.query.packageFreezes.findFirst({
            where: eq(packageFreezes.id, parsedParams.packageFreezeId)
          });

        if (!packageFreezeRow) {
          return {
            kind: "package_freeze_not_found" as const
          };
        }

        if (packageFreezeRow.status !== "active") {
          return {
            kind: "package_freeze_not_active" as const,
            packageFreezeRow
          };
        }

        const existingVersion = await tx.query.benchmarkVersions.findFirst({
          where: eq(benchmarkVersions.benchmarkVersionId, input.benchmarkVersionId)
        });

        if (existingVersion) {
          return {
            existingVersion,
            kind: "already_exists" as const
          };
        }

          const now = new Date();
          const [insertedRow] = await tx
            .insert(benchmarkVersions)
            .values({
              benchmarkFamily: packageFreezeRow.benchmarkFamily,
              benchmarkVersionId: input.benchmarkVersionId,
              createdByUserId: actorUserId,
              displayLabel:
                input.displayLabel ??
                getDefaultBenchmarkDisplayLabel(
                  packageFreezeRow.packageId,
                  packageFreezeRow.packageVersion
                ),
              itemSetDefinition: input.itemSetDefinition,
              launchability: "internal_only",
              packageDigest: packageFreezeRow.packageDigest,
              packageFreezeId: packageFreezeRow.id,
              packageId: packageFreezeRow.packageId,
              packageVersion: packageFreezeRow.packageVersion,
              scopeLabel: input.scopeLabel,
              updatedAt: now
            })
            .returning();

        await tx.insert(auditEvents).values(
          createBenchmarkWorkflowAuditEvent({
            actorUserId,
            eventId: "benchmark_version.created",
            payload: {
              actorUserId,
              benchmarkVersionId: insertedRow.benchmarkVersionId,
              packageFreezeId: insertedRow.packageFreezeId
            },
            severity: "info",
            subjectKind: "benchmark_version"
          })
        );

          return {
            item: insertedRow,
            kind: "created" as const
          };
        });
      } catch (error) {
        if (isDatabaseUniqueConstraintError(error, ["benchmark_versions_pkey"])) {
          const conflictingVersion =
            (await db.query.benchmarkVersions.findFirst({
              where: eq(benchmarkVersions.benchmarkVersionId, input.benchmarkVersionId)
            })) ?? null;

          if (!conflictingVersion) {
            throw error;
          }

          result = {
            existingVersion: conflictingVersion,
            kind: "already_exists"
          };
        } else {
          throw error;
        }
      }

      if (result.kind === "package_freeze_not_found") {
        reply.code(404).send({
          error: "package_freeze_not_found"
        });
        return;
      }

      if (result.kind === "package_freeze_not_active") {
        reply.code(409).send({
          error: "package_freeze_not_active",
          item: toPackageFreeze(result.packageFreezeRow)
        });
        return;
      }

      if (result.kind === "already_exists") {
        reply.code(409).send({
          error: "benchmark_version_already_exists",
          item: toBenchmarkVersion(result.existingVersion)
        });
        return;
      }

      return {
        item: toBenchmarkVersion(result.item)
      };
    }
  );

  app.post(
    "/portal/admin/benchmark-versions/:benchmarkVersionId/launchability",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("admin_only"))
    },
    async (request, reply) => {
      const parsedBody =
        benchmarkWorkflowContract.adminBenchmarkVersionLaunchabilityUpdateInput.safeParse(
          request.body ?? {}
        );

      if (!parsedBody.success) {
        reply.code(400).send({
          error: "invalid_benchmark_version_launchability_payload",
          issues: parsedBody.error.issues
        });
        return;
      }

      const actorUserId = getAdminActorUserId(request);
      const parsedParams = parseBenchmarkVersionParams(request, reply);

      if (!parsedParams) {
        return;
      }

      const result = await db.transaction(async (tx) => {
        const initialRow =
          (await tx.query.benchmarkVersions.findFirst({
            where: eq(benchmarkVersions.benchmarkVersionId, parsedParams.benchmarkVersionId)
          })) ?? null;

        if (!initialRow) {
          return {
            kind: "not_found" as const
          };
        }

        let currentRow: DbBenchmarkVersionRow = initialRow;

        for (;;) {
          const seenRow: DbBenchmarkVersionRow = currentRow;

          if (
            !canTransitionBenchmarkVersionLaunchability(
              seenRow.launchability,
              parsedBody.data.launchability
            )
          ) {
            return {
              currentRow: seenRow,
              kind: "invalid_transition" as const
            };
          }

          const previousLaunchability = seenRow.launchability;
          const now = new Date();
          const [updatedRow] = await tx
            .update(benchmarkVersions)
            .set({
              launchability: parsedBody.data.launchability,
              updatedAt: now
            })
            .where(
              and(
                eq(benchmarkVersions.benchmarkVersionId, seenRow.benchmarkVersionId),
                eq(benchmarkVersions.launchability, seenRow.launchability)
              )
            )
            .returning();

          if (!updatedRow) {
            const latestRow =
              (await tx.query.benchmarkVersions.findFirst({
                where: eq(benchmarkVersions.benchmarkVersionId, seenRow.benchmarkVersionId)
              })) ?? null;

            if (!latestRow) {
              return {
                kind: "not_found" as const
              };
            }

            currentRow = latestRow;
            continue;
          }

          await tx.insert(auditEvents).values(
            createBenchmarkWorkflowAuditEvent({
              actorUserId,
              eventId: "benchmark_version.launchability_updated",
              payload: {
                actorUserId,
                benchmarkVersionId: updatedRow.benchmarkVersionId,
                launchability: updatedRow.launchability,
                previousLaunchability
              },
              severity: "critical",
              subjectKind: "benchmark_version"
            })
          );

          return {
            item: updatedRow,
            kind: "updated" as const
          };
        }
      });

      if (result.kind === "not_found") {
        reply.code(404).send({
          error: "benchmark_version_not_found"
        });
        return;
      }

      if (result.kind === "invalid_transition") {
        reply.code(409).send({
          error: "benchmark_version_invalid_launchability_transition",
          item: toBenchmarkVersion(result.currentRow)
        });
        return;
      }

      return {
        item: toBenchmarkVersion(result.item)
      };
    }
  );

  app.get(
    "/portal/admin/benchmark-releases",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("admin_only"))
    },
    async () => {
      const rows = await db.query.benchmarkReleases.findMany({
        orderBy: [desc(benchmarkReleases.createdAt)]
      });

      return {
        items: rows.map((row) => toBenchmarkRelease(row))
      };
    }
  );

  app.get(
    "/portal/admin/benchmark-releases/:benchmarkReleaseId",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("admin_only"))
    },
    async (request, reply) => {
      const parsedParams = parseBenchmarkReleaseParams(request, reply);

      if (!parsedParams) {
        return;
      }

      const row = await db.query.benchmarkReleases.findFirst({
        where: eq(benchmarkReleases.benchmarkReleaseId, parsedParams.benchmarkReleaseId)
      });

      if (!row) {
        reply.code(404).send({
          error: "benchmark_release_not_found"
        });
        return;
      }

      return {
        item: toBenchmarkRelease(row)
      };
    }
  );

  app.post(
    "/portal/admin/benchmark-versions/:benchmarkVersionId/releases",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("admin_only"))
    },
    async (request, reply) => {
      const parsedBody = benchmarkWorkflowContract.adminBenchmarkReleaseCreateInput.safeParse(
        request.body ?? {}
      );

      if (!parsedBody.success) {
        reply.code(400).send({
          error: "invalid_benchmark_release_payload",
          issues: parsedBody.error.issues
        });
        return;
      }

      const actorUserId = getAdminActorUserId(request);
      const parsedParams = parseBenchmarkVersionParams(request, reply);

      if (!parsedParams) {
        return;
      }

      const input = parsedBody.data as AdminBenchmarkReleaseCreateInput;

      let result:
        | { kind: "benchmark_version_not_found" }
        | { kind: "already_exists"; existingRelease: DbBenchmarkReleaseRow }
        | { kind: "created"; item: DbBenchmarkReleaseRow };

      try {
        result = await db.transaction(async (tx) => {
          const benchmarkVersionRow = await tx.query.benchmarkVersions.findFirst({
            where: eq(benchmarkVersions.benchmarkVersionId, parsedParams.benchmarkVersionId)
          });

        if (!benchmarkVersionRow) {
          return {
            kind: "benchmark_version_not_found" as const
          };
        }

        const existingRelease = await tx.query.benchmarkReleases.findFirst({
          where: eq(benchmarkReleases.benchmarkReleaseId, input.benchmarkReleaseId)
        });

        if (existingRelease) {
          return {
            existingRelease,
            kind: "already_exists" as const
          };
        }

          const now = new Date();
          const [insertedRow] = await tx
            .insert(benchmarkReleases)
            .values({
              benchmarkReleaseId: input.benchmarkReleaseId,
              benchmarkVersionId: benchmarkVersionRow.benchmarkVersionId,
              createdByUserId: actorUserId,
              methodologyArtifactRefs: input.methodologyArtifactRefs,
              releaseLabel: input.releaseLabel,
              summaryArtifactRefs: input.summaryArtifactRefs,
              summaryPayload: input.summaryPayload,
              updatedAt: now,
              visibility: input.visibility
            })
            .returning();

        await tx.insert(auditEvents).values(
          createBenchmarkWorkflowAuditEvent({
            actorUserId,
            eventId: "benchmark_release.drafted",
            payload: {
              actorUserId,
              benchmarkReleaseId: insertedRow.benchmarkReleaseId,
              benchmarkVersionId: insertedRow.benchmarkVersionId,
              visibility: insertedRow.visibility
            },
            severity: "info",
            subjectKind: "benchmark_release"
          })
        );

          return {
            item: insertedRow,
            kind: "created" as const
          };
        });
      } catch (error) {
        if (isDatabaseUniqueConstraintError(error, ["benchmark_releases_pkey"])) {
          const conflictingRelease =
            (await db.query.benchmarkReleases.findFirst({
              where: eq(benchmarkReleases.benchmarkReleaseId, input.benchmarkReleaseId)
            })) ?? null;

          if (!conflictingRelease) {
            throw error;
          }

          result = {
            existingRelease: conflictingRelease,
            kind: "already_exists"
          };
        } else {
          throw error;
        }
      }

      if (result.kind === "benchmark_version_not_found") {
        reply.code(404).send({
          error: "benchmark_version_not_found"
        });
        return;
      }

      if (result.kind === "already_exists") {
        reply.code(409).send({
          error: "benchmark_release_already_exists",
          item: toBenchmarkRelease(result.existingRelease)
        });
        return;
      }

      return {
        item: toBenchmarkRelease(result.item)
      };
    }
  );

  app.post(
    "/portal/admin/benchmark-releases/:benchmarkReleaseId/approve",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("admin_only"))
    },
    async (request, reply) => {
      const parsedBody = benchmarkWorkflowContract.adminBenchmarkWorkflowActionInput.safeParse(
        request.body ?? {}
      );

      if (!parsedBody.success) {
        reply.code(400).send({
          error: "invalid_benchmark_release_approve_payload",
          issues: parsedBody.error.issues
        });
        return;
      }

      const actorUserId = getAdminActorUserId(request);
      const parsedParams = parseBenchmarkReleaseParams(request, reply);

      if (!parsedParams) {
        return;
      }

      const result = await db.transaction(async (tx) => {
        const currentRow = await tx.query.benchmarkReleases.findFirst({
          where: eq(benchmarkReleases.benchmarkReleaseId, parsedParams.benchmarkReleaseId)
        });

        if (!currentRow) {
          return {
            kind: "not_found" as const
          };
        }

        if (currentRow.status !== "draft") {
          return {
            currentRow,
            kind: "not_draft" as const
          };
        }

        const now = new Date();
        const [updatedRow] = await tx
          .update(benchmarkReleases)
          .set({
            approvedAt: now,
            approvedByUserId: actorUserId,
            status: "approved",
            updatedAt: now
          })
          .where(
            and(
              eq(benchmarkReleases.benchmarkReleaseId, currentRow.benchmarkReleaseId),
              eq(benchmarkReleases.status, "draft")
            )
          )
          .returning();

        if (!updatedRow) {
          return {
            currentRow:
              (await tx.query.benchmarkReleases.findFirst({
                where: eq(benchmarkReleases.benchmarkReleaseId, currentRow.benchmarkReleaseId)
              })) ?? currentRow,
            kind: "not_draft" as const
          };
        }

        await tx.insert(auditEvents).values(
          createBenchmarkWorkflowAuditEvent({
            actorUserId,
            eventId: "benchmark_release.approved",
            payload: {
              actorUserId,
              benchmarkReleaseId: updatedRow.benchmarkReleaseId,
              benchmarkVersionId: updatedRow.benchmarkVersionId
            },
            severity: "critical",
            subjectKind: "benchmark_release"
          })
        );

        return {
          item: updatedRow,
          kind: "approved" as const
        };
      });

      if (result.kind === "not_found") {
        reply.code(404).send({
          error: "benchmark_release_not_found"
        });
        return;
      }

      if (result.kind === "not_draft") {
        reply.code(409).send({
          error: "benchmark_release_not_draft",
          item: toBenchmarkRelease(result.currentRow)
        });
        return;
      }

      return {
        item: toBenchmarkRelease(result.item)
      };
    }
  );

  app.post(
    "/portal/admin/benchmark-releases/:benchmarkReleaseId/publish",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("admin_only"))
    },
    async (request, reply) => {
      const parsedBody = benchmarkWorkflowContract.adminBenchmarkWorkflowActionInput.safeParse(
        request.body ?? {}
      );

      if (!parsedBody.success) {
        reply.code(400).send({
          error: "invalid_benchmark_release_publish_payload",
          issues: parsedBody.error.issues
        });
        return;
      }

      const actorUserId = getAdminActorUserId(request);
      const parsedParams = parseBenchmarkReleaseParams(request, reply);

      if (!parsedParams) {
        return;
      }

      let result:
        | { kind: "release_not_found" }
        | { kind: "release_not_approved"; currentReleaseRow: DbBenchmarkReleaseRow }
        | { kind: "release_not_public"; currentReleaseRow: DbBenchmarkReleaseRow }
        | { kind: "benchmark_version_not_found" }
        | {
            kind: "benchmark_version_not_launchable";
            benchmarkVersionRow: DbBenchmarkVersionRow;
            currentReleaseRow: DbBenchmarkReleaseRow;
          }
        | {
            kind: "public_release_conflict";
            conflictingPublishedRelease: DbBenchmarkReleaseRow;
            currentReleaseRow: DbBenchmarkReleaseRow;
          }
        | { kind: "published"; item: DbBenchmarkReleaseRow };

      try {
        result = await db.transaction(async (tx) => {
          const currentReleaseRow = await tx.query.benchmarkReleases.findFirst({
            where: eq(benchmarkReleases.benchmarkReleaseId, parsedParams.benchmarkReleaseId)
          });

        if (!currentReleaseRow) {
          return {
            kind: "release_not_found" as const
          };
        }

        if (currentReleaseRow.status !== "approved") {
          return {
            currentReleaseRow,
            kind: "release_not_approved" as const
          };
        }

        if (currentReleaseRow.visibility !== "public") {
          return {
            currentReleaseRow,
            kind: "release_not_public" as const
          };
        }

        const benchmarkVersionRow = await tx.query.benchmarkVersions.findFirst({
          where: eq(
            benchmarkVersions.benchmarkVersionId,
            currentReleaseRow.benchmarkVersionId
          )
        });

        if (!benchmarkVersionRow) {
          return {
            kind: "benchmark_version_not_found" as const
          };
        }

        if (benchmarkVersionRow.launchability !== "launchable") {
          return {
            benchmarkVersionRow,
            currentReleaseRow,
            kind: "benchmark_version_not_launchable" as const
          };
        }

        const conflictingPublishedRelease = await tx.query.benchmarkReleases.findFirst({
          where: and(
            eq(benchmarkReleases.benchmarkVersionId, currentReleaseRow.benchmarkVersionId),
            eq(benchmarkReleases.status, "published"),
            eq(benchmarkReleases.visibility, "public")
          )
        });

        if (
          conflictingPublishedRelease &&
          conflictingPublishedRelease.benchmarkReleaseId !== currentReleaseRow.benchmarkReleaseId
        ) {
          return {
            conflictingPublishedRelease,
            currentReleaseRow,
            kind: "public_release_conflict" as const
          };
        }

          const now = new Date();
          const [updatedReleaseRow] = await tx
            .update(benchmarkReleases)
            .set({
              publishedAt: now,
              status: "published",
              updatedAt: now
            })
            .where(
              and(
                eq(benchmarkReleases.benchmarkReleaseId, currentReleaseRow.benchmarkReleaseId),
                eq(benchmarkReleases.status, "approved"),
                eq(benchmarkReleases.visibility, "public")
              )
            )
            .returning();

        if (!updatedReleaseRow) {
          return {
            currentReleaseRow:
              (await tx.query.benchmarkReleases.findFirst({
                where: eq(
                  benchmarkReleases.benchmarkReleaseId,
                  currentReleaseRow.benchmarkReleaseId
                )
              })) ?? currentReleaseRow,
            kind: "release_not_approved" as const
          };
        }

        await tx.insert(auditEvents).values(
          createBenchmarkWorkflowAuditEvent({
            actorUserId,
            eventId: "benchmark_release.published",
            payload: {
              actorUserId,
              benchmarkReleaseId: updatedReleaseRow.benchmarkReleaseId,
              benchmarkVersionId: updatedReleaseRow.benchmarkVersionId,
              publishedAt: updatedReleaseRow.publishedAt?.toISOString() ?? now.toISOString()
            },
            severity: "critical",
            subjectKind: "benchmark_release"
          })
        );

          return {
            item: updatedReleaseRow,
            kind: "published" as const
          };
        });
      } catch (error) {
        if (isDatabaseUniqueConstraintError(error, ["benchmark_releases_public_version_unique"])) {
          const currentReleaseRow =
            (await db.query.benchmarkReleases.findFirst({
              where: eq(benchmarkReleases.benchmarkReleaseId, parsedParams.benchmarkReleaseId)
            })) ?? null;

          if (!currentReleaseRow) {
            throw error;
          }

          const conflictingPublishedRelease =
            (await db.query.benchmarkReleases.findFirst({
              where: and(
                eq(benchmarkReleases.benchmarkVersionId, currentReleaseRow.benchmarkVersionId),
                eq(benchmarkReleases.status, "published"),
                eq(benchmarkReleases.visibility, "public")
              )
            })) ?? null;

          if (
            !conflictingPublishedRelease ||
            conflictingPublishedRelease.benchmarkReleaseId === currentReleaseRow.benchmarkReleaseId
          ) {
            throw error;
          }

          result = {
            conflictingPublishedRelease,
            currentReleaseRow,
            kind: "public_release_conflict"
          };
        } else {
          throw error;
        }
      }

      if (result.kind === "release_not_found") {
        reply.code(404).send({
          error: "benchmark_release_not_found"
        });
        return;
      }

      if (result.kind === "release_not_approved") {
        reply.code(409).send({
          error: "benchmark_release_not_approved",
          item: toBenchmarkRelease(result.currentReleaseRow)
        });
        return;
      }

      if (result.kind === "release_not_public") {
        reply.code(409).send({
          error: "benchmark_release_not_public",
          item: toBenchmarkRelease(result.currentReleaseRow)
        });
        return;
      }

      if (result.kind === "benchmark_version_not_found") {
        reply.code(404).send({
          error: "benchmark_version_not_found"
        });
        return;
      }

      if (result.kind === "benchmark_version_not_launchable") {
        reply.code(409).send({
          error: "benchmark_version_not_launchable",
          item: toBenchmarkVersion(result.benchmarkVersionRow),
          release: toBenchmarkRelease(result.currentReleaseRow)
        });
        return;
      }

      if (result.kind === "public_release_conflict") {
        reply.code(409).send({
          error: "benchmark_release_public_version_conflict",
          item: toBenchmarkRelease(result.currentReleaseRow),
          conflictingRelease: toBenchmarkRelease(result.conflictingPublishedRelease)
        });
        return;
      }

      return {
        item: toBenchmarkRelease(result.item)
      };
    }
  );
}
