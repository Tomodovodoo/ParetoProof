import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { materializeProblem9Package } from "../src/lib/problem9-package.ts";
import {
  getDefaultProblem9PromptPackageOptions,
  materializeProblem9PromptPackage
} from "../src/lib/problem9-prompt-package.ts";

test("materializeProblem9PromptPackage rejects output roots with unexpected existing entries", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-prompt-package-unsafe-"));
  const benchmarkPackageRoot = (
    await materializeProblem9Package({
      outputRoot: path.join(tempRoot, "benchmark-package")
    })
  ).outputRoot;
  const outputRoot = path.join(tempRoot, "prompt-package");
  const sentinelPath = path.join(outputRoot, "keep.txt");

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  await mkdir(outputRoot, { recursive: true });
  await writeFile(sentinelPath, "do not delete\n", "utf8");

  await assert.rejects(
    () =>
      materializeProblem9PromptPackage(
        buildPromptPackageOptions({
          benchmarkPackageRoot,
          outputRoot
        })
      ),
    /Prompt package output must be empty or contain only a prior prompt-package materialization\. Unexpected entries: keep\.txt\./u
  );
  assert.equal(await readFile(sentinelPath, "utf8"), "do not delete\n");
});

test("materializeProblem9PromptPackage rejects lookalike managed files that are not a valid prior output", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-prompt-package-lookalike-"));
  const benchmarkPackageRoot = (
    await materializeProblem9Package({
      outputRoot: path.join(tempRoot, "benchmark-package")
    })
  ).outputRoot;
  const outputRoot = path.join(tempRoot, "prompt-package");

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  await mkdir(outputRoot, { recursive: true });
  await writeFile(path.join(outputRoot, "system.md"), "handwritten system layer\n", "utf8");
  await writeFile(path.join(outputRoot, "benchmark.md"), "handwritten benchmark layer\n", "utf8");
  await writeFile(path.join(outputRoot, "item.md"), "handwritten item layer\n", "utf8");
  await writeFile(path.join(outputRoot, "run-envelope.json"), "{\n  \"runId\": \"manual\"\n}\n", "utf8");
  await writeFile(path.join(outputRoot, "prompt-package.json"), "{\n  \"promptPackageSchemaVersion\": \"1\"\n}\n", "utf8");

  await assert.rejects(
    () =>
      materializeProblem9PromptPackage(
        buildPromptPackageOptions({
          benchmarkPackageRoot,
          outputRoot
        })
      ),
    /Existing managed files do not form a valid prompt-package output\./u
  );
  assert.equal(await readFile(path.join(outputRoot, "system.md"), "utf8"), "handwritten system layer\n");
});

test("materializeProblem9PromptPackage rejects symbolic-link output roots", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-prompt-package-symlink-"));
  const benchmarkPackageRoot = (
    await materializeProblem9Package({
      outputRoot: path.join(tempRoot, "benchmark-package")
    })
  ).outputRoot;
  const realOutputRoot = path.join(tempRoot, "real-output");
  const symlinkOutputRoot = path.join(tempRoot, "prompt-package-link");

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  await mkdir(realOutputRoot, { recursive: true });
  await symlink(realOutputRoot, symlinkOutputRoot, "junction");

  await assert.rejects(
    () =>
      materializeProblem9PromptPackage(
        buildPromptPackageOptions({
          benchmarkPackageRoot,
          outputRoot: symlinkOutputRoot
        })
      ),
    /Prompt package output may not be a symbolic link\./u
  );
});

test("materializeProblem9PromptPackage safely refreshes an existing prompt-package output", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "paretoproof-worker-prompt-package-refresh-"));
  const benchmarkPackageRoot = (
    await materializeProblem9Package({
      outputRoot: path.join(tempRoot, "benchmark-package")
    })
  ).outputRoot;
  const outputRoot = path.join(tempRoot, "prompt-package");

  t.after(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  const firstResult = await materializeProblem9PromptPackage(
    buildPromptPackageOptions({
      benchmarkPackageRoot,
      outputRoot
    })
  );

  const secondResult = await materializeProblem9PromptPackage(
    buildPromptPackageOptions({
      benchmarkPackageRoot,
      outputRoot
    })
  );
  const promptPackageManifest = JSON.parse(
    await readFile(path.join(outputRoot, "prompt-package.json"), "utf8")
  ) as {
    promptPackageDigest: string;
  };

  assert.equal(firstResult.outputRoot, outputRoot);
  assert.equal(secondResult.outputRoot, outputRoot);
  assert.equal(secondResult.promptPackageDigest, promptPackageManifest.promptPackageDigest);
  assert.equal(secondResult.promptPackageDigest, firstResult.promptPackageDigest);
});

function buildPromptPackageOptions(options: {
  benchmarkPackageRoot: string;
  outputRoot: string;
}) {
  const promptDefaults = getDefaultProblem9PromptPackageOptions();

  return {
    attemptId: "attempt-prompt-package-001",
    authMode: "local_stub" as const,
    benchmarkPackageRoot: options.benchmarkPackageRoot,
    harnessRevision: "prompt-package-test-rev",
    jobId: null,
    laneId: "lean422_exact",
    modelConfigId: "local_stub/problem9_fixture.v1",
    outputRoot: options.outputRoot,
    passKCount: null,
    passKIndex: null,
    promptLayerVersions: promptDefaults.promptLayerVersions,
    promptProtocolVersion: promptDefaults.promptProtocolVersion,
    providerFamily: "openai" as const,
    runId: "run-prompt-package-001",
    runMode: "single_pass_probe" as const,
    toolProfile: "workspace_edit_limited" as const
  };
}
