import { z } from "zod";

export const runKindSchema = z.enum([
  "full_benchmark",
  "benchmark_slice",
  "single_run",
  "repeated_n"
]);

export const runLifecycleStateSchema = z.enum([
  "created",
  "queued",
  "running",
  "cancel_requested",
  "succeeded",
  "failed",
  "cancelled"
]);

export const jobLifecycleStateSchema = z.enum([
  "queued",
  "claimed",
  "running",
  "cancel_requested",
  "completed",
  "failed",
  "cancelled"
]);

export const attemptLifecycleStateSchema = z.enum([
  "prepared",
  "active",
  "succeeded",
  "failed",
  "cancelled"
]);

export const evaluationVerdictClassSchema = z.enum([
  "pass",
  "fail",
  "invalid_result"
]);

export const runKindCatalogEntrySchema = z.object({
  description: z.string(),
  id: runKindSchema,
  requiredFields: z.array(z.string())
});

export const runLifecycleStateCatalogEntrySchema = z.object({
  allowedNextStates: z.array(runLifecycleStateSchema),
  id: runLifecycleStateSchema,
  rationale: z.string(),
  terminal: z.boolean()
});

export const jobLifecycleStateCatalogEntrySchema = z.object({
  allowedNextStates: z.array(jobLifecycleStateSchema),
  id: jobLifecycleStateSchema,
  rationale: z.string(),
  terminal: z.boolean()
});

export const attemptLifecycleStateCatalogEntrySchema = z.object({
  allowedNextStates: z.array(attemptLifecycleStateSchema),
  id: attemptLifecycleStateSchema,
  rationale: z.string(),
  terminal: z.boolean()
});
