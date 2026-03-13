import { z } from "zod";
import { runKindSchema } from "./run-control.js";

export const runFailureReasonSchema = z.enum([
  "worker_crash",
  "worker_lease_timeout",
  "provider_rate_limited",
  "provider_transport_error",
  "artifact_upload_transient",
  "internal_transient",
  "validation_error",
  "artifact_contract_error",
  "budget_exhausted",
  "manual_cancel"
]);

export const runFailureReasonCatalogEntrySchema = z.object({
  consumesRetryBudget: z.boolean(),
  id: runFailureReasonSchema,
  retryable: z.boolean(),
  terminalRunFailure: z.boolean(),
  rationale: z.string()
});

export const runRetryPolicySchema = z.object({
  initialBackoffSeconds: z.number().int().positive(),
  maxAttemptsPerJob: z.number().int().min(1),
  maxAttemptsPerRun: z.number().int().min(1),
  maxBackoffSeconds: z.number().int().positive(),
  backoffMultiplier: z.number().positive(),
  retryableReasons: z.array(runFailureReasonSchema)
});

export const runCancellationPolicySchema = z.object({
  heartbeatStaleSeconds: z.number().int().positive(),
  cancelRequestGraceSeconds: z.number().int().positive(),
  forcedCancelAfterSeconds: z.number().int().positive()
});

export const runConcurrencyPolicySchema = z.object({
  maxActiveRunsGlobal: z.number().int().min(1),
  maxActiveRunsPerContributor: z.number().int().min(1),
  maxConcurrentJobsPerRun: z.number().int().min(1),
  maxQueuedRunsPerContributor: z.number().int().min(1)
});

export const runBudgetPolicySchema = z.object({
  maxEstimatedUsdPerRun: z.number().positive(),
  maxInputTokensPerRun: z.number().int().positive(),
  maxOutputTokensPerRun: z.number().int().positive(),
  maxWallClockMinutesPerRun: z.number().int().positive(),
  budgetExceededTerminalState: z.literal("failed")
});

export const runControlPolicySchema = z.object({
  budget: runBudgetPolicySchema,
  cancellation: runCancellationPolicySchema,
  concurrency: runConcurrencyPolicySchema,
  retry: runRetryPolicySchema
});

export const runKindConcurrencyOverrideSchema = z.object({
  id: runKindSchema,
  maxConcurrentJobsPerRun: z.number().int().min(1),
  rationale: z.string()
});
