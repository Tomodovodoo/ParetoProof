import { z } from "zod";
import { benchmarkVersionLaunchabilitySchema } from "./benchmark-workflow.js";
import {
  problem9LocalAuthModes,
  problem9ProviderFamilies,
  problem9RunModes,
  problem9ToolProfiles
} from "../contracts/problem9-execution.js";
import { runKindSchema } from "./run-control.js";
import {
  workerActiveJobSchema,
  workerBundleArtifactRoleSchema
} from "./worker-control.js";

const nonEmptyStringSchema = z.string().trim().min(1);
const nonPaddedParamStringSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0 && value === value.trim(), {
    message: "Path params must not be blank or padded with whitespace."
  });
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i);
const timestampSchema = z.string().min(1);

export const mathLaunchModeSchema = z.enum([
  "hosted",
  "local_connected",
  "offline_export"
]);

export const mathConnectedAuthModeSchema = z.enum([
  "trusted_local_user",
  "machine_api_key"
]);

export const mathLaunchReadinessIssueCodeSchema = z.enum([
  "no_launchable_benchmark_version",
  "no_launch_configs",
  "source_package_version_mismatch"
]);

export const mathLaunchReadinessIssueSchema = z.object({
  code: mathLaunchReadinessIssueCodeSchema,
  message: nonEmptyStringSchema
});

export const mathQuestionParamsSchema = z.object({
  questionId: nonPaddedParamStringSchema
});

export const mathRunnerBootstrapSessionParamsSchema = z.object({
  bootstrapSessionId: z.string().uuid()
});

export const mathSingleRunLaunchTargetSchema = z.object({
  authMode: z.enum(problem9LocalAuthModes),
  benchmarkItemId: nonEmptyStringSchema,
  benchmarkPackageDigest: sha256Schema,
  benchmarkPackageId: nonEmptyStringSchema,
  benchmarkPackageVersion: nonEmptyStringSchema,
  harnessRevision: nonEmptyStringSchema,
  laneId: nonEmptyStringSchema,
  modelConfigId: nonEmptyStringSchema,
  modelSnapshotId: nonEmptyStringSchema,
  promptPackageDigest: sha256Schema,
  promptProtocolVersion: nonEmptyStringSchema,
  providerFamily: z.enum(problem9ProviderFamilies),
  runKind: z.literal("single_run"),
  runMode: z.enum(problem9RunModes),
  toolProfile: z.enum(problem9ToolProfiles)
});

export const mathQuestionLaunchSummarySchema = z.object({
  benchmarkFamily: nonEmptyStringSchema,
  benchmarkItemId: nonEmptyStringSchema,
  benchmarkPackageId: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  questionId: nonEmptyStringSchema,
  routePath: nonEmptyStringSchema,
  sourcePackageVersion: nonEmptyStringSchema
});

export const mathQuestionLaunchBenchmarkVersionSummarySchema = z.object({
  benchmarkVersionId: nonEmptyStringSchema,
  displayLabel: nonEmptyStringSchema,
  launchability: benchmarkVersionLaunchabilitySchema,
  packageDigest: sha256Schema,
  packageVersion: nonEmptyStringSchema
});

export const mathQuestionLaunchConfigSchema = z.object({
  benchmarkVersionId: nonEmptyStringSchema,
  hostedSupported: z.boolean(),
  id: nonEmptyStringSchema,
  laneId: nonEmptyStringSchema,
  localSupportedAuthModes: z.array(mathConnectedAuthModeSchema),
  modelConfigId: nonEmptyStringSchema,
  modelSnapshotId: nonEmptyStringSchema,
  offlineExportSupportedAuthModes: z.array(mathConnectedAuthModeSchema),
  providerFamily: z.enum(problem9ProviderFamilies),
  runMode: z.enum(problem9RunModes),
  templateSourceRunId: nonEmptyStringSchema,
  toolProfile: z.enum(problem9ToolProfiles)
});

export const mathQuestionLaunchViewResponseSchema = z.object({
  benchmarkVersions: z.array(mathQuestionLaunchBenchmarkVersionSummarySchema),
  issues: z.array(mathLaunchReadinessIssueSchema),
  launchConfigs: z.array(mathQuestionLaunchConfigSchema),
  portalRunPathPattern: nonEmptyStringSchema,
  question: mathQuestionLaunchSummarySchema
});

export const mathHostedLaunchCreateInputSchema = z.object({
  launchConfigId: nonEmptyStringSchema
});

export const mathHostedLaunchCreateResponseSchema = z.object({
  launchId: z.string().uuid(),
  portalRunPath: nonEmptyStringSchema,
  questionId: nonEmptyStringSchema,
  run: z.object({
    attemptId: nonEmptyStringSchema,
    jobId: nonEmptyStringSchema,
    runId: nonEmptyStringSchema
  }),
  target: mathSingleRunLaunchTargetSchema
});

export const mathLocalConnectedLaunchCreateInputSchema = z.object({
  authMode: mathConnectedAuthModeSchema,
  launchConfigId: nonEmptyStringSchema
});

export const mathLocalConnectedLaunchCreateResponseSchema = z.object({
  bootstrapSession: z.object({
    expiresAt: timestampSchema,
    sessionId: z.string().uuid(),
    sessionToken: nonEmptyStringSchema
  }),
  launchId: z.string().uuid(),
  questionId: nonEmptyStringSchema,
  sourceAttemptId: nonEmptyStringSchema,
  sourceJobId: nonEmptyStringSchema,
  sourceRunId: nonEmptyStringSchema,
  target: mathSingleRunLaunchTargetSchema
});

export const mathOfflineExportCreateInputSchema = z.object({
  authMode: mathConnectedAuthModeSchema,
  launchConfigId: nonEmptyStringSchema
});

export const mathOfflineExportCreateResponseSchema = z.object({
  launchId: z.string().uuid(),
  questionId: nonEmptyStringSchema,
  sourceAttemptId: nonEmptyStringSchema,
  sourceJobId: nonEmptyStringSchema.nullable(),
  sourceRunId: nonEmptyStringSchema,
  target: mathSingleRunLaunchTargetSchema
});

export const mathRunnerBootstrapSessionRedeemInputSchema = z.object({
  availableRunKinds: z.array(runKindSchema),
  supportedArtifactRoles: z.array(workerBundleArtifactRoleSchema).min(1),
  supportsOfflineBundleContract: z.boolean(),
  supportsTraceUploads: z.boolean(),
  workerId: nonEmptyStringSchema,
  workerPool: nonEmptyStringSchema.refine((value) => value.startsWith("local-"), {
    message: "workerPool must start with local-"
  }),
  workerRuntime: z.literal("local_docker"),
  workerVersion: nonEmptyStringSchema
}).strict();

export const mathRunnerBootstrapSessionRedeemResponseSchema = z.object({
  launchId: z.string().uuid(),
  workerJob: workerActiveJobSchema
});
