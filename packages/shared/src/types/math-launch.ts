import type { HarnessRuntimeClass } from "./harness-registry.js";
import type { RunKind } from "./run-control.js";

export type MathLaunchMode = "hosted" | "local_connected" | "offline_export";

export type MathLaunchCredentialPolicy =
  | "platform_managed"
  | "runner_host_local"
  | "none";

export type MathLaunchQuestionRef = {
  benchmarkFamily: string;
  benchmarkItemId: string;
  benchmarkPackageId: string;
  benchmarkPackageVersion: string;
  benchmarkVersionId: string;
  laneId: string;
  questionId: string;
};

export type MathLaunchHarnessRef = {
  authMode: string;
  harnessId: string;
  harnessRevision: string;
  imageDigest: string | null;
  providerFamily: string;
  runMode: string;
  runtimeClass: HarnessRuntimeClass;
  toolProfile: string;
};

export type MathHostedLaunchRequest = {
  credentialPolicy: "platform_managed";
  harness: MathLaunchHarnessRef & {
    authMode: "machine_api_key";
    runtimeClass: "hosted_worker";
  };
  idempotencyKey?: string;
  mode: "hosted";
  modelConfigId: string;
  question: MathLaunchQuestionRef;
  requestedSurface: "math";
  runKind: RunKind;
};

export type MathLocalConnectedLaunchRequest = {
  credentialPolicy: "runner_host_local";
  harness: MathLaunchHarnessRef & {
    authMode: "machine_api_key" | "trusted_local_user";
    runtimeClass: "trusted_local_devbox";
  };
  idempotencyKey?: string;
  mode: "local_connected";
  modelConfigId: string;
  question: MathLaunchQuestionRef;
  requestedSurface: "math";
  runKind: RunKind;
};

export type MathOfflineExportRequest = {
  credentialPolicy: "none";
  exportFormat: "problem9_offline_run_bundle_descriptor";
  harness: MathLaunchHarnessRef & {
    authMode: "none";
    runtimeClass: "offline_export";
  };
  idempotencyKey?: string;
  mode: "offline_export";
  modelConfigId: string;
  question: MathLaunchQuestionRef;
  requestedSurface: "math";
  runKind: RunKind;
};

export type MathQuestionLaunchRequest =
  | MathHostedLaunchRequest
  | MathLocalConnectedLaunchRequest
  | MathOfflineExportRequest;

export type MathHostedLaunchBootstrapResponse = {
  endpoint: "/math/launches";
  mode: "hosted";
  rawProviderSecretAccepted: false;
  redirectPattern: "/runs/:runId";
  requiredBackendContracts: string[];
  status: "backend_pending";
};

export type MathLocalConnectedBootstrapResponse = {
  bootstrap: {
    authBoundary: "runner_host_only";
    expiresAt: string | null;
    manifest: {
      harnessId: string;
      modelConfigId: string;
      questionId: string;
      runKind: RunKind;
      tokenAudience: "paretoproof-local-runner";
      tokenScope: "math.question.launch.local";
    };
    rawProviderSecretAccepted: false;
    runnerCommand: {
      command: string[];
      label: string;
      workingDirectory: string;
    };
  };
  mode: "local_connected";
  status: "bootstrap_ready";
};

export type MathOfflineExportBootstrapResponse = {
  exportDescriptor: {
    descriptorSchemaVersion: "1";
    files: string[];
    generatedAt: string;
    harness: MathLaunchHarnessRef;
    includesProviderSecrets: false;
    modelConfigId: string;
    question: MathLaunchQuestionRef;
    runKind: RunKind;
  };
  mode: "offline_export";
  status: "export_ready";
};

export type MathQuestionLaunchBootstrapResponse =
  | MathHostedLaunchBootstrapResponse
  | MathLocalConnectedBootstrapResponse
  | MathOfflineExportBootstrapResponse;
