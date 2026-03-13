export type ArtifactStorageMode =
  | "postgres_metadata_only"
  | "r2_object_with_postgres_metadata";

export type ArtifactBucketClass =
  | "artifacts_bucket"
  | "exports_bucket"
  | "none";

export type ArtifactOwnerKind =
  | "run"
  | "job_attempt"
  | "benchmark_version"
  | "problem";

export type ArtifactVisibility = "private" | "restricted" | "public";

export type ArtifactClass =
  | "run_log_chunk"
  | "run_trace_bundle"
  | "run_artifact_blob"
  | "run_export_bundle"
  | "benchmark_source_bundle"
  | "benchmark_report_bundle"
  | "problem_attachment";

export type ArtifactClassCatalogEntry = {
  bucketClass: ArtifactBucketClass;
  description: string;
  id: ArtifactClass;
  ownerKind: ArtifactOwnerKind;
  r2PrefixTemplate: string | null;
  storageMode: ArtifactStorageMode;
  visibility: ArtifactVisibility;
};
