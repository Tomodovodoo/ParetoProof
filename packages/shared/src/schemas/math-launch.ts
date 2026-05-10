import { z } from "zod";
import { harnessRuntimeClassSchema } from "./harness-registry.js";
import { runKindSchema } from "./run-control.js";

const nonEmptyStringSchema = z.string().trim().min(1);

export const mathLaunchModeSchema = z.enum([
  "hosted",
  "local_connected",
  "offline_export"
]);

export const mathLaunchCredentialPolicySchema = z.enum([
  "platform_managed",
  "runner_host_local",
  "none"
]);

export const mathLaunchQuestionRefSchema = z
  .object({
    benchmarkFamily: nonEmptyStringSchema,
    benchmarkItemId: nonEmptyStringSchema,
    benchmarkPackageId: nonEmptyStringSchema,
    benchmarkPackageVersion: nonEmptyStringSchema,
    benchmarkVersionId: nonEmptyStringSchema,
    laneId: nonEmptyStringSchema,
    questionId: nonEmptyStringSchema
  })
  .strict();

export const mathLaunchHarnessRefSchema = z
  .object({
    authMode: nonEmptyStringSchema,
    harnessId: nonEmptyStringSchema,
    harnessRevision: nonEmptyStringSchema,
    imageDigest: nonEmptyStringSchema.nullable(),
    providerFamily: nonEmptyStringSchema,
    runMode: nonEmptyStringSchema,
    runtimeClass: harnessRuntimeClassSchema,
    toolProfile: nonEmptyStringSchema
  })
  .strict();

const mathQuestionLaunchRequestBaseSchema = z.object({
  idempotencyKey: nonEmptyStringSchema.optional(),
  modelConfigId: nonEmptyStringSchema,
  question: mathLaunchQuestionRefSchema,
  requestedSurface: z.literal("math"),
  runKind: runKindSchema
});

export const mathHostedLaunchRequestSchema = mathQuestionLaunchRequestBaseSchema
  .extend({
    credentialPolicy: z.literal("platform_managed"),
    harness: mathLaunchHarnessRefSchema.extend({
      authMode: z.literal("machine_api_key"),
      runtimeClass: z.literal("hosted_worker")
    }),
    mode: z.literal("hosted")
  })
  .strict();

export const mathLocalConnectedLaunchRequestSchema =
  mathQuestionLaunchRequestBaseSchema
    .extend({
      credentialPolicy: z.literal("runner_host_local"),
      harness: mathLaunchHarnessRefSchema.extend({
        authMode: z.enum(["machine_api_key", "trusted_local_user"]),
        runtimeClass: z.literal("trusted_local_devbox")
      }),
      mode: z.literal("local_connected")
    })
    .strict();

export const mathOfflineExportRequestSchema = mathQuestionLaunchRequestBaseSchema
  .extend({
    credentialPolicy: z.literal("none"),
    exportFormat: z.literal("problem9_offline_run_bundle_descriptor"),
    harness: mathLaunchHarnessRefSchema.extend({
      authMode: z.literal("none"),
      runtimeClass: z.literal("offline_export")
    }),
    mode: z.literal("offline_export")
  })
  .strict();

export const mathQuestionLaunchRequestSchema = z.discriminatedUnion("mode", [
  mathHostedLaunchRequestSchema,
  mathLocalConnectedLaunchRequestSchema,
  mathOfflineExportRequestSchema
]);

export const mathHostedLaunchBootstrapResponseSchema = z
  .object({
    endpoint: z.literal("/math/launches"),
    mode: z.literal("hosted"),
    rawProviderSecretAccepted: z.literal(false),
    redirectPattern: z.literal("/runs/:runId"),
    requiredBackendContracts: z.array(nonEmptyStringSchema).min(1),
    status: z.literal("backend_pending")
  })
  .strict();

export const mathLocalConnectedBootstrapResponseSchema = z
  .object({
    bootstrap: z
      .object({
        authBoundary: z.literal("runner_host_only"),
        expiresAt: nonEmptyStringSchema.nullable(),
        manifest: z
          .object({
            harnessId: nonEmptyStringSchema,
            modelConfigId: nonEmptyStringSchema,
            questionId: nonEmptyStringSchema,
            runKind: runKindSchema,
            tokenAudience: z.literal("paretoproof-local-runner"),
            tokenScope: z.literal("math.question.launch.local")
          })
          .strict(),
        rawProviderSecretAccepted: z.literal(false),
        runnerCommand: z
          .object({
            command: z.array(nonEmptyStringSchema).min(1),
            label: nonEmptyStringSchema,
            workingDirectory: nonEmptyStringSchema
          })
          .strict()
      })
      .strict(),
    mode: z.literal("local_connected"),
    status: z.literal("bootstrap_ready")
  })
  .strict();

export const mathOfflineExportBootstrapResponseSchema = z
  .object({
    exportDescriptor: z
      .object({
        descriptorSchemaVersion: z.literal("1"),
        files: z.array(nonEmptyStringSchema).min(1),
        generatedAt: nonEmptyStringSchema,
        harness: mathLaunchHarnessRefSchema,
        includesProviderSecrets: z.literal(false),
        modelConfigId: nonEmptyStringSchema,
        question: mathLaunchQuestionRefSchema,
        runKind: runKindSchema
      })
      .strict(),
    mode: z.literal("offline_export"),
    status: z.literal("export_ready")
  })
  .strict();

export const mathQuestionLaunchBootstrapResponseSchema = z.discriminatedUnion(
  "mode",
  [
    mathHostedLaunchBootstrapResponseSchema,
    mathLocalConnectedBootstrapResponseSchema,
    mathOfflineExportBootstrapResponseSchema
  ]
);
