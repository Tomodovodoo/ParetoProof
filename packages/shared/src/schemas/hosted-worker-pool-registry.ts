import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);

export const hostedWorkerPoolEnvironmentSchema = z.enum(["dev", "staging", "prod"]);
export const hostedWorkerPoolRuntimeSchema = z.enum(["local_docker", "modal"]);
export const hostedWorkerPoolRolloutClassSchema = z.enum([
  "stable",
  "canary",
  "quarantine"
]);

export const hostedWorkerPoolDeploymentTargetSchema = z.object({
  environment: hostedWorkerPoolEnvironmentSchema,
  modalAppName: nonEmptyStringSchema,
  secretName: nonEmptyStringSchema
});

export const hostedWorkerPoolRegistryEntrySchema = z
  .object({
    defaultRolloutClass: hostedWorkerPoolRolloutClassSchema,
    deploymentTargets: z.array(hostedWorkerPoolDeploymentTargetSchema).min(1),
    notes: z.array(nonEmptyStringSchema).default([]),
    ownershipSummary: nonEmptyStringSchema.nullable().default(null),
    workerPool: nonEmptyStringSchema,
    workerRuntime: hostedWorkerPoolRuntimeSchema
  })
  .superRefine((entry, ctx) => {
    const seenEnvironments = new Set<string>();

    for (const [index, target] of entry.deploymentTargets.entries()) {
      if (seenEnvironments.has(target.environment)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate deployment target environment "${target.environment}" is not allowed.`,
          path: ["deploymentTargets", index, "environment"]
        });
        continue;
      }

      seenEnvironments.add(target.environment);
    }
  });

export const hostedWorkerPoolRegistryCatalogSchema = z
  .object({
    items: z.array(hostedWorkerPoolRegistryEntrySchema).min(1),
    version: z.literal(1)
  })
  .superRefine((catalog, ctx) => {
    const seenWorkerPools = new Set<string>();

    for (const [index, entry] of catalog.items.entries()) {
      if (seenWorkerPools.has(entry.workerPool)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate worker pool "${entry.workerPool}" is not allowed.`,
          path: ["items", index, "workerPool"]
        });
        continue;
      }

      seenWorkerPools.add(entry.workerPool);
    }
  });
