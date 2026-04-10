import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { benchmarkWorkflowContract } from "@paretoproof/shared";
import {
  auditEvents,
  benchmarkReleases,
  benchmarkVersions,
  packageFreezes,
  repoSyncRecords
} from "../src/db/schema.ts";
import {
  registerBenchmarkWorkflowRoutes
} from "../src/routes/benchmark-workflow.ts";

function createAdminAccessGuard() {
  return () => (request: {
    accessRbacContext?: unknown;
  }, _reply: unknown, done: () => void) => {
    request.accessRbacContext = {
      email: "admin@paretoproof.com",
      identityId: "11111111-1111-4111-8111-111111111111",
      roles: ["admin"],
      status: "approved",
      subject: "admin-subject",
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    };
    done();
  };
}

function buildRepoSyncRecord(
  overrides: Partial<typeof repoSyncRecords.$inferSelect> = {}
): typeof repoSyncRecords.$inferSelect {
  return {
    createdAt: new Date("2026-04-02T18:00:00.000Z"),
    id: "11111111-1111-4111-8111-111111111111",
    lastUpdatedByUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    mathPackageCandidateId: "math-candidate-1",
    mergeCommitSha: null,
    note: "Open PR for freeze review",
    pullRequestNumber: 890,
    pullRequestUrl: "https://github.com/Tomodovodoo/ParetoProof/pull/890",
    recordedByUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    repoName: "ParetoProof",
    repoOwner: "Tomodovodoo",
    status: "pr_open",
    targetRepoPath: "packages/benchmarks/problem9",
    updatedAt: new Date("2026-04-02T18:00:00.000Z"),
    ...overrides
  };
}

function buildPackageFreeze(
  overrides: Partial<typeof packageFreezes.$inferSelect> = {}
): typeof packageFreezes.$inferSelect {
  return {
    benchmarkFamily: "firstproof",
    createdAt: new Date("2026-04-02T19:00:00.000Z"),
    createdByUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    id: "22222222-2222-4222-8222-222222222222",
    mathPackageCandidateId: "math-candidate-1",
    note: "Freeze after merge",
    packageDigest: "sha256:freeze-digest",
    packageId: "firstproof/Problem9",
    packageVersion: "2026-04-02",
    repoCommitSha: "abc1234567890",
    repoSyncRecordId: "11111111-1111-4111-8111-111111111111",
    repoTreePath: "packages/benchmarks/problem9",
    status: "active",
    updatedAt: new Date("2026-04-02T19:00:00.000Z"),
    ...overrides
  };
}

function buildBenchmarkVersion(
  overrides: Partial<typeof benchmarkVersions.$inferSelect> = {}
): typeof benchmarkVersions.$inferSelect {
  return {
    benchmarkFamily: "firstproof",
    benchmarkVersionId: "firstproof/Problem9@2026-04-02",
    createdAt: new Date("2026-04-02T19:10:00.000Z"),
    createdByUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    displayLabel: "Problem 9 April 2026",
    itemSetDefinition: {
      family: "firstproof"
    },
    launchability: "internal_only",
    packageDigest: "sha256:freeze-digest",
    packageFreezeId: "22222222-2222-4222-8222-222222222222",
    packageId: "firstproof/Problem9",
    packageVersion: "2026-04-02",
    scopeLabel: "full",
    updatedAt: new Date("2026-04-02T19:10:00.000Z"),
    ...overrides
  };
}

function buildBenchmarkRelease(
  overrides: Partial<typeof benchmarkReleases.$inferSelect> = {}
): typeof benchmarkReleases.$inferSelect {
  return {
    approvedAt: new Date("2026-04-02T20:00:00.000Z"),
    approvedByUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    benchmarkReleaseId: "problem9-apr-2026",
    benchmarkVersionId: "firstproof/Problem9@2026-04-02",
    createdAt: new Date("2026-04-02T19:30:00.000Z"),
    createdByUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    methodologyArtifactRefs: ["artifacts/methodology.md"],
    publishedAt: new Date("2026-04-02T20:15:00.000Z"),
    releaseLabel: "Problem 9 Release April 2026",
    status: "published",
    summaryArtifactRefs: ["artifacts/summary.json"],
    summaryPayload: {
      releaseSummary: "Published release"
    },
    updatedAt: new Date("2026-04-02T20:15:00.000Z"),
    visibility: "public",
    ...overrides
  };
}

test("POST /portal/admin/repo-sync-records creates a record and audits the action", async (t) => {
  const insertedAuditEvents: Array<typeof auditEvents.$inferInsert> = [];
  const createdRow = buildRepoSyncRecord();
  const db = {
    query: {
      repoSyncRecords: {
        findFirst: async () => null
      }
    },
    transaction: async (
      callback: (tx: {
        insert: (
          table: unknown
        ) => {
          values: (
            value: unknown
          ) => {
            returning?: () => Promise<unknown[]>;
          } | Promise<unknown>;
        };
        update: (_table: unknown) => {
          set: (_value: unknown) => {
            where: (_value: unknown) => {
              returning: () => Promise<unknown[]>;
            };
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        insert(table: unknown) {
          return {
            values(value: unknown) {
              if (table === repoSyncRecords) {
                return {
                  returning: async () => [createdRow]
                };
              }

              if (table === auditEvents) {
                insertedAuditEvents.push(value as typeof auditEvents.$inferInsert);
              }

              return Promise.resolve(value);
            }
          };
        }
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      mathPackageCandidateId: "math-candidate-1",
      note: "Open PR for freeze review",
      pullRequestNumber: 890,
      pullRequestUrl: "https://github.com/Tomodovodoo/ParetoProof/pull/890",
      repoName: "ParetoProof",
      repoOwner: "Tomodovodoo",
      status: "pr_open",
      targetRepoPath: "packages/benchmarks/problem9"
    },
    url: "/portal/admin/repo-sync-records"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    benchmarkWorkflowContract.adminRepoSyncRecordDetailResponse.safeParse(response.json()).success,
    true
  );
  assert.equal(insertedAuditEvents[0]?.eventId, "benchmark_workflow.repo_sync_recorded");
  assert.deepEqual(insertedAuditEvents[0]?.payload, {
    actorUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    repoName: "ParetoProof",
    repoOwner: "Tomodovodoo",
    repoSyncRecordId: createdRow.id,
    status: "pr_open"
  });
});

test("POST /portal/admin/repo-sync-records remaps unique-constraint races to the existing 409 payload", async (t) => {
  const existingRow = buildRepoSyncRecord();
  let topLevelLookupCount = 0;
  const db = {
    query: {
      repoSyncRecords: {
        findFirst: async () => (topLevelLookupCount++ === 0 ? null : existingRow)
      }
    },
    transaction: async (
      callback: (tx: {
        query: {
          repoSyncRecords: {
            findFirst: () => Promise<typeof existingRow | null>;
          };
        };
        insert: (_table: unknown) => {
          values: (_value: unknown) => {
            returning?: () => Promise<unknown[]>;
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          repoSyncRecords: {
            findFirst: async () => existingRow
          }
        },
        insert: () => ({
          values: () => ({
            returning: async () => {
              throw {
                code: "23505",
                constraint: "repo_sync_records_repo_pr_unique"
              };
            }
          })
        })
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      mathPackageCandidateId: "math-candidate-1",
      note: "Open PR for freeze review",
      pullRequestNumber: 890,
      pullRequestUrl: "https://github.com/Tomodovodoo/ParetoProof/pull/890",
      repoName: "ParetoProof",
      repoOwner: "Tomodovodoo",
      status: "pr_open",
      targetRepoPath: "packages/benchmarks/problem9"
    },
    url: "/portal/admin/repo-sync-records"
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "repo_sync_record_already_exists");
  assert.equal(response.json().item.id, existingRow.id);
});

test("POST /portal/admin/repo-sync-records rejects merged records without a merge commit sha", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, {} as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      repoName: "ParetoProof",
      repoOwner: "Tomodovodoo",
      status: "merged",
      targetRepoPath: "packages/benchmarks/problem9"
    },
    url: "/portal/admin/repo-sync-records"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "repo_sync_record_merge_commit_required");
});

test("POST /portal/admin/repo-sync-records rejects PR-tracked states without PR linkage", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, {} as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      repoName: "ParetoProof",
      repoOwner: "Tomodovodoo",
      status: "pr_open",
      targetRepoPath: "packages/benchmarks/problem9"
    },
    url: "/portal/admin/repo-sync-records"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "repo_sync_record_pr_link_required");
});

test("POST /portal/admin/repo-sync-records/:id/status rejects promotion without PR linkage", async (t) => {
  const currentRow = buildRepoSyncRecord({
    note: "Draft proposal without linked PR yet",
    pullRequestNumber: null,
    pullRequestUrl: null,
    status: "proposed"
  });
  let repoSyncLookupCount = 0;
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          repoSyncRecords: {
            findFirst: () => Promise<typeof currentRow | null>;
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          repoSyncRecords: {
            findFirst: async () => (repoSyncLookupCount++ === 0 ? currentRow : null)
          }
        }
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      status: "pr_open"
    },
    url: `/portal/admin/repo-sync-records/${currentRow.id}/status`
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "repo_sync_record_pr_link_required");
});

test("POST /portal/admin/repo-sync-records/:id/status accepts explicit null PR linkage clears on non-PR states", async (t) => {
  const insertedAuditEvents: Array<typeof auditEvents.$inferInsert> = [];
  const currentRow = buildRepoSyncRecord({
    status: "pr_open"
  });
  const updatedRow = buildRepoSyncRecord({
    lastUpdatedByUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    pullRequestNumber: null,
    pullRequestUrl: null,
    status: "rejected",
    updatedAt: new Date("2026-04-02T18:05:00.000Z")
  });
  const db = {
    transaction: async (
      callback: (tx: {
        insert: (_table: unknown) => {
          values: (_value: unknown) => Promise<unknown>;
        };
        query: {
          repoSyncRecords: {
            findFirst: () => Promise<typeof currentRow | null>;
          };
        };
        update: (_table: unknown) => {
          set: (_value: unknown) => {
            where: (_value: unknown) => {
              returning: () => Promise<unknown[]>;
            };
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        insert(table: unknown) {
          return {
            values(value: unknown) {
              if (table === auditEvents) {
                insertedAuditEvents.push(value as typeof auditEvents.$inferInsert);
              }

              return Promise.resolve(value);
            }
          };
        },
        query: {
          repoSyncRecords: {
            findFirst: async () => currentRow
          }
        },
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => [updatedRow]
            })
          })
        })
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      pullRequestNumber: null,
      pullRequestUrl: null,
      status: "rejected"
    },
    url: `/portal/admin/repo-sync-records/${currentRow.id}/status`
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    benchmarkWorkflowContract.adminRepoSyncRecordDetailResponse.safeParse(response.json()).success,
    true
  );
  assert.equal(response.json().item.pullRequestNumber, null);
  assert.equal(response.json().item.pullRequestUrl, null);
  assert.equal(response.json().item.status, "rejected");
  assert.equal(insertedAuditEvents[0]?.eventId, "benchmark_workflow.repo_sync_status_updated");
});

test("POST /portal/admin/repo-sync-records/:id/status rejects partial PR linkage clears", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, {} as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      pullRequestNumber: null,
      status: "rejected"
    },
    url: "/portal/admin/repo-sync-records/11111111-1111-4111-8111-111111111111/status"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "invalid_repo_sync_record_status_payload");
});

test("POST /portal/admin/repo-sync-records/:id/status returns a conflict when another writer already changed the status", async (t) => {
  const currentRow = buildRepoSyncRecord({
    status: "pr_open"
  });
  const staleRow = buildRepoSyncRecord({
    status: "rejected"
  });
  let repoSyncLookupCount = 0;
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          repoSyncRecords: {
            findFirst: () => Promise<typeof currentRow | typeof staleRow | null>;
          };
        };
        update: (_table: unknown) => {
          set: (_value: unknown) => {
            where: (_value: unknown) => {
              returning: () => Promise<unknown[]>;
            };
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          repoSyncRecords: {
            findFirst: async () => (repoSyncLookupCount++ === 0 ? currentRow : staleRow)
          }
        },
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => []
            })
          })
        })
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      status: "merged",
      mergeCommitSha: "abc1234567890"
    },
    url: `/portal/admin/repo-sync-records/${currentRow.id}/status`
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "repo_sync_record_invalid_transition");
  assert.equal(response.json().item.status, staleRow.status);
});

test("POST /portal/admin/repo-sync-records/:id/status remaps unique-constraint races to the existing 409 payload", async (t) => {
  const currentRow = buildRepoSyncRecord({
    status: "proposed"
  });
  const conflictingRow = buildRepoSyncRecord({
    id: "99999999-9999-4999-8999-999999999999",
    status: "pr_open"
  });
  let repoSyncLookupCount = 0;
  let topLevelLookupCount = 0;
  const db = {
    query: {
      repoSyncRecords: {
        findFirst: async () => {
          topLevelLookupCount += 1;
          return topLevelLookupCount === 1 ? currentRow : conflictingRow;
        }
      }
    },
    transaction: async (
      callback: (tx: {
        query: {
          repoSyncRecords: {
            findFirst: () => Promise<typeof currentRow | typeof conflictingRow | null>;
          };
        };
        update: (_table: unknown) => {
          set: (_value: unknown) => {
            where: (_value: unknown) => {
              returning: () => Promise<unknown[]>;
            };
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          repoSyncRecords: {
            findFirst: async () => {
              repoSyncLookupCount += 1;

              if (repoSyncLookupCount === 1) {
                return currentRow;
              }

              if (repoSyncLookupCount === 2) {
                return currentRow;
              }

              return conflictingRow;
            }
          }
        },
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => {
                throw {
                  code: "23505",
                  constraint: "repo_sync_records_repo_pr_unique"
                };
              }
            })
          })
        })
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      pullRequestNumber: 890,
      pullRequestUrl: "https://github.com/Tomodovodoo/ParetoProof/pull/890",
      status: "pr_open"
    },
    url: `/portal/admin/repo-sync-records/${currentRow.id}/status`
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "repo_sync_record_pr_conflict");
  assert.equal(response.json().item.id, conflictingRow.id);
});

test("POST /portal/admin/repo-sync-records/:id/status retries against the latest same-status row before succeeding", async (t) => {
  const currentRow = buildRepoSyncRecord({
    note: "Initial note",
    status: "proposed",
    updatedAt: new Date("2026-04-02T18:00:00.000Z")
  });
  const latestRow = buildRepoSyncRecord({
    note: "Fresh note from another admin",
    status: "proposed",
    updatedAt: new Date("2026-04-02T18:05:00.000Z")
  });
  const updatedRow = buildRepoSyncRecord({
    note: latestRow.note,
    status: "proposed",
    updatedAt: new Date("2026-04-02T18:06:00.000Z")
  });
  const insertedAuditEvents: Array<typeof auditEvents.$inferInsert> = [];
  let repoSyncLookupCount = 0;
  let updateAttemptCount = 0;
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          repoSyncRecords: {
            findFirst: () => Promise<typeof currentRow | typeof latestRow | null>;
          };
        };
        insert: (_table: unknown) => {
          values: (_value: unknown) => Promise<unknown>;
        };
        update: (_table: unknown) => {
          set: (_value: unknown) => {
            where: (_value: unknown) => {
              returning: () => Promise<unknown[]>;
            };
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          repoSyncRecords: {
            findFirst: async () => {
              repoSyncLookupCount += 1;

              if (repoSyncLookupCount === 1) {
                return currentRow;
              }

              if (repoSyncLookupCount === 2) {
                return currentRow;
              }

              if (repoSyncLookupCount === 3) {
                return latestRow;
              }

              return latestRow;
            }
          }
        },
        insert: () => ({
          values: async (value: unknown) => {
            insertedAuditEvents.push(value as typeof auditEvents.$inferInsert);
          }
        }),
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => {
                updateAttemptCount += 1;
                return updateAttemptCount === 1 ? [] : [updatedRow];
              }
            })
          })
        })
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      status: "proposed"
    },
    url: `/portal/admin/repo-sync-records/${currentRow.id}/status`
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().item.note, latestRow.note);
  assert.equal(updateAttemptCount, 2);
  assert.equal(insertedAuditEvents[0]?.eventId, "benchmark_workflow.repo_sync_status_updated");
});

test("POST /portal/admin/package-freezes rejects repo sync records that are not merged", async (t) => {
  const repoSyncRecordRow = buildRepoSyncRecord({
    mergeCommitSha: null,
    status: "pr_open"
  });
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          repoSyncRecords: {
            findFirst: () => Promise<typeof repoSyncRecordRow>;
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          repoSyncRecords: {
            findFirst: async () => repoSyncRecordRow
          }
        }
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      benchmarkFamily: "firstproof",
      note: "Freeze after merge",
      packageDigest: "sha256:freeze-digest",
      packageId: "firstproof/Problem9",
      packageVersion: "2026-04-02",
      repoCommitSha: "abc1234567890",
      repoSyncRecordId: repoSyncRecordRow.id
    },
    url: "/portal/admin/package-freezes"
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "repo_sync_record_not_merged");
});

test("POST /portal/admin/package-freezes rejects merged repo sync records that still lack PR linkage", async (t) => {
  const repoSyncRecordRow = buildRepoSyncRecord({
    mergeCommitSha: "abc1234567890",
    pullRequestNumber: null,
    pullRequestUrl: null,
    status: "merged"
  });
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          repoSyncRecords: {
            findFirst: () => Promise<typeof repoSyncRecordRow>;
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          repoSyncRecords: {
            findFirst: async () => repoSyncRecordRow
          }
        }
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      benchmarkFamily: "firstproof",
      note: "Freeze after merge",
      packageDigest: "sha256:freeze-digest",
      packageId: "firstproof/Problem9",
      packageVersion: "2026-04-02",
      repoCommitSha: "abc1234567890",
      repoSyncRecordId: repoSyncRecordRow.id
    },
    url: "/portal/admin/package-freezes"
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "repo_sync_record_pr_link_required");
});

test("POST /portal/admin/package-freezes rejects repo sync records that are superseded after validation but before the freeze insert", async (t) => {
  const repoSyncRecordRow = buildRepoSyncRecord({
    mergeCommitSha: "abc1234567890",
    status: "merged"
  });
  const supersededRepoSyncRecordRow = buildRepoSyncRecord({
    mergeCommitSha: "abc1234567890",
    status: "superseded"
  });
  let repoSyncLookupCount = 0;
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          packageFreezes: {
            findFirst: () => Promise<null>;
          };
          repoSyncRecords: {
            findFirst: () => Promise<typeof repoSyncRecordRow | typeof supersededRepoSyncRecordRow | null>;
          };
        };
        execute: (_query: unknown) => Promise<unknown[]>;
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          packageFreezes: {
            findFirst: async () => null
          },
          repoSyncRecords: {
            findFirst: async () =>
              (repoSyncLookupCount++ === 0 ? repoSyncRecordRow : supersededRepoSyncRecordRow)
          }
        },
        execute: async () => []
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      benchmarkFamily: "firstproof",
      note: "Freeze after merge",
      packageDigest: "sha256:freeze-digest",
      packageId: "firstproof/Problem9",
      packageVersion: "2026-04-02",
      repoCommitSha: "abc1234567890",
      repoSyncRecordId: repoSyncRecordRow.id
    },
    url: "/portal/admin/package-freezes"
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "repo_sync_record_not_merged");
  assert.equal(response.json().item.status, supersededRepoSyncRecordRow.status);
});

test("POST /portal/admin/benchmark-releases/:id/publish blocks publication when the version is not launchable", async (t) => {
  const benchmarkReleaseRow = buildBenchmarkRelease({
    status: "approved"
  });
  const benchmarkVersionRow = buildBenchmarkVersion({
    launchability: "internal_only"
  });
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          benchmarkReleases: {
            findFirst: () => Promise<typeof benchmarkReleaseRow>;
          };
          benchmarkVersions: {
            findFirst: () => Promise<typeof benchmarkVersionRow>;
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          benchmarkReleases: {
            findFirst: async () => benchmarkReleaseRow
          },
          benchmarkVersions: {
            findFirst: async () => benchmarkVersionRow
          }
        }
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {},
    url: `/portal/admin/benchmark-releases/${benchmarkReleaseRow.benchmarkReleaseId}/publish`
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "benchmark_version_not_launchable");
  assert.equal(response.json().item.launchability, "internal_only");
});

test("POST /portal/admin/package-freezes derives provenance fields from the repo sync record", async (t) => {
  const repoSyncRecordRow = buildRepoSyncRecord({
    mathPackageCandidateId: "math-candidate-from-sync",
    mergeCommitSha: "abc1234567890",
    status: "merged",
    targetRepoPath: "benchmarks/firstproof/problem9"
  });
  const insertedAuditEvents: Array<typeof auditEvents.$inferInsert> = [];
  const insertedRows: Array<typeof packageFreezes.$inferInsert> = [];
  const createdFreezeRow = buildPackageFreeze({
    mathPackageCandidateId: repoSyncRecordRow.mathPackageCandidateId,
    repoCommitSha: repoSyncRecordRow.mergeCommitSha,
    repoSyncRecordId: repoSyncRecordRow.id,
    repoTreePath: repoSyncRecordRow.targetRepoPath
  });
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          packageFreezes: {
            findFirst: () => Promise<null>;
          };
          repoSyncRecords: {
            findFirst: () => Promise<typeof repoSyncRecordRow>;
          };
        };
        insert: (
          table: unknown
        ) => {
          values: (
            value: unknown
          ) => {
            returning?: () => Promise<unknown[]>;
          } | Promise<unknown>;
        };
        execute: (_query: unknown) => Promise<unknown[]>;
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          packageFreezes: {
            findFirst: async () => null
          },
          repoSyncRecords: {
            findFirst: async () => repoSyncRecordRow
          }
        },
        insert(table: unknown) {
          return {
            values(value: unknown) {
              if (table === packageFreezes) {
                insertedRows.push(value as typeof packageFreezes.$inferInsert);
                return {
                  returning: async () => [createdFreezeRow]
                };
              }

              if (table === auditEvents) {
                insertedAuditEvents.push(value as typeof auditEvents.$inferInsert);
              }

              return Promise.resolve(value);
            }
          };
        },
        execute: async () => [{ id: repoSyncRecordRow.id }]
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      benchmarkFamily: "firstproof",
      mathPackageCandidateId: "caller-supplied-candidate",
      note: "Freeze after merge",
      packageDigest: "sha256:freeze-digest",
      packageId: "firstproof/Problem9",
      packageVersion: "2026-04-02",
      repoCommitSha: "abc1234567890",
      repoSyncRecordId: repoSyncRecordRow.id,
      repoTreePath: "caller/controlled/path"
    },
    url: "/portal/admin/package-freezes"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    insertedRows[0]?.mathPackageCandidateId,
    repoSyncRecordRow.mathPackageCandidateId
  );
  assert.equal(insertedRows[0]?.repoTreePath, repoSyncRecordRow.targetRepoPath);
  assert.equal(response.json().item.repoTreePath, repoSyncRecordRow.targetRepoPath);
  assert.equal(response.json().item.mathPackageCandidateId, repoSyncRecordRow.mathPackageCandidateId);
  assert.equal(insertedAuditEvents[0]?.eventId, "benchmark_workflow.package_frozen");
});

test("POST /portal/admin/package-freezes remaps unique-constraint races to the existing 409 payload", async (t) => {
  const repoSyncRecordRow = buildRepoSyncRecord({
    mergeCommitSha: "abc1234567890",
    status: "merged"
  });
  const existingFreezeRow = buildPackageFreeze({
    repoSyncRecordId: repoSyncRecordRow.id
  });
  let packageFreezeLookupCount = 0;
  const db = {
    query: {
      packageFreezes: {
        findFirst: async () => existingFreezeRow
      }
    },
    transaction: async (
      callback: (tx: {
        query: {
          packageFreezes: {
            findFirst: () => Promise<typeof existingFreezeRow | null>;
          };
          repoSyncRecords: {
            findFirst: () => Promise<typeof repoSyncRecordRow>;
          };
        };
        insert: (_table: unknown) => {
          values: (_value: unknown) => {
            returning?: () => Promise<unknown[]>;
          };
        };
        execute: (_query: unknown) => Promise<unknown[]>;
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          packageFreezes: {
            findFirst: async () => (packageFreezeLookupCount++ < 2 ? null : existingFreezeRow)
          },
          repoSyncRecords: {
            findFirst: async () => repoSyncRecordRow
          }
        },
        insert: () => ({
          values: () => ({
            returning: async () => {
              throw {
                code: "23505",
                constraint: "package_freezes_repo_sync_record_id_unique"
              };
            }
          })
        }),
        execute: async () => [{ id: repoSyncRecordRow.id }]
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      benchmarkFamily: "firstproof",
      note: "Freeze after merge",
      packageDigest: "sha256:freeze-digest",
      packageId: "firstproof/Problem9",
      packageVersion: "2026-04-02",
      repoCommitSha: "abc1234567890",
      repoSyncRecordId: repoSyncRecordRow.id
    },
    url: "/portal/admin/package-freezes"
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "package_freeze_already_exists");
  assert.equal(response.json().item.id, existingFreezeRow.id);
});

test("POST /portal/admin/package-freezes/:id/benchmark-versions allows multiple versions per freeze", async (t) => {
  const packageFreezeRow = buildPackageFreeze();
  let createdVersionCount = 0;
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          benchmarkVersions: {
            findFirst: () => Promise<null>;
          };
          packageFreezes: {
            findFirst: () => Promise<typeof packageFreezeRow>;
          };
        };
        insert: (
          table: unknown
        ) => {
          values: (
            value: unknown
          ) => {
            returning?: () => Promise<unknown[]>;
          } | Promise<unknown>;
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          benchmarkVersions: {
            findFirst: async () => null
          },
          packageFreezes: {
            findFirst: async () => packageFreezeRow
          }
        },
        insert(table: unknown) {
          return {
            values(value: unknown) {
              if (table === benchmarkVersions) {
                createdVersionCount += 1;
                const input = value as typeof benchmarkVersions.$inferInsert;
                return {
                  returning: async () => [
                    buildBenchmarkVersion({
                      benchmarkVersionId: input.benchmarkVersionId,
                      displayLabel: input.displayLabel ?? "Problem 9 April 2026",
                      itemSetDefinition: input.itemSetDefinition ?? null,
                      scopeLabel: input.scopeLabel ?? "full"
                    })
                  ]
                };
              }

              return Promise.resolve(value);
            }
          };
        }
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const firstResponse = await app.inject({
    method: "POST",
    payload: {
      benchmarkVersionId: "firstproof/Problem9@2026-04-02",
      itemSetDefinition: {
        slice: "full"
      },
      scopeLabel: "full"
    },
    url: `/portal/admin/package-freezes/${packageFreezeRow.id}/benchmark-versions`
  });
  const secondResponse = await app.inject({
    method: "POST",
    payload: {
      benchmarkVersionId: "firstproof/Problem9@2026-04-02-scout",
      itemSetDefinition: {
        slice: "scout"
      },
      scopeLabel: "scout"
    },
    url: `/portal/admin/package-freezes/${packageFreezeRow.id}/benchmark-versions`
  });

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(secondResponse.statusCode, 200);
  assert.equal(createdVersionCount, 2);
});

test("POST /portal/admin/package-freezes/:id/benchmark-versions remaps duplicate-key races to the existing 409 payload", async (t) => {
  const packageFreezeRow = buildPackageFreeze();
  const existingVersion = buildBenchmarkVersion();
  let versionLookupCount = 0;
  const db = {
    query: {
      benchmarkVersions: {
        findFirst: async () => existingVersion
      }
    },
    transaction: async (
      callback: (tx: {
        query: {
          benchmarkVersions: {
            findFirst: () => Promise<typeof existingVersion | null>;
          };
          packageFreezes: {
            findFirst: () => Promise<typeof packageFreezeRow>;
          };
        };
        insert: (_table: unknown) => {
          values: (_value: unknown) => {
            returning?: () => Promise<unknown[]>;
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          benchmarkVersions: {
            findFirst: async () => (versionLookupCount++ === 0 ? null : existingVersion)
          },
          packageFreezes: {
            findFirst: async () => packageFreezeRow
          }
        },
        insert: () => ({
          values: () => ({
            returning: async () => {
              throw {
                code: "23505",
                constraint: "benchmark_versions_pkey"
              };
            }
          })
        })
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      benchmarkVersionId: existingVersion.benchmarkVersionId,
      itemSetDefinition: {
        slice: "full"
      },
      scopeLabel: "full"
    },
    url: `/portal/admin/package-freezes/${packageFreezeRow.id}/benchmark-versions`
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "benchmark_version_already_exists");
  assert.equal(response.json().item.benchmarkVersionId, existingVersion.benchmarkVersionId);
});

test("POST /portal/admin/benchmark-versions/:id/launchability rejects downgrades from launchable state", async (t) => {
  const benchmarkVersionRow = buildBenchmarkVersion({
    launchability: "launchable"
  });
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          benchmarkVersions: {
            findFirst: () => Promise<typeof benchmarkVersionRow>;
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          benchmarkVersions: {
            findFirst: async () => benchmarkVersionRow
          }
        }
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      launchability: "internal_only"
    },
    url: `/portal/admin/benchmark-versions/${encodeURIComponent(benchmarkVersionRow.benchmarkVersionId)}/launchability`
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "benchmark_version_invalid_launchability_transition");
  assert.equal(response.json().item.launchability, "launchable");
});

test("POST /portal/admin/benchmark-versions/:id/launchability rejects stale downgrade requests after another writer already launched the version", async (t) => {
  const currentRow = buildBenchmarkVersion({
    launchability: "internal_only"
  });
  const latestRow = buildBenchmarkVersion({
    launchability: "launchable"
  });
  let benchmarkVersionLookupCount = 0;
  let updateAttemptCount = 0;
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          benchmarkVersions: {
            findFirst: () => Promise<typeof currentRow | typeof latestRow | null>;
          };
        };
        update: (_table: unknown) => {
          set: (_value: unknown) => {
            where: (_value: unknown) => {
              returning: () => Promise<unknown[]>;
            };
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          benchmarkVersions: {
            findFirst: async () => {
              benchmarkVersionLookupCount += 1;
              return benchmarkVersionLookupCount === 1 ? currentRow : latestRow;
            }
          }
        },
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => {
                updateAttemptCount += 1;
                return [];
              }
            })
          })
        })
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      launchability: "internal_only"
    },
    url: `/portal/admin/benchmark-versions/${encodeURIComponent(currentRow.benchmarkVersionId)}/launchability`
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "benchmark_version_invalid_launchability_transition");
  assert.equal(response.json().item.launchability, latestRow.launchability);
  assert.equal(updateAttemptCount, 1);
});

test("POST /portal/admin/benchmark-releases/:id/approve returns a conflict if another writer already approved it", async (t) => {
  const currentRow = buildBenchmarkRelease({
    approvedAt: null,
    approvedByUserId: null,
    publishedAt: null,
    status: "draft"
  });
  const racedRow = buildBenchmarkRelease({
    approvedAt: new Date("2026-04-02T20:00:00.000Z"),
    approvedByUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    publishedAt: null,
    status: "approved"
  });
  let benchmarkReleaseLookupCount = 0;
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          benchmarkReleases: {
            findFirst: () => Promise<typeof currentRow | typeof racedRow>;
          };
        };
        insert: (_table: unknown) => {
          values: (_value: unknown) => Promise<unknown>;
        };
        update: (_table: unknown) => {
          set: (_value: unknown) => {
            where: (_value: unknown) => {
              returning: () => Promise<unknown[]>;
            };
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          benchmarkReleases: {
            findFirst: async () => (benchmarkReleaseLookupCount++ === 0 ? currentRow : racedRow)
          }
        },
        insert: () => ({
          values: async () => undefined
        }),
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => []
            })
          })
        })
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {},
    url: `/portal/admin/benchmark-releases/${currentRow.benchmarkReleaseId}/approve`
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "benchmark_release_not_draft");
  assert.equal(response.json().item.status, "approved");
});

test("POST /portal/admin/benchmark-releases/:id/publish returns a conflict if another writer already published it", async (t) => {
  const currentReleaseRow = buildBenchmarkRelease({
    approvedAt: new Date("2026-04-02T20:00:00.000Z"),
    publishedAt: null,
    status: "approved",
    visibility: "public"
  });
  const publishedReleaseRow = buildBenchmarkRelease({
    publishedAt: new Date("2026-04-02T20:15:00.000Z"),
    status: "published",
    visibility: "public"
  });
  const benchmarkVersionRow = buildBenchmarkVersion({
    benchmarkVersionId: currentReleaseRow.benchmarkVersionId,
    launchability: "launchable"
  });
  let benchmarkReleaseLookupCount = 0;
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          benchmarkReleases: {
            findFirst: () => Promise<typeof currentReleaseRow | typeof publishedReleaseRow>;
          };
          benchmarkVersions: {
            findFirst: () => Promise<typeof benchmarkVersionRow>;
          };
        };
        insert: (_table: unknown) => {
          values: (_value: unknown) => Promise<unknown>;
        };
        update: (_table: unknown) => {
          set: (_value: unknown) => {
            where: (_value: unknown) => {
              returning: () => Promise<unknown[]>;
            };
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          benchmarkReleases: {
            findFirst: async () =>
              (benchmarkReleaseLookupCount++ === 0 ? currentReleaseRow : publishedReleaseRow)
          },
          benchmarkVersions: {
            findFirst: async () => benchmarkVersionRow
          }
        },
        insert: () => ({
          values: async () => undefined
        }),
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => []
            })
          })
        })
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {},
    url: `/portal/admin/benchmark-releases/${currentReleaseRow.benchmarkReleaseId}/publish`
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "benchmark_release_not_approved");
  assert.equal(response.json().item.status, "published");
});

test("POST /portal/admin/benchmark-releases/:id/publish rejects a second public release for the same benchmark version", async (t) => {
  const currentReleaseRow = buildBenchmarkRelease({
    benchmarkReleaseId: "problem9-may-2026",
    benchmarkVersionId: "firstproof/Problem9@2026-04-02",
    publishedAt: null,
    status: "approved",
    visibility: "public"
  });
  const conflictingReleaseRow = buildBenchmarkRelease({
    benchmarkReleaseId: "problem9-apr-2026",
    benchmarkVersionId: currentReleaseRow.benchmarkVersionId,
    status: "published",
    visibility: "public"
  });
  const benchmarkVersionRow = buildBenchmarkVersion({
    benchmarkVersionId: currentReleaseRow.benchmarkVersionId,
    launchability: "launchable"
  });
  let benchmarkReleaseLookupCount = 0;
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          benchmarkReleases: {
            findFirst: () => Promise<typeof currentReleaseRow | typeof conflictingReleaseRow>;
          };
          benchmarkVersions: {
            findFirst: () => Promise<typeof benchmarkVersionRow>;
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          benchmarkReleases: {
            findFirst: async () =>
              (benchmarkReleaseLookupCount++ === 0 ? currentReleaseRow : conflictingReleaseRow)
          },
          benchmarkVersions: {
            findFirst: async () => benchmarkVersionRow
          }
        }
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {},
    url: `/portal/admin/benchmark-releases/${currentReleaseRow.benchmarkReleaseId}/publish`
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "benchmark_release_public_version_conflict");
  assert.equal(
    response.json().conflictingRelease.benchmarkReleaseId,
    conflictingReleaseRow.benchmarkReleaseId
  );
});

test("POST /portal/admin/benchmark-versions/:id/releases remaps duplicate-key races to the existing 409 payload", async (t) => {
  const benchmarkVersionRow = buildBenchmarkVersion();
  const existingReleaseRow = buildBenchmarkRelease({
    benchmarkReleaseId: "problem9-may-2026",
    benchmarkVersionId: benchmarkVersionRow.benchmarkVersionId,
    publishedAt: null,
    status: "draft",
    visibility: "internal_only"
  });
  let releaseLookupCount = 0;
  const db = {
    query: {
      benchmarkReleases: {
        findFirst: async () => existingReleaseRow
      }
    },
    transaction: async (
      callback: (tx: {
        query: {
          benchmarkReleases: {
            findFirst: () => Promise<typeof existingReleaseRow | null>;
          };
          benchmarkVersions: {
            findFirst: () => Promise<typeof benchmarkVersionRow>;
          };
        };
        insert: (_table: unknown) => {
          values: (_value: unknown) => {
            returning?: () => Promise<unknown[]>;
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          benchmarkReleases: {
            findFirst: async () => (releaseLookupCount++ === 0 ? null : existingReleaseRow)
          },
          benchmarkVersions: {
            findFirst: async () => benchmarkVersionRow
          }
        },
        insert: () => ({
          values: () => ({
            returning: async () => {
              throw {
                code: "23505",
                constraint: "benchmark_releases_pkey"
              };
            }
          })
        })
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      benchmarkReleaseId: existingReleaseRow.benchmarkReleaseId,
      methodologyArtifactRefs: ["artifacts/methodology.md"],
      releaseLabel: "Problem 9 Release May 2026",
      summaryArtifactRefs: ["artifacts/summary.json"],
      summaryPayload: {
        releaseSummary: "Draft release"
      },
      visibility: "internal_only"
    },
    url: `/portal/admin/benchmark-versions/${encodeURIComponent(benchmarkVersionRow.benchmarkVersionId)}/releases`
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "benchmark_release_already_exists");
  assert.equal(response.json().item.benchmarkReleaseId, existingReleaseRow.benchmarkReleaseId);
});

test("POST /portal/admin/benchmark-releases/:id/publish remaps public-version unique races to 409", async (t) => {
  const currentReleaseRow = buildBenchmarkRelease({
    benchmarkReleaseId: "problem9-may-2026",
    benchmarkVersionId: "firstproof/Problem9@2026-04-02",
    publishedAt: null,
    status: "approved",
    visibility: "public"
  });
  const conflictingReleaseRow = buildBenchmarkRelease({
    benchmarkReleaseId: "problem9-apr-2026",
    benchmarkVersionId: currentReleaseRow.benchmarkVersionId,
    status: "published",
    visibility: "public"
  });
  const benchmarkVersionRow = buildBenchmarkVersion({
    benchmarkVersionId: currentReleaseRow.benchmarkVersionId,
    launchability: "launchable"
  });
  let benchmarkReleaseLookupCount = 0;
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          benchmarkReleases: {
            findFirst: () => Promise<typeof currentReleaseRow | typeof conflictingReleaseRow | null>;
          };
          benchmarkVersions: {
            findFirst: () => Promise<typeof benchmarkVersionRow>;
          };
        };
        insert: (_table: unknown) => {
          values: (_value: unknown) => Promise<unknown>;
        };
        update: (_table: unknown) => {
          set: (_value: unknown) => {
            where: (_value: unknown) => {
              returning: () => Promise<unknown[]>;
            };
          };
        };
      }) => Promise<unknown>
    ) =>
      callback({
        query: {
          benchmarkReleases: {
            findFirst: async () =>
              (benchmarkReleaseLookupCount++ === 0 ? currentReleaseRow : conflictingReleaseRow)
          },
          benchmarkVersions: {
            findFirst: async () => benchmarkVersionRow
          }
        },
        insert: () => ({
          values: async () => undefined
        }),
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => {
                throw {
                  code: "23505",
                  constraint: "benchmark_releases_public_version_unique"
                };
              }
            })
          })
        })
      } as never)
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {},
    url: `/portal/admin/benchmark-releases/${currentReleaseRow.benchmarkReleaseId}/publish`
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "benchmark_release_public_version_conflict");
  assert.equal(
    response.json().conflictingRelease.benchmarkReleaseId,
    conflictingReleaseRow.benchmarkReleaseId
  );
});

test("GET /portal/admin/repo-sync-records/:id rejects malformed UUID params before querying", async (t) => {
  let repoSyncLookupTouched = false;
  const db = {
    query: {
      repoSyncRecords: {
        findFirst: async () => {
          repoSyncLookupTouched = true;
          throw new Error("repo sync lookup should not run for malformed UUID params");
        }
      }
    }
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "GET",
    url: "/portal/admin/repo-sync-records/not-a-uuid"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "invalid_repo_sync_record_params");
  assert.equal(repoSyncLookupTouched, false);
});

test("POST /portal/admin/repo-sync-records/:id/status rejects malformed UUID params before opening a transaction", async (t) => {
  let transactionTouched = false;
  const db = {
    transaction: async () => {
      transactionTouched = true;
      throw new Error("repo sync status transaction should not run for malformed UUID params");
    }
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      status: "rejected"
    },
    url: "/portal/admin/repo-sync-records/not-a-uuid/status"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "invalid_repo_sync_record_params");
  assert.equal(transactionTouched, false);
});

test("GET /portal/admin/package-freezes/:id rejects malformed UUID params before querying", async (t) => {
  let packageFreezeLookupTouched = false;
  const db = {
    query: {
      packageFreezes: {
        findFirst: async () => {
          packageFreezeLookupTouched = true;
          throw new Error("package freeze lookup should not run for malformed UUID params");
        }
      }
    }
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "GET",
    url: "/portal/admin/package-freezes/not-a-uuid"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "invalid_package_freeze_params");
  assert.equal(packageFreezeLookupTouched, false);
});

test("POST /portal/admin/package-freezes/:id/benchmark-versions rejects malformed UUID params before opening a transaction", async (t) => {
  let transactionTouched = false;
  const db = {
    transaction: async () => {
      transactionTouched = true;
      throw new Error(
        "benchmark version create transaction should not run for malformed UUID params"
      );
    }
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      benchmarkVersionId: "firstproof/Problem9@2026-04-02",
      itemSetDefinition: {
        slice: "full"
      },
      scopeLabel: "full"
    },
    url: "/portal/admin/package-freezes/not-a-uuid/benchmark-versions"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "invalid_package_freeze_params");
  assert.equal(transactionTouched, false);
});

test("GET /portal/admin/benchmark-versions/:id rejects whitespace-padded params before querying", async (t) => {
  let benchmarkVersionLookupTouched = false;
  const db = {
    query: {
      benchmarkVersions: {
        findFirst: async () => {
          benchmarkVersionLookupTouched = true;
          throw new Error("benchmark version lookup should not run for padded params");
        }
      }
    }
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "GET",
    url: `/portal/admin/benchmark-versions/${encodeURIComponent(" firstproof/Problem9@2026-04-02 ")}`
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "invalid_benchmark_version_params");
  assert.equal(benchmarkVersionLookupTouched, false);
});

test("POST /portal/admin/benchmark-versions/:id/launchability rejects whitespace-padded params before opening a transaction", async (t) => {
  let transactionTouched = false;
  const db = {
    transaction: async () => {
      transactionTouched = true;
      throw new Error(
        "benchmark version launchability transaction should not run for padded params"
      );
    }
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {
      launchability: "launchable"
    },
    url: `/portal/admin/benchmark-versions/${encodeURIComponent(" firstproof/Problem9@2026-04-02 ")}/launchability`
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "invalid_benchmark_version_params");
  assert.equal(transactionTouched, false);
});

test("GET /portal/admin/benchmark-releases/:id rejects whitespace-padded params before querying", async (t) => {
  let benchmarkReleaseLookupTouched = false;
  const db = {
    query: {
      benchmarkReleases: {
        findFirst: async () => {
          benchmarkReleaseLookupTouched = true;
          throw new Error("benchmark release lookup should not run for padded params");
        }
      }
    }
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "GET",
    url: `/portal/admin/benchmark-releases/${encodeURIComponent(" problem9-apr-2026 ")}`
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "invalid_benchmark_release_params");
  assert.equal(benchmarkReleaseLookupTouched, false);
});

test("POST /portal/admin/benchmark-releases/:id/approve rejects whitespace-padded params before opening a transaction", async (t) => {
  let transactionTouched = false;
  const db = {
    transaction: async () => {
      transactionTouched = true;
      throw new Error("benchmark release approve transaction should not run for padded params");
    }
  };
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerBenchmarkWorkflowRoutes(app, db as never, createAdminAccessGuard() as never);

  const response = await app.inject({
    method: "POST",
    payload: {},
    url: `/portal/admin/benchmark-releases/${encodeURIComponent(" problem9-apr-2026 ")}/approve`
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "invalid_benchmark_release_params");
  assert.equal(transactionTouched, false);
});
