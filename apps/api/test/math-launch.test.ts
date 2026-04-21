import assert from "node:assert/strict";
import test from "node:test";
import { createMathLaunchService, MathLaunchServiceError } from "../src/lib/math-launch.ts";

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
        workerRuntime: "local_docker",
        workerVersion: "worker.v1"
      }),
    (error: unknown) =>
      error instanceof MathLaunchServiceError &&
      error.code === "math_runner_bootstrap_identity_not_supported" &&
      error.statusCode === 409
  );
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
