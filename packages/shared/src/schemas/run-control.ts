import { z } from "zod";
import {
  attemptLifecycleStates,
  evaluationVerdictClasses,
  jobLifecycleStates,
  offlineIngestAttemptLifecycleStates,
  offlineIngestJobLifecycleStates,
  offlineIngestRunLifecycleStates,
  runKindValues,
  runLifecycleStates,
  workerResultAttemptLifecycleStates,
  workerResultJobLifecycleStates,
  workerResultRunLifecycleStates,
  workerTerminalFailureAttemptLifecycleStates,
  workerTerminalFailureJobLifecycleStates,
  workerTerminalFailureRunLifecycleStates
} from "../types/run-control.js";

export const runKindSchema = z.enum(runKindValues);

export const runLifecycleStateSchema = z.enum(runLifecycleStates);

export const jobLifecycleStateSchema = z.enum(jobLifecycleStates);

export const attemptLifecycleStateSchema = z.enum(attemptLifecycleStates);

export const evaluationVerdictClassSchema = z.enum(evaluationVerdictClasses);

export const offlineIngestRunLifecycleStateSchema = z.enum(
  offlineIngestRunLifecycleStates
);

export const offlineIngestJobLifecycleStateSchema = z.enum(
  offlineIngestJobLifecycleStates
);

export const offlineIngestAttemptLifecycleStateSchema = z.enum(
  offlineIngestAttemptLifecycleStates
);

export const workerResultRunLifecycleStateSchema = z.enum(
  workerResultRunLifecycleStates
);

export const workerResultJobLifecycleStateSchema = z.enum(
  workerResultJobLifecycleStates
);

export const workerResultAttemptLifecycleStateSchema = z.enum(
  workerResultAttemptLifecycleStates
);

export const workerTerminalFailureRunLifecycleStateSchema = z.enum(
  workerTerminalFailureRunLifecycleStates
);

export const workerTerminalFailureJobLifecycleStateSchema = z.enum(
  workerTerminalFailureJobLifecycleStates
);

export const workerTerminalFailureAttemptLifecycleStateSchema = z.enum(
  workerTerminalFailureAttemptLifecycleStates
);

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
