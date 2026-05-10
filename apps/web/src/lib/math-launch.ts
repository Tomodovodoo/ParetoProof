import {
  mathQuestionLaunchBootstrapResponseSchema,
  mathQuestionLaunchRequestSchema,
  type MathLaunchMode,
  type MathQuestionLaunchBootstrapResponse,
  type MathQuestionLaunchRequest
} from "@paretoproof/shared";

export type MathLaunchPreset = {
  id: string;
  label: string;
  modelConfigId: string;
  runMode: string;
  summary: string;
  toolProfile: string;
};

export type MathQuestionLaunchDescriptor = {
  benchmarkFamily: string;
  benchmarkItemId: string;
  benchmarkPackageId: string;
  benchmarkPackageVersion: string;
  benchmarkVersionId: string;
  laneId: string;
  questionId: string;
  statementHref: string;
  subtitle: string;
  title: string;
};

export const defaultMathQuestion: MathQuestionLaunchDescriptor = {
  benchmarkFamily: "firstproof",
  benchmarkItemId: "Problem9",
  benchmarkPackageId: "firstproof/Problem9",
  benchmarkPackageVersion: "2026.03.15",
  benchmarkVersionId: "firstproof/Problem9@2026.03.15",
  laneId: "lean422_exact",
  questionId: "firstproof/Problem9",
  statementHref:
    "https://github.com/Tomodovodoo/ParetoProof/blob/main/benchmarks/firstproof/problem9/statements/problem.md",
  subtitle: "FirstProof Lean 4.22 proof-generation benchmark package.",
  title: "Problem 9"
};

export const mathLaunchPresets: MathLaunchPreset[] = [
  {
    id: "problem9-single-pass",
    label: "Single-pass probe",
    modelConfigId: "openai/problem9-single-pass",
    runMode: "single_pass_probe",
    summary: "One deterministic proof attempt for a quick question-level check.",
    toolProfile: "no_tools"
  },
  {
    id: "problem9-lean-readonly",
    label: "Lean readonly attempt",
    modelConfigId: "openai/problem9-lean-readonly",
    runMode: "bounded_agentic_attempt",
    summary: "A bounded agentic attempt with readonly Lean context for deeper exploration.",
    toolProfile: "lean_mcp_readonly"
  }
];

const mathQuestionAliases = new Map([
  ["firstproof/Problem9", defaultMathQuestion],
  ["Problem9", defaultMathQuestion],
  ["problem9", defaultMathQuestion]
]);

function parseQuestionSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function resolveMathQuestionFromPath(pathname: string) {
  if (!pathname.startsWith("/questions/")) {
    return defaultMathQuestion;
  }

  const questionSegment = pathname.slice("/questions/".length);
  const questionId = parseQuestionSegment(questionSegment);
  return mathQuestionAliases.get(questionId) ?? {
    ...defaultMathQuestion,
    questionId,
    title: questionId
  };
}

function toQuestionRef(question: MathQuestionLaunchDescriptor) {
  return {
    benchmarkFamily: question.benchmarkFamily,
    benchmarkItemId: question.benchmarkItemId,
    benchmarkPackageId: question.benchmarkPackageId,
    benchmarkPackageVersion: question.benchmarkPackageVersion,
    benchmarkVersionId: question.benchmarkVersionId,
    laneId: question.laneId,
    questionId: question.questionId
  };
}

function parseLaunchRequest(request: MathQuestionLaunchRequest) {
  return mathQuestionLaunchRequestSchema.parse(request) as MathQuestionLaunchRequest;
}

function parseBootstrapResponse(response: MathQuestionLaunchBootstrapResponse) {
  return mathQuestionLaunchBootstrapResponseSchema.parse(
    response
  ) as MathQuestionLaunchBootstrapResponse;
}

export function buildMathQuestionLaunchRequest(options: {
  mode: MathLaunchMode;
  preset: MathLaunchPreset;
  question: MathQuestionLaunchDescriptor;
}): MathQuestionLaunchRequest {
  const question = toQuestionRef(options.question);
  const baseRequest = {
    modelConfigId: options.preset.modelConfigId,
    question,
    requestedSurface: "math" as const,
    runKind: "single_run" as const
  };

  if (options.mode === "hosted") {
    return parseLaunchRequest({
      ...baseRequest,
      credentialPolicy: "platform_managed",
      harness: {
        authMode: "machine_api_key",
        harnessId: "problem9_hosted",
        harnessRevision: "problem9",
        imageDigest: null,
        providerFamily: "openai",
        runMode: options.preset.runMode,
        runtimeClass: "hosted_worker",
        toolProfile: options.preset.toolProfile
      },
      mode: "hosted"
    });
  }

  if (options.mode === "local_connected") {
    return parseLaunchRequest({
      ...baseRequest,
      credentialPolicy: "runner_host_local",
      harness: {
        authMode: "trusted_local_user",
        harnessId: "problem9_trusted_local_devbox",
        harnessRevision: "problem9",
        imageDigest: null,
        providerFamily: "openai",
        runMode: options.preset.runMode,
        runtimeClass: "trusted_local_devbox",
        toolProfile: options.preset.toolProfile
      },
      mode: "local_connected"
    });
  }

  return parseLaunchRequest({
    ...baseRequest,
    credentialPolicy: "none",
    exportFormat: "problem9_offline_run_bundle_descriptor",
    harness: {
      authMode: "none",
      harnessId: "problem9_offline_export",
      harnessRevision: "problem9",
      imageDigest: null,
      providerFamily: "openai",
      runMode: options.preset.runMode,
      runtimeClass: "offline_export",
      toolProfile: options.preset.toolProfile
    },
    mode: "offline_export"
  });
}

export function buildMathQuestionLaunchBootstrapResponse(
  request: MathQuestionLaunchRequest,
  generatedAt = new Date().toISOString()
): MathQuestionLaunchBootstrapResponse {
  if (request.mode === "hosted") {
    return parseBootstrapResponse({
      endpoint: "/math/launches",
      mode: "hosted",
      rawProviderSecretAccepted: false,
      redirectPattern: "/runs/:runId",
      requiredBackendContracts: [
        "POST /math/launches",
        "question-to-run linkage",
        "platform-managed provider credential resolution"
      ],
      status: "backend_pending"
    });
  }

  if (request.mode === "local_connected") {
    return parseBootstrapResponse({
      bootstrap: {
        authBoundary: "runner_host_only",
        expiresAt: null,
        manifest: {
          harnessId: request.harness.harnessId,
          modelConfigId: request.modelConfigId,
          questionId: request.question.questionId,
          runKind: request.runKind,
          tokenAudience: "paretoproof-local-runner",
          tokenScope: "math.question.launch.local"
        },
        rawProviderSecretAccepted: false,
        runnerCommand: {
          command: [
            "node",
            "infra/scripts/run-problem9-trusted-local-attempt.mjs",
            "--preflight-only"
          ],
          label: "Trusted-local preflight",
          workingDirectory: "repo root"
        }
      },
      mode: "local_connected",
      status: "bootstrap_ready"
    });
  }

  return parseBootstrapResponse({
    exportDescriptor: {
      descriptorSchemaVersion: "1",
      files: [
        "benchmarks/firstproof/problem9/benchmark-package.json",
        "benchmarks/firstproof/problem9/statements/problem.md",
        "benchmarks/firstproof/problem9/FirstProof/Problem9/Statement.lean",
        "benchmarks/firstproof/problem9/FirstProof/Problem9/Support.lean",
        "apps/worker/prompts/problem9/benchmark.md",
        "apps/worker/prompts/problem9/system.md"
      ],
      generatedAt,
      harness: request.harness,
      includesProviderSecrets: false,
      modelConfigId: request.modelConfigId,
      question: request.question,
      runKind: request.runKind
    },
    mode: "offline_export",
    status: "export_ready"
  });
}

export function buildMathLaunchExportFilename(questionId: string) {
  return `${questionId.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-offline-launch.json`;
}

export function buildMathLaunchExportDataUrl(response: MathQuestionLaunchBootstrapResponse) {
  if (response.mode !== "offline_export") {
    return null;
  }

  return `data:application/json;charset=utf-8,${encodeURIComponent(
    JSON.stringify(response.exportDescriptor, null, 2)
  )}`;
}
