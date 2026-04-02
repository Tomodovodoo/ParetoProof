export type HarnessSupportStatus =
  | "supported"
  | "internal_only"
  | "deprecated"
  | "retired";

export type HarnessRuntimeClass =
  | "hosted_worker"
  | "trusted_local_devbox"
  | "noninteractive_execution"
  | "offline_export";

export type HarnessImageRole =
  | "hosted_worker_image"
  | "execution_image"
  | "devbox_image";

export type HarnessImageDigestAuthority = "publish_workflow_artifact";

export type HarnessImageRef = {
  currentDigest: string | null;
  digestAuthority: HarnessImageDigestAuthority;
  notes: string[];
  publishedByWorkflow: string;
  publishedImage: string;
  repository: string;
  role: HarnessImageRole;
  target: string;
};

export type HarnessRegistryEntry = {
  authModes: string[];
  benchmarkFamilies: string[];
  familyId: string;
  harnessRevision: string;
  id: string;
  imageRefs: HarnessImageRef[];
  label: string;
  notes: string[];
  providerFamilies: string[];
  runModes: string[];
  runtimeClass: HarnessRuntimeClass;
  summary: string;
  supportStatus: HarnessSupportStatus;
  toolProfiles: string[];
};

export type HarnessRegistryCatalog = {
  items: HarnessRegistryEntry[];
  version: 1;
};
