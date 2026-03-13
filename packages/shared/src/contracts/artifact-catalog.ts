import type { ArtifactClassCatalogEntry } from "../types/artifact-catalog.js";

export const artifactClassCatalog = [
  {
    bucketClass: "artifacts_bucket",
    description:
      "Worker and control-plane log slices stored as append-only log objects.",
    id: "run_log_chunk",
    ownerKind: "run",
    r2PrefixTemplate: "runs/<run_id>/logs/",
    storageMode: "r2_object_with_postgres_metadata",
    visibility: "private"
  },
  {
    bucketClass: "artifacts_bucket",
    description:
      "Trace archives or structured timing traces generated during run execution.",
    id: "run_trace_bundle",
    ownerKind: "run",
    r2PrefixTemplate: "runs/<run_id>/traces/",
    storageMode: "r2_object_with_postgres_metadata",
    visibility: "private"
  },
  {
    bucketClass: "artifacts_bucket",
    description:
      "General run-scoped execution outputs that are too large for Postgres rows.",
    id: "run_artifact_blob",
    ownerKind: "job_attempt",
    r2PrefixTemplate: "runs/<run_id>/artifacts/",
    storageMode: "r2_object_with_postgres_metadata",
    visibility: "private"
  },
  {
    bucketClass: "exports_bucket",
    description:
      "Downloadable run result packages prepared for contributor or admin consumption.",
    id: "run_export_bundle",
    ownerKind: "run",
    r2PrefixTemplate: "runs/<run_id>/bundles/",
    storageMode: "r2_object_with_postgres_metadata",
    visibility: "restricted"
  },
  {
    bucketClass: "artifacts_bucket",
    description:
      "Canonical benchmark source payload pinned to one benchmark version.",
    id: "benchmark_source_bundle",
    ownerKind: "benchmark_version",
    r2PrefixTemplate: "benchmarks/<benchmark_version_id>/source/",
    storageMode: "r2_object_with_postgres_metadata",
    visibility: "restricted"
  },
  {
    bucketClass: "exports_bucket",
    description:
      "Published benchmark reports and aggregate evaluation output bundles.",
    id: "benchmark_report_bundle",
    ownerKind: "benchmark_version",
    r2PrefixTemplate: "benchmarks/<benchmark_version_id>/reports/",
    storageMode: "r2_object_with_postgres_metadata",
    visibility: "public"
  },
  {
    bucketClass: "none",
    description:
      "Problem-level attachment metadata tracked in Postgres without dedicated object payload.",
    id: "problem_attachment",
    ownerKind: "problem",
    r2PrefixTemplate: null,
    storageMode: "postgres_metadata_only",
    visibility: "restricted"
  }
] satisfies ArtifactClassCatalogEntry[];
