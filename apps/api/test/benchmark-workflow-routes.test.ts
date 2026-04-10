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

test("POST /portal/admin/benchmark-versions/:id/launchability blocks downgrades when a public release is already published", async (t) => {
  const benchmarkVersionRow = buildBenchmarkVersion({
    launchability: "launchable"
  });
  const publishedReleaseRow = buildBenchmarkRelease({
    benchmarkVersionId: benchmarkVersionRow.benchmarkVersionId,
    status: "published",
    visibility: "public"
  });
  const db = {
    transaction: async (
      callback: (tx: {
        query: {
          benchmarkReleases: {
            findFirst: () => Promise<typeof publishedReleaseRow>;
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
            findFirst: async () => publishedReleaseRow
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
    payload: {
      launchability: "internal_only"
    },
    url: `/portal/admin/benchmark-versions/${encodeURIComponent(benchmarkVersionRow.benchmarkVersionId)}/launchability`
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "benchmark_version_has_published_release");
  assert.equal(response.json().release.benchmarkReleaseId, publishedReleaseRow.benchmarkReleaseId);
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
