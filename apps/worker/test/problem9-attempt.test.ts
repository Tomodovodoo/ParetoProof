import assert from "node:assert/strict";
import test from "node:test";
import { resolveProblem9ModelSnapshotId } from "../src/lib/problem9-attempt.ts";

test("resolveProblem9ModelSnapshotId uses the selected local stub scenario by default", () => {
  assert.equal(
    resolveProblem9ModelSnapshotId({
      authMode: "local_stub",
      fallbackModelConfigId: "prompt/default-model",
      stubScenario: "exact_canonical"
    }),
    "local_stub/problem9_exact_canonical.v1"
  );

  assert.equal(
    resolveProblem9ModelSnapshotId({
      authMode: "local_stub",
      fallbackModelConfigId: "prompt/default-model",
      stubScenario: "compile_failure"
    }),
    "local_stub/problem9_compile_failure.v1"
  );
});

test("resolveProblem9ModelSnapshotId preserves explicit overrides and non-stub provider defaults", () => {
  assert.equal(
    resolveProblem9ModelSnapshotId({
      authMode: "local_stub",
      fallbackModelConfigId: "prompt/default-model",
      overrideModelSnapshotId: "override/snapshot.v1",
      stubScenario: "compile_failure"
    }),
    "override/snapshot.v1"
  );

  assert.equal(
    resolveProblem9ModelSnapshotId({
      authMode: "machine_api_key",
      fallbackModelConfigId: "prompt/default-model",
      providerModel: "provider/selected-model",
      stubScenario: "exact_canonical"
    }),
    "provider/selected-model"
  );

  assert.equal(
    resolveProblem9ModelSnapshotId({
      authMode: "machine_api_key",
      fallbackModelConfigId: "prompt/default-model",
      stubScenario: "exact_canonical"
    }),
    "prompt/default-model"
  );
});
