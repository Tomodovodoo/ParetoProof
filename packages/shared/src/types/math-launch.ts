import type { BenchmarkVersionLaunchability } from "./benchmark-workflow.js";
import type {
  Problem9LocalAuthMode,
  Problem9ProviderFamily,
  Problem9RunMode,
  Problem9ToolProfile
} from "../contracts/problem9-execution.js";
import type { RunKind } from "./run-control.js";
import type { WorkerActiveJob, WorkerBundleArtifactRole } from "./worker-control.js";

export type MathLaunchMode = "hosted" | "local_connected" | "offline_export";

export type MathConnectedAuthMode = Exclude<Problem9LocalAuthMode, "local_stub">;

export type MathLaunchReadinessIssueCode =
  | "no_launchable_benchmark_version"
  | "no_launch_configs"
  | "source_package_version_mismatch";

export type MathLaunchReadinessIssue = {
  code: MathLaunchReadinessIssueCode;
  message: string;
};

export type MathQuestionLaunchSummary = {
  benchmarkFamily: string;
  benchmarkItemId: string;
  benchmarkPackageId: string;
  label: string;
  questionId: string;
  routePath: string;
  sourcePackageVersion: string;
};

export type MathQuestionLaunchBenchmarkVersionSummary = {
  benchmarkVersionId: string;
  displayLabel: string;
  launchability: BenchmarkVersionLaunchability;
  packageDigest: string;
  packageVersion: string;
};

export type MathSingleRunLaunchTarget = {
  authMode: Problem9LocalAuthMode;
  benchmarkItemId: string;
  benchmarkPackageDigest: string;
  benchmarkPackageId: string;
  benchmarkPackageVersion: string;
  harnessRevision: string;
  laneId: string;
  modelConfigId: string;
  modelSnapshotId: string;
  promptPackageDigest: string;
  promptProtocolVersion: string;
  providerFamily: Problem9ProviderFamily;
  runKind: "single_run";
  runMode: Problem9RunMode;
  toolProfile: Problem9ToolProfile;
};

export type MathQuestionLaunchConfig = {
  benchmarkVersionId: string;
  hostedSupported: boolean;
  id: string;
  laneId: string;
  localSupportedAuthModes: MathConnectedAuthMode[];
  modelConfigId: string;
  modelSnapshotId: string;
  offlineExportSupportedAuthModes: MathConnectedAuthMode[];
  providerFamily: Problem9ProviderFamily;
  runMode: Problem9RunMode;
  templateSourceRunId: string;
  toolProfile: Problem9ToolProfile;
};

export type MathQuestionLaunchViewResponse = {
  benchmarkVersions: MathQuestionLaunchBenchmarkVersionSummary[];
  issues: MathLaunchReadinessIssue[];
  launchConfigs: MathQuestionLaunchConfig[];
  portalRunPathPattern: string;
  question: MathQuestionLaunchSummary;
};

export type MathHostedLaunchCreateInput = {
  launchConfigId: string;
};

export type MathHostedLaunchCreateResponse = {
  launchId: string;
  portalRunPath: string;
  questionId: string;
  run: {
    attemptId: string;
    jobId: string;
    runId: string;
  };
  target: MathSingleRunLaunchTarget;
};

export type MathLocalConnectedLaunchCreateInput = {
  authMode: MathConnectedAuthMode;
  launchConfigId: string;
};

export type MathLocalConnectedLaunchCreateResponse = {
  bootstrapSession: {
    expiresAt: string;
    sessionId: string;
    sessionToken: string;
  };
  launchId: string;
  questionId: string;
  sourceAttemptId: string;
  sourceJobId: string;
  sourceRunId: string;
  target: MathSingleRunLaunchTarget;
};

export type MathOfflineExportCreateInput = {
  authMode: MathConnectedAuthMode;
  launchConfigId: string;
};

export type MathOfflineExportCreateResponse = {
  launchId: string;
  questionId: string;
  sourceAttemptId: string;
  sourceJobId: string | null;
  sourceRunId: string;
  target: MathSingleRunLaunchTarget;
};

export type MathRunnerBootstrapSessionRedeemInput = {
  availableRunKinds: RunKind[];
  supportedArtifactRoles: WorkerBundleArtifactRole[];
  supportsOfflineBundleContract: boolean;
  supportsTraceUploads: boolean;
  workerId: string;
  workerPool: `local-${string}`;
  workerRuntime: "local_docker";
  workerVersion: string;
};

export type MathRunnerBootstrapSessionRedeemResponse = {
  launchId: string;
  workerJob: WorkerActiveJob;
};
