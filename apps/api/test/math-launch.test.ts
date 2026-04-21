import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { materializeProblem9Package } from "../../worker/src/lib/problem9-package.ts";
import {
  attempts,
  jobs,
  mathLaunchRecords,
  mathRunnerBootstrapSessions,
  runs,
  workerInstances,
  workerJobLeases,
  workerPoolDefinitions
} from "../src/db/schema.ts";
import {
  createMathLaunchService,
  MathLaunchServiceError
} from "../src/lib/math-launch.ts";

const requiredArtifactRoles = [
  "package_reference",
  "prompt_package",
  "candidate_source",
  "verdict_record",
  "compiler_output",
  "compiler_diagnostics",
  "verifier_output",
  "environment_snapshot"
] as const;

function sha256Text(value: string) {
  return createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex");
}

async function computeCurrentProblem9BenchmarkDigest() {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "problem9-package-"));

  try {
    const materializedPackage = await materializeProblem9Package({
      outputRoot
    });

    return materializedPackage.packageDigest;
  } finally {
    await rm(outputRoot, { force: true, recursive: true });
  }
}

async function readCurrentProblem9PackageVersion() {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "problem9-package-version-"));

  try {
    const materializedPackage = await materializeProblem9Package({
      outputRoot
    });

    return materializedPackage.packageVersion;
  } finally {
    await rm(outputRoot, { force: true, recursive: true });
  }
}

function createHarnessRegistryStub() {
  return {
    async getCatalog() {
      return {
        items: [
          {
            authModes: ["trusted_local_user", "machine_api_key"],
            familyId: "problem9",
            harnessRevision: "problem9",
            providerFamilies: ["openai"],
            runModes: ["bounded_agentic_attempt"],
            runtimeClass: "trusted_local_devbox",
            toolProfiles: ["workspace_edit_limited"]
          }
        ]
      };
    }
  } as never;
}

function createQueuedSelectDb(results: unknown[]) {
  let selectIndex = 0;

  return {
    select() {
      const result = results[selectIndex];
      selectIndex += 1;

      return {
        from() {
          return {
            where() {
              return {
                orderBy: async () => result
              };
            }
          };
        }
      };
    }
  } as never;
}

function createLaunchRecordRow() {
  return {
    authMode: "trusted_local_user",
    benchmarkItemId: "Problem9",
    benchmarkPackageDigest: "a".repeat(64),
    benchmarkPackageId: "firstproof/Problem9",
    benchmarkPackageVersion: "2026.03.15",
    benchmarkVersionId: "benchmark-version-1",
    configSourceRunId: "run_template_1",
    harnessRevision: "problem9",
    id: "launch-1",
    ingestedAt: null,
    laneId: "lean422_exact",
    launchMode: "local_connected",
    mathQuestionId: "problem-9",
    modelConfigId: "openai/gpt-5.4",
    modelSnapshotId: "gpt-5.4-2026-03-01",
    promptPackageDigest: "b".repeat(64),
    promptProtocolVersion: "problem9-prompt-protocol.v1",
    providerFamily: "openai",
    requestedByUserId: "user-1",
    runId: null,
    runMode: "bounded_agentic_attempt",
    sourceAttemptId: "attempt_src_1",
    sourceJobId: "job_src_1",
    sourceRunId: "run_src_1",
    status: "local_bootstrap_issued",
    toolProfile: "workspace_edit_limited",
    verifierVersion: "lean4.22"
  };
}

function createProblem9SourceManifestFixture() {
  return {
    benchmarkFamily: "firstproof",
    benchmarkItemId: "Problem9",
    canonicalModules: {
      gold: "FirstProof/Problem9/Gold.lean",
      statement: "FirstProof/Problem9/Statement.lean",
      support: "FirstProof/Problem9/Support.lean"
    },
    lanePolicy: {
      primaryLane: "lean422_exact",
      supportedLanes: ["lean422_exact"]
    },
    materialization: {
      generatedManifestPath: "benchmark-package.json",
      packageRoot: "firstproof/Problem9"
    },
    packageId: "firstproof/Problem9",
    packageVersion: "2026.03.15",
    sourceMetadata: {
      laneEvidence: {
        lean422_exact: "lean-toolchain"
      },
      license: {
        file: "LICENSE",
        spdxId: "Apache-2.0"
      },
      provenance: {
        goldModule: "FirstProof/Problem9/Gold.lean",
        humanStatement: "statements/problem.md",
        statementModule: "FirstProof/Problem9/Statement.lean",
        supportModule: "FirstProof/Problem9/Support.lean"
      },
      regressionEvidence: {
        cohesionCheck: "bun run check:problem9-package-cohesion",
        integrityTest: "node --import tsx --test test/problem9-integrity.test.ts"
      }
    },
    sourceSchemaVersion: "1"
  };
}

function assertProblem9QuestionSummary(
  actual: {
    benchmarkFamily: string;
    benchmarkItemId: string;
    benchmarkPackageId: string;
    label: string;
    questionId: string;
    routePath: string;
    sourcePackageVersion: string;
  },
  sourcePackageVersion: string
) {
  assert.deepEqual(actual, {
    benchmarkFamily: "firstproof",
    benchmarkItemId: "Problem9",
    benchmarkPackageId: "firstproof/Problem9",
    label: "Problem 9",
    questionId: "problem-9",
    routePath: "/questions/problem-9",
    sourcePackageVersion
  });
}

async function writeProblem9FixtureRepo(
  repoRoot: string,
  options?: {
    manifestText?: string;
    omitPaths?: string[];
  }
) {
  const omittedPaths = new Set(options?.omitPaths ?? []);
  const sourceFiles = {
    "README.md": "# Problem 9\n",
    "LICENSE": "Apache License\n",
    "lean-toolchain": "leanprover/lean4:v4.22.0\n",
    "lake-manifest.json": "{}\n",
    "lakefile.toml": "[package]\nname = \"FirstProof\"\n",
    "statements/problem.md": "Problem statement\n",
    "FirstProof/Problem9/Statement.lean": "theorem problem9_statement : True := by\n  trivial\n",
    "FirstProof/Problem9/Support.lean": "def problem9_support : Nat := 0\n",
    "FirstProof/Problem9/Gold.lean": "theorem problem9_gold : True := by\n  trivial\n",
    "benchmark-package.json":
      options?.manifestText ?? JSON.stringify(createProblem9SourceManifestFixture(), null, 2)
  } as const;
  const promptFiles = {
    "benchmark.md": "Benchmark layer\n",
    "system.md": "System layer\n"
  } as const;

  for (const [relativePath, contents] of Object.entries(sourceFiles)) {
    if (omittedPaths.has(relativePath)) {
      continue;
    }

    const targetPath = path.join(repoRoot, "benchmarks", "firstproof", "problem9", relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, contents);
  }

  for (const [relativePath, contents] of Object.entries(promptFiles)) {
    const targetPath = path.join(repoRoot, "apps", "worker", "prompts", "problem9", relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, contents);
  }
}

function createRedeemDb(options?: {
  insertedWorkerPoolDefinitionId?: string | null;
  existingWorkerPoolDefinition?: {
    id: string;
    workerPool?: string;
    workerRuntime: "local_docker" | "modal";
  } | null;
  insertedWorkerInstanceId?: string | null;
  existingWorkerInstance?: {
    id: string;
  } | null;
}) {
  const launchRecord = createLaunchRecordRow();
  const sessionRow = {
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    id: "session-1",
    mathLaunchRecordId: launchRecord.id,
    redeemedAt: null,
    revokedAt: null,
    sessionTokenHash: sha256Text("bootstrap-token")
  };
  let leaseInsertValues: Record<string, unknown> | null = null;
  let workerInstanceInsertValues: Record<string, unknown> | null = null;

  const db = {
    select() {
      return {
        from(table: unknown) {
          if (table === mathRunnerBootstrapSessions) {
            return {
              where: async () => [sessionRow]
            };
          }

          throw new Error("Unexpected top-level select.");
        }
      };
    },
    async transaction(callback: (tx: unknown) => Promise<unknown>) {
      const tx = {
        select() {
          return {
            from(table: unknown) {
              if (table === mathLaunchRecords) {
                return {
                  where: async () => [launchRecord]
                };
              }

              if (table === workerPoolDefinitions) {
                return {
                  where() {
                    return {
                      limit: async () =>
                        options?.existingWorkerPoolDefinition
                          ? [options.existingWorkerPoolDefinition]
                          : []
                    };
                  }
                };
              }

              if (table === workerInstances) {
                return {
                  where() {
                    return {
                      limit: async () =>
                        options?.existingWorkerInstance ? [options.existingWorkerInstance] : []
                    };
                  }
                };
              }

              throw new Error("Unexpected transactional select.");
            }
          };
        },
        insert(table: unknown) {
          return {
            values(values: Record<string, unknown>) {
              if (table === workerPoolDefinitions) {
                return {
                  onConflictDoNothing() {
                    return {
                      returning: async () =>
                        options?.insertedWorkerPoolDefinitionId === null
                          ? []
                          : [
                              {
                                id:
                                  options?.insertedWorkerPoolDefinitionId ??
                                  "worker-pool-definition-1"
                              }
                            ]
                    };
                  }
                };
              }

              if (table === workerInstances) {
                workerInstanceInsertValues = values;

                return {
                  onConflictDoNothing() {
                    return {
                      returning: async () =>
                        options?.insertedWorkerInstanceId === null
                          ? []
                          : [
                              {
                                id: options?.insertedWorkerInstanceId ?? "worker-instance-1"
                              }
                            ]
                    };
                  }
                };
              }

              if (table === runs) {
                return {
                  returning: async () => [
                    {
                      id: "run-row-1",
                      sourceRunId: launchRecord.sourceRunId
                    }
                  ]
                };
              }

              if (table === jobs) {
                return {
                  returning: async () => [
                    {
                      id: "job-row-1",
                      sourceJobId: launchRecord.sourceJobId
                    }
                  ]
                };
              }

              if (table === attempts) {
                return {
                  returning: async () => [
                    {
                      id: "attempt-row-1",
                      sourceAttemptId: launchRecord.sourceAttemptId
                    }
                  ]
                };
              }

              if (table === workerJobLeases) {
                leaseInsertValues = values;

                return {
                  returning: async () => [
                    {
                      id: "lease-1"
                    }
                  ]
                };
              }

              throw new Error("Unexpected transactional insert.");
            }
          };
        },
        update(table: unknown) {
          return {
            set(values: Record<string, unknown>) {
              void table;
              void values;

              return {
                where: async () => undefined
              };
            }
          };
        }
      };

      return callback(tx);
    }
  } as never;

  return {
    db,
    getLeaseInsertValues() {
      return leaseInsertValues;
    },
    getWorkerInstanceInsertValues() {
      return workerInstanceInsertValues;
    }
  };
}

test("redeemRunnerBootstrapSession rejects non-local runner identities before touching the database", async () => {
  const service = createMathLaunchService({
    select() {
      throw new Error("redeem should fail before any database read");
    }
  } as never);

  await assert.rejects(
    () =>
      service.redeemRunnerBootstrapSession("cf8516ba-f6ea-4f61-82f0-6af1903c3223", {
        availableRunKinds: ["single_run"],
        sessionToken: "bootstrap-token",
        supportedArtifactRoles: [...requiredArtifactRoles],
        supportsOfflineBundleContract: true,
        supportsTraceUploads: true,
        workerId: "worker-1",
        workerPool: "modal-prod",
        workerRuntime: "local_docker",
        workerVersion: "worker.v1"
      }),
    (error: unknown) =>
      error instanceof MathLaunchServiceError &&
      error.code === "math_runner_bootstrap_identity_not_supported" &&
      error.statusCode === 409
  );
});

test("getQuestionLaunchView rejects launch configs whose digest does not match the current source tree", async () => {
  const service = createMathLaunchService(
    createQueuedSelectDb([
      [
        {
          benchmarkVersionId: "wrong-digest-version",
          createdAt: new Date("2026-04-20T00:00:00.000Z"),
          displayLabel: "Wrong digest version",
          launchability: "launchable",
          packageDigest: "c".repeat(64),
          packageVersion: "2026.03.15"
        }
      ]
    ]),
    {
      harnessRegistry: createHarnessRegistryStub()
    }
  );

  const view = await service.getQuestionLaunchView("problem-9");

  assert.ok(view);
  assert.equal(view.launchConfigs.length, 0);
  assert.equal(view.issues[0]?.code, "source_package_version_mismatch");
});

test("getQuestionLaunchView keeps the newest benchmark version row for the current source digest", async () => {
  const currentDigest = await computeCurrentProblem9BenchmarkDigest();
  const service = createMathLaunchService(
    createQueuedSelectDb([
      [
        {
          benchmarkVersionId: "benchmark-version-new",
          createdAt: new Date("2026-04-20T00:00:00.000Z"),
          displayLabel: "Current launchable version",
          launchability: "launchable",
          packageDigest: currentDigest,
          packageVersion: "2026.03.15"
        },
        {
          benchmarkVersionId: "benchmark-version-old",
          createdAt: new Date("2026-04-19T00:00:00.000Z"),
          displayLabel: "Older duplicate digest",
          launchability: "launchable",
          packageDigest: currentDigest,
          packageVersion: "2026.03.15"
        }
      ],
      [
        {
          benchmarkPackageDigest: currentDigest,
          benchmarkPackageVersion: "2026.03.15",
          createdAt: new Date("2026-04-20T00:00:00.000Z"),
          harnessRevision: "problem9",
          laneId: "lean422_exact",
          modelConfigId: "openai/gpt-5.4",
          modelSnapshotId: "gpt-5.4-2026-03-01",
          providerFamily: "openai",
          runMode: "bounded_agentic_attempt",
          sourceRunId: "run_template_1",
          toolProfile: "workspace_edit_limited",
          verifierVersion: "lean4.22"
        }
      ]
    ]),
    {
      harnessRegistry: createHarnessRegistryStub()
    }
  );

  const view = await service.getQuestionLaunchView("problem-9");

  assert.ok(view);
  assert.equal(view.launchConfigs.length, 1);
  assert.equal(view.launchConfigs[0]?.benchmarkVersionId, "benchmark-version-new");
});

test("getQuestionLaunchView returns a mismatch issue instead of crashing when required source files are missing", async () => {
  const originalCwd = process.cwd();
  const repoRoot = await mkdtemp(path.join(tmpdir(), "problem9-source-tree-"));

  try {
    await writeProblem9FixtureRepo(repoRoot, {
      omitPaths: ["FirstProof/Problem9/Statement.lean"]
    });

    process.chdir(repoRoot);
    const service = createMathLaunchService(
      createQueuedSelectDb([
        [
          {
            benchmarkVersionId: "benchmark-version-1",
            createdAt: new Date("2026-04-20T00:00:00.000Z"),
            displayLabel: "Launchable version",
            launchability: "launchable",
            packageDigest: "c".repeat(64),
            packageVersion: "2026.03.15"
          }
        ]
      ]),
      {
        disableProblem9SourceBundleCache: true,
        harnessRegistry: createHarnessRegistryStub()
      }
    );

    const view = await service.getQuestionLaunchView("problem-9");

    assert.ok(view);
    assert.equal(view.launchConfigs.length, 0);
    assert.equal(view.issues[0]?.code, "source_package_version_mismatch");
    assertProblem9QuestionSummary(view.question, "2026.03.15");
  } finally {
    process.chdir(originalCwd);
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("getQuestionLaunchView ignores partial cwd scaffolds that are missing the prompt package", async () => {
  const originalCwd = process.cwd();
  const repoRoot = await mkdtemp(path.join(tmpdir(), "problem9-partial-root-"));
  const currentPackageVersion = await readCurrentProblem9PackageVersion();

  try {
    await mkdir(path.join(repoRoot, "benchmarks", "firstproof", "problem9"), { recursive: true });

    process.chdir(repoRoot);
    const service = createMathLaunchService(createQueuedSelectDb([[]]), {
      disableProblem9SourceBundleCache: true,
      harnessRegistry: createHarnessRegistryStub()
    });

    const view = await service.getQuestionLaunchView("problem-9");

    assert.ok(view);
    assert.equal(view.issues[0]?.code, "no_launchable_benchmark_version");
    assertProblem9QuestionSummary(view.question, currentPackageVersion);
  } finally {
    process.chdir(originalCwd);
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("getQuestionLaunchView ignores cwd scaffolds that only contain prompts and a README", async () => {
  const originalCwd = process.cwd();
  const repoRoot = await mkdtemp(path.join(tmpdir(), "problem9-readme-only-root-"));
  const currentPackageVersion = await readCurrentProblem9PackageVersion();

  try {
    await mkdir(path.join(repoRoot, "benchmarks", "firstproof", "problem9"), { recursive: true });
    await mkdir(path.join(repoRoot, "apps", "worker", "prompts", "problem9"), { recursive: true });
    await writeFile(path.join(repoRoot, "benchmarks", "firstproof", "problem9", "README.md"), "# Problem 9\n");
    await writeFile(path.join(repoRoot, "apps", "worker", "prompts", "problem9", "benchmark.md"), "Benchmark layer\n");
    await writeFile(path.join(repoRoot, "apps", "worker", "prompts", "problem9", "system.md"), "System layer\n");

    process.chdir(repoRoot);
    const service = createMathLaunchService(createQueuedSelectDb([[]]), {
      disableProblem9SourceBundleCache: true,
      harnessRegistry: createHarnessRegistryStub()
    });

    const view = await service.getQuestionLaunchView("problem-9");

    assert.ok(view);
    assert.equal(view.issues[0]?.code, "no_launchable_benchmark_version");
    assertProblem9QuestionSummary(view.question, currentPackageVersion);
  } finally {
    process.chdir(originalCwd);
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("getQuestionLaunchView ignores cwd scaffolds that only contain prompts and one Lean file", async () => {
  const originalCwd = process.cwd();
  const repoRoot = await mkdtemp(path.join(tmpdir(), "problem9-single-lean-root-"));
  const currentPackageVersion = await readCurrentProblem9PackageVersion();

  try {
    await mkdir(path.join(repoRoot, "benchmarks", "firstproof", "problem9", "FirstProof", "Problem9"), {
      recursive: true
    });
    await mkdir(path.join(repoRoot, "apps", "worker", "prompts", "problem9"), { recursive: true });
    await writeFile(
      path.join(
        repoRoot,
        "benchmarks",
        "firstproof",
        "problem9",
        "FirstProof",
        "Problem9",
        "Statement.lean"
      ),
      "theorem scaffold_statement : True := by\n  trivial\n"
    );
    await writeFile(path.join(repoRoot, "apps", "worker", "prompts", "problem9", "benchmark.md"), "Benchmark layer\n");
    await writeFile(path.join(repoRoot, "apps", "worker", "prompts", "problem9", "system.md"), "System layer\n");

    process.chdir(repoRoot);
    const service = createMathLaunchService(createQueuedSelectDb([[]]), {
      disableProblem9SourceBundleCache: true,
      harnessRegistry: createHarnessRegistryStub()
    });

    const view = await service.getQuestionLaunchView("problem-9");

    assert.ok(view);
    assert.equal(view.issues[0]?.code, "no_launchable_benchmark_version");
    assertProblem9QuestionSummary(view.question, currentPackageVersion);
  } finally {
    process.chdir(originalCwd);
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("getQuestionLaunchView ignores cwd scaffolds that only contain three source signals", async () => {
  const originalCwd = process.cwd();
  const repoRoot = await mkdtemp(path.join(tmpdir(), "problem9-three-signals-root-"));
  const currentPackageVersion = await readCurrentProblem9PackageVersion();

  try {
    await mkdir(path.join(repoRoot, "benchmarks", "firstproof", "problem9", "FirstProof", "Problem9"), {
      recursive: true
    });
    await mkdir(path.join(repoRoot, "benchmarks", "firstproof", "problem9", "statements"), {
      recursive: true
    });
    await mkdir(path.join(repoRoot, "apps", "worker", "prompts", "problem9"), { recursive: true });
    await writeFile(
      path.join(repoRoot, "benchmarks", "firstproof", "problem9", "benchmark-package.json"),
      JSON.stringify(createProblem9SourceManifestFixture(), null, 2)
    );
    await writeFile(
      path.join(repoRoot, "benchmarks", "firstproof", "problem9", "statements", "problem.md"),
      "Problem statement\n"
    );
    await writeFile(
      path.join(
        repoRoot,
        "benchmarks",
        "firstproof",
        "problem9",
        "FirstProof",
        "Problem9",
        "Statement.lean"
      ),
      "theorem scaffold_statement : True := by\n  trivial\n"
    );
    await writeFile(path.join(repoRoot, "apps", "worker", "prompts", "problem9", "benchmark.md"), "Benchmark layer\n");
    await writeFile(path.join(repoRoot, "apps", "worker", "prompts", "problem9", "system.md"), "System layer\n");

    process.chdir(repoRoot);
    const service = createMathLaunchService(createQueuedSelectDb([[]]), {
      disableProblem9SourceBundleCache: true,
      harnessRegistry: createHarnessRegistryStub()
    });

    const view = await service.getQuestionLaunchView("problem-9");

    assert.ok(view);
    assert.equal(view.issues[0]?.code, "no_launchable_benchmark_version");
    assertProblem9QuestionSummary(view.question, currentPackageVersion);
  } finally {
    process.chdir(originalCwd);
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("getQuestionLaunchView keeps a complete current cwd authoritative over the fallback repo", async () => {
  const originalCwd = process.cwd();
  const repoRoot = await mkdtemp(path.join(tmpdir(), "problem9-complete-cwd-root-"));

  try {
    await writeProblem9FixtureRepo(repoRoot, {
      manifestText: JSON.stringify(
        {
          ...createProblem9SourceManifestFixture(),
          packageVersion: "2099.01.01"
        },
        null,
        2
      )
    });

    process.chdir(repoRoot);
    const service = createMathLaunchService(createQueuedSelectDb([[]]), {
      disableProblem9SourceBundleCache: true,
      harnessRegistry: createHarnessRegistryStub()
    });

    const view = await service.getQuestionLaunchView("problem-9");

    assert.ok(view);
    assert.equal(view.issues[0]?.code, "no_launchable_benchmark_version");
    assertProblem9QuestionSummary(view.question, "2099.01.01");
  } finally {
    process.chdir(originalCwd);
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("getQuestionLaunchView keeps the current cwd authoritative when its manifest is missing", async () => {
  const originalCwd = process.cwd();
  const repoRoot = await mkdtemp(path.join(tmpdir(), "problem9-cwd-missing-manifest-"));

  try {
    await writeProblem9FixtureRepo(repoRoot, {
      omitPaths: ["benchmark-package.json"]
    });

    process.chdir(repoRoot);
    const service = createMathLaunchService(
      createQueuedSelectDb([
        [
          {
            benchmarkVersionId: "benchmark-version-1",
            createdAt: new Date("2026-04-20T00:00:00.000Z"),
            displayLabel: "Launchable version",
            launchability: "launchable",
            packageDigest: "c".repeat(64),
            packageVersion: "2026.03.15"
          }
        ]
      ]),
      {
        disableProblem9SourceBundleCache: true,
        harnessRegistry: createHarnessRegistryStub()
      }
    );

    const view = await service.getQuestionLaunchView("problem-9");

    assert.ok(view);
    assert.equal(view.launchConfigs.length, 0);
    assert.equal(view.issues[0]?.code, "source_package_version_mismatch");
    assertProblem9QuestionSummary(view.question, "invalid-manifest");
  } finally {
    process.chdir(originalCwd);
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("getQuestionLaunchView bypasses a warmed source-bundle cache when cache is disabled", async () => {
  const originalCwd = process.cwd();
  const repoRoot = await mkdtemp(path.join(tmpdir(), "problem9-cache-bypass-"));

  try {
    const cachedService = createMathLaunchService(createQueuedSelectDb([[]]), {
      harnessRegistry: createHarnessRegistryStub()
    });
    const cachedView = await cachedService.getQuestionLaunchView("problem-9");
    assert.ok(cachedView);

    await writeProblem9FixtureRepo(repoRoot, {
      manifestText: "{ invalid json"
    });

    process.chdir(repoRoot);
    const uncachedService = createMathLaunchService(
      createQueuedSelectDb([
        [
          {
            benchmarkVersionId: "benchmark-version-1",
            createdAt: new Date("2026-04-20T00:00:00.000Z"),
            displayLabel: "Launchable version",
            launchability: "launchable",
            packageDigest: "c".repeat(64),
            packageVersion: "2026.03.15"
          }
        ]
      ]),
      {
        disableProblem9SourceBundleCache: true,
        harnessRegistry: createHarnessRegistryStub()
      }
    );

    const uncachedView = await uncachedService.getQuestionLaunchView("problem-9");

    assert.ok(uncachedView);
    assert.equal(uncachedView.launchConfigs.length, 0);
    assert.equal(uncachedView.issues[0]?.code, "source_package_version_mismatch");
    assertProblem9QuestionSummary(uncachedView.question, "invalid-manifest");
  } finally {
    process.chdir(originalCwd);
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("getQuestionLaunchView returns a mismatch issue instead of crashing when benchmark-package.json is missing", async () => {
  const originalCwd = process.cwd();
  const repoRoot = await mkdtemp(path.join(tmpdir(), "problem9-missing-manifest-"));

  try {
    await writeProblem9FixtureRepo(repoRoot, {
      omitPaths: ["benchmark-package.json"]
    });

    process.chdir(repoRoot);
    const service = createMathLaunchService(
      createQueuedSelectDb([
        [
          {
            benchmarkVersionId: "benchmark-version-1",
            createdAt: new Date("2026-04-20T00:00:00.000Z"),
            displayLabel: "Launchable version",
            launchability: "launchable",
            packageDigest: "c".repeat(64),
            packageVersion: "2026.03.15"
          }
        ]
      ]),
      {
        disableProblem9SourceBundleCache: true,
        harnessRegistry: createHarnessRegistryStub()
      }
    );

    const view = await service.getQuestionLaunchView("problem-9");

    assert.ok(view);
    assert.equal(view.launchConfigs.length, 0);
    assert.equal(view.issues[0]?.code, "source_package_version_mismatch");
    assertProblem9QuestionSummary(view.question, "invalid-manifest");
  } finally {
    process.chdir(originalCwd);
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("getQuestionLaunchView returns a mismatch issue instead of crashing when the benchmark manifest is malformed", async () => {
  const originalCwd = process.cwd();
  const repoRoot = await mkdtemp(path.join(tmpdir(), "problem9-invalid-manifest-"));

  try {
    await writeProblem9FixtureRepo(repoRoot, {
      manifestText: "{ invalid json"
    });

    process.chdir(repoRoot);
    const service = createMathLaunchService(
      createQueuedSelectDb([
        [
          {
            benchmarkVersionId: "benchmark-version-1",
            createdAt: new Date("2026-04-20T00:00:00.000Z"),
            displayLabel: "Launchable version",
            launchability: "launchable",
            packageDigest: "c".repeat(64),
            packageVersion: "2026.03.15"
          }
        ]
      ]),
      {
        disableProblem9SourceBundleCache: true,
        harnessRegistry: createHarnessRegistryStub()
      }
    );

    const view = await service.getQuestionLaunchView("problem-9");

    assert.ok(view);
    assert.equal(view.launchConfigs.length, 0);
    assert.equal(view.issues[0]?.code, "source_package_version_mismatch");
    assertProblem9QuestionSummary(view.question, "invalid-manifest");
  } finally {
    process.chdir(originalCwd);
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("getQuestionLaunchView returns an invalid-manifest summary when manifest JSON fails schema validation", async () => {
  const originalCwd = process.cwd();
  const repoRoot = await mkdtemp(path.join(tmpdir(), "problem9-schema-invalid-manifest-"));

  try {
    await writeProblem9FixtureRepo(repoRoot, {
      manifestText: JSON.stringify({
        ...createProblem9SourceManifestFixture(),
        sourceSchemaVersion: 42
      })
    });

    process.chdir(repoRoot);
    const service = createMathLaunchService(
      createQueuedSelectDb([
        [
          {
            benchmarkVersionId: "benchmark-version-1",
            createdAt: new Date("2026-04-20T00:00:00.000Z"),
            displayLabel: "Launchable version",
            launchability: "launchable",
            packageDigest: "c".repeat(64),
            packageVersion: "2026.03.15"
          }
        ]
      ]),
      {
        disableProblem9SourceBundleCache: true,
        harnessRegistry: createHarnessRegistryStub()
      }
    );

    const view = await service.getQuestionLaunchView("problem-9");

    assert.ok(view);
    assert.equal(view.launchConfigs.length, 0);
    assert.equal(view.issues[0]?.code, "source_package_version_mismatch");
    assertProblem9QuestionSummary(view.question, "invalid-manifest");
  } finally {
    process.chdir(originalCwd);
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("redeemRunnerBootstrapSession rejects worker pools that already belong to a different runtime", async () => {
  const redeemDb = createRedeemDb({
    existingWorkerPoolDefinition: {
      id: "worker-pool-definition-1",
      workerRuntime: "modal"
    },
    insertedWorkerPoolDefinitionId: null
  });
  const service = createMathLaunchService(redeemDb.db);

  await assert.rejects(
    () =>
      service.redeemRunnerBootstrapSession("cf8516ba-f6ea-4f61-82f0-6af1903c3223", {
        availableRunKinds: ["single_run"],
        sessionToken: "bootstrap-token",
        supportedArtifactRoles: [...requiredArtifactRoles],
        supportsOfflineBundleContract: true,
        supportsTraceUploads: true,
        workerId: "worker-1",
        workerPool: "local-devbox",
        workerRuntime: "local_docker",
        workerVersion: "worker.v1"
      }),
    (error: unknown) =>
      error instanceof MathLaunchServiceError &&
      error.code === "math_runner_bootstrap_identity_not_supported" &&
      error.statusCode === 409
  );

  assert.equal(redeemDb.getLeaseInsertValues(), null);
});

test("redeemRunnerBootstrapSession binds the issued lease to a durable worker instance", async () => {
  const redeemDb = createRedeemDb();
  const service = createMathLaunchService(redeemDb.db);

  const response = await service.redeemRunnerBootstrapSession(
    "cf8516ba-f6ea-4f61-82f0-6af1903c3223",
    {
      availableRunKinds: ["single_run"],
      sessionToken: "bootstrap-token",
      supportedArtifactRoles: [...requiredArtifactRoles],
      supportsOfflineBundleContract: true,
      supportsTraceUploads: true,
      workerId: "worker-1",
      workerPool: "local-devbox",
      workerRuntime: "local_docker",
      workerVersion: "worker.v1"
    }
  );

  assert.equal(response.launchId, "launch-1");
  assert.equal(redeemDb.getWorkerInstanceInsertValues()?.workerId, "math-local-bootstrap:session-1");
  assert.equal(redeemDb.getWorkerInstanceInsertValues()?.workerPoolDefinitionId, "worker-pool-definition-1");
  assert.equal(redeemDb.getLeaseInsertValues()?.workerInstanceId, "worker-instance-1");
});

test("redeemRunnerBootstrapSession reuses the server-owned durable worker instance key after an insert race", async () => {
  const redeemDb = createRedeemDb({
    existingWorkerInstance: {
      id: "worker-instance-existing"
    },
    insertedWorkerInstanceId: null
  });
  const service = createMathLaunchService(redeemDb.db);

  const response = await service.redeemRunnerBootstrapSession(
    "cf8516ba-f6ea-4f61-82f0-6af1903c3223",
    {
      availableRunKinds: ["single_run"],
      sessionToken: "bootstrap-token",
      supportedArtifactRoles: [...requiredArtifactRoles],
      supportsOfflineBundleContract: true,
      supportsTraceUploads: true,
      workerId: "worker-1",
      workerPool: "local-devbox",
      workerRuntime: "local_docker",
      workerVersion: "worker.v1"
    }
  );

  assert.equal(response.launchId, "launch-1");
  assert.equal(redeemDb.getWorkerInstanceInsertValues()?.workerId, "math-local-bootstrap:session-1");
  assert.equal(redeemDb.getLeaseInsertValues()?.workerInstanceId, "worker-instance-existing");
});

test("attachOfflineIngestToLaunch returns a conflict when a concurrent linker wins first", async () => {
  const service = createMathLaunchService({
    select(selection: unknown) {
      void selection;
      return {
        from() {
          return {
            where: async () => [
              {
                id: "launch-1",
                launchMode: "offline_export",
                runId: null,
                sourceRunId: "run_export_1"
              }
            ]
          };
        }
      };
    },
    update(table: unknown) {
      void table;
      return {
        set(values: unknown) {
          void values;
          return {
            where(predicate: unknown) {
              void predicate;
              return {
                returning: async () => []
              };
            }
          };
        }
      };
    }
  } as never);

  await assert.rejects(
    () =>
      service.attachOfflineIngestToLaunch({
        mathLaunchId: "launch-1",
        runRowId: "run-row-1",
        sourceRunId: "run_export_1"
      }),
    (error: unknown) =>
      error instanceof MathLaunchServiceError &&
      error.code === "math_launch_already_linked" &&
      error.statusCode === 409
  );
});
