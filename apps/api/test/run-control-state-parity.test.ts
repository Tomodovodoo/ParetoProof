import assert from "node:assert/strict";
import test from "node:test";
import {
  attemptLifecycleCatalog,
  attemptLifecycleStates,
  jobLifecycleCatalog,
  jobLifecycleStates,
  offlineIngestAttemptLifecycleStates,
  offlineIngestJobLifecycleStates,
  offlineIngestRunLifecycleStates,
  portalRunAttemptSummarySchema,
  problem9OfflineIngestResponseSchema,
  runKindCatalog,
  runKindValues,
  runLifecycleCatalog,
  runLifecycleStates,
  workerResultAttemptLifecycleStates,
  workerResultJobLifecycleStates,
  workerResultMessageResponseSchema,
  workerResultRunLifecycleStates,
  workerTerminalFailureAttemptLifecycleStates,
  workerTerminalFailureJobLifecycleStates,
  workerTerminalFailureResponseSchema,
  workerTerminalFailureRunLifecycleStates
} from "@paretoproof/shared";
import {
  attemptStateEnum,
  jobStateEnum,
  runKindEnum,
  runStateEnum
} from "../src/db/schema.ts";

test("shared lifecycle catalogs, response schemas, and API Postgres enums stay in parity", () => {
  assert.deepEqual(runKindCatalog.map((entry) => entry.id), [...runKindValues]);
  assert.deepEqual(runLifecycleCatalog.map((entry) => entry.id), [...runLifecycleStates]);
  assert.deepEqual(jobLifecycleCatalog.map((entry) => entry.id), [...jobLifecycleStates]);
  assert.deepEqual(attemptLifecycleCatalog.map((entry) => entry.id), [...attemptLifecycleStates]);

  for (const entry of runLifecycleCatalog) {
    assert.ok(
      entry.allowedNextStates.every((state) => runLifecycleStates.includes(state)),
      `run lifecycle drift: ${entry.id}`
    );
  }

  for (const entry of jobLifecycleCatalog) {
    assert.ok(
      entry.allowedNextStates.every((state) => jobLifecycleStates.includes(state)),
      `job lifecycle drift: ${entry.id}`
    );
  }

  for (const entry of attemptLifecycleCatalog) {
    assert.ok(
      entry.allowedNextStates.every((state) => attemptLifecycleStates.includes(state)),
      `attempt lifecycle drift: ${entry.id}`
    );
  }

  assert.deepEqual(runKindEnum.enumValues, [...runKindValues]);
  assert.deepEqual(runStateEnum.enumValues, [...runLifecycleStates]);
  assert.deepEqual(jobStateEnum.enumValues, [...jobLifecycleStates]);
  assert.deepEqual(attemptStateEnum.enumValues, [...attemptLifecycleStates]);

  assert.deepEqual(
    portalRunAttemptSummarySchema.shape.state.options,
    [...attemptLifecycleStates]
  );

  assert.deepEqual(
    problem9OfflineIngestResponseSchema.shape.attempt.shape.state.options,
    [...offlineIngestAttemptLifecycleStates]
  );
  assert.deepEqual(
    problem9OfflineIngestResponseSchema.shape.job.shape.state.options,
    [...offlineIngestJobLifecycleStates]
  );
  assert.deepEqual(
    problem9OfflineIngestResponseSchema.shape.run.shape.state.options,
    [...offlineIngestRunLifecycleStates]
  );

  assert.deepEqual(
    workerResultMessageResponseSchema.shape.attemptState.options,
    [...workerResultAttemptLifecycleStates]
  );
  assert.deepEqual(
    workerResultMessageResponseSchema.shape.jobState.options,
    [...workerResultJobLifecycleStates]
  );
  assert.deepEqual(
    workerResultMessageResponseSchema.shape.runState.options,
    [...workerResultRunLifecycleStates]
  );

  assert.deepEqual(
    workerTerminalFailureResponseSchema.shape.attemptState.options,
    [...workerTerminalFailureAttemptLifecycleStates]
  );
  assert.deepEqual(
    workerTerminalFailureResponseSchema.shape.jobState.options,
    [...workerTerminalFailureJobLifecycleStates]
  );
  assert.deepEqual(
    workerTerminalFailureResponseSchema.shape.runState.options,
    [...workerTerminalFailureRunLifecycleStates]
  );
});
