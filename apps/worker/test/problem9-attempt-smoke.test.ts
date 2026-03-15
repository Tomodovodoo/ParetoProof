import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runProblem9Attempt } from "../src/lib/problem9-attempt.ts";
import { materializeProblem9Package } from "../src/lib/problem9-package.ts";
import {
  getDefaultProblem9PromptPackageOptions,
  materializeProblem9PromptPackage
} from "../src/lib/problem9-prompt-package.ts";

test(
  "problem9 attempt smoke completes a deterministic local-stub pass flow",
  { timeout: 60000 },
  async () => {
    const fixture = await createAttemptFixture();

    try {
      const result = await runProblem9Attempt({
        authMode: "local_stub",
        benchmarkPackageRoot: fixture.benchmarkPackageRoot,
        outputRoot: path.join(fixture.tempRoot, "attempt-pass-output"),
        promptPackageRoot: fixture.promptPackageRoot,
        stubScenario: "exact_canonical",
        workspaceRoot: path.join(fixture.tempRoot, "attempt-pass-workspace")
      });

      assert.equal(result.authMode, "local_stub");
      assert.equal(result.result, "pass");
      assert.equal(result.stopReason, "verification_passed");
      assert.equal(result.providerTurnsUsed, 1);
      assert.equal(result.compileRepairCount, 0);
      assert.equal(result.verifierRepairCount, 0);
      assert.match(result.bundleDigest, /^[a-f0-9]{64}$/);

      const runBundle = JSON.parse(
        await readFile(path.join(result.outputRoot, "run-bundle.json"), "utf8")
      ) as Record<string, unknown>;
      assert.equal(runBundle.status, "success");
      assert.equal(runBundle.stopReason, "verification_passed");

      const verdict = JSON.parse(
        await readFile(path.join(result.outputRoot, "verification", "verdict.json"), "utf8")
      ) as Record<string, unknown>;
      assert.equal(verdict.result, "pass");
      assert.equal(verdict.semanticEquality, "matched");
      assert.equal(verdict.axiomCheck, "passed");
    } finally {
      await rm(fixture.tempRoot, { force: true, recursive: true });
    }
  }
);

test(
  "problem9 attempt smoke emits a deterministic compile-failure bundle for local-stub failures",
  { timeout: 60000 },
  async () => {
    const fixture = await createAttemptFixture();

    try {
      const result = await runProblem9Attempt({
        authMode: "local_stub",
        benchmarkPackageRoot: fixture.benchmarkPackageRoot,
        outputRoot: path.join(fixture.tempRoot, "attempt-fail-output"),
        promptPackageRoot: fixture.promptPackageRoot,
        stubScenario: "compile_failure",
        workspaceRoot: path.join(fixture.tempRoot, "attempt-fail-workspace")
      });

      assert.equal(result.authMode, "local_stub");
      assert.equal(result.result, "fail");
      assert.equal(result.stopReason, "compile_failed");
      assert.equal(result.providerTurnsUsed, 4);
      assert.equal(result.compileRepairCount, 3);
      assert.equal(result.verifierRepairCount, 0);
      assert.match(result.bundleDigest, /^[a-f0-9]{64}$/);

      const runBundle = JSON.parse(
        await readFile(path.join(result.outputRoot, "run-bundle.json"), "utf8")
      ) as Record<string, unknown>;
      assert.equal(runBundle.status, "failure");
      assert.equal(runBundle.stopReason, "compile_failed");

      const verdict = JSON.parse(
        await readFile(path.join(result.outputRoot, "verification", "verdict.json"), "utf8")
      ) as Record<string, unknown>;
      assert.equal(verdict.result, "fail");
      assert.equal(verdict.diagnosticGate, "failed");
      assert.equal(verdict.semanticEquality, "not_evaluated");
      assert.equal(
        (verdict.primaryFailure as Record<string, unknown>).failureCode,
        "compile_failed"
      );
      assert.equal((verdict.primaryFailure as Record<string, unknown>).phase, "compile");
    } finally {
      await rm(fixture.tempRoot, { force: true, recursive: true });
    }
  }
);

async function createAttemptFixture(): Promise<{
  benchmarkPackageRoot: string;
  promptPackageRoot: string;
  tempRoot: string;
}> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-attempt-smoke-"));
  const benchmarkPackage = await materializeProblem9Package({
    outputRoot: path.join(tempRoot, "benchmark-package")
  });
  const promptDefaults = getDefaultProblem9PromptPackageOptions();
  const promptPackage = await materializeProblem9PromptPackage({
    attemptId: "attempt-fixture-001",
    authMode: "local_stub",
    benchmarkPackageRoot: benchmarkPackage.outputRoot,
    harnessRevision: "fixture-harness-rev",
    jobId: null,
    laneId: "lean422_exact",
    modelConfigId: "local_stub/problem9_fixture.v1",
    outputRoot: path.join(tempRoot, "prompt-package"),
    passKCount: null,
    passKIndex: null,
    promptLayerVersions: promptDefaults.promptLayerVersions,
    promptProtocolVersion: promptDefaults.promptProtocolVersion,
    providerFamily: "openai",
    runId: "run-fixture-001",
    runMode: "bounded_agentic_attempt",
    toolProfile: "workspace_edit_limited"
  });

  return {
    benchmarkPackageRoot: benchmarkPackage.outputRoot,
    promptPackageRoot: promptPackage.outputRoot,
    tempRoot
  };
}
