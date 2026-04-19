export type HostedWorkerPoolEnvironment = "dev" | "staging" | "prod";

export type HostedWorkerPoolRuntime = "local_docker" | "modal";

export type HostedWorkerPoolRolloutClass = "stable" | "canary" | "quarantine";

export type HostedWorkerPoolDeploymentTarget = {
  environment: HostedWorkerPoolEnvironment;
  modalAppName: string;
  secretName: string;
};

export type HostedWorkerPoolRegistryEntry = {
  defaultRolloutClass: HostedWorkerPoolRolloutClass;
  deploymentTargets: HostedWorkerPoolDeploymentTarget[];
  notes: string[];
  ownershipSummary: string | null;
  workerPool: string;
  workerRuntime: HostedWorkerPoolRuntime;
};

export type HostedWorkerPoolRegistryCatalog = {
  items: HostedWorkerPoolRegistryEntry[];
  version: 1;
};
