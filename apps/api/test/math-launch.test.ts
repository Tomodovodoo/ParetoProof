import assert from "node:assert/strict";
import test from "node:test";
import { createMathLaunchService, MathLaunchServiceError } from "../src/lib/math-launch.ts";

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
