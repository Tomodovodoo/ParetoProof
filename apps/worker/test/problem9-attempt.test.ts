import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { problem9AuthModes } from "../src/lib/problem9-auth.ts";
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

test("run-problem9-attempt rejects unsupported auth-mode values at the CLI boundary", () => {
  const workerEntryPoint = path.resolve("src/index.ts");
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      workerEntryPoint,
      "run-problem9-attempt",
      "--benchmark-package-root",
      "ignored-benchmark",
      "--prompt-package-root",
      "ignored-prompt",
      "--workspace",
      "ignored-workspace",
      "--output",
      "ignored-output",
      "--auth-mode",
      "trusted_local_usr"
    ],
    {
      cwd: path.resolve("."),
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    new RegExp(
      `Unsupported --auth-mode value "trusted_local_usr"\\. Expected one of: ${problem9AuthModes.join(", ")}\\.`
    )
  );
  assert.equal(result.stdout, "");
});
