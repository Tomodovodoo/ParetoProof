import { spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  type Problem9AuthMode,
  type Problem9AuthPreflight,
  preflightProblem9AuthMode,
  resolveCodexInvocation
} from "./problem9-auth.js";
import { materializeProblem9RunBundle } from "./problem9-run-bundle.js";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i);

const providerFamilySchema = z.enum([
  "openai",
  "anthropic",
  "google",
  "aristotle",
  "axle",
  "custom"
]);

const runModeSchema = z.enum([
  "single_pass_probe",
  "pass_k_probe",
  "bounded_agentic_attempt"
]);

const toolProfileSchema = z.enum([
  "no_tools",
  "lean_mcp_readonly",
  "workspace_edit_limited"
]);

const authModeSchema = z.enum([
  "trusted_local_user",
  "machine_api_key",
  "machine_oauth",
  "local_stub"
]);

const budgetSchema = z.object({
  compileRepairCycles: z.number().int().nonnegative(),
  providerSpendUsd: z.number().nonnegative().nullable(),
  providerTokenBudget: z.number().int().positive().nullable(),
  providerTurns: z.number().int().positive(),
  verifierRepairCycles: z.number().int().nonnegative(),
  wallClockSeconds: z.number().int().positive()
});

const benchmarkPackageManifestSchema = z.object({
  benchmarkItemId: z.literal("Problem9"),
  canonicalModules: z.object({
    gold: z.string().min(1),
    statement: z.string().min(1),
    support: z.string().min(1)
  }),
  hashes: z.record(z.string().min(1), sha256Schema),
  lanePolicy: z.object({
    primaryLane: z.string().min(1),
    supportedLanes: z.array(z.string().min(1)).min(1)
  }),
  packageDigest: sha256Schema,
  packageId: z.literal("firstproof/Problem9"),
  packageVersion: z.string().min(1)
});

const promptPackageManifestSchema = z.object({
  authMode: authModeSchema,
  benchmarkItemId: z.literal("Problem9"),
  benchmarkPackageDigest: sha256Schema,
  benchmarkPackageId: z.literal("firstproof/Problem9"),
  benchmarkPackageVersion: z.string().min(1),
  harnessRevision: z.string().min(1),
  laneId: z.string().min(1),
  modelConfigId: z.string().min(1),
  promptPackageDigest: sha256Schema,
  promptProtocolVersion: z.string().min(1),
  providerFamily: providerFamilySchema,
  runMode: runModeSchema,
  toolProfile: toolProfileSchema
});

const runEnvelopeSchema = z.object({
  attemptId: z.string().min(1),
  authMode: authModeSchema,
  benchmarkItemId: z.literal("Problem9"),
  benchmarkPackageDigest: sha256Schema,
  benchmarkPackageId: z.literal("firstproof/Problem9"),
  benchmarkPackageVersion: z.string().min(1),
  budgets: budgetSchema,
  harnessRevision: z.string().min(1),
  jobId: z.string().min(1).nullable(),
  laneId: z.string().min(1),
  modelConfigId: z.string().min(1),
  promptProtocolVersion: z.string().min(1),
  providerFamily: providerFamilySchema,
  runId: z.string().min(1),
  runMode: runModeSchema,
  toolProfile: toolProfileSchema
});

const problem9AttemptOptionsSchema = z.object({
  authMode: authModeSchema.optional(),
  benchmarkPackageRoot: z.string().min(1),
  modelSnapshotId: z.string().min(1).optional(),
  outputRoot: z.string().min(1),
  promptPackageRoot: z.string().min(1),
  providerFamily: providerFamilySchema.optional(),
  providerModel: z.string().min(1).optional(),
  stubScenario: z.enum(["exact_canonical", "compile_failure"]).default("exact_canonical"),
  workspaceRoot: z.string().min(1)
});

type Problem9AttemptOptions = z.infer<typeof problem9AttemptOptionsSchema>;
type BenchmarkPackageManifest = z.infer<typeof benchmarkPackageManifestSchema>;
type PromptPackageManifest = z.infer<typeof promptPackageManifestSchema>;
type RunEnvelope = z.infer<typeof runEnvelopeSchema>;

type CompileResult = {
  diagnostics: Record<string, unknown>;
  diagnosticsPath: string;
  outputPath: string;
  outputText: string;
  succeeded: boolean;
};

type VerificationFailureCode =
  | "forbidden_axiom_dependency"
  | "forbidden_placeholder_token"
  | "proof_policy_failed"
  | "theorem_reference_missing"
  | "theorem_semantic_mismatch";

type VerificationResult = {
  axiomCheck: "passed" | "failed" | "not_evaluated";
  containsAdmit: boolean;
  containsSorry: boolean;
  diagnosticGate: "passed" | "failed";
  failureCode: VerificationFailureCode | null;
  semanticEquality: "matched" | "mismatched" | "not_evaluated";
  surfaceEquality: "matched" | "drifted" | "not_evaluated";
  verifierOutput: Record<string, unknown>;
  verifierOutputPath: string;
};

type AttemptTerminalFailure = {
  failureCode:
    | "compile_failed"
    | "forbidden_axiom_dependency"
    | "forbidden_placeholder_token"
    | "proof_policy_failed"
    | "provider_auth_error"
    | "provider_internal_error"
    | "provider_malformed_response"
    | "provider_timeout"
    | "theorem_reference_missing"
    | "theorem_semantic_mismatch"
    | "turn_budget_exhausted"
    | "wall_clock_budget_exhausted";
  phase: "compile" | "generate" | "verify";
  stopReason: "budget_exhausted" | "compile_failed" | "provider_failed" | "verifier_failed";
  summary: string;
};

type ProviderResponse = {
  candidateSource: string;
  usage: {
    completionTokens: number | null;
    promptTokens: number | null;
    totalTokens: number | null;
  };
};

export type Problem9AttemptResult = {
  artifactManifestDigest: string;
  attemptId: string;
  authMode: Problem9AuthMode;
  bundleDigest: string;
  compileRepairCount: number;
  outputRoot: string;
  promptPackageDigest: string;
  providerFamily: z.infer<typeof providerFamilySchema>;
  providerTurnsUsed: number;
  result: "pass" | "fail";
  runConfigDigest: string;
  runId: string;
  stopReason:
    | "budget_exhausted"
    | "compile_failed"
    | "provider_failed"
    | "verification_passed"
    | "verifier_failed";
  verifierRepairCount: number;
  verdictDigest: string;
};

export async function runProblem9Attempt(
  rawOptions: Problem9AttemptOptions
): Promise<Problem9AttemptResult> {
  const options = problem9AttemptOptionsSchema.parse(rawOptions);
  const benchmarkPackageRoot = path.resolve(options.benchmarkPackageRoot);
  const promptPackageRoot = path.resolve(options.promptPackageRoot);
  const outputRoot = path.resolve(options.outputRoot);
  const workspaceRoot = path.resolve(options.workspaceRoot);

  assertNotFilesystemRoot(outputRoot, "Attempt output");
  assertNotFilesystemRoot(workspaceRoot, "Attempt workspace");
  assertNoPathOverlap(benchmarkPackageRoot, workspaceRoot, "Benchmark package input", "Attempt workspace");
  assertNoPathOverlap(promptPackageRoot, workspaceRoot, "Prompt package input", "Attempt workspace");
  assertNoPathOverlap(outputRoot, workspaceRoot, "Attempt output", "Attempt workspace");

  const benchmarkManifest = await loadJsonFile(
    path.join(benchmarkPackageRoot, "benchmark-package.json"),
    benchmarkPackageManifestSchema
  );
  const promptManifest = await loadJsonFile(
    path.join(promptPackageRoot, "prompt-package.json"),
    promptPackageManifestSchema
  );
  const runEnvelope = await loadJsonFile(
    path.join(promptPackageRoot, "run-envelope.json"),
    runEnvelopeSchema
  );

  validateAttemptInputs(benchmarkManifest, promptManifest, runEnvelope, options);

  const effectiveProviderFamily = options.providerFamily ?? promptManifest.providerFamily;
  const effectiveAuthMode = (options.authMode ?? promptManifest.authMode) as Problem9AuthMode;
  const authPreflight = await preflightProblem9AuthMode(effectiveAuthMode);

  await rm(workspaceRoot, { force: true, recursive: true });
  await mkdir(workspaceRoot, { recursive: true });

  const compileRoot = path.join(workspaceRoot, "package");
  const tempArtifactsRoot = path.join(workspaceRoot, ".paretoproof-artifacts");

  await cp(benchmarkPackageRoot, compileRoot, { recursive: true });
  await mkdir(tempArtifactsRoot, { recursive: true });

  const canonicalTheoremHeader = extractCanonicalTheoremHeader(
    await readNormalizedText(path.join(compileRoot, "FirstProof", "Problem9", "Statement.lean"))
  );
  const candidatePath = path.join(compileRoot, "FirstProof", "Problem9", "Candidate.lean");
  const startedAtMs = Date.now();

  let providerTurnsUsed = 0;
  let compileRepairCount = 0;
  let verifierRepairCount = 0;
  let compileResult: CompileResult | null = null;
  let verificationResult: VerificationResult | null = null;
  let candidateSource = "";
  let terminalFailure: AttemptTerminalFailure | null = null;

  while (true) {
    if (providerTurnsUsed >= runEnvelope.budgets.providerTurns) {
      terminalFailure = {
        failureCode: "turn_budget_exhausted",
        phase: verificationResult ? "verify" : compileResult ? "compile" : "generate",
        stopReason: "budget_exhausted",
        summary: `Attempt exhausted the provider turn budget of ${runEnvelope.budgets.providerTurns} turns.`
      };
      break;
    }

    if (hasWallClockExceeded(startedAtMs, runEnvelope.budgets.wallClockSeconds)) {
      terminalFailure = {
        failureCode: "wall_clock_budget_exhausted",
        phase: verificationResult ? "verify" : compileResult ? "compile" : "generate",
        stopReason: "budget_exhausted",
        summary: `Attempt exceeded the wall-clock budget of ${runEnvelope.budgets.wallClockSeconds} seconds.`
      };
      break;
    }

    providerTurnsUsed += 1;

    let providerResponse: ProviderResponse;

    try {
      providerResponse = await generateCandidate({
        authMode: effectiveAuthMode,
        authPreflight,
        compileResult,
        promptPackageRoot,
        providerFamily: effectiveProviderFamily,
        providerModel: options.providerModel ?? null,
        providerTurnsUsed,
        runEnvelope,
        stubScenario: options.stubScenario,
        verificationResult,
        workspaceRoot
      });
    } catch (error) {
      terminalFailure = classifyProviderFailure(error);

      if (!candidateSource) {
        throw new Error(terminalFailure.summary);
      }

      break;
    }

    candidateSource = sanitizeCandidateOutput(providerResponse.candidateSource);

    if (!candidateSource.trim()) {
      terminalFailure = {
        failureCode: "provider_malformed_response",
        phase: "generate",
        stopReason: "provider_failed",
        summary: "Provider response did not contain candidate Lean source."
      };
      break;
    }

    await writeNormalizedText(candidatePath, candidateSource);

    compileResult = await compileCandidate({
      candidatePath,
      compileRoot,
      tempArtifactsRoot
    });

    if (!compileResult.succeeded) {
      if (
        runEnvelope.runMode === "bounded_agentic_attempt" &&
        compileRepairCount < runEnvelope.budgets.compileRepairCycles
      ) {
        compileRepairCount += 1;
        continue;
      }

      terminalFailure = {
        failureCode: "compile_failed",
        phase: "compile",
        stopReason: "compile_failed",
        summary:
          compileRepairCount >= runEnvelope.budgets.compileRepairCycles
            ? `Candidate failed compilation after exhausting ${runEnvelope.budgets.compileRepairCycles} compile repair cycles.`
            : "Candidate failed the authoritative Lean compile gate."
      };
      break;
    }

    verificationResult = await verifyCandidate({
      candidateSource,
      canonicalTheoremHeader,
      compileResult,
      compileRoot,
      tempArtifactsRoot
    });

    if (verificationResult.failureCode === null) {
      break;
    }

    if (
      runEnvelope.runMode === "bounded_agentic_attempt" &&
      verifierRepairCount < runEnvelope.budgets.verifierRepairCycles
    ) {
      verifierRepairCount += 1;
      continue;
    }

    terminalFailure = {
      failureCode: verificationResult.failureCode,
      phase: "verify",
      stopReason: "verifier_failed",
      summary: buildVerifierFailureSummary(
        verificationResult.failureCode,
        runEnvelope.budgets.verifierRepairCycles
      )
    };
    break;
  }

  if (compileResult === null || !candidateSource.trim()) {
    throw new Error("Attempt did not reach a bundle-emittable terminal state.");
  }

  if (verificationResult === null) {
    verificationResult = await createCompileFailureVerificationResult({
      compileResult,
      tempArtifactsRoot
    });
  }

  const environmentInputPath = path.join(tempArtifactsRoot, "environment-input.json");
  const failureClassificationPath = path.join(tempArtifactsRoot, "failure-classification.json");
  const passingAttempt = terminalFailure === null;
  const finalizedFailure = terminalFailure;

  await writeJsonFile(
    environmentInputPath,
    await buildEnvironmentInput({
      benchmarkManifest,
      compileRoot,
      modelSnapshotId:
        options.modelSnapshotId ??
        (effectiveAuthMode === "local_stub"
          ? "local_stub/problem9_exact_canonical.v1"
          : options.providerModel ?? promptManifest.modelConfigId)
    })
  );

  if (!passingAttempt) {
    if (finalizedFailure === null) {
      throw new Error("Attempt ended without a terminal failure classification.");
    }

    await writeJsonFile(failureClassificationPath, buildFailureClassification(finalizedFailure));
  }

  const bundleResult = await materializeProblem9RunBundle({
    axiomCheck: verificationResult.axiomCheck,
    benchmarkPackageRoot,
    candidateSourcePath: candidatePath,
    compilerDiagnosticsPath: compileResult.diagnosticsPath,
    compilerOutputPath: compileResult.outputPath,
    containsAdmit: verificationResult.containsAdmit,
    containsSorry: verificationResult.containsSorry,
    diagnosticGate: verificationResult.diagnosticGate,
    environmentInputPath,
    failureClassificationPath: passingAttempt ? null : failureClassificationPath,
    outputRoot,
    promptPackageRoot,
    result: passingAttempt ? "pass" : "fail",
    semanticEquality: verificationResult.semanticEquality,
    stopReason: passingAttempt ? "verification_passed" : finalizedFailure!.stopReason,
    surfaceEquality: verificationResult.surfaceEquality,
    verifierOutputPath: verificationResult.verifierOutputPath
  });

  return {
    artifactManifestDigest: bundleResult.artifactManifestDigest,
    attemptId: runEnvelope.attemptId,
    authMode: effectiveAuthMode,
    bundleDigest: bundleResult.bundleDigest,
    compileRepairCount,
    outputRoot: bundleResult.outputRoot,
    promptPackageDigest: bundleResult.promptPackageDigest,
    providerFamily: effectiveProviderFamily,
    providerTurnsUsed,
    result: passingAttempt ? "pass" : "fail",
    runConfigDigest: bundleResult.runConfigDigest,
    runId: runEnvelope.runId,
    stopReason: passingAttempt ? "verification_passed" : finalizedFailure!.stopReason,
    verifierRepairCount,
    verdictDigest: bundleResult.verdictDigest
  };
}

function validateAttemptInputs(
  benchmarkManifest: BenchmarkPackageManifest,
  promptManifest: PromptPackageManifest,
  runEnvelope: RunEnvelope,
  options: Problem9AttemptOptions
): void {
  if (promptManifest.benchmarkPackageId !== benchmarkManifest.packageId) {
    throw new Error("Prompt package benchmarkPackageId does not match the benchmark package.");
  }

  if (promptManifest.benchmarkPackageVersion !== benchmarkManifest.packageVersion) {
    throw new Error("Prompt package benchmarkPackageVersion does not match the benchmark package.");
  }

  if (promptManifest.benchmarkPackageDigest !== benchmarkManifest.packageDigest) {
    throw new Error("Prompt package benchmarkPackageDigest does not match the benchmark package.");
  }

  if (runEnvelope.benchmarkPackageDigest !== promptManifest.benchmarkPackageDigest) {
    throw new Error("Run envelope benchmarkPackageDigest does not match the prompt package.");
  }

  if (runEnvelope.providerFamily !== promptManifest.providerFamily) {
    throw new Error("Run envelope providerFamily does not match the prompt package.");
  }

  if (runEnvelope.authMode !== promptManifest.authMode) {
    throw new Error("Run envelope authMode does not match the prompt package.");
  }

  if (runEnvelope.runMode !== promptManifest.runMode) {
    throw new Error("Run envelope runMode does not match the prompt package.");
  }

  if (runEnvelope.runMode === "pass_k_probe") {
    throw new Error("run-problem9-attempt only supports single-item run modes, not pass_k_probe.");
  }

  if (options.providerFamily && options.providerFamily !== promptManifest.providerFamily) {
    throw new Error("Requested provider family does not match the prompt package.");
  }

  if (options.authMode && options.authMode !== promptManifest.authMode) {
    throw new Error("Requested auth mode does not match the prompt package.");
  }
}

async function generateCandidate(options: {
  authMode: Problem9AuthMode;
  authPreflight: Problem9AuthPreflight;
  compileResult: CompileResult | null;
  promptPackageRoot: string;
  providerFamily: z.infer<typeof providerFamilySchema>;
  providerModel: string | null;
  providerTurnsUsed: number;
  runEnvelope: RunEnvelope;
  stubScenario: "compile_failure" | "exact_canonical";
  verificationResult: VerificationResult | null;
  workspaceRoot: string;
}): Promise<ProviderResponse> {
  if (options.authMode === "local_stub") {
    return {
      candidateSource: buildStubCandidate(options.stubScenario),
      usage: {
        completionTokens: 0,
        promptTokens: 0,
        totalTokens: 0
      }
    };
  }

  if (options.providerFamily !== "openai") {
    throw new Error(
      `Provider family ${options.providerFamily} is not implemented for run-problem9-attempt yet.`
    );
  }

  if (!options.providerModel) {
    throw new Error("Provider model is required for non-stub execution.");
  }

  const promptText = await buildProviderPrompt({
    compileResult: options.compileResult,
    promptPackageRoot: options.promptPackageRoot,
    providerTurnsUsed: options.providerTurnsUsed,
    runEnvelope: options.runEnvelope,
    verificationResult: options.verificationResult
  });
  const outputFilePath = path.join(
    options.workspaceRoot,
    `.provider-output-${options.providerTurnsUsed}.txt`
  );
  const codexInvocation = resolveCodexInvocation([
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "--color",
    "never",
    "-C",
    options.workspaceRoot,
    "-s",
    "read-only",
    "-m",
    options.providerModel,
    "-o",
    outputFilePath,
    "-"
  ]);
  const execution = await runCommand(
    codexInvocation.command,
    codexInvocation.args,
    {
      cwd: options.workspaceRoot,
      env: await buildCodexExecutionEnv(
        options.authMode,
        options.authPreflight,
        options.workspaceRoot
      ),
      stdin: promptText,
      timeoutMs: 300000
    }
  );

  if (execution.exitCode !== 0) {
    throw new Error(execution.stderr || execution.stdout || "codex exec failed.");
  }

  return {
    candidateSource: await readNormalizedText(outputFilePath),
    usage: {
      completionTokens: null,
      promptTokens: null,
      totalTokens: null
    }
  };
}

async function buildCodexExecutionEnv(
  authMode: Problem9AuthMode,
  authPreflight: Problem9AuthPreflight,
  workspaceRoot: string
): Promise<NodeJS.ProcessEnv> {
  if (authMode === "trusted_local_user" && authPreflight.authMode === "trusted_local_user") {
    return {
      ...process.env,
      CODEX_HOME: authPreflight.codexHome
    };
  }

  if (authMode === "machine_api_key") {
    const machineAuthHome = path.join(workspaceRoot, ".machine-auth-codex-home");
    await mkdir(machineAuthHome, { recursive: true });

    return {
      ...process.env,
      CODEX_HOME: machineAuthHome
    };
  }

  return { ...process.env };
}

async function buildProviderPrompt(options: {
  compileResult: CompileResult | null;
  promptPackageRoot: string;
  providerTurnsUsed: number;
  runEnvelope: RunEnvelope;
  verificationResult: VerificationResult | null;
}): Promise<string> {
  const systemPrompt = await readNormalizedText(path.join(options.promptPackageRoot, "system.md"));
  const benchmarkPrompt = await readNormalizedText(
    path.join(options.promptPackageRoot, "benchmark.md")
  );
  const itemPrompt = await readNormalizedText(path.join(options.promptPackageRoot, "item.md"));
  const runEnvelope = await readNormalizedText(
    path.join(options.promptPackageRoot, "run-envelope.json")
  );

  const sections = [
    "System instructions:",
    systemPrompt.trim(),
    "",
    "Benchmark context:",
    benchmarkPrompt.trim(),
    "",
    "Problem item:",
    itemPrompt.trim(),
    "",
    "Run envelope:",
    "```json",
    runEnvelope.trim(),
    "```",
    "",
    `This is provider turn ${options.providerTurnsUsed} for run mode ${options.runEnvelope.runMode}.`,
    "Return only the full contents of candidate/Candidate.lean with no prose and no markdown fences."
  ];

  if (options.compileResult && !options.compileResult.succeeded) {
    sections.push(
      "",
      "Compile repair context:",
      "```text",
      options.compileResult.outputText.trim() || "(no compiler output)",
      "```"
    );
  }

  if (options.verificationResult && options.verificationResult.failureCode) {
    sections.push(
      "",
      "Verifier repair context:",
      "```json",
      stableStringify(options.verificationResult.verifierOutput),
      "```"
    );
  }

  return `${sections.join("\n")}\n`;
}

async function compileCandidate(options: {
  candidatePath: string;
  compileRoot: string;
  tempArtifactsRoot: string;
}): Promise<CompileResult> {
  const compileCommand = await runCommand(
    "lake",
    ["build", "FirstProof.Problem9.Candidate"],
    {
      cwd: options.compileRoot,
      env: process.env,
      timeoutMs: 300000
    }
  );
  const outputText = [compileCommand.stdout, compileCommand.stderr]
    .filter((value) => value.trim().length > 0)
    .join("\n");
  const diagnostics = buildCompilerDiagnostics(outputText, compileCommand.exitCode === 0);
  const diagnosticsPath = path.join(options.tempArtifactsRoot, "compiler-diagnostics.json");
  const outputPath = path.join(options.tempArtifactsRoot, "compiler-output.txt");

  await writeJsonFile(diagnosticsPath, diagnostics);
  await writeNormalizedText(outputPath, outputText);

  return {
    diagnostics,
    diagnosticsPath,
    outputPath,
    outputText,
    succeeded: compileCommand.exitCode === 0
  };
}

async function verifyCandidate(options: {
  candidateSource: string;
  canonicalTheoremHeader: string;
  compileResult: CompileResult;
  compileRoot: string;
  tempArtifactsRoot: string;
}): Promise<VerificationResult> {
  const containsSorry = /\bsorry\b/.test(options.candidateSource);
  const containsAdmit = /\badmit\b/.test(options.candidateSource);
  const diagnostics =
    ((options.compileResult.diagnostics.diagnostics as Array<Record<string, unknown>> | undefined) ??
      []);
  const diagnosticGate = diagnostics.length > 0 ? "failed" : "passed";

  const semanticProbePath = path.join(options.compileRoot, "ParetoProofSemanticCheck.lean");

  await writeNormalizedText(
    semanticProbePath,
    [
      "import FirstProof.Problem9.Candidate",
      "",
      "namespace ParetoProofVerifier",
      "",
      "example (n : Nat) :",
      "    FirstProof.Problem9.triangular (Nat.succ n) =",
      "    FirstProof.Problem9.triangular n + Nat.succ n := by",
      "  simpa using FirstProof.Problem9.problem9 n",
      "",
      "end ParetoProofVerifier"
    ].join("\n")
  );

  const semanticProbe = await runCommand(
    "lake",
    ["env", "lean", path.basename(semanticProbePath)],
    {
      cwd: options.compileRoot,
      env: process.env,
      timeoutMs: 300000
    }
  );
  const semanticOutput = [semanticProbe.stdout, semanticProbe.stderr]
    .filter((value) => value.trim().length > 0)
    .join("\n");
  const candidateTheoremHeader = extractCanonicalTheoremHeader(options.candidateSource);
  const semanticEquality =
    semanticProbe.exitCode === 0 ? "matched" : candidateTheoremHeader ? "mismatched" : "not_evaluated";
  const surfaceEquality =
    semanticEquality === "matched"
      ? normalizeWhitespace(candidateTheoremHeader) === normalizeWhitespace(options.canonicalTheoremHeader)
        ? "matched"
        : "drifted"
      : candidateTheoremHeader
        ? "drifted"
        : "not_evaluated";

  let axiomCheck: "passed" | "failed" | "not_evaluated" = "not_evaluated";
  let axiomOutput = "";

  if (semanticEquality === "matched") {
    const axiomProbePath = path.join(options.compileRoot, "ParetoProofAxiomCheck.lean");

    await writeNormalizedText(
      axiomProbePath,
      ["import FirstProof.Problem9.Candidate", "#print axioms FirstProof.Problem9.problem9"].join("\n")
    );

    const axiomProbe = await runCommand(
      "lake",
      ["env", "lean", path.basename(axiomProbePath)],
      {
        cwd: options.compileRoot,
        env: process.env,
        timeoutMs: 300000
      }
    );

    axiomOutput = [axiomProbe.stdout, axiomProbe.stderr]
      .filter((value) => value.trim().length > 0)
      .join("\n");
    axiomCheck =
      axiomProbe.exitCode === 0 && /does not depend on any axioms/i.test(axiomOutput)
        ? "passed"
        : "failed";
  }

  const failureCode = deriveVerificationFailureCode({
    axiomCheck,
    containsAdmit,
    containsSorry,
    diagnosticGate,
    semanticEquality,
    semanticOutput
  });
  const verifierOutput = {
    axiomCheck: {
      output: axiomOutput,
      result: axiomCheck
    },
    diagnosticGate: {
      result: diagnosticGate
    },
    forbiddenTokens: {
      containsAdmit,
      containsSorry
    },
    result: failureCode === null ? "pass" : "fail",
    semanticCheck: {
      output: semanticOutput,
      result: semanticEquality
    },
    surfaceEquality,
    surface_drift: surfaceEquality === "drifted",
    theoremHeaders: {
      canonical: options.canonicalTheoremHeader,
      candidate: candidateTheoremHeader
    },
    verifierOutputSchemaVersion: "1"
  };
  const verifierOutputPath = path.join(options.tempArtifactsRoot, "verifier-output.json");

  await writeJsonFile(verifierOutputPath, verifierOutput);

  return {
    axiomCheck,
    containsAdmit,
    containsSorry,
    diagnosticGate,
    failureCode,
    semanticEquality,
    surfaceEquality,
    verifierOutput,
    verifierOutputPath
  };
}

async function createCompileFailureVerificationResult(options: {
  compileResult: CompileResult;
  tempArtifactsRoot: string;
}): Promise<VerificationResult> {
  const verifierOutput = {
    axiomCheck: {
      output: "",
      result: "not_evaluated"
    },
    compileGate: {
      result: "failed"
    },
    diagnosticGate: {
      result: "failed"
    },
    forbiddenTokens: {
      containsAdmit: false,
      containsSorry: false
    },
    result: "fail",
    semanticCheck: {
      output: options.compileResult.outputText,
      result: "not_evaluated"
    },
    surfaceEquality: "not_evaluated",
    surface_drift: false,
    theoremHeaders: {
      canonical: "",
      candidate: ""
    },
    verifierOutputSchemaVersion: "1"
  } as const;
  const verifierOutputPath = path.join(options.tempArtifactsRoot, "verifier-output.json");

  await writeJsonFile(verifierOutputPath, verifierOutput);

  return {
    axiomCheck: "not_evaluated",
    containsAdmit: false,
    containsSorry: false,
    diagnosticGate: "failed",
    failureCode: "proof_policy_failed",
    semanticEquality: "not_evaluated",
    surfaceEquality: "not_evaluated",
    verifierOutput,
    verifierOutputPath
  };
}

function deriveVerificationFailureCode(options: {
  axiomCheck: "passed" | "failed" | "not_evaluated";
  containsAdmit: boolean;
  containsSorry: boolean;
  diagnosticGate: "passed" | "failed";
  semanticEquality: "matched" | "mismatched" | "not_evaluated";
  semanticOutput: string;
}): VerificationFailureCode | null {
  if (options.containsSorry || options.containsAdmit) {
    return "forbidden_placeholder_token";
  }

  if (options.semanticEquality === "not_evaluated") {
    return "theorem_reference_missing";
  }

  if (options.semanticEquality === "mismatched") {
    return /unknown (constant|identifier).*problem9/i.test(options.semanticOutput)
      ? "theorem_reference_missing"
      : "theorem_semantic_mismatch";
  }

  if (options.axiomCheck === "failed") {
    return "forbidden_axiom_dependency";
  }

  if (options.diagnosticGate === "failed") {
    return "proof_policy_failed";
  }

  return null;
}

function buildVerifierFailureSummary(
  failureCode: VerificationFailureCode,
  verifierRepairBudget: number
): string {
  switch (failureCode) {
    case "forbidden_placeholder_token":
      return `Candidate still contained sorry/admit after exhausting the verifier repair budget of ${verifierRepairBudget}.`;
    case "forbidden_axiom_dependency":
      return `Candidate depended on forbidden axioms after exhausting the verifier repair budget of ${verifierRepairBudget}.`;
    case "theorem_reference_missing":
      return `Candidate did not expose the canonical theorem target after exhausting the verifier repair budget of ${verifierRepairBudget}.`;
    case "theorem_semantic_mismatch":
      return `Candidate failed semantic theorem equality after exhausting the verifier repair budget of ${verifierRepairBudget}.`;
    case "proof_policy_failed":
      return `Candidate failed the Problem 9 verification policy after exhausting the verifier repair budget of ${verifierRepairBudget}.`;
  }
}

async function buildEnvironmentInput(options: {
  benchmarkManifest: BenchmarkPackageManifest;
  compileRoot: string;
  modelSnapshotId: string;
}): Promise<Record<string, unknown>> {
  const leanVersionCommand = await runCommand("lake", ["env", "lean", "--version"], {
    cwd: options.compileRoot,
    env: process.env,
    timeoutMs: 120000
  });
  const leanVersion = (
    leanVersionCommand.stdout ||
    leanVersionCommand.stderr ||
    "unknown"
  )
    .split(/\r?\n/u)[0]
    .trim();

  return {
    environmentSchemaVersion: "1",
    executionImageDigest: null,
    executionTargetKind: "problem9-devbox",
    lakeSnapshotId: options.benchmarkManifest.hashes["lake-manifest.json"] ?? "unknown",
    leanVersion,
    localDevboxDigest: null,
    metadata: {},
    modelSnapshotId: options.modelSnapshotId,
    os: {
      arch: os.arch(),
      platform: os.platform(),
      release: os.release()
    },
    runtime: {
      bunVersion: process.versions.bun ?? null,
      nodeVersion: process.version,
      tsxVersion: null
    },
    verifierVersion: "problem9-local-verifier.v1"
  };
}

function buildFailureClassification(failure: AttemptTerminalFailure): Record<string, unknown> {
  return {
    evidenceArtifactRefs: [
      "candidate/Candidate.lean",
      "verification/compiler-diagnostics.json",
      "verification/compiler-output.txt",
      "verification/verifier-output.json"
    ],
    failureCode: failure.failureCode,
    failureFamily: classifyFailureFamily(failure.failureCode),
    phase: failure.phase,
    retryEligibility:
      failure.failureCode === "provider_timeout" || failure.failureCode === "provider_internal_error"
        ? "outer_retry_allowed"
        : "manual_retry_only",
    summary: failure.summary,
    terminality: "terminal_attempt",
    userVisibility: "user_visible"
  };
}

function classifyFailureFamily(
  failureCode: AttemptTerminalFailure["failureCode"]
):
  | "budget"
  | "compile"
  | "provider"
  | "verification" {
  switch (failureCode) {
    case "turn_budget_exhausted":
    case "wall_clock_budget_exhausted":
      return "budget";
    case "compile_failed":
      return "compile";
    case "provider_auth_error":
    case "provider_internal_error":
    case "provider_malformed_response":
    case "provider_timeout":
      return "provider";
    case "forbidden_axiom_dependency":
    case "forbidden_placeholder_token":
    case "proof_policy_failed":
    case "theorem_reference_missing":
    case "theorem_semantic_mismatch":
      return "verification";
  }
}

function classifyProviderFailure(error: unknown): AttemptTerminalFailure {
  const message = error instanceof Error ? error.message : String(error);

  if (/auth/i.test(message)) {
    return {
      failureCode: "provider_auth_error",
      phase: "generate",
      stopReason: "provider_failed",
      summary: message
    };
  }

  if (/timeout/i.test(message)) {
    return {
      failureCode: "provider_timeout",
      phase: "generate",
      stopReason: "provider_failed",
      summary: message
    };
  }

  if (/malformed|empty|candidate lean source/i.test(message)) {
    return {
      failureCode: "provider_malformed_response",
      phase: "generate",
      stopReason: "provider_failed",
      summary: message
    };
  }

  return {
    failureCode: "provider_internal_error",
    phase: "generate",
    stopReason: "provider_failed",
    summary: message
  };
}

function buildCompilerDiagnostics(outputText: string, compileSucceeded: boolean): Record<string, unknown> {
  const diagnostics = outputText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({
      message: line,
      severity: /warning:/i.test(line) ? "warning" : /error:/i.test(line) ? "error" : "info",
      terminal: /error:/i.test(line)
    }))
    .filter((entry) => !compileSucceeded || entry.severity !== "info");

  return {
    compilerDiagnosticsSchemaVersion: "1",
    diagnostics,
    success: compileSucceeded
  };
}

function buildStubCandidate(stubScenario: "compile_failure" | "exact_canonical"): string {
  switch (stubScenario) {
    case "compile_failure":
      return [
        "import FirstProof.Problem9.Support",
        "",
        "namespace FirstProof.Problem9",
        "",
        "theorem problem9 (n : Nat) :",
        "    triangular (Nat.succ n) = triangular n + Nat.succ n := by",
        "  this is not valid Lean",
        "",
        "end FirstProof.Problem9"
      ].join("\n");
    case "exact_canonical":
      return [
        "import FirstProof.Problem9.Support",
        "",
        "namespace FirstProof.Problem9",
        "",
        "theorem problem9 (n : Nat) :",
        "    triangular (Nat.succ n) = triangular n + Nat.succ n := by",
        "  rfl",
        "",
        "end FirstProof.Problem9"
      ].join("\n");
  }
}

function extractCanonicalTheoremHeader(sourceText: string): string {
  const match = sourceText.match(/theorem\s+problem9[\s\S]*?:=\s*by/u);
  return match ? normalizeWhitespace(match[0]) : "";
}

function sanitizeCandidateOutput(candidateSource: string): string {
  const trimmed = candidateSource.trim();

  if (trimmed.startsWith("```")) {
    return `${trimmed
      .replace(/^```[a-zA-Z0-9_-]*\s*/u, "")
      .replace(/\s*```$/u, "")
      .trim()}\n`;
  }

  return `${trimmed.replace(/\n?$/u, "\n")}`;
}

function hasWallClockExceeded(startedAtMs: number, budgetSeconds: number): boolean {
  return Date.now() - startedAtMs > budgetSeconds * 1000;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function assertNoPathOverlap(
  leftPath: string,
  rightPath: string,
  leftLabel: string,
  rightLabel: string
): void {
  const normalizedLeft = normalizeComparisonPath(leftPath);
  const normalizedRight = normalizeComparisonPath(rightPath);

  const overlaps =
    normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(`${normalizedRight}/`) ||
    normalizedRight.startsWith(`${normalizedLeft}/`);

  if (overlaps) {
    throw new Error(`${leftLabel} overlaps ${rightLabel}. Choose separate directories.`);
  }
}

function assertNotFilesystemRoot(targetPath: string, description: string): void {
  if (path.parse(targetPath).root === targetPath) {
    throw new Error(`${description} may not be a filesystem root.`);
  }
}

async function loadJsonFile<TSchema extends z.ZodTypeAny>(
  filePath: string,
  schema: TSchema
): Promise<z.output<TSchema>> {
  const fileStats = await stat(filePath);

  if (!fileStats.isFile()) {
    throw new Error(`Expected file input at ${filePath}.`);
  }

  return schema.parse(JSON.parse(normalizeText(await readFile(filePath, "utf8"))));
}

async function readNormalizedText(filePath: string): Promise<string> {
  return normalizeText(await readFile(filePath, "utf8"));
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeNormalizedText(filePath, stableStringify(value));
}

async function writeNormalizedText(filePath: string, value: string): Promise<void> {
  await writeFile(filePath, `${normalizeText(value).replace(/\n?$/u, "\n")}`, "utf8");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value), null, 2);
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortJsonValue(nestedValue)])
    );
  }

  return value;
}

function normalizeText(value: string): string {
  return value.replace(/^\uFEFF/u, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeComparisonPath(value: string): string {
  return path.resolve(value).replace(/\\/g, "/").toLowerCase();
}

async function runCommand(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    stdin?: string;
    timeoutMs: number;
  }
): Promise<{
  exitCode: number;
  stderr: string;
  stdout: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        reject(new Error(`${command} ${args.join(" ")} timed out after ${options.timeoutMs}ms.`));
      }
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.once("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(error);
      }
    });

    child.once("close", (exitCode) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({
          exitCode: exitCode ?? 1,
          stderr: stderr.trim(),
          stdout: stdout.trim()
        });
      }
    });

    if (options.stdin) {
      child.stdin.write(options.stdin);
    }

    child.stdin.end();
  });
}
