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
