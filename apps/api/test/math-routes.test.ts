import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import {
  mathLaunchContract,
  type MathQuestionLaunchViewResponse,
  type MathRunnerBootstrapSessionRedeemResponse
} from "@paretoproof/shared";
import { registerMathRoutes } from "../src/routes/math.ts";

function createRequireAccessStub(roles: Array<"admin" | "collaborator" | "helper">) {
  return (requiredAccess: string) =>
    (
      request: Record<string, unknown>,
      reply: {
        code: (statusCode: number) => { send: (payload: unknown) => void };
      },
      done: () => void
    ) => {
      request.accessIdentity = {
        email: "person@example.com",
        issuer: "https://paretoproof.cloudflareaccess.com",
        provider: "cloudflare_google",
        subject: "subject-1"
      };
      request.accessRbacContext = {
        email: "person@example.com",
        identityId: "identity-1",
        role: roles[0] ?? null,
        status: "approved",
        subject: "subject-1",
        userId: "user-1"
      };

      const allow =
        requiredAccess === "authenticated_access_identity" ||
        (requiredAccess === "approved_helper_or_higher" && roles.length > 0) ||
        (requiredAccess === "approved_collaborator_or_higher" &&
          (roles.includes("collaborator") || roles.includes("admin"))) ||
        (requiredAccess === "admin_only" && roles.includes("admin"));

      if (!allow) {
        reply.code(403).send({
          error: "forbidden"
        });
        return;
      }

      done();
    };
}

function buildLaunchView(): MathQuestionLaunchViewResponse {
  return {
    benchmarkVersions: [
      {
        benchmarkVersionId: "firstproof-problem9-v1",
        displayLabel: "Problem 9 v1",
        launchability: "launchable",
        packageDigest: "a".repeat(64),
        packageVersion: "2026.03.15"
      }
    ],
    issues: [],
    launchConfigs: [
      {
        benchmarkVersionId: "firstproof-problem9-v1",
        hostedSupported: true,
        id: "launch-config-1",
        laneId: "lean422_exact",
        localSupportedAuthModes: ["trusted_local_user", "machine_api_key"],
        modelConfigId: "openai/gpt-5.4",
        modelSnapshotId: "gpt-5.4-2026-03-01",
        offlineExportSupportedAuthModes: ["trusted_local_user", "machine_api_key"],
        providerFamily: "openai",
        runMode: "bounded_agentic_attempt",
        templateSourceRunId: "run_template_1",
        toolProfile: "workspace_edit_limited"
      }
    ],
    portalRunPathPattern: "/runs/:runId",
    question: {
      benchmarkFamily: "firstproof",
      benchmarkItemId: "Problem9",
      benchmarkPackageId: "firstproof/Problem9",
      label: "Problem 9",
      questionId: "problem-9",
      routePath: "/questions/problem-9",
      sourcePackageVersion: "2026.03.15"
    }
  };
}

function buildRedeemResponse(): MathRunnerBootstrapSessionRedeemResponse {
  return {
    launchId: "cf8516ba-f6ea-4f61-82f0-6af1903c3223",
    workerJob: {
      attemptId: "attempt_1",
      heartbeatIntervalSeconds: 60,
      heartbeatTimeoutSeconds: 180,
      jobId: "job_1",
      jobToken: "job-token",
      jobTokenExpiresAt: "2026-04-19T19:00:00.000Z",
      jobTokenScopes: [
        "heartbeat",
        "event_append",
        "artifact_manifest_write",
        "verifier_verdict_write",
        "result_finalize",
        "failure_finalize"
      ],
      leaseExpiresAt: "2026-04-19T19:00:00.000Z",
      leaseId: "lease_1",
      offlineBundleCompatible: true,
      requiredArtifactRoles: [
        "package_reference",
        "prompt_package",
        "candidate_source",
        "verdict_record",
        "compiler_output",
        "compiler_diagnostics",
        "verifier_output",
        "environment_snapshot"
      ],
      runBundleSchemaVersion: "1",
      runId: "run_1",
      target: {
        authMode: "trusted_local_user",
        benchmarkItemId: "Problem9",
        benchmarkPackageDigest: "a".repeat(64),
        benchmarkPackageId: "firstproof/Problem9",
        benchmarkPackageVersion: "2026.03.15",
        harnessRevision: "problem9",
        laneId: "lean422_exact",
        modelConfigId: "openai/gpt-5.4",
        modelSnapshotId: "gpt-5.4-2026-03-01",
        promptPackageDigest: "b".repeat(64),
        promptProtocolVersion: "problem9-prompt-protocol.v1",
        providerFamily: "openai",
        runKind: "single_run",
        runMode: "bounded_agentic_attempt",
        toolProfile: "workspace_edit_limited"
      }
    }
  };
}

test("GET /math/questions/:questionId/launch returns a contract-valid launch read model", async (t) => {
  const app = Fastify();
  registerMathRoutes(app, {} as never, createRequireAccessStub(["helper"]) as never, {
    mathLaunchService: {
      attachOfflineIngestToLaunch: async () => undefined,
      createHostedLaunch: async () => {
        throw new Error("not expected");
      },
      createLocalBootstrap: async () => {
        throw new Error("not expected");
      },
      createOfflineExport: async () => {
        throw new Error("not expected");
      },
      getQuestionLaunchView: async () => buildLaunchView(),
      redeemRunnerBootstrapSession: async () => {
        throw new Error("not expected");
      }
    } as never
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/math/questions/problem-9/launch"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    mathLaunchContract.questionLaunchViewResponse.parse(response.json()),
    buildLaunchView()
  );
});

test("POST /math/questions/:questionId/launches/hosted requires approved helper access", async (t) => {
  const app = Fastify();
  registerMathRoutes(app, {} as never, createRequireAccessStub([]) as never, {
    mathLaunchService: {
      attachOfflineIngestToLaunch: async () => undefined,
      createHostedLaunch: async () => {
        throw new Error("not expected");
      },
      createLocalBootstrap: async () => {
        throw new Error("not expected");
      },
      createOfflineExport: async () => {
        throw new Error("not expected");
      },
      getQuestionLaunchView: async () => buildLaunchView(),
      redeemRunnerBootstrapSession: async () => buildRedeemResponse()
    } as never
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    payload: {
      launchConfigId: "launch-config-1"
    },
    url: "/math/questions/problem-9/launches/hosted"
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), {
    error: "forbidden"
  });
});

test("POST /internal/math/runner-bootstrap-sessions/:bootstrapSessionId/redeem returns the leased worker job payload", async (t) => {
  const app = Fastify();
  let receivedBootstrapSessionId: string | null = null;
  let receivedRedeemInput: Record<string, unknown> | null = null;
  registerMathRoutes(app, {} as never, createRequireAccessStub([]) as never, {
    mathLaunchService: {
      attachOfflineIngestToLaunch: async () => undefined,
      createHostedLaunch: async () => {
        throw new Error("not expected");
      },
      createLocalBootstrap: async () => {
        throw new Error("not expected");
      },
      createOfflineExport: async () => {
        throw new Error("not expected");
      },
      getQuestionLaunchView: async () => buildLaunchView(),
      redeemRunnerBootstrapSession: async (bootstrapSessionId, input) => {
        receivedBootstrapSessionId = bootstrapSessionId;
        receivedRedeemInput = input as unknown as Record<string, unknown>;
        return buildRedeemResponse();
      }
    } as never
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    headers: {
      authorization: "Bearer bootstrap-token"
    },
    payload: {
      availableRunKinds: ["single_run"],
      supportedArtifactRoles: [
        "package_reference",
        "prompt_package",
        "candidate_source",
        "verdict_record",
        "compiler_output",
        "compiler_diagnostics",
        "verifier_output",
        "environment_snapshot"
      ],
      supportsOfflineBundleContract: true,
      supportsTraceUploads: true,
      workerId: "worker-1",
      workerPool: "local-devbox",
      workerRuntime: "local_docker",
      workerVersion: "worker.v1"
    },
    url: "/internal/math/runner-bootstrap-sessions/cf8516ba-f6ea-4f61-82f0-6af1903c3223/redeem"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    receivedBootstrapSessionId,
    "cf8516ba-f6ea-4f61-82f0-6af1903c3223"
  );
  assert.equal(receivedRedeemInput?.sessionToken, "bootstrap-token");
  assert.equal(receivedRedeemInput?.workerPool, "local-devbox");
  assert.deepEqual(
    mathLaunchContract.runnerBootstrapSessionRedeemResponse.parse(response.json()),
    buildRedeemResponse()
  );
});

test(
  "POST /internal/math/runner-bootstrap-sessions/:bootstrapSessionId/redeem requires a bearer bootstrap token",
  async (t) => {
    const app = Fastify();
    registerMathRoutes(app, {} as never, createRequireAccessStub([]) as never, {
      mathLaunchService: {
        attachOfflineIngestToLaunch: async () => undefined,
        createHostedLaunch: async () => {
          throw new Error("not expected");
        },
        createLocalBootstrap: async () => {
          throw new Error("not expected");
        },
        createOfflineExport: async () => {
          throw new Error("not expected");
        },
        getQuestionLaunchView: async () => buildLaunchView(),
        redeemRunnerBootstrapSession: async () => {
          throw new Error("not expected");
        }
      } as never
    });

    t.after(async () => {
      await app.close();
    });

    const response = await app.inject({
      method: "POST",
      payload: {
        availableRunKinds: ["single_run"],
        supportedArtifactRoles: [
          "package_reference",
          "prompt_package",
          "candidate_source",
          "verdict_record",
          "compiler_output",
          "compiler_diagnostics",
          "verifier_output",
          "environment_snapshot"
        ],
        supportsOfflineBundleContract: true,
        supportsTraceUploads: true,
        workerId: "worker-1",
        workerPool: "local-devbox",
        workerRuntime: "local_docker",
        workerVersion: "worker.v1"
      },
      url: "/internal/math/runner-bootstrap-sessions/cf8516ba-f6ea-4f61-82f0-6af1903c3223/redeem"
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      error: "invalid_math_runner_bootstrap_token"
    });
  }
);

test(
  "POST /internal/math/runner-bootstrap-sessions/:bootstrapSessionId/redeem rejects browser-origin requests",
  async (t) => {
    const app = Fastify();
    registerMathRoutes(app, {} as never, createRequireAccessStub([]) as never, {
      mathLaunchService: {
        attachOfflineIngestToLaunch: async () => undefined,
        createHostedLaunch: async () => {
          throw new Error("not expected");
        },
        createLocalBootstrap: async () => {
          throw new Error("not expected");
        },
        createOfflineExport: async () => {
          throw new Error("not expected");
        },
        getQuestionLaunchView: async () => buildLaunchView(),
        redeemRunnerBootstrapSession: async () => {
          throw new Error("not expected");
        }
      } as never
    });

    t.after(async () => {
      await app.close();
    });

    const response = await app.inject({
      method: "POST",
      headers: {
        authorization: "Bearer bootstrap-token",
        origin: "https://math.paretoproof.com"
      },
      payload: {
        availableRunKinds: ["single_run"],
        supportedArtifactRoles: [
          "package_reference",
          "prompt_package",
          "candidate_source",
          "verdict_record",
          "compiler_output",
          "compiler_diagnostics",
          "verifier_output",
          "environment_snapshot"
        ],
        supportsOfflineBundleContract: true,
        supportsTraceUploads: true,
        workerId: "worker-1",
        workerPool: "local-devbox",
        workerRuntime: "local_docker",
        workerVersion: "worker.v1"
      },
      url: "/internal/math/runner-bootstrap-sessions/cf8516ba-f6ea-4f61-82f0-6af1903c3223/redeem"
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), {
      error: "math_runner_bootstrap_origin_not_allowed"
    });
  }
);

test(
  "POST /internal/math/runner-bootstrap-sessions/:bootstrapSessionId/redeem rejects hosted worker identities in the payload",
  async (t) => {
    const app = Fastify();
    registerMathRoutes(app, {} as never, createRequireAccessStub([]) as never, {
      mathLaunchService: {
        attachOfflineIngestToLaunch: async () => undefined,
        createHostedLaunch: async () => {
          throw new Error("not expected");
        },
        createLocalBootstrap: async () => {
          throw new Error("not expected");
        },
        createOfflineExport: async () => {
          throw new Error("not expected");
        },
        getQuestionLaunchView: async () => buildLaunchView(),
        redeemRunnerBootstrapSession: async () => {
          throw new Error("not expected");
        }
      } as never
    });

    t.after(async () => {
      await app.close();
    });

    const response = await app.inject({
      method: "POST",
      headers: {
        authorization: "Bearer bootstrap-token"
      },
      payload: {
        availableRunKinds: ["single_run"],
        supportedArtifactRoles: [
          "package_reference",
          "prompt_package",
          "candidate_source",
          "verdict_record",
          "compiler_output",
          "compiler_diagnostics",
          "verifier_output",
          "environment_snapshot"
        ],
        supportsOfflineBundleContract: true,
        supportsTraceUploads: true,
        workerId: "worker-1",
        workerPool: "modal-prod",
        workerRuntime: "modal",
        workerVersion: "worker.v1"
      },
      url: "/internal/math/runner-bootstrap-sessions/cf8516ba-f6ea-4f61-82f0-6af1903c3223/redeem"
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, "invalid_math_runner_bootstrap_payload");
    assert.equal(response.json().issues?.[0]?.path, "workerPool");
    assert.equal(response.json().issues?.[1]?.path, "workerRuntime");
  }
);

test(
  "POST /internal/math/runner-bootstrap-sessions/:bootstrapSessionId/redeem rejects the obsolete body sessionToken field",
  async (t) => {
    const app = Fastify();
    registerMathRoutes(app, {} as never, createRequireAccessStub([]) as never, {
      mathLaunchService: {
        attachOfflineIngestToLaunch: async () => undefined,
        createHostedLaunch: async () => {
          throw new Error("not expected");
        },
        createLocalBootstrap: async () => {
          throw new Error("not expected");
        },
        createOfflineExport: async () => {
          throw new Error("not expected");
        },
        getQuestionLaunchView: async () => buildLaunchView(),
        redeemRunnerBootstrapSession: async () => {
          throw new Error("not expected");
        }
      } as never
    });

    t.after(async () => {
      await app.close();
    });

    const response = await app.inject({
      method: "POST",
      headers: {
        authorization: "Bearer bootstrap-token"
      },
      payload: {
        availableRunKinds: ["single_run"],
        sessionToken: "stale-body-token",
        supportedArtifactRoles: [
          "package_reference",
          "prompt_package",
          "candidate_source",
          "verdict_record",
          "compiler_output",
          "compiler_diagnostics",
          "verifier_output",
          "environment_snapshot"
        ],
        supportsOfflineBundleContract: true,
        supportsTraceUploads: true,
        workerId: "worker-1",
        workerPool: "local-devbox",
        workerRuntime: "local_docker",
        workerVersion: "worker.v1"
      },
      url: "/internal/math/runner-bootstrap-sessions/cf8516ba-f6ea-4f61-82f0-6af1903c3223/redeem"
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, "invalid_math_runner_bootstrap_payload");
    assert.match(response.json().issues?.[0]?.message ?? "", /sessionToken/);
  }
);
